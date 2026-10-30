import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { findMains, resolveBuildTarget, type ProjectFs } from '../../src/projectModel';

const fixtures = path.resolve(__dirname, '../fixtures');
const multi = path.join(fixtures, 'multi');
const twomains = path.join(fixtures, 'twomains');
const solution = path.join(fixtures, 'solution');
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

describe('resolveBuildTarget (solution mode)', () => {
  it('builds the project whose folder contains the active file', async () => {
    const result = await resolveBuildTarget(path.join(solution, 'Lab2/main.cpp'), fsApi);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const lab2 = path.join(solution, 'Lab2');
    expect(result.target.key).toBe(path.join(lab2, 'Lab2.vcxproj'));
    expect(result.target.name).toBe('Lab2');
    expect(result.target.dir).toBe(lab2);
    expect(result.target.sources).toEqual([path.join(lab2, 'main.cpp'), path.join(lab2, 'util/helper.cpp')]);
    expect(result.target.includeDirs).toContain(path.join(solution, 'common'));
    expect(result.target.defines).toContain('_DEBUG');
  });

  it('finds the solution from a subfolder of a project (util/helper.cpp)', async () => {
    const result = await resolveBuildTarget(path.join(solution, 'Lab2/util/helper.cpp'), fsApi);
    expect(result.kind === 'ok' && result.target.name).toBe('Lab2');
  });

  it('asks which project when the file is outside every project, and honours chosenProject', async () => {
    const file = path.join(solution, 'scratch.cpp');
    const picked = await resolveBuildTarget(file, fsApi);
    expect(picked).toEqual({
      kind: 'pickProject',
      projects: [
        { name: 'Lab1', vcxprojPath: path.join(solution, 'Lab1/Lab1.vcxproj') },
        { name: 'Lab2', vcxprojPath: path.join(solution, 'Lab2/Lab2.vcxproj') },
      ],
    });
    const chosen = await resolveBuildTarget(file, fsApi, 'Lab1');
    expect(chosen.kind === 'ok' && chosen.target.name).toBe('Lab1');
  });
});

/** In-memory tree: keys are absolute paths, string values are files, null values are directories. */
function memFs(files: Record<string, string>): ProjectFs {
  const dirs = new Set<string>();
  for (const f of Object.keys(files)) for (let d = path.dirname(f); !dirs.has(d); d = path.dirname(d)) dirs.add(d);
  return {
    readdir: async (dir) => {
      if (!dirs.has(dir)) throw new Error(`ENOENT ${dir}`);
      const names = new Set<string>();
      for (const p of [...Object.keys(files), ...dirs]) if (path.dirname(p) === dir && p !== dir) names.add(path.basename(p));
      return [...names];
    },
    readFile: async (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p];
    },
  };
}

const slnFor = (...projs: string[]): string =>
  projs
    .map((p) => `Project("{8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942}") = "${p}", "${p}\\${p}.vcxproj", "{AAAA}"\r\nEndProject\r\n`)
    .join('');
const vcx = (...cpps: string[]): string =>
  `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><ItemGroup>${cpps.map((c) => `<ClCompile Include="${c}" />`).join('')}</ItemGroup></Project>`;
const MAIN = 'int main() {}';

describe('resolveBuildTarget (solution detection rules)', () => {
  it('ignores a .sln more than 3 ancestors up', async () => {
    const f = '/r/a/b/c/d/x.cpp'; // .sln at /r is 4 levels above /r/a/b/c/d
    const api = memFs({ '/r/S.sln': slnFor('P'), '/r/P/P.vcxproj': vcx('m.cpp'), '/r/P/m.cpp': MAIN, [f]: MAIN });
    const result = await resolveBuildTarget(f, api);
    expect(result.kind === 'ok' && result.target.key).toBe('/r/a/b/c/d');
  });

  it('uses a .sln exactly 3 ancestors up', async () => {
    const f = '/r/a/b/c/x.cpp';
    const api = memFs({ '/r/S.sln': slnFor('P'), '/r/P/P.vcxproj': vcx('m.cpp'), '/r/P/m.cpp': MAIN, [f]: MAIN });
    const result = await resolveBuildTarget(f, api);
    expect(result.kind === 'ok' && result.target.key).toBe('/r/P/P.vcxproj');
  });

  it('falls back to folder mode when one level has several .sln files', async () => {
    const api = memFs({
      '/r/A.sln': slnFor('P'),
      '/r/B.sln': slnFor('P'),
      '/r/P/P.vcxproj': vcx('m.cpp'),
      '/r/P/m.cpp': MAIN,
    });
    const result = await resolveBuildTarget('/r/P/m.cpp', api);
    expect(result.kind === 'ok' && result.target.key).toBe('/r/P');
  });

  it('stops at the nearest level that has a .sln', async () => {
    const api = memFs({
      '/r/Outer.sln': slnFor('Q'),
      '/r/Q/Q.vcxproj': vcx('m.cpp'),
      '/r/Q/m.cpp': MAIN,
      '/r/in/Inner.sln': slnFor('P'),
      '/r/in/P/P.vcxproj': vcx('m.cpp'),
      '/r/in/P/m.cpp': MAIN,
    });
    const result = await resolveBuildTarget('/r/in/P/m.cpp', api);
    expect(result.kind === 'ok' && result.target.key).toBe('/r/in/P/P.vcxproj');
  });

  it('treats a lone .vcxproj in the file folder as a one-project solution (SolutionDir = project dir)', async () => {
    const xml =
      '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><ItemDefinitionGroup Condition="\'$(Configuration)|$(Platform)\'==\'Debug|x64\'"><ClCompile><AdditionalIncludeDirectories>$(SolutionDir)inc</AdditionalIncludeDirectories></ClCompile></ItemDefinitionGroup><ItemGroup><ClCompile Include="m.cpp" /></ItemGroup></Project>';
    const api = memFs({ '/r/P/P.vcxproj': xml, '/r/P/m.cpp': MAIN });
    const result = await resolveBuildTarget('/r/P/m.cpp', api);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.target.name).toBe('P');
    expect(result.target.key).toBe('/r/P/P.vcxproj');
    expect(result.target.includeDirs).toEqual(['/r/P/inc']);
  });

  it('skips an unreadable project; with none left returns noSources for the .sln folder', async () => {
    const api = memFs({ '/r/S.sln': slnFor('Gone', 'P'), '/r/P/P.vcxproj': vcx('m.cpp'), '/r/P/m.cpp': MAIN, '/r/x.cpp': MAIN });
    const one = await resolveBuildTarget('/r/x.cpp', api);
    expect(one.kind === 'ok' && one.target.name).toBe('P');

    const none = memFs({ '/r/S.sln': slnFor('Gone'), '/r/x.cpp': MAIN });
    expect(await resolveBuildTarget('/r/x.cpp', none)).toEqual({ kind: 'noSources', dir: '/r' });
  });

  it('reports multipleMains for a project with two mains', async () => {
    const api = memFs({ '/r/S.sln': slnFor('P'), '/r/P/P.vcxproj': vcx('a.cpp', 'b.cpp'), '/r/P/a.cpp': MAIN, '/r/P/b.cpp': MAIN });
    expect(await resolveBuildTarget('/r/P/a.cpp', api)).toEqual({
      kind: 'multipleMains',
      dir: '/r/P',
      files: ['/r/P/a.cpp', '/r/P/b.cpp'],
    });
  });

  it('ignores excluded sources when counting mains', async () => {
    const result = await resolveBuildTarget(path.join(solution, 'Lab2/main.cpp'), fsApi);
    expect(result.kind).toBe('ok'); // old.cpp and skip.cpp also define main but are excluded
  });
});
