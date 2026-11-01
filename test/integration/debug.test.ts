import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  addBreakpoint,
  cleanUp,
  findTerminal,
  fixture,
  openFile,
  waitForDapEvent,
  waitForExit,
  waitForStop,
  type Stop,
} from './helpers';

const HELLO = fixture('hello', 'main.cpp');
const HELLO_COUT_LINE = 5;
const STUDENT_CPP = fixture('multi', 'Student.cpp');
const STUDENT_DESCRIBE_LINE = 5;
const STUDENT_H = fixture('multi', 'Student.h');
const STUDENT_GRADE_LINE = 10;
const INPUT = fixture('input', 'main.cpp');
const INPUT_DOUBLED_LINE = 6;
const HELPER = fixture('solution', 'Lab2', 'util', 'helper.cpp');
const SPACES = fixture('spaces', 'C++ Projects', 'واجب 1', 'main.cpp');
const TWO_MAINS = fixture('twomains', 'lab1.cpp');

const run = (command: string) => vscode.commands.executeCommand<boolean>(command);

/** A promise that rejects later must not be reported as unhandled before the test awaits it. */
function later<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

async function debugAndExpectStop(file: string, line: number, opener = file): Promise<Stop> {
  await openFile(opener);
  addBreakpoint(file, line);
  const stop = later(waitForStop());
  assert.strictEqual(await run('cppStarter.startDebugging'), true, 'the build or debug start failed');
  const at = await stop;
  assert.strictEqual(at.file, path.normalize(file));
  assert.strictEqual(at.line, line);
  return at;
}

/** Puts a fixture back exactly as it was, saved, whatever state its editor is in. */
async function restore(file: string, original: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(file);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), original);
  await vscode.workspace.applyEdit(edit);
  await doc.save();
  fs.writeFileSync(file, original);
}

async function setArchitecture(value: 'x86_64' | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('cppStarter')
    .update('architecture', value, vscode.ConfigurationTarget.Global);
}

async function processArchitecture(at: Stop): Promise<string> {
  const reply = await at.session.customRequest('evaluate', {
    expression: '`target list',
    context: 'repl',
    frameId: at.frameId,
  });
  return String(reply.result);
}

suite('build and debug', function () {
  this.timeout(120000);

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cpp-starter.cpp-starter-mac');
    await ext?.activate();
    await cleanUp();
  });
  teardown(cleanUp);

  test('stops at a breakpoint in hello/main.cpp', async () => {
    await debugAndExpectStop(HELLO, HELLO_COUT_LINE);
  });

  test('the attach handshake prints nothing to the Debug Console', async () => {
    const printed: string[] = [];
    const tracker = vscode.debug.registerDebugAdapterTrackerFactory('cppstarter', {
      createDebugAdapterTracker: () => ({
        onDidSendMessage(message: { type?: string; event?: string; body?: { output?: string } }) {
          if (message.type === 'event' && message.event === 'output') printed.push(message.body?.output ?? '');
        },
      }),
    });
    try {
      await debugAndExpectStop(HELLO, HELLO_COUT_LINE);
    } finally {
      tracker.dispose();
    }
    const console = printed.join('');
    for (const noise of ['launchCommands', 'process attach', 'SIGSTOP', 'cpp_starter_debugger_attached']) {
      assert.ok(!console.includes(noise), `Debug Console shows "${noise}":\n${console}`);
    }
  });

  test('F5 from the terminal (VS Code debug start, no launch.json) builds and stops at the breakpoint', async () => {
    await openFile(HELLO);
    addBreakpoint(HELLO, HELLO_COUT_LINE);
    await vscode.commands.executeCommand('workbench.action.terminal.focus');
    const sessions: vscode.DebugSession[] = [];
    const sub = vscode.debug.onDidStartDebugSession((s) => sessions.push(s));
    try {
      const stop = later(waitForStop(30000));
      // What VS Code resolves for the debugger picker's default: a config with no program.
      await vscode.debug.startDebugging(undefined, { type: 'cppstarter', request: 'launch', name: 'picker' });
      const at = await stop;
      assert.strictEqual(at.file, path.normalize(HELLO));
      assert.strictEqual(at.line, HELLO_COUT_LINE);
      assert.strictEqual(sessions.length, 1, 'expected only the extension\'s own session');
      assert.strictEqual(typeof at.session.configuration.program, 'string');
    } finally {
      sub.dispose();
    }
  });

  test('stops in Student.cpp in a method called from main.cpp', async () => {
    await debugAndExpectStop(STUDENT_CPP, STUDENT_DESCRIBE_LINE);
  });

  test('stops in an inline method in Student.h', async () => {
    await debugAndExpectStop(STUDENT_H, STUDENT_GRADE_LINE);
  });

  test('reads cin from the integrated terminal and stops after it', async () => {
    await openFile(INPUT);
    addBreakpoint(INPUT, INPUT_DOUBLED_LINE);
    const terminalOpened = later(
      new Promise<vscode.Terminal>((resolve) => {
        const sub = vscode.window.onDidOpenTerminal((t) => {
          sub.dispose();
          resolve(t);
        });
      }),
    );
    const processStarted = later(waitForDapEvent('process'));
    const stop = later(waitForStop(30000));

    assert.strictEqual(await run('cppStarter.startDebugging'), true);
    const terminal = await terminalOpened;
    await processStarted;
    terminal.sendText('21');

    const at = await stop;
    assert.strictEqual(at.file, path.normalize(INPUT));
    assert.strictEqual(at.line, INPUT_DOUBLED_LINE);
    const reply = await at.session.customRequest('evaluate', {
      expression: 'n',
      context: 'watch',
      frameId: at.frameId,
    });
    assert.strictEqual(reply.result, '21');
  });

  test('stops in a helper of a Visual Studio solution project', async () => {
    await debugAndExpectStop(HELPER, 1);
  });

  test('stops in a folder whose path has spaces, a plus and Arabic', async () => {
    await debugAndExpectStop(SPACES, 5);
  });

  test('saves an unsaved edit before building and debugs the edited code', async () => {
    const original = fs.readFileSync(HELLO, 'utf8');
    try {
      const editor = await openFile(HELLO);
      // Line 5 becomes `int edited = 42;`, line 6 the new cout: neither exists in the old build.
      await editor.edit((b) =>
        b.insert(new vscode.Position(HELLO_COUT_LINE - 1, 0), '    int edited = 42;\n    std::cout << "x";\n'),
      );
      assert.strictEqual(editor.document.isDirty, true);

      const at = await debugAndExpectStop(HELLO, HELLO_COUT_LINE + 1);

      assert.strictEqual(editor.document.isDirty, false);
      const reply = await at.session.customRequest('evaluate', {
        expression: 'edited',
        context: 'watch',
        frameId: at.frameId,
      });
      assert.strictEqual(reply.result, '42', 'the program being debugged is not the edited build');
    } finally {
      await cleanUp();
      await restore(HELLO, original);
    }
  });

  test('Stop Debugging ends the program', async () => {
    await debugAndExpectStop(HELLO, HELLO_COUT_LINE);
    const terminal = findTerminal('C++: hello');
    assert.strictEqual(terminal.exitStatus, undefined, 'the program should still be running at the breakpoint');
    await vscode.debug.stopDebugging();
    await waitForExit(terminal, 10000);
  });

  test('a compile error stops before debugging and shows one error', async () => {
    const original = fs.readFileSync(HELLO, 'utf8');
    try {
      const editor = await openFile(HELLO);
      assert.strictEqual(await run('cppStarter.build'), true, 'the clean build failed');
      // `int x = std::cout << ...;` is exactly one error: an ostream does not convert to int.
      await editor.edit((b) => b.insert(new vscode.Position(HELLO_COUT_LINE - 1, 4), 'int x = '));

      assert.strictEqual(await run('cppStarter.startDebugging'), false);
      assert.strictEqual(vscode.debug.activeDebugSession, undefined);
      const errors = vscode.languages
        .getDiagnostics(vscode.Uri.file(HELLO))
        .filter((d) => d.source === 'C++ Starter' && d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(errors.length, 1, JSON.stringify(errors));
    } finally {
      await cleanUp();
      await restore(HELLO, original);
    }
  });

  test('two files with main() in one folder: no build, no session', async () => {
    await openFile(TWO_MAINS);
    assert.strictEqual(await run('cppStarter.startDebugging'), false);
    assert.strictEqual(vscode.debug.activeDebugSession, undefined);
  });

  suite('Intel (x86_64) under Rosetta', () => {
    suiteSetup(() => setArchitecture('x86_64'));
    suiteTeardown(() => setArchitecture(undefined));

    test('stops at a breakpoint in hello/main.cpp', async () => {
      const at = await debugAndExpectStop(HELLO, HELLO_COUT_LINE);
      assert.match(await processArchitecture(at), /x86_64/);
    });

    test('stops in Student.cpp in a method called from main.cpp', async () => {
      const at = await debugAndExpectStop(STUDENT_CPP, STUDENT_DESCRIBE_LINE);
      assert.match(await processArchitecture(at), /x86_64/);
    });
  });

  test('Start Without Debugging runs hello in a terminal named after the program', async () => {
    await openFile(HELLO);
    assert.strictEqual(await run('cppStarter.runWithoutDebugging'), true);
    const status = await waitForExit(findTerminal('C++: hello'));
    assert.strictEqual(status.code, 0);
  });

  test('Start Without Debugging runs a program whose path has spaces, a plus and Arabic', async () => {
    await openFile(SPACES);
    assert.strictEqual(await run('cppStarter.runWithoutDebugging'), true);
    const status = await waitForExit(findTerminal('C++: واجب 1'));
    assert.strictEqual(status.code, 0);
  });
});
