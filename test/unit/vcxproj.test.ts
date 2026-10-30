import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSolution, parseVcxproj } from '../../src/vcxproj';

const sol = path.resolve(__dirname, '../fixtures/solution');
const read = (p: string) => fs.readFile(p, 'utf8');

describe('parseSolution', () => {
  it('lists vcxproj projects, handles CRLF, skips solution folders', async () => {
    const text = await read(path.join(sol, 'Course.sln'));
    expect(text).toContain('\r\n');
    expect(parseSolution(text, sol)).toEqual([
      { name: 'Lab1', vcxprojPath: path.join(sol, 'Lab1/Lab1.vcxproj') },
      { name: 'Lab2', vcxprojPath: path.join(sol, 'Lab2/Lab2.vcxproj') },
    ]);
  });
});

describe('parseVcxproj', () => {
  const lab2 = path.join(sol, 'Lab2');

  it('reads sources, include dirs and defines from the Debug|x64 group', async () => {
    const xml = await read(path.join(lab2, 'Lab2.vcxproj'));
    const result = parseVcxproj(xml, lab2, sol);
    expect(result.sources).toEqual([path.join(lab2, 'main.cpp'), path.join(lab2, 'util/helper.cpp')]);
    expect(result.includeDirs).toEqual([path.join(sol, 'common'), path.join(lab2, 'util')]);
    expect(result.defines).toEqual(['_DEBUG', 'LAB2=1']);
    expect(result.defines).not.toContain('_CONSOLE');
  });

  it('skips items excluded in every configuration (and a lone unconditional exclusion)', async () => {
    const xml = await read(path.join(lab2, 'Lab2.vcxproj'));
    const sources = parseVcxproj(xml, lab2, sol).sources;
    expect(sources).not.toContain(path.join(lab2, 'old.cpp'));
    expect(sources).not.toContain(path.join(lab2, 'skip.cpp'));
  });

  it('keeps an item excluded in only some configurations', () => {
    const xml = `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><ItemGroup>
      <ClCompile Include="a.cpp"><ExcludedFromBuild Condition="'$(Configuration)|$(Platform)'=='Release|x64'">true</ExcludedFromBuild></ClCompile>
    </ItemGroup></Project>`;
    expect(parseVcxproj(xml, '/p', '/p').sources).toEqual(['/p/a.cpp']);
  });

  it('falls back to a Debug| group, then the first group', () => {
    const mk = (cond: string) =>
      `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><ItemDefinitionGroup Condition="'$(Configuration)|$(Platform)'=='${cond}'"><ClCompile><PreprocessorDefinitions>X_${cond.replace('|', '_')}</PreprocessorDefinitions></ClCompile></ItemDefinitionGroup></Project>`;
    expect(parseVcxproj(mk('Debug|Win32'), '/p', '/p').defines).toEqual(['X_Debug_Win32']);
    expect(parseVcxproj(mk('Release|x64'), '/p', '/p').defines).toEqual(['X_Release_x64']);
  });

  it('handles a project with a single ClCompile and no definition groups', () => {
    const xml = `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><ItemGroup><ClCompile Include="main.cpp" /><ClCompile Include="x.c" /></ItemGroup></Project>`;
    expect(parseVcxproj(xml, '/p', '/p')).toEqual({ sources: ['/p/main.cpp'], includeDirs: [], defines: [] });
  });
});
