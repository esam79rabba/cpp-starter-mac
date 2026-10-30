import { describe, expect, it, vi } from 'vitest';
import type { ExecFn, ExecResult } from '../../src/exec';
import { cachedWhenFound, detectToolchain, installToolchain } from '../../src/toolchain';

const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });
const fail = (code: number): ExecResult => ({ code, stdout: '', stderr: '' });

const PATHS: Record<string, string> = {
  'xcrun -f clang++': '/usr/bin/clang++\n',
  'xcrun -f lldb-dap': '/Library/Developer/CommandLineTools/usr/bin/lldb-dap\n',
  'xcrun -f clangd': '/Library/Developer/CommandLineTools/usr/bin/clangd\n',
};

function fakeExec(overrides: Record<string, ExecResult> = {}) {
  const calls: string[] = [];
  const exec: ExecFn = async (file, args) => {
    const key = [file, ...args].join(' ');
    calls.push(key);
    if (key in overrides) return overrides[key];
    if (key === 'xcode-select -p') return ok('/Library/Developer/CommandLineTools\n');
    if (key in PATHS) return ok(PATHS[key]);
    return fail(1);
  };
  return { exec, calls };
}

describe('detectToolchain', () => {
  it('returns trimmed paths when every command succeeds', async () => {
    const { exec } = fakeExec();
    expect(await detectToolchain(exec)).toEqual({
      clang: '/usr/bin/clang++',
      lldbDap: '/Library/Developer/CommandLineTools/usr/bin/lldb-dap',
      clangd: '/Library/Developer/CommandLineTools/usr/bin/clangd',
    });
  });

  it('returns undefined and never calls xcrun when xcode-select -p fails', async () => {
    const { exec, calls } = fakeExec({ 'xcode-select -p': fail(2) });
    expect(await detectToolchain(exec)).toBeUndefined();
    expect(calls.some((c) => c.startsWith('xcrun'))).toBe(false);
  });

  it('returns undefined when lldb-dap is missing', async () => {
    const { exec } = fakeExec({ 'xcrun -f lldb-dap': fail(1) });
    expect(await detectToolchain(exec)).toBeUndefined();
  });

  it('treats a binary that cannot be started as not installed', async () => {
    const exec: ExecFn = async () => {
      throw new Error('spawn ENOENT');
    };
    expect(await detectToolchain(exec)).toBeUndefined();
  });
});

describe('installToolchain', () => {
  it('starts the installer then polls until the tools appear', async () => {
    const calls: string[] = [];
    let detectRuns = 0;
    const exec: ExecFn = async (file, args) => {
      const key = [file, ...args].join(' ');
      calls.push(key);
      if (key === 'xcode-select --install') return ok();
      if (key === 'xcode-select -p') {
        detectRuns += 1;
        return detectRuns >= 3 ? ok('/x\n') : fail(2);
      }
      return ok('/bin/tool\n');
    };
    const sleep = vi.fn(async () => {});
    const result = await installToolchain(exec, { pollMs: 7, timeoutMs: 60_000, sleep });
    expect(calls[0]).toBe('xcode-select --install');
    expect(result).toEqual({ clang: '/bin/tool', lldbDap: '/bin/tool', clangd: '/bin/tool' });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 7);
    expect(sleep).toHaveBeenNthCalledWith(2, 7);
  });

  it('gives up with undefined after the timeout', async () => {
    const exec: ExecFn = async () => fail(1);
    const result = await installToolchain(exec, { timeoutMs: 10, pollMs: 5 });
    expect(result).toBeUndefined();
  });
});

describe('cachedWhenFound', () => {
  it('does not cache an undefined result, so the next call runs again', async () => {
    const run = vi.fn(async () => undefined);
    const get = cachedWhenFound(run);
    await get();
    await get();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('caches a found result', async () => {
    const tc = { clang: 'a', lldbDap: 'b', clangd: 'c' };
    const run = vi.fn(async () => tc);
    const get = cachedWhenFound(run);
    expect(await get()).toBe(tc);
    expect(await get()).toBe(tc);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight call between concurrent callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = vi.fn(async () => {
      await gate;
      return undefined;
    });
    const get = cachedWhenFound(run);
    const [p1, p2] = [get(), get()];
    release();
    await Promise.all([p1, p2]);
    expect(run).toHaveBeenCalledTimes(1);
    await get();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('treats a rejection as undefined and allows a retry', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    const get = cachedWhenFound(run);
    expect(await get()).toBeUndefined();
    await get();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
