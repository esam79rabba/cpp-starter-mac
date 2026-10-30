import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));

describe('package.json contributions', () => {
  it('binds the Visual Studio keys to the C++ commands', () => {
    expect(manifest.contributes.keybindings).toEqual([
      { key: 'f5', command: 'cppStarter.startDebugging', when: 'editorLangId == cpp && !inDebugMode' },
      { key: 'ctrl+f5', command: 'cppStarter.runWithoutDebugging', when: 'editorLangId == cpp && !inDebugMode' },
      { key: 'ctrl+shift+b', command: 'cppStarter.build', when: 'editorLangId == cpp' },
      { key: 'cmd+shift+b', command: 'cppStarter.build', when: 'editorLangId == cpp' },
    ]);
  });

  it('adds Run and Build buttons to the editor title bar', () => {
    expect(manifest.contributes.menus['editor/title']).toEqual([
      { command: 'cppStarter.startDebugging', group: 'navigation@1', when: 'resourceLangId == cpp && !inDebugMode' },
      { command: 'cppStarter.build', group: 'navigation@2', when: 'resourceLangId == cpp && !inDebugMode' },
    ]);
  });
});
