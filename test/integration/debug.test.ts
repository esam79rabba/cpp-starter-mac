import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { addBreakpoint, cleanUp, fixture, openFile, waitForDapEvent, waitForStop, type Stop } from './helpers';

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

  test('saves an unsaved edit before building and stops on the new line', async () => {
    const original = fs.readFileSync(HELLO, 'utf8');
    try {
      const editor = await openFile(HELLO);
      await editor.edit((b) => b.insert(new vscode.Position(HELLO_COUT_LINE - 1, 0), '    std::cout << "x";\n'));
      assert.strictEqual(editor.document.isDirty, true);

      await debugAndExpectStop(HELLO, HELLO_COUT_LINE);

      assert.strictEqual(editor.document.isDirty, false);
      assert.ok(fs.readFileSync(HELLO, 'utf8').includes('std::cout << "x";'), 'the edit was not saved to disk');
    } finally {
      await cleanUp();
      await restore(HELLO, original);
    }
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

  test('Start Without Debugging opens a terminal named after the program', async () => {
    await openFile(HELLO);
    assert.strictEqual(await run('cppStarter.runWithoutDebugging'), true);
    assert.ok(
      vscode.window.terminals.some((t) => t.name === 'C++: hello'),
      vscode.window.terminals.map((t) => t.name).join(', '),
    );
  });
});
