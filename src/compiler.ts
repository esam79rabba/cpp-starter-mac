import { createHash } from 'crypto';
import { mkdir, rm, stat } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import type { ExecFn } from './exec';
import type { BuildTarget } from './projectModel';

export type { BuildTarget };
export type Arch = 'native' | 'x86_64';

export interface CompilerDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'note';
  message: string;
}

export function buildArgs(
  target: BuildTarget,
  out: string,
  shimDir: string,
  arch: Arch,
  sdk: string,
): string[] {
  return [
    '-std=c++17',
    '-g',
    '-O0',
    '-Wall',
    '-fno-color-diagnostics',
    '-fno-caret-diagnostics',
    '-Wno-unknown-pragmas',
    '-isysroot',
    sdk,
    '-include',
    `${shimDir}/cpp_starter_compat.h`,
    '-I',
    `${shimDir}/include`,
    ...target.includeDirs.flatMap((dir) => ['-I', dir]),
    ...target.defines.flatMap((def) => ['-D', def]),
    ...(arch === 'x86_64' ? ['-arch', 'x86_64'] : []),
    ...target.sources,
    '-o',
    out,
  ];
}

export function outputPath(storageDir: string, target: BuildTarget): string {
  const hash = createHash('sha1').update(target.key).digest('hex').slice(0, 12);
  const name = target.name.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(storageDir, 'builds', hash, name === '' ? 'program' : name);
}

const DIAGNOSTIC_LINE = /^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;
const DUPLICATE_MAIN = /duplicate symbol '_main'/;
const UNDEFINED_SYMBOLS = /undefined symbols? for architecture|symbol\(s\) not found for architecture/i;

/**
 * Parses clang/ld output. `sources` supplies the file for linker errors; `failed` makes sure
 * a failed build never reports zero problems.
 */
export function parseDiagnostics(
  output: string,
  cwd: string,
  sources: string[],
  failed = false,
): CompilerDiagnostic[] {
  const lines = output.split(/\r?\n/);
  const linkerFile = sources[0] === undefined ? cwd : sources[0];
  const diagnostics: CompilerDiagnostic[] = [];
  let linkerReported = false;

  for (const text of lines) {
    const match = DIAGNOSTIC_LINE.exec(text);
    if (match) {
      diagnostics.push({
        file: isAbsolute(match[1]) ? match[1] : resolve(cwd, match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        severity: match[4] === 'fatal error' ? 'error' : (match[4] as 'error' | 'warning' | 'note'),
        message: match[5],
      });
    } else if (!linkerReported && (DUPLICATE_MAIN.test(text) || UNDEFINED_SYMBOLS.test(text))) {
      linkerReported = true;
      diagnostics.push({
        file: linkerFile,
        line: 1,
        column: 1,
        severity: 'error',
        message: text.trim(),
      });
    }
  }

  if (diagnostics.length === 0 && failed) {
    const last = lines.map((l) => l.trim()).filter((l) => l !== '').pop();
    diagnostics.push({
      file: linkerFile,
      line: 1,
      column: 1,
      severity: 'error',
      message: last ?? 'The build failed.',
    });
  }
  return diagnostics;
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

export interface BuildResult {
  ok: boolean;
  exe: string;
  diagnostics: CompilerDiagnostic[];
  rawOutput: string;
}

export async function build(
  target: BuildTarget,
  opts: {
    exec: ExecFn;
    clang: string;
    storageDir: string;
    shimDir: string;
    arch: Arch;
    sdk: string;
  },
): Promise<BuildResult> {
  const exe = outputPath(opts.storageDir, target);
  const dsym = `${exe}.dSYM`;
  await mkdir(join(exe, '..'), { recursive: true });
  // A failed build must never leave an older executable to be run or debugged.
  await rm(exe, { force: true });
  await rm(dsym, { recursive: true, force: true });

  const result = await opts.exec(
    opts.clang,
    buildArgs(target, exe, opts.shimDir, opts.arch, opts.sdk),
    { cwd: target.dir },
  );
  const rawOutput = result.stdout + result.stderr;
  const ok = result.code === 0;
  const diagnostics = parseDiagnostics(rawOutput, target.dir, target.sources, !ok);

  if (ok && !(await exists(dsym))) {
    // clang normally runs dsymutil for -g; make sure breakpoints resolve in every source file.
    await opts.exec('xcrun', ['dsymutil', exe], { cwd: target.dir });
  }
  return { ok, exe, diagnostics, rawOutput };
}
