import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'child_process';
import { closeSync, openSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { realExec } from '../../src/exec';

const root = path.resolve(__dirname, '../..');
const fixtures = path.join(root, 'test/fixtures/shims');
const shims = path.join(root, 'shims');

type Run = { code: number | null; stdout: string; stderr: string };

function run(bin: string, stdin: string, env: NodeJS.ProcessEnv, viaRosetta: boolean): Promise<Run> {
  return new Promise((resolve, reject) => {
    const [cmd, args] = viaRosetta ? ['arch', ['-x86_64', bin]] : [bin, []];
    const child = spawn(cmd, args, { env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(stdin);
  });
}

// Set CPP_STARTER_SHIM_X86=1 to run the whole suite for x86_64 under Rosetta.
const archs: Array<'arm64' | 'x86_64'> = process.env.CPP_STARTER_SHIM_X86 ? ['x86_64'] : ['arm64'];

describe.each(archs)('compat shims (%s)', (arch) => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cpp-shims-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function build(name: string, sources: string[] = [`${name}.cpp`]) {
    const out = path.join(dir, `${name}-${arch}`);
    // `xcrun clang++` supplies the macOS SDK sysroot that the bare binary lacks.
    const res = await realExec('xcrun', [
      'clang++',
      '-std=c++17', '-g', '-O0', '-Wall', '-arch', arch,
      '-include', path.join(shims, 'cpp_starter_compat.h'),
      '-I', path.join(shims, 'include'),
      '-Wno-unknown-pragmas',
      ...sources.map((f) => path.join(fixtures, f)),
      path.join(shims, 'cpp_starter_compat.cpp'),
      '-o', out,
    ]);
    return { out, res };
  }

  async function buildAndRun(
    name: string,
    stdin = '',
    env: NodeJS.ProcessEnv = { CPP_STARTER_NO_PAUSE: '1' },
    sources?: string[],
  ) {
    const { out, res } = await build(name, sources);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    return run(out, stdin, env, arch === 'x86_64');
  }

  it('system("pause") prints the prompt then continues', async () => {
    const r = await buildAndRun('pause');
    expect(r.stdout).toMatch(/Press any key to continue \. \. \. [\s\S]*after/);
  });

  it('std::system("PAUSE") works with using namespace std', async () => {
    const r = await buildAndRun('std_pause');
    expect(r.stdout).toMatch(/Press any key to continue \. \. \. [\s\S]*after/);
  });

  it('system("cls") clears the screen', async () => {
    const r = await buildAndRun('cls');
    expect(r.stdout).toContain('\x1b[2J\x1b[H');
  });

  it('system("Cls") matches case-insensitively', async () => {
    expect((await buildAndRun('cls_mixed')).stdout).toContain('\x1b[2J\x1b[H');
  });

  it('system("pause>nul") and "PAUSE > NUL" wait silently', async () => {
    expect((await buildAndRun('pause_nul')).stdout).toBe('after');
  });

  it('sprintf_s works with and without a size argument', async () => {
    expect((await buildAndRun('sprintf2')).stdout).toBe('7-x\ny=8\n');
  });

  it('links two translation units that both include the shim', async () => {
    const r = await buildAndRun('multi_tu', '', undefined, ['multi_tu/a.cpp', 'multi_tu/b.cpp']);
    expect(r.stdout.match(/Press any key to continue/g)).toHaveLength(2);
    expect(r.stdout).toContain('other\n');
    expect(r.stdout).toContain('main\n');
  });

  it('#include "pch.h" compiles', async () => {
    expect((await buildAndRun('pch')).stdout).toContain('Hello World!');
  });

  it('#include "stdafx.h" compiles', async () => {
    expect((await buildAndRun('stdafx')).stdout).toContain('Hello World!');
  });

  it('scanf_s and printf_s work', async () => {
    expect((await buildAndRun('scanf_s', 'Sara 19\n')).stdout).toContain('Sara is 19');
  });

  it('conio.h _getch reads one key', async () => {
    expect((await buildAndRun('conio', 'x')).stdout).toContain('got x');
  });

  it('pragma warning and _s string functions compile without warnings', async () => {
    const r = await buildAndRun('pragma');
    expect(r.stdout).toContain('hi!');
  });

  it('leaves names such as TRUE, FALSE, MAX, MIN and isset free for student code', async () => {
    expect((await buildAndRun('macro_names')).stdout).toBe('3');
  });

  it('leaves POSIX names such as pause, read, link and ECHO free for student code', async () => {
    expect((await buildAndRun('posix_names')).stdout).toBe('p4\n');
  });

  it('a student global named read does not break the exit pause, which reads a key', async () => {
    const { out, res } = await build('posix_names');
    expect(res.stderr).toBe('');
    // `script` runs the program on a pseudo-terminal, so the exit pause really reads a key.
    // Its stdin must be a file: script cannot use the socket node gives a child for stdin.
    const keyFile = path.join(dir, 'key.txt');
    await writeFile(keyFile, 'x');
    const env = { ...process.env };
    delete env.CPP_STARTER_NO_PAUSE;
    const cmd = arch === 'x86_64' ? ['arch', '-x86_64', out] : [out];
    const r = await new Promise<Run>((resolve, reject) => {
      const key = openSync(keyFile, 'r');
      const child = spawn('/usr/bin/script', ['-q', '/dev/null', ...cmd], { env, stdio: [key, 'pipe', 'pipe'] });
      closeSync(key);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.stdout?.on('data', (d) => (stdout += d));
      child.stderr?.on('data', (d) => (stderr += d));
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('p4');
    expect(r.stdout).toContain('Press any key to close this window');
  }, 10000);

  it('with CPP_STARTER_WAIT_FOR_DEBUGGER=<file> it writes its pid there and runs nothing until the debugger releases it', async () => {
    const { out, res } = await build('wait_debugger');
    expect(res.code).toBe(0);
    const ready = path.join(dir, `ready-${arch}`);
    const env = { CPP_STARTER_NO_PAUSE: '1', CPP_STARTER_WAIT_FOR_DEBUGGER: ready };
    const [cmd, args] = arch === 'x86_64' ? ['arch', ['-x86_64', out]] : [out, []];
    const child = spawn(cmd, args, { env });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    const exited = new Promise<number | null>((resolve) => child.on('close', resolve));

    let pid = '';
    for (let i = 0; i < 100 && pid === ''; i++) {
      await new Promise((r) => setTimeout(r, 50));
      pid = await readFile(ready, 'utf8').catch(() => '');
    }
    // `arch` execs the program, so the child's pid is the program's pid.
    expect(pid.trim()).toBe(String(child.pid));
    await new Promise((r) => setTimeout(r, 1000));
    expect(stdout).toBe('');

    // Attaching alone must not release it: the debugger sets the flag, as the extension does.
    const lldb = await realExec('xcrun', [
      'lldb', '--batch',
      '-o', `process attach --pid ${child.pid}`,
      '-o', 'expression -- cpp_starter_debugger_attached = 1',
      '-o', 'continue',
    ], {
      timeoutMs: 20000,
    });
    expect(lldb.stdout + lldb.stderr).not.toMatch(/attach failed/);
    expect(await exited).toBe(0);
    expect(stdout).toBe('init\nmain\n');
  }, 30000);

  it('without CPP_STARTER_WAIT_FOR_DEBUGGER the program runs at once', async () => {
    expect((await buildAndRun('wait_debugger')).stdout).toBe('init\nmain\n');
  });

  it('exit pause does not hang when stdin is not a TTY', async () => {
    const env = { ...process.env };
    delete env.CPP_STARTER_NO_PAUSE;
    const r = await buildAndRun('exit_pause', '', env);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('done\n');
  }, 10000);
});
