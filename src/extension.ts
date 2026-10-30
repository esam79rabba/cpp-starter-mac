import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  if (process.platform !== 'darwin') {
    void vscode.window.showErrorMessage('C++ Starter for Mac only works on macOS.');
    return;
  }
}

export function deactivate(): void {}
