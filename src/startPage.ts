import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { createProject, expandHome, validateProjectName } from './projectTemplate';

export const START_PAGE_SHOWN_KEY = 'cppStarter.startPageShown';
export const PENDING_HINT_KEY = 'cppStarter.pendingHint';
const VIEW_TYPE = 'cppStarter.startPage';
const DEFAULT_LOCATION = '~/Documents/C++ Projects';
const CHOOSE_OTHER = 'Choose another folder…';
const RUN_HINT = 'Press F5 (or fn+F5) to run your program.';

export type StartCommand = 'createProject' | 'openFolder' | 'openSolution';
const COMMANDS: readonly StartCommand[] = ['createProject', 'openFolder', 'openSolution'];

/** Messages from the webview are untrusted: only the three known commands are accepted. */
export function parseMessage(message: unknown): StartCommand | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const command = (message as { command?: unknown }).command;
  return COMMANDS.find((c) => c === command);
}

/** The single step that reloads the window; replaced in tests. */
export type OpenFolder = (dir: string) => Thenable<unknown>;
const openFolderInWindow: OpenFolder = (dir) =>
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir));

async function pickLocation(): Promise<string | undefined> {
  const pick = await vscode.window.showQuickPick([DEFAULT_LOCATION, CHOOSE_OTHER], {
    title: 'Where should it be saved?',
    placeHolder: 'Where should it be saved?',
  });
  if (pick === undefined) return undefined;
  if (pick !== CHOOSE_OTHER) return pick;
  const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
  return chosen?.[0]?.fsPath;
}

export async function handleCommand(
  command: StartCommand,
  context: vscode.ExtensionContext,
  openFolder: OpenFolder = openFolderInWindow,
): Promise<void> {
  if (command === 'createProject') {
    const name = await vscode.window.showInputBox({
      prompt: 'Project name',
      title: 'Project name',
      value: 'ConsoleApplication1',
      validateInput: validateProjectName,
    });
    if (name === undefined) return;
    const location = await pickLocation();
    if (location === undefined) return;
    const result = await createProject(expandHome(location), name.trim());
    if (!result.ok) {
      void vscode.window.showErrorMessage(result.error);
      return;
    }
    await context.globalState.update(PENDING_HINT_KEY, result.dir);
    await openFolder(result.dir);
  } else if (command === 'openFolder') {
    const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
    if (chosen?.[0]) await openFolder(chosen[0].fsPath);
  } else {
    const chosen = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Visual Studio solution': ['sln', 'vcxproj'] },
    });
    if (chosen?.[0]) await openFolder(path.dirname(chosen[0].fsPath));
  }
}

export function renderHtml(cspSource: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Get started</title>
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 2rem 3rem; }
  h1 { font-weight: 400; }
  .actions { display: flex; flex-direction: column; gap: 0.75rem; max-width: 22rem; margin-top: 1.5rem; }
  button { font: inherit; text-align: left; padding: 0.75rem 1rem; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
<h1>Get started</h1>
<div class="actions">
  <button class="primary" data-command="createProject">Create a new project</button>
  <button data-command="openFolder">Open a local folder</button>
  <button data-command="openSolution">Open a project or solution</button>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const button of document.querySelectorAll('button[data-command]')) {
    button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
  }
</script>
</body>
</html>`;
}

let panel: vscode.WebviewPanel | undefined;

export function showStartPage(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal();
    return;
  }
  panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Get started', vscode.ViewColumn.One, {
    enableScripts: true,
    localResourceRoots: [],
  });
  const nonce = crypto.randomBytes(16).toString('hex');
  panel.webview.html = renderHtml(panel.webview.cspSource, nonce);
  panel.webview.onDidReceiveMessage((message: unknown) => {
    const command = parseMessage(message);
    if (command) {
      handleCommand(command, context).catch((error: Error) =>
        vscode.window.showErrorMessage(`Something went wrong: ${error.message}`),
      );
    }
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

async function showPendingHint(context: vscode.ExtensionContext): Promise<void> {
  const hint = context.globalState.get<string>(PENDING_HINT_KEY);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!hint || hint !== root) return;
  await context.globalState.update(PENDING_HINT_KEY, undefined);
  const doc = await vscode.workspace.openTextDocument(path.join(hint, 'main.cpp'));
  await vscode.window.showTextDocument(doc);
  void vscode.window.showInformationMessage(RUN_HINT);
}

export function registerStartPage(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cppStarter.showStartPage', () => showStartPage(context)),
  );
  showPendingHint(context).catch(() => undefined);
}

export function showStartPageOnFirstRun(context: vscode.ExtensionContext): void {
  if (context.globalState.get<boolean>(START_PAGE_SHOWN_KEY)) return;
  void context.globalState.update(START_PAGE_SHOWN_KEY, true);
  showStartPage(context);
}
