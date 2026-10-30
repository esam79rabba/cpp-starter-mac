import * as vscode from 'vscode';
import { registerDebugAdapter } from './debugAdapter';
import { registerRunner } from './runner';
import { registerStartPage, showStartPageOnFirstRun } from './startPage';
import { registerUi } from './ui';
import { ensureToolchain, recheckToolchain } from './toolchainUi';

export function activate(context: vscode.ExtensionContext): void {
  if (process.platform !== 'darwin') {
    void vscode.window.showErrorMessage('C++ Starter for Mac only works on macOS.');
    return;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('cppStarter.checkTools', () => recheckToolchain()),
  );
  registerDebugAdapter(context, ensureToolchain);
  registerRunner(context);
  registerUi(context);
  registerStartPage(context);
  ensureToolchain()
    .then(() => showStartPageOnFirstRun(context))
    .catch(() => undefined);
}

export function deactivate(): void {}
