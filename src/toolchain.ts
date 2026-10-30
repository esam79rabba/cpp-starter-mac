import type { ExecFn } from './exec';

export interface Toolchain {
  clang: string;
  lldbDap: string;
  clangd: string;
}

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

async function findTool(exec: ExecFn, name: string): Promise<string | undefined> {
  const result = await exec('xcrun', ['-f', name]);
  if (result.code !== 0) return undefined;
  const path = result.stdout.trim();
  return path === '' ? undefined : path;
}

async function detect(exec: ExecFn): Promise<Toolchain | undefined> {
  const select = await exec('xcode-select', ['-p']);
  if (select.code !== 0) return undefined;
  const clang = await findTool(exec, 'clang++');
  const lldbDap = await findTool(exec, 'lldb-dap');
  const clangd = await findTool(exec, 'clangd');
  if (!clang || !lldbDap || !clangd) return undefined;
  return { clang, lldbDap, clangd };
}

/** Returns the tool paths, or undefined if Apple's Command Line Tools are not fully installed. */
export async function detectToolchain(exec: ExecFn): Promise<Toolchain | undefined> {
  try {
    return await detect(exec);
  } catch {
    // A binary that cannot even be started means the tools are not installed.
    return undefined;
  }
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts Apple's installer, then polls until the tools appear or the timeout passes. */
export async function installToolchain(
  exec: ExecFn,
  opts: { pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Toolchain | undefined> {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = opts.sleep ?? realSleep;

  try {
    await exec('xcode-select', ['--install']);
  } catch {
    // If the installer cannot start, polling below simply times out.
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await detectToolchain(exec);
    if (found) return found;
    if (Date.now() >= deadline) return undefined;
    await sleep(pollMs);
  }
}

/**
 * Wraps an async lookup so only a found result is remembered. An undefined (or failed)
 * result is retried on the next call, and concurrent callers share one in-flight run.
 */
export function cachedWhenFound<T>(run: () => Promise<T | undefined>): () => Promise<T | undefined> {
  let cached: T | undefined;
  let inFlight: Promise<T | undefined> | undefined;
  return () => {
    if (cached !== undefined) return Promise.resolve(cached);
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
  };
}
