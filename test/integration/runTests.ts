import { spawnSync } from 'child_process';
import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './index');
  // The fixtures folder is the workspace so tests can open files from every fixture project.
  const workspaceFolder = path.resolve(extensionDevelopmentPath, 'test/fixtures');

  const vscodeExecutablePath = await downloadAndUnzipVSCode();
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

  // extensionDependencies must be present in the test instance or the extension cannot activate.
  const install = spawnSync(
    cli,
    [...cliArgs, '--install-extension', 'llvm-vs-code-extensions.vscode-clangd'],
    { encoding: 'utf8' },
  );
  if (install.status !== 0) {
    throw new Error(`Installing vscode-clangd failed:\n${install.stdout}\n${install.stderr}`);
  }

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspaceFolder],
    extensionTestsEnv: { CPP_STARTER_NO_PAUSE: '1' },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
