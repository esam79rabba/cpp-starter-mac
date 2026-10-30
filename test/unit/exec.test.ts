import { describe, expect, it } from 'vitest';
import { realExec } from '../../src/exec';

describe('realExec', () => {
  it('passes arguments without shell interpretation', async () => {
    const result = await realExec('/bin/echo', ['a b']);
    expect(result).toEqual({ code: 0, stdout: 'a b\n', stderr: '' });
  });

  it('resolves with the exit code instead of rejecting on non-zero exit', async () => {
    const result = await realExec('/bin/sh', ['-c', 'exit 3']);
    expect(result.code).toBe(3);
  });

  it('rejects when the binary cannot be started', async () => {
    await expect(realExec('/no/such/bin', [])).rejects.toThrow();
  });

  it('resolves with code -1 and timedOut when the timeout kills the process', async () => {
    const started = Date.now();
    const result = await realExec('/bin/sleep', ['5'], { timeoutMs: 200 });
    expect(result.code).toBe(-1);
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
