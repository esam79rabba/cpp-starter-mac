import * as assert from 'assert';
import * as vscode from 'vscode';
import { cleanUp, fixture, openFile } from './helpers';

suite('ui', () => {
  teardown(cleanUp);

  test('opening a C++ file records that the fn-key tip was shown', async function () {
    this.timeout(60000);
    await vscode.extensions.getExtension('EsamRabba.cpp-starter-mac')?.activate();
    await openFile(fixture('hello', 'main.cpp'));

    let shown: unknown;
    for (let i = 0; i < 50 && shown !== true; i++) {
      shown = await vscode.commands.executeCommand('cppStarter._getState', 'cppStarter.fnTipShown');
      if (shown !== true) await new Promise((r) => setTimeout(r, 100));
    }
    assert.strictEqual(shown, true);
  });
});
