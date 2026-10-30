import { mkdtemp, readFile, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  mergeCompileCommands,
  updateCompileCommandsFile,
  compileCommandEntries,
  desiredClangdSettings,
  findSlnDir,
  isOurs,
} from '../../src/intellisenseCore';
import type { BuildTarget } from '../../src/projectModel';

const target: BuildTarget = {
  key: '/s/Lab2/Lab2.vcxproj',
  name: 'Lab2',
  dir: '/s/Lab2',
  sources: ['/s/Lab2/main.cpp', '/s/Lab2/util/helper.cpp'],
  includeDirs: ['/s/common'],
  defines: [],
};

describe('desiredClangdSettings', () => {
  it('uses the exact path and fallback flags', () => {
    expect(desiredClangdSettings({ clangd: '/usr/bin/clangd', sdk: '/sdk' }, '/shims')).toEqual({
      path: '/usr/bin/clangd',
      fallbackFlags: [
        '-std=c++17',
        '-Wno-unknown-pragmas',
        '-isysroot',
        '/sdk',
        '-include',
        '/shims/cpp_starter_compat.h',
        '-I',
        '/shims/include',
      ],
    });
  });
});

describe('isOurs', () => {
  it('allows writing when the user has no global value', () => {
    expect(isOurs(undefined, undefined)).toBe(true);
    expect(isOurs(undefined, 'x')).toBe(true);
  });
  it('allows overwriting only a value deep-equal to the recorded one', () => {
    expect(isOurs(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isOurs('/old', '/old')).toBe(true);
    expect(isOurs(['a', 'c'], ['a', 'b'])).toBe(false);
    expect(isOurs('/mine', undefined)).toBe(false);
  });
});

describe('compileCommandEntries', () => {
  const args = ['-std=c++17', '-I', '/s/common', '/s/Lab2/main.cpp', '/s/Lab2/util/helper.cpp', '-o', '/out/Lab2'];
  const entries = compileCommandEntries(target, args, '/usr/bin/clang++');

  it('has one entry per source with the project dir', () => {
    expect(entries.map((e) => e.file)).toEqual(target.sources);
    expect(entries.every((e) => e.directory === '/s/Lab2')).toBe(true);
  });
  it('drops -o, its value and all sources, then appends -c file', () => {
    expect(entries[1].arguments).toEqual([
      '/usr/bin/clang++', '-std=c++17', '-I', '/s/common', '-c', '/s/Lab2/util/helper.cpp',
    ]);
  });
});

describe('findSlnDir', () => {
  const fsOf = (tree: Record<string, string[]>) => async (d: string) => tree[d] ?? [];
  it('finds the single .sln among ancestors', async () => {
    const readdir = fsOf({ '/s/Lab2': ['Lab2.vcxproj'], '/s': ['Course.sln', 'Lab2'] });
    expect(await findSlnDir('/s/Lab2', readdir)).toBe('/s');
  });
  it('falls back to the project dir without a .sln', async () => {
    expect(await findSlnDir('/p/Lab', fsOf({}))).toBe('/p/Lab');
  });
  it('skips directories with two .sln files', async () => {
    const readdir = fsOf({ '/s': ['a.sln', 'b.sln'] });
    expect(await findSlnDir('/s/Lab', readdir)).toBe('/s/Lab');
  });
});

describe('mergeCompileCommands', () => {
  const entry = (file: string, flag: string) => ({ directory: '/d', file, arguments: ['clang', flag, '-c', file] });
  const lab2 = [entry('/s/Lab2/main.cpp', '-I/a'), entry('/s/Lab2/h.cpp', '-I/a')];
  const lab1 = [entry('/s/Lab1/main.cpp', '-I/b')];

  it('keeps both projects when Lab2 is built and then Lab1', () => {
    const first = mergeCompileCommands(undefined, lab2);
    const files = (JSON.parse(mergeCompileCommands(first, lab1)) as { file: string }[]).map((e) => e.file);
    expect(files).toEqual(['/s/Lab1/main.cpp', '/s/Lab2/h.cpp', '/s/Lab2/main.cpp']);
  });
  it('gives identical text when rebuilding with the same args', () => {
    const first = mergeCompileCommands(mergeCompileCommands(undefined, lab2), lab1);
    expect(mergeCompileCommands(first, lab2)).toBe(first);
  });
  it('replaces the entries of rebuilt files', () => {
    const first = mergeCompileCommands(undefined, lab2);
    const changed = JSON.parse(mergeCompileCommands(first, [entry('/s/Lab2/main.cpp', '-I/new')])) as { arguments: string[] }[];
    expect(changed[1].arguments).toContain('-I/new');
    expect(changed).toHaveLength(2);
  });
  it('starts fresh on invalid existing content', () => {
    for (const bad of ['not json', '{"a":1}', '[1,"x",{"file":3}]', '']) {
      expect(JSON.parse(mergeCompileCommands(bad, lab1))).toEqual(lab1);
    }
  });
});

describe('updateCompileCommandsFile', () => {
  const fresh = [{ directory: '/d', file: '/s/a.cpp', arguments: ['clang', '-c', '/s/a.cpp'] }];

  it('writes, then reports unchanged', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'cc-')), 'compile_commands.json');
    expect(await updateCompileCommandsFile(file, fresh)).toBe('written');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(fresh);
    expect(await updateCompileCommandsFile(file, fresh)).toBe('unchanged');
  });
  it('refuses a symlink and leaves its target untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cc-'));
    const victim = join(dir, 'victim.txt');
    await writeFile(victim, 'precious');
    const file = join(dir, 'compile_commands.json');
    await symlink(victim, file);
    expect(await updateCompileCommandsFile(file, fresh)).toBe('refused');
    expect(await readFile(victim, 'utf8')).toBe('precious');
  });
});
