import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildArgs, build, outputPath, parseDiagnostics, type BuildTarget } from '../../src/compiler';
import { realExec } from '../../src/exec';

const ROOT = resolve(__dirname, '../..');
const SHIMS = join(ROOT, 'shims');
const FIXTURES = join(ROOT, 'test/fixtures');

function target(dir: string, name: string, key = dir): BuildTarget {
  return { key, name, dir, sources: [join(dir, 'main.cpp')], includeDirs: [], defines: [] };
}

const exists = (p: string) => stat(p).then(() => true, () => false);

describe('buildArgs', () => {
  const t: BuildTarget = {
    key: '/p', name: 'p', dir: '/p', sources: ['/p/a.cpp', '/p/b.cpp'],
    includeDirs: ['/p/inc'], defines: ['_DEBUG'],
  };

  it('produces the exact argument list for native', () => {
    expect(buildArgs(t, '/out/p', '/shims', 'native', '/sdk')).toEqual([
      '-std=c++17', '-g', '-O0', '-Wall', '-fno-color-diagnostics', '-fno-caret-diagnostics',
      '-Wno-unknown-pragmas', '-isysroot', '/sdk',
      '-include', '/shims/cpp_starter_compat.h', '-I', '/shims/include',
      '-I', '/p/inc', '-D', '_DEBUG', '/p/a.cpp', '/p/b.cpp', '-o', '/out/p',
    ]);
  });

  it('puts -arch x86_64 right before the sources', () => {
    const args = buildArgs(t, '/out/p', '/shims', 'x86_64', '/sdk');
    const i = args.indexOf('/p/a.cpp');
    expect(args.slice(i - 2, i)).toEqual(['-arch', 'x86_64']);
  });
});

describe('outputPath', () => {
  it('sanitises the name under builds/<12 hex>', () => {
    expect(outputPath('/s', target('/d', 'واجب 1'))).toMatch(/builds\/[0-9a-f]{12}\/[A-Za-z0-9._-]+$/);
  });
  it('falls back to program for an empty name', () => {
    expect(outputPath('/s', target('/d', ''))).toMatch(/\/program$/);
  });
});

describe('parseDiagnostics', () => {
  const t = target('/w', 'w');
  it('parses an error and resolves relative paths against cwd', () => {
    expect(parseDiagnostics("main.cpp:5:3: error: expected ';' after expression\n1 error generated.\n", '/w', t.sources)).toEqual([
      { file: '/w/main.cpp', line: 5, column: 3, severity: 'error', message: "expected ';' after expression" },
    ]);
  });
  it('maps fatal error to error and keeps absolute paths', () => {
    const [d] = parseDiagnostics("/a/b.cpp:1:10: fatal error: 'x.h' file not found", '/w', t.sources);
    expect(d).toMatchObject({ file: '/a/b.cpp', severity: 'error', message: "'x.h' file not found" });
  });
  it('maps duplicate symbol to one error on the first source', () => {
    const out = "duplicate symbol '_main' in:\n    /t/a.o\n    /t/b.o\nld: 1 duplicate symbols\nclang++: error: linker command failed with exit code 1\n";
    expect(parseDiagnostics(out, '/w', t.sources)).toEqual([
      { file: '/w/main.cpp', line: 1, column: 1, severity: 'error', message: "duplicate symbol '_main' in:" },
    ]);
  });
  it('maps undefined symbols to one error on the first source', () => {
    const out = 'Undefined symbols for architecture arm64:\n  "_foo", referenced from:\nld: symbol(s) not found for architecture arm64\n';
    const ds = parseDiagnostics(out, '/w', t.sources);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ file: '/w/main.cpp', line: 1, column: 1, severity: 'error' });
    expect(ds[0].message).toMatch(/symbols? (not found )?for architecture/i);
  });
  it('falls back to the last stderr line when nothing parses and the build failed', () => {
    const ds = parseDiagnostics('weird failure\n\n', '/w', t.sources, true);
    expect(ds).toEqual([{ file: '/w/main.cpp', line: 1, column: 1, severity: 'error', message: 'weird failure' }]);
  });
  it('returns nothing for unparsable output when the build succeeded', () => {
    expect(parseDiagnostics('1 warning generated.\n', '/w', t.sources, false)).toEqual([]);
  });
});

describe('build (real clang++)', () => {
  let storageDir: string;
  let clang: string;
  let sdk: string;
  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'cppstarter-'));
    clang = (await realExec('xcrun', ['-f', 'clang++'])).stdout.trim();
    sdk = (await realExec('xcrun', ['--show-sdk-path'])).stdout.trim();
  });
  afterAll(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });
  const opts = () => ({ exec: realExec, clang, sdk, storageDir, shimDir: SHIMS, arch: 'native' as const });

  it('builds hello with exe and dSYM', async () => {
    const r = await build(target(join(FIXTURES, 'hello'), 'hello'), opts());
    expect(r.ok).toBe(true);
    expect(await exists(r.exe)).toBe(true);
    expect(await exists(`${r.exe}.dSYM`)).toBe(true);
  }, 60_000);

  it('removes the old exe when a rebuild fails', async () => {
    const dir = join(FIXTURES, 'errors/missing_semicolon');
    const t = target(dir, 'same', '/shared-key');
    const good = await build({ ...t, dir: join(FIXTURES, 'hello'), sources: [join(FIXTURES, 'hello/main.cpp')] }, opts());
    expect(good.ok).toBe(true);
    const bad = await build(t, opts());
    expect(bad.ok).toBe(false);
    expect(bad.exe).toBe(good.exe);
    expect(await exists(bad.exe)).toBe(false);
    expect(await exists(`${bad.exe}.dSYM`)).toBe(false);
    const errors = bad.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(5);
    expect(errors[0].message).toContain("expected ';'");
    expect(bad.rawOutput).toContain('expected');
  }, 60_000);

  it('builds a folder whose path has spaces, a plus and Arabic', async () => {
    const dir = join(FIXTURES, 'spaces/C++ Projects/واجب 1');
    const r = await build(target(dir, 'واجب 1'), opts());
    expect(r.ok).toBe(true);
    expect(await exists(r.exe)).toBe(true);
  }, 60_000);

  it('reports duplicate main as one error', async () => {
    const dir = join(FIXTURES, 'twomains');
    const t: BuildTarget = {
      key: dir, name: 'twomains', dir,
      sources: [join(dir, 'lab1.cpp'), join(dir, 'lab2.cpp')], includeDirs: [], defines: [],
    };
    const r = await build(t, opts());
    expect(r.ok).toBe(false);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0].message).toContain("duplicate symbol '_main'");
  }, 60_000);
});
