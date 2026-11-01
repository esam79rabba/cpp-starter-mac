import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

suite('activation', () => {
  test('extension activates after opening a C++ file', async function () {
    this.timeout(60000);
    const ext = vscode.extensions.getExtension('EsamRabba.cpp-starter-mac');
    if (!ext) {
      assert.fail('extension EsamRabba.cpp-starter-mac is not present');
    }

    const file = path.resolve(__dirname, '../../../test/fixtures/hello/main.cpp');
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    await ext.activate();

    assert.strictEqual(ext.isActive, true);
  });
});
