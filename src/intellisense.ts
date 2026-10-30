import { readdir, readFile, writeFile } from 'fs/promises';
import * as vscode from 'vscode';
import {
  compileCommandEntries,
  compileCommandsPath,
  desiredClangdSettings,
  findSlnDir,
  isOurs,
  type ClangdSettings,
} from './intellisenseCore';
import type { BuildTarget } from './projectModel';
import type { Toolchain } from './toolchain';
import { getOutputChannel } from './toolchainUi';

const MANAGED_KEY = 'cppStarter.clangdManaged';

/**
 * Points the clangd extension at Apple's clangd with flags that make loose folders work.
 * Only global (user) settings are touched, so no .vscode/settings.json appears in a project.
 */
export async function configureClangd(
  toolchain: Toolchain,
  shimDir: string,
  state: vscode.Memento,
): Promise<void> {
  const wanted = desiredClangdSettings(toolchain, shimDir);
  const recorded = state.get<Partial<ClangdSettings>>(MANAGED_KEY) ?? {};
  const config = vscode.workspace.getConfiguration('clangd');
  const written: Partial<ClangdSettings> = { ...recorded };
  for (const key of ['path', 'fallbackFlags'] as const) {
    const current = config.inspect(key)?.globalValue;
    if (!isOurs(current, recorded[key])) continue;
    await config.update(key, wanted[key], vscode.ConfigurationTarget.Global);
    Object.assign(written, { [key]: wanted[key] });
  }
  await state.update(MANAGED_KEY, written);
}

/** Solution mode only (key is a .vcxproj). Never throws: a failure is logged. */
export async function writeCompileCommands(target: BuildTarget, args: string[], clang: string): Promise<void> {
  if (!target.key.toLowerCase().endsWith('.vcxproj')) return;
  try {
    const dir = await findSlnDir(target.dir, (d) => readdir(d));
    const entries = compileCommandEntries(target, args, clang);
    const file = compileCommandsPath(dir);
    const text = JSON.stringify(entries, null, 2) + '\n';
    if ((await readFile(file, 'utf8').catch(() => undefined)) === text) return;
    await writeFile(file, text);
    // clangd caches "no compile_commands.json here" and does not always notice the new file
    // for documents that are already open, so restart it. Only when the content changed.
    await vscode.commands.executeCommand('clangd.restart');
  } catch (error) {
    getOutputChannel().appendLine(
      `Could not write compile_commands.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
