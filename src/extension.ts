import * as vscode from 'vscode';
import { ensureToolchain, recheckToolchain } from './toolchainUi';

export function activate(context: vscode.ExtensionContext): void {
  if (process.platform !== 'darwin') {
    void vscode.window.showErrorMessage('C++ Starter for Mac only works on macOS.');
    return;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('cppStarter.checkTools', () => recheckToolchain()),
  );
  void ensureToolchain();
}

export function deactivate(): void {}
