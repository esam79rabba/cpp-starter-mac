import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The Visual Studio 2022 console application template body. */
export const HELLO_WORLD = `#include <iostream>

int main()
{
    std::cout << "Hello World!\\n";
}
`;

export type CreateProjectResult =
  | { ok: true; dir: string; mainFile: string }
  | { ok: false; error: string };

/** Replaces a leading `~` with the user's home folder. */
export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function validateName(name: string): string | undefined {
  if (name.trim() === '') return 'Please enter a project name.';
  if (name.includes('/') || name.includes(':') || name.startsWith('.')) {
    return "A project name can't contain / or : or start with a dot.";
  }
  return undefined;
}

/** Validates the name only (for the input box). */
export const validateProjectName = validateName;

export async function createProject(parentDir: string, name: string): Promise<CreateProjectResult> {
  const invalid = validateName(name);
  if (invalid) return { ok: false, error: invalid };

  const parent = expandHome(parentDir);
  const dir = path.join(parent, name);
  try {
    await fs.promises.mkdir(parent, { recursive: true });
    // Non-recursive mkdir fails with EEXIST, so the existence check and creation are atomic.
    await fs.promises.mkdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return { ok: false, error: `A folder named '${name}' already exists here. Choose another name.` };
    }
    return { ok: false, error: `Couldn't create the project: ${(error as Error).message}` };
  }
  const mainFile = path.join(dir, 'main.cpp');
  try {
    await fs.promises.writeFile(mainFile, HELLO_WORLD, 'utf8');
  } catch (error) {
    return { ok: false, error: `Couldn't create the project: ${(error as Error).message}` };
  }
  return { ok: true, dir, mainFile };
}
