import { readdir, readFile, rm } from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { build, type Arch, type BuildResult, type CompilerDiagnostic } from './compiler';
import { DEBUG_TYPE } from './debugAdapter';
import { realExec } from './exec';
import { explain } from './explain';
import { resolveBuildTarget, type BuildTarget, type ProjectFs } from './projectModel';
import { ensureToolchain, getOutputChannel } from './toolchainUi';

type Mode = 'debug' | 'run' | 'build';

const CHOSEN_PROJECT_KEY = 'cppStarter.chosenProject';
const CPP_EXTENSIONS = ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'];

const projectFs: ProjectFs = {
  readdir: (dir) => readdir(dir),
  readFile: (file) => readFile(file, 'utf8'),
};

/** Only real files on disk count: not untitled buffers, diffs, output panes or settings. */
function isCppDocument(doc: vscode.TextDocument): boolean {
  return (
    doc.uri.scheme === 'file' &&
    (doc.languageId === 'cpp' || doc.languageId === 'c' || CPP_EXTENSIONS.includes(path.extname(doc.uri.fsPath).toLowerCase()))
  );
}

export class Runner {
  private lastCppFile: string | undefined;
  private busy = false;
  private readonly reported = new Map<string, vscode.Uri[]>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: vscode.DiagnosticCollection,
  ) {
    this.remember(vscode.window.activeTextEditor);
  }

  remember(editor: vscode.TextEditor | undefined): void {
    if (editor && isCppDocument(editor.document)) this.lastCppFile = editor.document.uri.fsPath;
  }

  /** Never rejects: any unexpected failure is logged and shown, and the command reports false. */
  async run(mode: Mode): Promise<boolean> {
    if (this.busy) {
      void vscode.window.showInformationMessage('A build is already running.');
      return false;
    }
    this.busy = true;
    try {
      return await this.flow(mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      getOutputChannel().appendLine(
        `Build failed unexpectedly: ${error instanceof Error ? (error.stack ?? message) : message}`,
      );
      void vscode.window.showErrorMessage('Something went wrong while building: ' + message);
      return false;
    } finally {
      this.busy = false;
    }
  }

  private currentFile(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor && isCppDocument(editor.document)) return editor.document.uri.fsPath;
    return this.lastCppFile;
  }

  private async flow(mode: Mode): Promise<boolean> {
    await vscode.workspace.saveAll(false);
    const target = await this.resolveTarget(this.currentFile());
    if (!target) return false;

    const toolchain = await ensureToolchain();
    if (!toolchain) return false;

    const arch: Arch =
      vscode.workspace.getConfiguration('cppStarter').get<string>('architecture') === 'x86_64' ? 'x86_64' : 'native';
    const status = vscode.window.setStatusBarMessage(`$(sync~spin) Building ${target.name}…`);
    let result: BuildResult;
    try {
      result = await build(target, {
        exec: realExec,
        clang: toolchain.clang,
        storageDir: this.context.globalStorageUri.fsPath,
        shimDir: path.join(this.context.extensionPath, 'shims'),
        arch,
        sdk: toolchain.sdk,
      });
    } finally {
      status.dispose();
    }
    this.publish(target, result.diagnostics);

    if (!result.ok) {
      getOutputChannel().appendLine(`Build of ${target.name} failed:\n${result.rawOutput}`);
      await vscode.commands.executeCommand('workbench.actions.view.problems');
      return false;
    }

    switch (mode) {
      case 'debug':
        return this.startDebugging(target, result.exe);
      case 'run':
        openProgramTerminal(target, result.exe, {});
        return true;
      case 'build':
        vscode.window.setStatusBarMessage('$(check) Build succeeded', 5000);
        return true;
    }
  }

  private async resolveTarget(file: string | undefined): Promise<BuildTarget | undefined> {
    let chosen = this.context.workspaceState.get<string>(CHOSEN_PROJECT_KEY);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await resolveBuildTarget(file, projectFs, chosen);
      switch (result.kind) {
        case 'ok':
          return result.target;
        case 'noFile':
          void vscode.window.showWarningMessage('Open a .cpp file first, then press F5.');
          return undefined;
        case 'noSources':
          void vscode.window.showWarningMessage('There are no .cpp files in this folder.');
          return undefined;
        case 'multipleMains':
          void vscode.window.showWarningMessage(
            `More than one file in this folder has a main() function: ${result.files
              .map((f) => path.basename(f))
              .join(', ')}. Each program needs its own folder.`,
          );
          return undefined;
        case 'pickProject': {
          const pick = await vscode.window.showQuickPick(
            result.projects.map((p) => p.name),
            { placeHolder: 'Which project do you want to run?' },
          );
          if (pick === undefined) return undefined;
          await this.context.workspaceState.update(CHOSEN_PROJECT_KEY, pick);
          chosen = pick;
          break;
        }
      }
    }
    return undefined;
  }

  /**
   * lldb-dap's own `runInTerminal` cannot work with Apple's lldb-dap: its terminal launcher is
   * lldb-dap itself, an Apple-signed system binary that macOS does not let a debugger attach to
   * ("Timed out trying to get messages from the runInTerminal launcher"). Instead the program
   * runs in an integrated terminal (so cin works) and waits in the compatibility header. Once it
   * is fully loaded it writes its pid to `readyFile`, and only then does lldb-dap attach (under
   * Rosetta, attaching during dyld start-up leaves the program stopped inside dyld) and set the
   * flag the program waits on. It is still a
   * `launch` request, so stopping the session ends the program, as in Visual Studio.
   */
  private async startDebugging(target: BuildTarget, exe: string): Promise<boolean> {
    const readyFile = `${exe}.debug-ready`;
    await rm(readyFile, { force: true });
    const terminal = openProgramTerminal(target, exe, { CPP_STARTER_WAIT_FOR_DEBUGGER: readyFile });
    const pid = await waitForReadyPid(readyFile, terminal, 15000);
    if (pid === undefined) {
      terminal.dispose();
      throw new Error('the program did not start in the terminal.');
    }

    const config: vscode.DebugConfiguration = {
      type: DEBUG_TYPE,
      request: 'launch',
      name: 'C++: ' + target.name,
      program: exe,
      cwd: target.dir,
      args: [],
      // Attach, then release the program's wait while it is still stopped: VS Code sets the
      // breakpoints before configurationDone lets it run.
      launchCommands: [`process attach --pid ${pid}`, 'expression -- cpp_starter_debugger_attached = 1'],
    };
    let started = false;
    try {
      started = await vscode.debug.startDebugging(
        vscode.workspace.getWorkspaceFolder(vscode.Uri.file(target.dir)),
        config,
      );
    } finally {
      // A program left waiting for a debugger that never comes would only confuse.
      if (!started) terminal.dispose();
    }
    return started;
  }

  /** Replaces this target's problems (its sources and any file it reported before). */
  private publish(target: BuildTarget, found: CompilerDiagnostic[]): void {
    for (const uri of this.reported.get(target.key) ?? []) this.diagnostics.delete(uri);
    for (const source of target.sources) this.diagnostics.delete(vscode.Uri.file(source));

    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const d of found) {
      byFile.set(d.file, [...(byFile.get(d.file) ?? []), toVscodeDiagnostic(d)]);
    }
    const uris: vscode.Uri[] = [];
    for (const [file, list] of byFile) {
      const uri = vscode.Uri.file(file);
      this.diagnostics.set(uri, list);
      uris.push(uri);
    }
    this.reported.set(target.key, uris);
  }
}

/**
 * Runs the program as the terminal's own process: `shellPath` involves no shell, so no quoting
 * of paths can break. Terminals of earlier runs of this program that have finished are closed.
 */
function openProgramTerminal(target: BuildTarget, exe: string, env: Record<string, string>): vscode.Terminal {
  const name = 'C++: ' + target.name;
  for (const old of vscode.window.terminals) {
    if (old.name === name && old.exitStatus !== undefined) old.dispose();
  }
  const noPause = process.env.CPP_STARTER_NO_PAUSE;
  const terminal = vscode.window.createTerminal({
    name,
    shellPath: exe,
    cwd: target.dir,
    env: { ...env, ...(noPause === undefined ? {} : { CPP_STARTER_NO_PAUSE: noPause }) },
  });
  terminal.show();
  return terminal;
}

/** Polls for the pid the waiting program writes; gives up if its terminal closes or on timeout. */
async function waitForReadyPid(file: string, terminal: vscode.Terminal, timeoutMs: number): Promise<number | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && terminal.exitStatus === undefined) {
    const text = await readFile(file, 'utf8').catch(() => '');
    const pid = Number.parseInt(text, 10);
    if (text.endsWith('\n') && Number.isInteger(pid) && pid > 0) return pid;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return undefined;
}

function toVscodeDiagnostic(d: CompilerDiagnostic): vscode.Diagnostic {
  const position = new vscode.Position(Math.max(d.line - 1, 0), Math.max(d.column - 1, 0));
  const tip = explain(d.message);
  const severity =
    d.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : d.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(position, position),
    tip === undefined ? d.message : `${d.message}\n💡 ${tip}`,
    severity,
  );
  diagnostic.source = 'C++ Starter';
  return diagnostic;
}

export function registerRunner(context: vscode.ExtensionContext): Runner {
  const diagnostics = vscode.languages.createDiagnosticCollection('C++ Starter');
  const runner = new Runner(context, diagnostics);
  context.subscriptions.push(
    diagnostics,
    vscode.window.onDidChangeActiveTextEditor((editor) => runner.remember(editor)),
    vscode.commands.registerCommand('cppStarter.startDebugging', () => runner.run('debug')),
    vscode.commands.registerCommand('cppStarter.runWithoutDebugging', () => runner.run('run')),
    vscode.commands.registerCommand('cppStarter.build', () => runner.run('build')),
  );
  return runner;
}
