import * as path from 'path';
import * as vscode from 'vscode';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const FIXTURES = path.resolve(__dirname, '../../../test/fixtures');

export function fixture(...parts: string[]): string {
  return path.join(FIXTURES, ...parts);
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`Timed out after ${ms} ms waiting for ${what}`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface Stop {
  file: string;
  line: number;
  session: vscode.DebugSession;
  threadId: number;
  frameId: number;
}

interface DapMessage {
  type?: string;
  event?: string;
  body?: Record<string, unknown>;
}

/** Short form of a DAP message for failure reports (output and module events are skipped). */
function describe(direction: string, message: DapMessage & { command?: string; success?: boolean }): string | undefined {
  if (message.event === 'output' || message.event === 'module') return undefined;
  const text = JSON.stringify(message.body ?? {});
  return `${direction} ${message.type} ${message.event ?? message.command ?? ''}${
    message.success === false ? ' FAILED' : ''
  } ${text.length > 300 ? text.slice(0, 300) + '…' : text}`;
}

/**
 * Resolves when a cppstarter session sends `event` (optionally matching `accept`). Call before
 * starting. On timeout the error lists the DAP traffic seen, so a failure can be diagnosed.
 */
export function waitForDapEvent(
  event: string,
  timeoutMs = 20000,
  accept: (body: Record<string, unknown>) => boolean = () => true,
): Promise<{ session: vscode.DebugSession; body: Record<string, unknown> }> {
  let registration: vscode.Disposable | undefined;
  const traffic: string[] = [];
  const record = (line: string | undefined) => {
    if (line !== undefined) traffic.push(line);
  };
  const seen = new Promise<{ session: vscode.DebugSession; body: Record<string, unknown> }>((resolve) => {
    registration = vscode.debug.registerDebugAdapterTrackerFactory('cppstarter', {
      createDebugAdapterTracker(session) {
        return {
          onWillReceiveMessage: (message: DapMessage) => record(describe('->', message)),
          onDidSendMessage(message: DapMessage) {
            record(describe('<-', message));
            const body = message.body ?? {};
            if (message.type === 'event' && message.event === event && accept(body)) {
              resolve({ session, body });
            }
          },
          onError: (error: Error) => record(`adapter error: ${error.message}`),
          onExit: (code: number | undefined) => record(`adapter exited: ${code}`),
        };
      },
    });
  });
  const done = () => registration?.dispose();
  return withTimeout(seen, timeoutMs, `the debug adapter's '${event}' event`, done)
    .catch((error: Error) => {
      throw new Error(`${error.message}\nDAP traffic:\n${traffic.join('\n')}`);
    })
    .finally(done);
}

/**
 * Waits for a `stopped` event with reason `breakpoint` and returns the top frame's location.
 * Call it before starting the session so the tracker sees every message.
 */
export async function waitForStop(timeoutMs = 20000): Promise<Stop> {
  const { session, body } = await waitForDapEvent('stopped', timeoutMs, (b) => b.reason === 'breakpoint');
  const threadId = Number(body.threadId);
  const trace = await session.customRequest('stackTrace', { threadId, levels: 1 });
  const frame = trace.stackFrames[0];
  return {
    file: path.normalize(frame.source?.path ?? ''),
    line: frame.line,
    session,
    threadId,
    frameId: frame.id,
  };
}

export function addBreakpoint(file: string, line1Based: number): void {
  const location = new vscode.Location(vscode.Uri.file(file), new vscode.Position(line1Based - 1, 0));
  vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(location)]);
}

/** Waits until the terminal's process has ended and returns its exit status. */
export async function waitForExit(terminal: vscode.Terminal, timeoutMs = 15000): Promise<vscode.TerminalExitStatus> {
  for (let waited = 0; terminal.exitStatus === undefined && waited < timeoutMs; waited += 50) await pause(50);
  if (terminal.exitStatus === undefined) throw new Error(`'${terminal.name}' was still running after ${timeoutMs} ms`);
  return terminal.exitStatus;
}

export function findTerminal(name: string): vscode.Terminal {
  const terminal = vscode.window.terminals.find((t) => t.name === name);
  if (!terminal) throw new Error(`no terminal named '${name}' among: ${vscode.window.terminals.map((t) => t.name).join(', ')}`);
  return terminal;
}

export async function openFile(file: string): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(file);
  return vscode.window.showTextDocument(doc);
}

async function stopAllSessions(): Promise<void> {
  for (let i = 0; i < 5 && vscode.debug.activeDebugSession; i++) {
    const ended = new Promise<void>((resolve) => {
      const sub = vscode.debug.onDidTerminateDebugSession(() => {
        sub.dispose();
        resolve();
      });
    });
    await vscode.debug.stopDebugging();
    await withTimeout(ended, 10000, 'the debug session to end', () => undefined).catch(() => undefined);
  }
  if (vscode.debug.activeDebugSession) throw new Error('A debug session is still running after cleanup.');
}

async function closeTerminals(): Promise<void> {
  for (const terminal of vscode.window.terminals) terminal.dispose();
  for (let i = 0; i < 50 && vscode.window.terminals.length > 0; i++) await pause(100);
}

/** Leaves the window as each test expects to find it: no sessions, terminals, breakpoints or editors. */
export async function cleanUp(): Promise<void> {
  await stopAllSessions();
  vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
  await closeTerminals();
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
