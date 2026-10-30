import * as path from 'path';
import * as vscode from 'vscode';
import { registerDebugAdapter } from './debugAdapter';
import { configureClangd } from './intellisense';
import { registerRunner } from './runner';
import { registerStartPage, showStartPageOnFirstRun } from './startPage';
import { registerUi } from './ui';
import { ensureToolchain, getOutputChannel, recheckToolchain } from './toolchainUi';

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
    .then(async (toolchain) => {
      if (toolchain) {
        // Not awaited: clangd setup must never delay or break activation.
        configureClangd(toolchain, path.join(context.extensionPath, 'shims'), context.globalState).catch((error) =>
          getOutputChannel().appendLine(`Could not configure clangd: ${error instanceof Error ? error.message : String(error)}`),
        );
      }
      await showStartPageOnFirstRun(context);
    })
    .catch(() => undefined);
}

export function deactivate(): void {}
