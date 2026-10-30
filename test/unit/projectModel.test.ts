import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { findMains, resolveBuildTarget } from '../../src/projectModel';

const fixtures = path.resolve(__dirname, '../fixtures');
const multi = path.join(fixtures, 'multi');
const twomains = path.join(fixtures, 'twomains');
const fsApi = {
  readdir: (dir: string) => fs.readdir(dir),
  readFile: (p: string) => fs.readFile(p, 'utf8'),
};

const cleanup: string[] = [];
afterAll(async () => {
  await Promise.all(cleanup.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('resolveBuildTarget (folder mode)', () => {
  it('builds every .cpp in the folder but none from subfolders', async () => {
    const result = await resolveBuildTarget(path.join(multi, 'main.cpp'), fsApi);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.target.sources).toEqual([path.join(multi, 'main.cpp'), path.join(multi, 'Student.cpp')]);
    expect(result.target.name).toBe('multi');
    expect(result.target.key).toBe(multi);
    expect(result.target.dir).toBe(multi);
    expect(result.target.includeDirs).toEqual([]);
    expect(result.target.defines).toEqual([]);
  });

  it('resolves a header to the same target as its .cpp', async () => {
    const fromHeader = await resolveBuildTarget(path.join(multi, 'Student.h'), fsApi);
    const fromCpp = await resolveBuildTarget(path.join(multi, 'main.cpp'), fsApi);
    expect(fromHeader).toEqual(fromCpp);
  });

  it('returns noFile for undefined and for non-C++ files', async () => {
    expect(await resolveBuildTarget(undefined, fsApi)).toEqual({ kind: 'noFile' });
    expect(await resolveBuildTarget(path.join(multi, 'README.md'), fsApi)).toEqual({ kind: 'noFile' });
  });

  it('returns noSources for a folder with only headers', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'pm-'));
    cleanup.push(dir);
    await fs.writeFile(path.join(dir, 'a.h'), '');
    expect(await resolveBuildTarget(path.join(dir, 'a.h'), fsApi)).toEqual({ kind: 'noSources', dir });
  });

  it('returns multipleMains listing both files', async () => {
    const result = await resolveBuildTarget(path.join(twomains, 'lab1.cpp'), fsApi);
    expect(result).toEqual({
      kind: 'multipleMains',
      dir: twomains,
      files: [path.join(twomains, 'lab1.cpp'), path.join(twomains, 'lab2.cpp')],
    });
  });
});

describe('findMains', () => {
  const find = (text: string) => findMains([{ path: 'x.cpp', text }]);

  it('finds int main and void main', () => {
    expect(find('int main() {}')).toEqual(['x.cpp']);
    expect(find('void main() {}')).toEqual(['x.cpp']);
    expect(find('int  main (int argc, char** argv) {}')).toEqual(['x.cpp']);
  });

  it('ignores line and block comments, including multi-line', () => {
    expect(find('// int main() {}')).toEqual([]);
    expect(find('/* int main() {} */')).toEqual([]);
    expect(find('/*\n int main(\n*/ int x;')).toEqual([]);
  });

  it('ignores string literals, including escaped quotes', () => {
    expect(find('const char* s = "int main(";')).toEqual([]);
    expect(find('const char* s = "a\\" int main(";')).toEqual([]);
  });

  it('handles char literals such as the double quote', () => {
    expect(find("char c = '\"'; int main() {}")).toEqual(['x.cpp']);
    expect(find("char c = '\\''; int main() {}")).toEqual(['x.cpp']);
  });

  it('does not match identifiers that merely contain main', () => {
    expect(find('int domain() {} int mainly(){}')).toEqual([]);
  });
});
