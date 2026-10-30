import * as path from 'path';
import { parseSolution, parseVcxproj, type SolutionProject } from './vcxproj';

export type { SolutionProject };

export interface BuildTarget {
  /** Absolute folder path (folder mode) or absolute .vcxproj path (solution mode). */
  key: string;
  /** Folder name or project name. */
  name: string;
  dir: string;
  /** Absolute paths, sorted. */
  sources: string[];
  includeDirs: string[];
  defines: string[];
}

export type ResolveResult =
  | { kind: 'ok'; target: BuildTarget }
  | { kind: 'noFile' }
  | { kind: 'noSources'; dir: string }
  | { kind: 'multipleMains'; dir: string; files: string[] }
  | { kind: 'pickProject'; projects: SolutionProject[] };

export interface ProjectFs {
  readdir(dir: string): Promise<string[]>;
  readFile(p: string): Promise<string>;
}

const FILE_EXTENSIONS = ['.cpp', '.cc', '.cxx', '.h', '.hpp'];
const SOURCE_EXTENSIONS = ['.cpp', '.cc', '.cxx'];
const MAIN_PATTERN = /\b(int|void)\s+main\s*\(/;

const hasExtension = (file: string, extensions: string[]): boolean =>
  extensions.includes(path.extname(file).toLowerCase());

/** Case-insensitive first so main.cpp sorts before Student.cpp; raw order breaks ties. */
const byName = (a: string, b: string): number => {
  const lower = a.toLowerCase().localeCompare(b.toLowerCase(), 'en');
  return lower !== 0 ? lower : a < b ? -1 : a > b ? 1 : 0;
};

/** Replaces comments with a space and string/char literal contents with nothing. */
function stripCommentsAndLiterals(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
    } else if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') {
        i += text[i] === '\\' ? 2 : 1;
      }
      i++;
      out += ' ';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Returns the paths whose code (comments and literals removed) defines main. */
export function findMains(sources: { path: string; text: string }[]): string[] {
  return sources.filter((s) => MAIN_PATTERN.test(stripCommentsAndLiterals(s.text))).map((s) => s.path);
}

async function resolveFolder(dir: string, fsApi: ProjectFs): Promise<ResolveResult> {
  const names = await fsApi.readdir(dir);
  const sources = names
    .filter((n) => hasExtension(n, SOURCE_EXTENSIONS))
    .sort(byName)
    .map((n) => path.join(dir, n));
  if (sources.length === 0) return { kind: 'noSources', dir };

  const texts = await Promise.all(sources.map(async (p) => ({ path: p, text: await fsApi.readFile(p) })));
  const mains = findMains(texts);
  if (mains.length > 1) return { kind: 'multipleMains', dir, files: mains };

  return {
    kind: 'ok',
    target: { key: dir, name: path.basename(dir), dir, sources, includeDirs: [], defines: [] },
  };
}

const SOLUTION_ANCESTOR_LEVELS = 3;

const listByExtension = (names: string[], ext: string): string[] =>
  names.filter((n) => path.extname(n).toLowerCase() === ext).sort(byName);

async function safeReaddir(dir: string, fsApi: ProjectFs): Promise<string[]> {
  try {
    return await fsApi.readdir(dir);
  } catch {
    return [];
  }
}

/** Nearest directory (file's own + 3 ancestors) with a .sln; null if none, 'ambiguous' if that level has several. */
async function findSolution(startDir: string, fsApi: ProjectFs): Promise<{ dir: string; sln: string } | 'ambiguous' | null> {
  let dir = startDir;
  for (let level = 0; level <= SOLUTION_ANCESTOR_LEVELS; level++) {
    const slns = listByExtension(await safeReaddir(dir, fsApi), '.sln');
    if (slns.length === 1) return { dir, sln: path.join(dir, slns[0]) };
    if (slns.length > 1) return 'ambiguous';
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function resolveProject(
  project: SolutionProject,
  solutionDir: string,
  fsApi: ProjectFs,
): Promise<ResolveResult> {
  const dir = path.dirname(project.vcxprojPath);
  const info = parseVcxproj(await fsApi.readFile(project.vcxprojPath), dir, solutionDir);
  const sources = [...info.sources].sort(byName);
  if (sources.length === 0) return { kind: 'noSources', dir };

  const texts = await Promise.all(
    sources.map(async (p) => ({ path: p, text: await fsApi.readFile(p).catch(() => '') })),
  );
  const mains = findMains(texts);
  if (mains.length > 1) return { kind: 'multipleMains', dir, files: mains };

  return {
    kind: 'ok',
    target: {
      key: project.vcxprojPath,
      name: project.name,
      dir,
      sources,
      includeDirs: info.includeDirs,
      defines: info.defines,
    },
  };
}

const isInside = (file: string, dir: string): boolean => {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

async function readableProjects(candidates: SolutionProject[], fsApi: ProjectFs): Promise<SolutionProject[]> {
  const checked = await Promise.all(
    candidates.map(async (p) => {
      try {
        await fsApi.readFile(p.vcxprojPath);
        return p;
      } catch {
        return null;
      }
    }),
  );
  return checked.filter((p): p is SolutionProject => p !== null);
}

async function resolveSolution(
  file: string,
  solutionDir: string,
  candidates: SolutionProject[],
  fsApi: ProjectFs,
  chosenProject: string | undefined,
): Promise<ResolveResult> {
  const projects = await readableProjects(candidates, fsApi);
  if (projects.length === 0) return { kind: 'noSources', dir: solutionDir };

  const pick =
    projects.length === 1
      ? projects[0]
      : (projects.find((p) => p.name === chosenProject) ??
        (() => {
          const containing = projects.filter((p) => isInside(file, path.dirname(p.vcxprojPath)));
          return containing.length === 1 ? containing[0] : undefined;
        })());
  if (pick === undefined) return { kind: 'pickProject', projects };
  return resolveProject(pick, solutionDir, fsApi);
}

/**
 * Decides what F5 builds for the active file. Solution mode: a single .sln found in the file's
 * folder or up to 3 ancestors. Otherwise a .vcxproj next to the file is a one-project solution.
 * Otherwise folder mode: every .cpp/.cc/.cxx directly in the file's folder.
 */
export async function resolveBuildTarget(
  file: string | undefined,
  fsApi: ProjectFs,
  chosenProject?: string,
): Promise<ResolveResult> {
  if (file === undefined || !hasExtension(file, FILE_EXTENSIONS)) return { kind: 'noFile' };
  const dir = path.dirname(file);

  const found = await findSolution(dir, fsApi);
  if (found === 'ambiguous') return resolveFolder(dir, fsApi);
  if (found !== null) {
    try {
      const candidates = parseSolution(await fsApi.readFile(found.sln), found.dir);
      return resolveSolution(file, found.dir, candidates, fsApi, chosenProject);
    } catch {
      // Unreadable .sln: fall through to the other modes.
    }
  } else {
    const vcxprojs = listByExtension(await safeReaddir(dir, fsApi), '.vcxproj');
    if (vcxprojs.length > 0) {
      const candidates = vcxprojs.map((n) => ({ name: path.basename(n, path.extname(n)), vcxprojPath: path.join(dir, n) }));
      return resolveSolution(file, dir, candidates, fsApi, chosenProject);
    }
  }
  return resolveFolder(dir, fsApi);
}
