import * as vscode from 'vscode';
import { realExec } from './exec';
import { detectToolchain, installToolchain, type Toolchain } from './toolchain';

let cached: Toolchain | undefined;
let inFlight: Promise<Toolchain | undefined> | undefined;

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

/** Finds the C++ tools, offering to install them if missing. Never throws. */
export function ensureToolchain(): Promise<Toolchain | undefined> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= run()
    .catch(() => undefined)
    .then((result) => {
      cached = result;
      return result;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

/** Forgets the cached result so the next check looks at the machine again. */
export function recheckToolchain(): Promise<Toolchain | undefined> {
  cached = undefined;
  return ensureToolchain();
}
