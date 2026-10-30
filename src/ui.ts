import * as vscode from 'vscode';

export const FN_TIP_KEY = 'cppStarter.fnTipShown';
const FN_TIP_MESSAGE =
  'Tip: on a Mac keyboard, hold fn and press F5 to run your program, or set F1, F2… to work as standard function keys. ' +
  'F11 (Step Into) also needs Show Desktop turned off in Keyboard Shortcuts → Mission Control.';
const OPEN_KEYBOARD_SETTINGS = 'Open Keyboard Settings';
const KEYBOARD_SETTINGS_URI = 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension';

function createStatusItem(text: string, tooltip: string, command: string, priority: number): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.text = text;
  item.tooltip = tooltip;
  item.command = command;
  return item;
}

function showFnTipOnce(context: vscode.ExtensionContext, editor: vscode.TextEditor): void {
  const { document } = editor;
  if (document.uri.scheme !== 'file' || document.languageId !== 'cpp') return;
  if (context.globalState.get<boolean>(FN_TIP_KEY)) return;

  // Mark it shown up front so it appears at most once, even if the user never dismisses it.
  void context.globalState.update(FN_TIP_KEY, true);
  void vscode.window.showInformationMessage(FN_TIP_MESSAGE, OPEN_KEYBOARD_SETTINGS).then((choice) => {
    if (choice === OPEN_KEYBOARD_SETTINGS) {
      return vscode.env.openExternal(vscode.Uri.parse(KEYBOARD_SETTINGS_URI));
    }
    return undefined;
  });
}

export function registerUi(context: vscode.ExtensionContext): void {
  const run = createStatusItem('$(play) Run', 'Build and debug (F5)', 'cppStarter.startDebugging', 101);
  const build = createStatusItem('$(tools) Build', 'Build (Ctrl+Shift+B)', 'cppStarter.build', 100);
  context.subscriptions.push(run, build);

  const refresh = (editor: vscode.TextEditor | undefined): void => {
    if (editor?.document.languageId === 'cpp') {
      run.show();
      build.show();
      showFnTipOnce(context, editor);
    } else {
      run.hide();
      build.hide();
    }
  };

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(refresh));
  refresh(vscode.window.activeTextEditor);

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand('cppStarter._getState', (key: string) => context.globalState.get(key)),
    );
  }
}
