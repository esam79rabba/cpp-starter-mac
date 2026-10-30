import * as vscode from 'vscode';
import { realExec } from './exec';
import { cachedWhenFound, detectToolchain, installToolchain, type Toolchain } from './toolchain';

let output: vscode.OutputChannel | undefined;
let announcedReady = false;

/** The extension's single "C++ Starter" output channel, created on first use. */
export function getOutputChannel(): vscode.OutputChannel {
  output ??= vscode.window.createOutputChannel('C++ Starter');
  return output;
}

async function run(): Promise<Toolchain | undefined> {
  const found = await detectToolchain(realExec);
  if (found) return found;

  const choice = await vscode.window.showInformationMessage(
    'C++ tools are not installed. Install now?',
    'Install',
  );
  if (choice !== 'Install') return undefined;

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing Apple's C++ tools… this can take a few minutes",
      cancellable: true,
    },
    (_progress, token) => installToolchain(realExec, { isCancelled: () => token.isCancellationRequested }),
  );

  switch (result.kind) {
    case 'installed':
      announcedReady = true;
      void vscode.window.showInformationMessage('✓ Ready to build C++');
      return result.toolchain;
    case 'startFailed':
      void vscode.window.showWarningMessage(
        "Apple's installer could not start. Check your internet connection, then run 'C++: Check Tools' from the Command Palette.",
      );
      return undefined;
    case 'timeout':
      void vscode.window.showWarningMessage(
        "The C++ tools were not found. Finish Apple's installer, then run 'C++: Check Tools' from the Command Palette.",
      );
      return undefined;
    case 'cancelled':
      return undefined;
  }
}

const lookup = cachedWhenFound(run);

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  getOutputChannel().appendLine(`Toolchain check failed: ${error instanceof Error ? (error.stack ?? message) : message}`);
  void vscode.window.showErrorMessage('Something went wrong while checking the C++ tools: ' + message);
}

async function check(fresh: boolean): Promise<Toolchain | undefined> {
  try {
    return await lookup({ fresh });
  } catch (error) {
    reportError(error);
    return undefined;
  }
}

/** Finds the C++ tools, offering to install them if missing. Only a found result is cached. Never throws. */
export function ensureToolchain(): Promise<Toolchain | undefined> {
  return check(false);
}

/** The "C++: Check Tools" command: re-detects, joins any run in progress, and confirms success. */
export async function recheckToolchain(): Promise<Toolchain | undefined> {
  announcedReady = false;
  const result = await check(true);
  if (result && !announcedReady) {
    void vscode.window.showInformationMessage('✓ Ready to build C++');
  }
  announcedReady = false;
  return result;
}
