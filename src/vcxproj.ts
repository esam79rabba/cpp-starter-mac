import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

export interface SolutionProject {
  name: string;
  vcxprojPath: string;
}

export interface VcxprojInfo {
  sources: string[];
  includeDirs: string[];
  defines: string[];
}

const PROJECT_LINE = /^Project\("\{[^}]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+\.vcxproj)"/;
const SOURCE_EXTENSIONS = ['.cpp', '.cc', '.cxx'];
const IGNORED_DEFINES = new Set(['WIN32', '_WINDOWS', '_CONSOLE']);

/** Lists the .vcxproj projects of a .sln. Solution folders have no .vcxproj and are skipped. */
export function parseSolution(slnText: string, slnDir: string): SolutionProject[] {
  const projects: SolutionProject[] = [];
  for (const line of slnText.split(/\r?\n/)) {
    const match = PROJECT_LINE.exec(line);
    if (match) {
      projects.push({ name: match[1], vcxprojPath: path.resolve(slnDir, match[2].replace(/\\/g, '/')) });
    }
  }
  return projects;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ['ItemGroup', 'ItemDefinitionGroup', 'ClCompile', 'ExcludedFromBuild', 'ProjectConfiguration'].includes(name),
});

type XmlNode = Record<string, unknown>;
const asNodes = (value: unknown): XmlNode[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).map((v) =>
    typeof v === 'object' && v !== null ? (v as XmlNode) : { '#text': String(v) },
  );
const textOf = (node: XmlNode | undefined): string => String(node?.['#text'] ?? '').trim();
const attr = (node: XmlNode, name: string): string | undefined => {
  const v = node[`@_${name}`];
  return typeof v === 'string' ? v : undefined;
};
/** `'$(Configuration)|$(Platform)'=='Debug|x64'` -> `Debug|x64` */
const configOf = (condition: string | undefined): string | undefined => /==\s*'([^']*)'/.exec(condition ?? '')?.[1];

function isExcluded(item: XmlNode, allConfigs: string[]): boolean {
  const exclusions = asNodes(item.ExcludedFromBuild).filter((e) => textOf(e).toLowerCase() === 'true');
  if (exclusions.length === 0) return false;
  if (exclusions.some((e) => attr(e, 'Condition') === undefined)) return true;
  const excluded = new Set(exclusions.map((e) => configOf(attr(e, 'Condition'))));
  return allConfigs.length > 0 && allConfigs.every((c) => excluded.has(c));
}

function expandList(raw: string, projectDir: string, solutionDir: string): string[] {
  return raw
    .split(';')
    .map((e) => e.trim())
    .filter((e) => e !== '' && !e.startsWith('%('))
    .map((e) => e.replace(/\$\(ProjectDir\)/g, `${projectDir}/`).replace(/\$\(SolutionDir\)/g, `${solutionDir}/`))
    .filter((e) => !e.includes('$('));
}

/** Reads sources, include dirs and defines (Debug|x64 preferred) from a .vcxproj. Sources keep file order. */
export function parseVcxproj(xml: string, projectDir: string, solutionDir: string): VcxprojInfo {
  const root = (parser.parse(xml) as { Project?: XmlNode }).Project ?? {};
  const groups = asNodes(root.ItemGroup);
  const defGroups = asNodes(root.ItemDefinitionGroup);

  const declared = groups
    .flatMap((g) => asNodes(g.ProjectConfiguration))
    .map((c) => attr(c, 'Include'))
    .filter((c): c is string => c !== undefined);
  const allConfigs = declared.length > 0 ? declared : defGroups.map((g) => configOf(attr(g, 'Condition'))).filter((c): c is string => c !== undefined);

  const seen = new Set<string>();
  const sources: string[] = [];
  for (const item of groups.flatMap((g) => asNodes(g.ClCompile))) {
    const include = attr(item, 'Include');
    if (include === undefined || !SOURCE_EXTENSIONS.includes(path.extname(include).toLowerCase())) continue;
    if (isExcluded(item, allConfigs)) continue;
    const abs = path.resolve(projectDir, include.replace(/\\/g, '/'));
    if (!seen.has(abs)) {
      seen.add(abs);
      sources.push(abs);
    }
  }

  const conditionOf = (g: XmlNode): string => attr(g, 'Condition') ?? '';
  const chosen =
    defGroups.find((g) => conditionOf(g).includes('Debug|x64')) ??
    defGroups.find((g) => conditionOf(g).includes('Debug|')) ??
    defGroups[0];
  const settings = asNodes(chosen?.ClCompile)[0];

  const includeDirs = expandList(textOf(asNodes(settings?.AdditionalIncludeDirectories)[0]), projectDir, solutionDir).map((d) =>
    path.resolve(projectDir, d.replace(/\\/g, '/')),
  );
  const defines = expandList(textOf(asNodes(settings?.PreprocessorDefinitions)[0]), projectDir, solutionDir).filter(
    (d) => !IGNORED_DEFINES.has(d),
  );
  return { sources, includeDirs, defines };
}
