import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createProject, HELLO_WORLD } from '../../src/projectTemplate';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cppstarter-tpl-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('createProject', () => {
  it('creates <parent>/<name>/main.cpp with the Hello World template', async () => {
    const result = await createProject(tmp, 'Lab1');
    const dir = path.join(tmp, 'Lab1');
    expect(result).toEqual({ ok: true, dir, mainFile: path.join(dir, 'main.cpp') });
    expect(fs.readFileSync(path.join(dir, 'main.cpp'), 'utf8')).toBe(HELLO_WORLD);
  });

  it('uses the Visual Studio console template text', () => {
    expect(HELLO_WORLD).toBe('#include <iostream>\n\nint main()\n{\n    std::cout << "Hello World!\\n";\n}\n');
  });

  it('creates a missing parent folder', async () => {
    const parent = path.join(tmp, 'C++ Projects');
    const result = await createProject(parent, 'App');
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(parent, 'App', 'main.cpp'))).toBe(true);
  });

  it.each(['', '   '])('rejects an empty name %j', async (name) => {
    expect(await createProject(tmp, name)).toEqual({ ok: false, error: 'Please enter a project name.' });
  });

  it.each(['a/b', 'a:b', '.hidden'])('rejects the name %j', async (name) => {
    expect(await createProject(tmp, name)).toEqual({
      ok: false,
      error: "A project name can't contain / or : or start with a dot.",
    });
  });

  it('rejects a folder that already exists', async () => {
    fs.mkdirSync(path.join(tmp, 'Taken'));
    expect(await createProject(tmp, 'Taken')).toEqual({
      ok: false,
      error: "A folder named 'Taken' already exists here. Choose another name.",
    });
  });
});
