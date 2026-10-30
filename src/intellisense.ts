import { readdir } from 'fs/promises';
import * as vscode from 'vscode';
import {
  compileCommandEntries,
  compileCommandsPath,
  desiredClangdSettings,
  findSlnDir,
  isOurs,
  updateCompileCommandsFile,
  type ClangdSettings,
  type UpdateResult,
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

/** Solution mode only. Never throws: a failure is logged. */
export async function writeCompileCommands(target: BuildTarget, args: string[], clang: string): Promise<void> {
  if (!target.key.toLowerCase().endsWith('.vcxproj') || !vscode.workspace.isTrusted) return;
  let result: UpdateResult;
  try {
    const dir = await findSlnDir(target.dir, (d) => readdir(d));
    result = await updateCompileCommandsFile(
      compileCommandsPath(dir),
      compileCommandEntries(target, args, clang),
    );
  } catch (error) {
    getOutputChannel().appendLine(
      `Could not write compile_commands.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (result === 'refused') {
    getOutputChannel().appendLine('Skipped compile_commands.json: the existing file is not a regular file.');
  } else if (result === 'written') {
    // clangd caches "no compile_commands.json here" and does not always notice the new file
    // for documents that are already open, so restart it, only when the content changed.
    void vscode.commands.executeCommand('clangd.restart').then(undefined, (error: unknown) =>
      getOutputChannel().appendLine(
        `Could not restart clangd: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}
