import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
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

  async function build(name: string) {
    const out = path.join(dir, `${name}-${arch}`);
    // `xcrun clang++` supplies the macOS SDK sysroot that the bare binary lacks.
    const res = await realExec('xcrun', [
      'clang++',
      '-std=c++17', '-g', '-O0', '-Wall', '-arch', arch,
      '-include', path.join(shims, 'cpp_starter_compat.h'),
      '-I', path.join(shims, 'include'),
      '-Wno-unknown-pragmas',
      path.join(fixtures, `${name}.cpp`), '-o', out,
    ]);
    return { out, res };
  }

  async function buildAndRun(name: string, stdin = '', env: NodeJS.ProcessEnv = { CPP_STARTER_NO_PAUSE: '1' }) {
    const { out, res } = await build(name);
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

  it('exit pause does not hang when stdin is not a TTY', async () => {
    const env = { ...process.env };
    delete env.CPP_STARTER_NO_PAUSE;
    const r = await buildAndRun('exit_pause', '', env);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('done\n');
  }, 10000);
});
