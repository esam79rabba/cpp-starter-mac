import { lstat, readFile, rename, rm, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { SHIM_SOURCE_NAME } from './compiler';
import { isDeepStrictEqual } from 'util';
import type { Toolchain } from './toolchain';
import type { BuildTarget } from './projectModel';

export interface CompileCommand {
  directory: string;
  file: string;
  arguments: string[];
}

export interface ClangdSettings {
  path: string;
  fallbackFlags: string[];
}

export function desiredClangdSettings(
  toolchain: Pick<Toolchain, 'clangd' | 'sdk'>,
  shimDir: string,
): ClangdSettings {
  return {
    path: toolchain.clangd,
    fallbackFlags: [
      '-std=c++17',
      '-Wno-unknown-pragmas',
      '-isysroot',
      toolchain.sdk,
      '-include',
      `${shimDir}/cpp_starter_compat.h`,
      '-I',
      `${shimDir}/include`,
    ],
  };
}

/** A global setting may be written if the user has none, or it still holds what we wrote. */
export function isOurs(globalValue: unknown, recorded: unknown): boolean {
  return globalValue === undefined || (recorded !== undefined && isDeepStrictEqual(globalValue, recorded));
}

/**
 * One entry per student source: the build's flags minus `-o <out>`, the sources and the
 * shim's own .cpp (it gets no entry), plus `-c <file>`.
 */
export function compileCommandEntries(target: BuildTarget, args: string[], clang: string): CompileCommand[] {
  const sources = new Set(target.sources);
  const flags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') {
      i++;
    } else if (!sources.has(args[i]) && basename(args[i]) !== SHIM_SOURCE_NAME) {
      flags.push(args[i]);
    }
  }
  return target.sources.map((file) => ({
    directory: target.dir,
    file,
    arguments: [clang, ...flags, '-c', file],
  }));
}

/** First of dir and its 3 ancestors holding exactly one .sln; otherwise dir itself. */
export async function findSlnDir(dir: string, readdir: (d: string) => Promise<string[]>): Promise<string> {
  let current = dir;
  for (let i = 0; i < 4; i++) {
    const entries = await readdir(current).catch(() => [] as string[]);
    if (entries.filter((e) => e.toLowerCase().endsWith('.sln')).length === 1) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dir;
}

export const compileCommandsPath = (dir: string): string => join(dir, 'compile_commands.json');

/**
 * Merges new entries into the existing compile_commands.json text. Existing entries for the
 * same files are replaced, all others kept; sorted by file so equal content gives equal text.
 * Unreadable or invalid existing content is ignored.
 */
export function mergeCompileCommands(existingText: string | undefined, fresh: CompileCommand[]): string {
  let kept: CompileCommand[] = [];
  try {
    const parsed: unknown = JSON.parse(existingText ?? '');
    if (Array.isArray(parsed)) {
      const replaced = new Set(fresh.map((e) => e.file));
      kept = parsed.filter(
        (e): e is CompileCommand =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as CompileCommand).file === 'string' &&
          typeof (e as CompileCommand).directory === 'string' &&
          Array.isArray((e as CompileCommand).arguments) &&
          !replaced.has((e as CompileCommand).file),
      );
    }
  } catch {
    kept = [];
  }
  const all = [...kept, ...fresh].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return JSON.stringify(all, null, 2) + '\n';
}

export type UpdateResult = 'written' | 'unchanged' | 'refused';

/**
 * Updates compile_commands.json safely: refuses a symlink or non-regular file at the path,
 * and replaces the file atomically (temp file in the same directory, then rename).
 */
export async function updateCompileCommandsFile(file: string, fresh: CompileCommand[]): Promise<UpdateResult> {
  const info = await lstat(file).catch(() => undefined);
  if (info && !info.isFile()) return 'refused';
  const existing = info ? await readFile(file, 'utf8').catch(() => undefined) : undefined;
  const text = mergeCompileCommands(existing, fresh);
  if (text === existing) return 'unchanged';
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temp, text, { flag: 'wx' });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return 'written';
}
