import type { ExecFn } from './exec';

export interface Toolchain {
  clang: string;
  lldbDap: string;
  clangd: string;
  /** macOS SDK root (`xcrun --show-sdk-path`); clang++ run directly needs it as -isysroot. */
  sdk: string;
}

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

async function findTool(exec: ExecFn, name: string): Promise<string | undefined> {
  const result = await exec('xcrun', ['-f', name]);
  if (result.code !== 0) return undefined;
  const path = result.stdout.trim();
  return path === '' ? undefined : path;
}

export type ToolchainStatus =
  | { kind: 'ok'; toolchain: Toolchain }
  | { kind: 'missing' }
  | { kind: 'outdated'; missing: string[] };

async function detectStatus(exec: ExecFn): Promise<ToolchainStatus> {
  const select = await exec('xcode-select', ['-p']);
  if (select.code !== 0) return { kind: 'missing' };
  const clang = await findTool(exec, 'clang++');
  const lldbDap = await findTool(exec, 'lldb-dap');
  const clangd = await findTool(exec, 'clangd');
  const sdkResult = await exec('xcrun', ['--show-sdk-path']);
  const sdk = sdkResult.code === 0 ? sdkResult.stdout.trim() : '';
  const missing = [
    ...(clang ? [] : ['clang++']),
    ...(lldbDap ? [] : ['lldb-dap']),
    ...(clangd ? [] : ['clangd']),
    ...(sdk !== '' ? [] : ['macOS SDK']),
  ];
  if (!clang || !lldbDap || !clangd || sdk === '') return { kind: 'outdated', missing };
  return { kind: 'ok', toolchain: { clang, lldbDap, clangd, sdk } };
}

/**
 * `missing`: Apple's Command Line Tools are not installed (`xcode-select -p` fails).
 * `outdated`: they are installed but lack some tools (lldb-dap needs Command Line Tools 16 or
 * later); installing again cannot help, only a macOS / tools update can.
 */
export async function detectToolchainStatus(exec: ExecFn): Promise<ToolchainStatus> {
  try {
    return await detectStatus(exec);
  } catch {
    // A binary that cannot even be started means the tools are not installed.
    return { kind: 'missing' };
  }
}

/** What to tell the student when the installed tools are too old (shown instead of installing). */
export function outdatedToolsMessage(missing: string[]): string {
  return (
    `Your Apple C++ tools are out of date (missing: ${missing.join(', ')}). ` +
    "Update macOS in System Settings → General → Software Update, then run 'C++: Check Tools'."
  );
}

/** Returns the tool paths, or undefined if Apple's Command Line Tools are not fully installed. */
export async function detectToolchain(exec: ExecFn): Promise<Toolchain | undefined> {
  const status = await detectToolchainStatus(exec);
  return status.kind === 'ok' ? status.toolchain : undefined;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type InstallResult =
  | { kind: 'installed'; toolchain: Toolchain }
  | { kind: 'startFailed' }
  | { kind: 'timeout' }
  | { kind: 'cancelled' };

/** Starts Apple's installer, then polls until the tools appear, the timeout passes, or the caller cancels. */
export async function installToolchain(
  exec: ExecFn,
  opts: {
    pollMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    isCancelled?: () => boolean;
  } = {},
): Promise<InstallResult> {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = opts.sleep ?? realSleep;
  const isCancelled = opts.isCancelled ?? (() => false);

  let startCode: number;
  try {
    startCode = (await exec('xcode-select', ['--install'])).code;
  } catch {
    return { kind: 'startFailed' };
  }
  if (startCode !== 0) {
    // The installer may refuse because the tools are already there.
    const already = await detectToolchain(exec);
    return already ? { kind: 'installed', toolchain: already } : { kind: 'startFailed' };
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await detectToolchain(exec);
    if (found) return { kind: 'installed', toolchain: found };
    if (isCancelled()) return { kind: 'cancelled' };
    if (Date.now() >= deadline) return { kind: 'timeout' };
    await sleep(pollMs);
  }
}

/**
 * Wraps an async lookup so only a found result is remembered. An undefined result or a
 * rejection is never cached (the next call retries; a rejection reaches the caller), and
 * concurrent callers share one in-flight run. `{ fresh: true }` drops the cached value
 * but still joins a run that is already in progress.
 */
export function cachedWhenFound<T>(
  run: () => Promise<T | undefined>,
): (opts?: { fresh?: boolean }) => Promise<T | undefined> {
  let cached: T | undefined;
  let inFlight: Promise<T | undefined> | undefined;
  return (opts) => {
    if (opts?.fresh) cached = undefined;
    if (cached !== undefined) return Promise.resolve(cached);
    inFlight ??= run()
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
