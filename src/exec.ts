import { execFile } from 'child_process';

export type ExecResult = { code: number; stdout: string; stderr: string };

export type ExecFn = (
  file: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
) => Promise<ExecResult>;

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Runs a binary with an argument array (never through a shell).
 * Resolves with the exit code, including non-zero; rejects only if the binary cannot be started.
 */
export const realExec: ExecFn = (file, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        env: opts.env,
        timeout: opts.timeoutMs,
        maxBuffer: MAX_BUFFER_BYTES,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        // A numeric `code` means the process ran and exited non-zero; a string code
        // (e.g. ENOENT) means it could not be started.
        if (typeof error.code === 'number') {
          resolve({ code: error.code, stdout, stderr });
          return;
        }
        reject(error);
      },
    );
  });
