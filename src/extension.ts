import * as path from 'path';
import * as vscode from 'vscode';
import { registerDebugAdapter, registerDebugConfigurationProvider } from './debugAdapter';
import { configureClangd } from './intellisense';
import { registerRunner } from './runner';
import { registerStartPage, showStartPageOnFirstRun } from './startPage';
import { registerUi } from './ui';
import { ensureToolchain, getOutputChannel, onToolchainFound, recheckToolchain } from './toolchainUi';

export function activate(context: vscode.ExtensionContext): void {
  if (process.platform !== 'darwin') {
    void vscode.window.showErrorMessage('C++ Starter for Mac only works on macOS.');
    return;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('cppStarter.checkTools', () => recheckToolchain()),
  );
  registerDebugAdapter(context, ensureToolchain);
  registerDebugConfigurationProvider(context);
  registerRunner(context);
  registerUi(context);
  registerStartPage(context);
  // Independent of the tools: on a fresh Mac the install can take many minutes, or never happen.
  showStartPageOnFirstRun(context);

  // Configure clangd the first time the tools are found: at activation, or later after an
  // install started from F5 or 'C++: Check Tools'. At most once per session.
  let clangdConfigured = false;
  onToolchainFound((toolchain) => {
    if (clangdConfigured) return;
    clangdConfigured = true;
    // Not awaited: clangd setup must never delay or break activation or a build.
    configureClangd(toolchain, path.join(context.extensionPath, 'shims'), context.globalState).catch((error) =>
      getOutputChannel().appendLine(`Could not configure clangd: ${error instanceof Error ? error.message : String(error)}`),
    );
  });
  void ensureToolchain();
}

export function deactivate(): void {}
