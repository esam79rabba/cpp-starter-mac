import * as path from 'path';

export interface SolutionProject {
  name: string;
  vcxprojPath: string;
}

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

/**
 * Decides what F5 builds for the active file. Folder mode: every .cpp/.cc/.cxx directly
 * in the file's folder. `chosenProject` is reserved for solution mode (Task 5).
 */
export async function resolveBuildTarget(
  file: string | undefined,
  fsApi: ProjectFs,
  chosenProject?: string,
): Promise<ResolveResult> {
  void chosenProject;
  if (file === undefined || !hasExtension(file, FILE_EXTENSIONS)) return { kind: 'noFile' };
  const dir = path.dirname(file);
  // Task 5: solution detection (file's directory + up to 3 ancestors) goes here.
  return resolveFolder(dir, fsApi);
}
