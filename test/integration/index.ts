import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  // MOCHA_GREP narrows the run to matching test names, e.g. MOCHA_GREP="breakpoint".
  const grep = process.env.MOCHA_GREP;
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000, ...(grep ? { grep } : {}) });
  const testsRoot = __dirname;
  const files = await glob('**/*.test.js', { cwd: testsRoot });
  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} integration test(s) failed.`)) : resolve(),
    );
  });
}
