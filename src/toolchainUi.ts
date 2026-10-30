import * as vscode from 'vscode';
import { realExec } from './exec';
import { cachedWhenFound, detectToolchain, installToolchain, type Toolchain } from './toolchain';

async function run(): Promise<Toolchain | undefined> {
  const found = await detectToolchain(realExec);
  if (found) return found;

  const choice = await vscode.window.showInformationMessage(
    'C++ tools are not installed. Install now?',
    'Install',
  );
  if (choice !== 'Install') return undefined;

  const installed = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing Apple's C++ tools… this can take a few minutes",
    },
    () => installToolchain(realExec),
  );

  if (installed) {
    void vscode.window.showInformationMessage('✓ Ready to build C++');
  } else {
    void vscode.window.showWarningMessage(
      "The C++ tools were not found. Finish Apple's installer, then run 'C++: Check Tools' from the Command Palette.",
    );
  }
  return installed;
}

let lookup = cachedWhenFound(run);

/** Finds the C++ tools, offering to install them if missing. Only a found result is cached. Never throws. */
export function ensureToolchain(): Promise<Toolchain | undefined> {
  return lookup();
}

/** Forgets any cached result so the next check looks at the machine again. */
export function recheckToolchain(): Promise<Toolchain | undefined> {
  lookup = cachedWhenFound(run);
  return lookup();
}
