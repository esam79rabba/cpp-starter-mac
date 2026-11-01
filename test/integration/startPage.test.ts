import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { addBreakpoint, cleanUp, openFile, waitForStop } from './helpers';
import { createProject } from '../../src/projectTemplate';

suite('start page', function () {
  this.timeout(120000);
  suiteSetup(async () => {
    await vscode.extensions.getExtension('EsamRabba.cpp-starter-mac')?.activate();
  });
  teardown(cleanUp);

  test('C++: Show Start Page opens the Get started webview', async () => {
    await vscode.commands.executeCommand('cppStarter.showStartPage');
    const findTab = () =>
      vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .find((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith('cppStarter.startPage'));
    let tab = findTab();
    for (let i = 0; i < 50 && !tab; i++) {
      await new Promise((r) => setTimeout(r, 100));
      tab = findTab();
    }
    assert.ok(tab, 'no start page tab');
    assert.strictEqual(tab.label, 'Get started');
  });

  test('a new project builds and stops at a breakpoint', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cppstarter-new-'));
    try {
      const result = await createProject(parent, 'ConsoleApplication1');
      assert.ok(result.ok);
      if (!result.ok) return;
      await openFile(result.mainFile);
      addBreakpoint(result.mainFile, 5);
      const stop = waitForStop();
      stop.catch(() => undefined);
      assert.strictEqual(await vscode.commands.executeCommand('cppStarter.startDebugging'), true);
      const at = await stop;
      assert.strictEqual(fs.realpathSync(at.file), fs.realpathSync(result.mainFile));
      assert.strictEqual(at.line, 5);
    } finally {
      await cleanUp();
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
