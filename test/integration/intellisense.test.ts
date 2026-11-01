import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { cleanUp, fixture, openFile } from './helpers';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls until `check` returns a value, or fails after `timeoutMs` (clangd indexes lazily). */
async function until<T>(what: string, check: () => Promise<T | undefined> | T | undefined, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await pause(250);
  }
}

const errorsOf = (file: string) =>
  vscode.languages
    .getDiagnostics(vscode.Uri.file(file))
    .filter((d) => d.severity === vscode.DiagnosticSeverity.Error);

/** Waits until clangd has published diagnostics for the file (even an empty list), then returns its errors. */
async function settledErrors(file: string): Promise<vscode.Diagnostic[]> {
  // clangd publishes after parsing; a quiet period of 3 s without errors counts as settled.
  // Symbols only come back once clangd has parsed the file, so a quiet period cannot be clangd not having started.
  await until('clangd to parse the file', async () => {
    const symbols = await vscode.commands.executeCommand<unknown[]>('vscode.executeDocumentSymbolProvider', vscode.Uri.file(file));
    return symbols && symbols.length > 0 ? symbols : undefined;
  });
  let lastErrorAt = Date.now();
  return until('clangd diagnostics to settle', () => {
    if (errorsOf(file).length > 0) lastErrorAt = Date.now();
    return Date.now() - lastErrorAt > 3000 ? errorsOf(file) : undefined;
  }, 40000).catch((error: Error) => {
    throw new Error(`${error.message}; errors: ${JSON.stringify(errorsOf(file).map((d) => d.message))}`);
  });
}

const COMPILE_COMMANDS = fixture('solution', 'compile_commands.json');

suite('intellisense', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await vscode.extensions.getExtension('EsamRabba.cpp-starter-mac')?.activate();
    await vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd')?.activate();
    // Activation configures clangd without blocking; wait for the global setting to be ours.
    await until('clangd.path to be configured', () =>
      vscode.workspace.getConfiguration('clangd').inspect<string>('path')?.globalValue,
    );
  });
  teardown(async () => {
    await cleanUp();
    fs.rmSync(COMPILE_COMMANDS, { force: true });
  });

  test('configures clangd globally only, never in the workspace', () => {
    const path = vscode.workspace.getConfiguration('clangd').inspect<string>('path');
    const flags = vscode.workspace.getConfiguration('clangd').inspect<string[]>('fallbackFlags');
    assert.ok(path?.globalValue?.endsWith('clangd'));
    assert.ok(flags?.globalValue?.includes('-isysroot'));
    assert.strictEqual(path?.workspaceValue, undefined);
    assert.strictEqual(flags?.workspaceFolderValue, undefined);
    assert.ok(!fs.existsSync(fixture('.vscode', 'settings.json')));
  });

  test('a fresh hello project has no errors and completes std::cout', async function () {
    this.timeout(90000);
    const file = fixture('hello', 'main.cpp');
    const original = fs.readFileSync(file, 'utf8');
    const editor = await openFile(file);
    try {
      assert.deepStrictEqual(
        (await settledErrors(file)).map((d) => d.message),
        [],
      );
      await editor.edit((b) => b.insert(new vscode.Position(4, 0), '    std::co'));
      const pos = new vscode.Position(4, '    std::co'.length);
      const labels = await until('a "cout" completion', async () => {
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          editor.document.uri,
          pos,
        );
        const found = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
        return found.some((l) => l.trim() === 'cout') ? found : undefined;
      });
      assert.ok(labels.length > 0);
    } finally {
      await vscode.commands.executeCommand('workbench.action.files.revert');
      fs.writeFileSync(file, original);
    }
  });

  test('pch.cpp finds the pch.h shim', async function () {
    this.timeout(60000);
    const file = fixture('shims', 'pch.cpp');
    await openFile(file);
    const errors = await settledErrors(file);
    assert.deepStrictEqual(errors.map((d) => d.message), []);
  });

  test('after building a solution project, its headers resolve', async function () {
    this.timeout(120000);
    const main = fixture('solution', 'Lab2', 'main.cpp');
    await openFile(main);
    assert.strictEqual(await vscode.commands.executeCommand('cppStarter.build'), true);
    assert.ok(fs.existsSync(COMPILE_COMMANDS), 'compile_commands.json was not written');
    const entries = JSON.parse(fs.readFileSync(COMPILE_COMMANDS, 'utf8')) as { file: string }[];
    assert.deepStrictEqual(entries.map((e) => e.file).sort(), [main, fixture('solution', 'Lab2', 'util', 'helper.cpp')].sort());

    await openFile(fixture('solution', 'Lab2', 'util', 'helper.cpp'));
    await openFile(main);
    const errors = await settledErrors(main);
    assert.deepStrictEqual(errors.map((d) => d.message), []);
  });
});
