import { dirname, join } from 'path';
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

/** One entry per source: the build's flags minus `-o <out>` and the sources, plus `-c <file>`. */
export function compileCommandEntries(target: BuildTarget, args: string[], clang: string): CompileCommand[] {
  const sources = new Set(target.sources);
  const flags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') {
      i++;
    } else if (!sources.has(args[i])) {
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
