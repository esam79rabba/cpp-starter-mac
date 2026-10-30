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
});
