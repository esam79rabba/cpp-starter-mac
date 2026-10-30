import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';

const root = path.resolve(__dirname, '../..');

describe('vsix contents', () => {
  const files = execFileSync('npx', ['vsce', 'ls', '--no-dependencies'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  it('contains exactly the files meant to be published', () => {
    const top = new Set(files.map((f) => f.split('/')[0]));
    expect([...top].sort()).toEqual(
      ['CHANGELOG.md', 'LICENSE', 'README.md', 'dist', 'media', 'package.json', 'shims'].sort(),
    );
    expect(files.filter((f) => f.startsWith('media/'))).toEqual(['media/icon.png']);
    expect(files).toContain('dist/extension.js');
  });

  it('ships the compat shim and the Visual Studio header stand-ins', () => {
    expect(files).toContain('shims/cpp_starter_compat.h');
    expect(files).toContain('shims/cpp_starter_compat.cpp');
    for (const h of ['pch.h', 'stdafx.h', 'conio.h']) expect(files).toContain(`shims/include/${h}`);
  });
});
