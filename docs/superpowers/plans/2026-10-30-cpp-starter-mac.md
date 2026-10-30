# C++ Starter for Mac Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free VS Code extension that gives beginner C++ students on macOS a Visual Studio-like experience: one-click toolchain setup, a start page with "Create a new project", F5 builds and debugs with zero config files, and breakpoints always stop.

**Architecture:** The extension calls Apple's Command Line Tools directly: `clang++` to build, `lldb-dap` (ships in the CLT, verified at `/Library/Developer/CommandLineTools/usr/bin/lldb-dap`, LLVM 21) as the debug adapter, registered under our own debug type, so no launch.json/tasks.json is ever written. Pure logic (project model, `.vcxproj` parsing, argument building, diagnostic parsing) lives in modules with no `vscode` import and is unit-tested with vitest. Everything touching VS Code or the debugger is covered by integration tests in a real VS Code instance via `@vscode/test-electron`. Windows-only beginner code is handled by a forced-include C++ compatibility header shipped with the extension.

**Tech Stack:** TypeScript 5, VS Code API (engine `^1.95.0`), esbuild bundle, vitest (unit), mocha + `@vscode/test-electron` (integration), `fast-xml-parser` (`.vcxproj`), `@vscode/vsce` (packaging), clangd extension (`llvm-vs-code-extensions.vscode-clangd`) for IntelliSense.

**Spec:** `docs/superpowers/specs/2026-10-30-vc-mac-design.md`

**Name (builder's call per spec):** display name "C++ Starter for Mac", package name `cpp-starter-mac`, command/setting prefix `cppStarter`, debug type `cppstarter`. The name avoids Microsoft trademarks; the description may say "Visual Studio-style".

## Global Constraints

- macOS only: on activation, if `process.platform !== 'darwin'`, show "C++ Starter for Mac only works on macOS." and register nothing else.
- Toolchain: Apple clang and lldb from the Xcode Command Line Tools; full Xcode must not be required. Resolve tools with `xcrun -f <tool>`.
- Build flags always include `-std=c++17 -g -O0`.
- Students never see or edit `tasks.json` or `launch.json`; the extension never writes them.
- One program per folder: F5 builds every `.cpp` in the active file's folder, not subfolders.
- New project location default: `~/Documents/C++ Projects`.
- All user-facing text in English, written for beginners. No telemetry of any kind.
- MIT license, published free on the VS Code Marketplace.
- Every child process is started with `execFile`/`spawn` and an argument array, never a shell string (paths contain spaces and `+`).
- Breakpoint reliability is the first acceptance criterion (spec "Anti-goal").

## Review Focus

1. **F5 with unsaved edits:** a student edits and presses F5 without saving. Expected: all dirty files are saved before building (as Visual Studio does), so the running code and breakpoint lines match the editor. Test in Task 7.
2. **Paths with spaces, `+` and non-ASCII characters** (`~/Documents/C++ Projects/واجب 1/main.cpp`). Expected: build, debug and Ctrl+F5 all work. Tests in Tasks 6 and 7.
3. **A compile error when F5 is pressed after an earlier successful build.** Expected: the debugger does not start the old executable; errors show in Problems. Test in Task 7.
4. **F5 when the active editor is a `.h` file or no editor is open.** Expected: a `.h` uses its own folder; with no `.cpp`/`.h` editor, use the most recently active `.cpp` editor, else show "Open a .cpp file first, then press F5." Test in Task 4.
5. **A breakpoint in the second `.cpp` file of a multi-file program** (single-step compile+link on macOS relies on `dsymutil`). Expected: it stops. Test in Task 7.

## File Structure

```
package.json                 manifest: commands, keybindings, menus, debugger, settings
tsconfig.json  esbuild.mjs  vitest.config.ts  .vscodeignore  LICENSE  README.md  CHANGELOG.md
media/icon.png               128x128 Marketplace icon (generated in Task 11)
shims/cpp_starter_compat.h   forced include: system("pause"/"cls"), scanf_s, printf_s, exit pause
shims/include/pch.h          empty, #pragma once
shims/include/stdafx.h       empty, #pragma once
shims/include/conio.h        _getch/getch/_getche/getche/_kbhit
src/extension.ts             activate(): wires every module below
src/exec.ts                  ExecFn type + real implementation (promisified execFile)
src/toolchain.ts             detect/install Command Line Tools          (no vscode import)
src/toolchainUi.ts           install prompt, progress, ensureToolchain() cache
src/projectTemplate.ts       HELLO_WORLD + createProject                  (no vscode import)
src/projectModel.ts          resolve what to build for a given file       (no vscode import)
src/vcxproj.ts               parse .sln / .vcxproj                        (no vscode import)
src/compiler.ts              build args, run clang++, parse diagnostics   (no vscode import)
src/explain.ts               plain-English explanations for diagnostics   (no vscode import)
src/runner.ts                build-then-debug / build-then-run commands, Problems panel
src/debugAdapter.ts          cppstarter debug type -> lldb-dap
src/ui.ts                    status bar items, fn-key notice
src/startPage.ts             webview start page + createProject
src/intellisense.ts          clangd configuration
test/unit/*.test.ts          vitest
test/integration/*.test.ts   mocha inside VS Code
test/fixtures/               sample programs and solutions
```

---

### Task 1: Repository, scaffold and both test harnesses

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `vitest.config.ts`, `.vscodeignore`, `.gitignore`, `LICENSE`, `src/extension.ts`, `src/exec.ts`, `test/integration/index.ts`, `test/integration/runTests.ts`, `test/integration/activation.test.ts`, `test/unit/exec.test.ts`

**Interfaces:**
- Produces: `type ExecFn = (file: string, args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }) => Promise<{ code: number; stdout: string; stderr: string }>` and `realExec: ExecFn` in `src/exec.ts` (never rejects on non-zero exit; rejects only if the binary cannot be started).
- Produces: npm scripts `build` (esbuild → `dist/extension.js`), `test:unit` (vitest run), `test:integration` (build, then `node out/test/integration/runTests.js`), `package` (`vsce package`).
- Produces: `package.json` with `"publisher": "cpp-starter"`. The owner changes this to their own Marketplace publisher ID before publishing (Task 11).

- [ ] **Step 1: Initialise git** — `git init -b main`, `.gitignore` (`node_modules/ dist/ out/ .vscode-test/ *.vsix .superpowers/ .claude-flow/`), commit the existing `docs/` as `docs: add design spec and implementation plan`, then `git checkout -b feature/mvp`.
- [ ] **Step 2: Write failing tests** — `test/unit/exec.test.ts`:
  - `realExec('/bin/echo', ['a b'])` resolves `{ code: 0, stdout: 'a b\n' }`.
  - `realExec('/bin/sh', ['-c', 'exit 3'])` resolves `code: 3` (does not reject).
  - `realExec('/no/such/bin', [])` rejects.
  `test/integration/activation.test.ts`: the extension `cpp-starter.cpp-starter-mac` is present and `isActive` becomes true after opening `test/fixtures/hello/main.cpp`.
- [ ] **Step 3: Run** `npm run test:unit` → FAIL (module missing).
- [ ] **Step 4: Implement** the manifest (`engines.vscode: ^1.95.0`, `activationEvents: ["onStartupFinished", "onLanguage:cpp"]`, `main: ./dist/extension.js`, `extensionDependencies: ["llvm-vs-code-extensions.vscode-clangd"]`), `realExec` with `child_process.execFile` (`maxBuffer` 10 MB), and an `activate()` that only performs the macOS check from Global Constraints. Fixture `test/fixtures/hello/main.cpp` = the Hello World text from Task 9.
- [ ] **Step 5: Run** `npm run test:unit && npm run test:integration` → PASS.
- [ ] **Step 6: Commit** `chore: scaffold extension with unit and integration test harnesses`.

### Task 2: Toolchain detection and one-click install

**Files:**
- Create: `src/toolchain.ts`, `test/unit/toolchain.test.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `ExecFn` (Task 1).
- Produces:
  - `interface Toolchain { clang: string; lldbDap: string; clangd: string }`
  - `detectToolchain(exec: ExecFn): Promise<Toolchain | undefined>` — `xcode-select -p` must exit 0, then `xcrun -f clang++`, `xcrun -f lldb-dap`, `xcrun -f clangd` must all exit 0; returns trimmed paths, else `undefined`.
  - `installToolchain(exec: ExecFn, opts?: { pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<Toolchain | undefined>` — runs `xcode-select --install`, then polls `detectToolchain` every `pollMs` (default 5000) until found or `timeoutMs` (default 30 min).
  - `ensureToolchain(): Promise<Toolchain | undefined>` exported from `src/toolchainUi.ts` (create it; it holds the messages from Step 4 and caches the result) for later tasks. Not in `extension.ts`, to avoid circular imports.

- [ ] **Step 1: Write failing tests** with a fake `ExecFn` keyed on `file + args`:
  - all four commands succeed → returns the three paths, trimmed.
  - `xcode-select -p` exits 2 → `undefined`, and `xcrun` is never called.
  - `xcrun -f lldb-dap` exits 1 → `undefined`.
  - `installToolchain` with a fake that starts failing and succeeds on the 3rd poll → resolves the toolchain; fake `sleep` called twice with `pollMs`.
  - `installToolchain` with `timeoutMs: 10, pollMs: 5` that never succeeds → `undefined`.
- [ ] **Step 2: Run** `npx vitest run test/unit/toolchain.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/toolchain.ts`.
- [ ] **Step 4: Wire into activation:** if `detectToolchain` returns `undefined`, show `window.showInformationMessage('C++ tools are not installed. Install now?', 'Install')`; on Install, run `installToolchain` inside `window.withProgress` (title "Installing Apple's C++ tools… this can take a few minutes"), then show "✓ Ready to build C++" or, on timeout, "The C++ tools were not found. Finish Apple's installer, then run 'C++: Check Tools' from the Command Palette." Register command `cppStarter.checkTools` (title "C++: Check Tools") that reruns this flow.
- [ ] **Step 5: Run** `npm run test:unit` → PASS.
- [ ] **Step 6: Commit** `feat: detect and install Apple command line tools`.

### Task 3: Compatibility shims for Windows-only beginner code

**Files:**
- Create: `shims/cpp_starter_compat.h`, `shims/include/pch.h`, `shims/include/stdafx.h`, `shims/include/conio.h`, `test/unit/shims.test.ts`, `test/fixtures/shims/*.cpp` (one per case below)

**Interfaces:**
- Produces: compiling with `-include <ext>/shims/cpp_starter_compat.h -I <ext>/shims/include -Wno-unknown-pragmas` makes the spec's Goal 6 list compile unchanged. Environment variable `CPP_STARTER_NO_PAUSE=1` disables every keypress wait (used by tests and by nothing else).
- Produces: at program exit (`atexit`), when stdin is a TTY and `CPP_STARTER_NO_PAUSE` is unset, print exactly `\nProgram exited.\nPress any key to close this window . . .` and wait for one key. (`atexit` can't see the exit code, so unlike Visual Studio no code is printed.)

Design notes the tests and header don't determine:
- `system`: the header includes `<cstdlib>` first, then declares `int cpp_starter_system(const char*)` (global, inline) and `namespace std { using ::cpp_starter_system; }`, then `#define system cpp_starter_system`. `"pause"` (case-insensitive) prints `Press any key to continue . . . ` and waits for one key (termios raw mode, restored after); `"cls"` writes `\033[2J\033[H`; anything else calls the real `::system` (call it via a function pointer taken before the macro is defined).
- `scanf_s`: a variadic template that drops every argument that is not a pointer (the buffer-size arguments are integers) and forwards the remaining pointers to `scanf`. Same for `fscanf_s`, `sscanf_s`.
- `printf_s` → `printf`, `fprintf_s` → `fprintf`, `sprintf_s(buf, size, fmt, ...)` → `snprintf(buf, size, fmt, ...)`, `strcpy_s(dst, size, src)` → `snprintf(dst, size, "%s", src)`, and the 2-argument template overload of `strcpy_s(char (&dst)[N], src)`.
- `_CRT_SECURE_NO_WARNINGS` needs nothing; `#pragma warning(...)` is silenced by `-Wno-unknown-pragmas`.
- `conio.h`: `_getch()`/`getch()` read one key without echo; `_getche()`/`getche()` with echo; `_kbhit()` uses `poll` on stdin with zero timeout.

- [ ] **Step 1: Write failing tests** — each compiles one fixture with `clang++ -std=c++17 -g -O0` plus the flags above via `realExec`, asserts exit code 0, runs the binary with `CPP_STARTER_NO_PAUSE=1` and piped stdin:
  - `pause.cpp` (`system("pause"); std::cout << "after";`) → stdout contains `Press any key to continue . . .` then `after`.
  - `std_pause.cpp` uses `std::system("PAUSE")` → same output.
  - `cls.cpp` → stdout contains `\x1b[2J\x1b[H`.
  - `pch.cpp` and `stdafx.cpp` (`#include "pch.h"` / `"stdafx.h"` then Hello World) → compile and print `Hello World!`.
  - `scanf_s.cpp` (`char name[20]; int age; scanf_s("%s %d", name, 20, &age); printf_s("%s is %d\n", name, age);`) with stdin `Sara 19\n` → `Sara is 19`.
  - `conio.cpp` (`#include <conio.h>`; `char c = _getch(); std::cout << "got " << c;`) with stdin `x` → `got x`.
  - `pragma.cpp` (`#define _CRT_SECURE_NO_WARNINGS` + `#pragma warning(disable: 4996)`) → stderr contains no `warning`.
  - `exit_pause.cpp` run WITHOUT `CPP_STARTER_NO_PAUSE` but with piped (non-TTY) stdin → exits immediately (no hang; test timeout 5 s).
- [ ] **Step 2: Run** `npx vitest run test/unit/shims.test.ts` → FAIL (header missing).
- [ ] **Step 3: Implement** the four header files.
- [ ] **Step 4: Run** → PASS. Also run every fixture again with `-arch x86_64` and execute via `arch -x86_64` → PASS (Rosetta check).
- [ ] **Step 5: Commit** `feat: add compatibility headers for Visual Studio beginner code`.

### Task 4: Project model — what F5 builds

**Files:**
- Create: `src/projectModel.ts`, `test/unit/projectModel.test.ts`, `test/fixtures/multi/` (`main.cpp`, `Student.cpp`, `Student.h`, `sub/other.cpp`), `test/fixtures/twomains/` (`lab1.cpp`, `lab2.cpp`)

**Interfaces:**
- Consumes: `SolutionProject`, `parseSolution`, `parseVcxproj` from Task 5 (solution branch only; write the folder branch and its tests first, the solution tests in Task 5).
- Produces:
  - `interface BuildTarget { key: string; name: string; dir: string; sources: string[]; includeDirs: string[]; defines: string[] }` — `key` is the absolute folder path (folder mode) or the absolute `.vcxproj` path; `name` is the folder name or project name; `sources` absolute and sorted.
  - `type ResolveResult = { kind: 'ok'; target: BuildTarget } | { kind: 'noFile' } | { kind: 'noSources'; dir: string } | { kind: 'multipleMains'; dir: string; files: string[] } | { kind: 'pickProject'; projects: SolutionProject[] }`
  - `resolveBuildTarget(file: string | undefined, fsApi: { readdir(dir: string): Promise<string[]>; readFile(p: string): Promise<string> }, chosenProject?: string): Promise<ResolveResult>`
  - `findMains(sources: { path: string; text: string }[]): string[]` — returns paths whose text, after stripping `//` and `/* */` comments and string literals, matches `/\b(int|void)\s+main\s*\(/`.

Rules: if `file` ends in `.cpp`, `.cc`, `.cxx`, `.h` or `.hpp`, use its directory; anything else → `noFile`. If that directory or any parent up to the filesystem root contains exactly one `.sln`, or the directory contains a `.vcxproj`, use solution mode (Task 5); otherwise folder mode: every `.cpp`/`.cc`/`.cxx` directly in the directory, none from subfolders.

- [ ] **Step 1: Write failing tests:**
  - `multi/main.cpp` → `ok`, sources = `[main.cpp, Student.cpp]` (not `sub/other.cpp`), name `multi`.
  - `multi/Student.h` → same target (Review Focus 4).
  - `undefined` → `noFile`; `README.md` → `noFile`.
  - a folder with only `.h` files → `noSources`.
  - `twomains/lab1.cpp` → `multipleMains`, files = both labs.
  - `findMains` ignores `// int main(` in a comment and `"int main("` in a string, and finds `void main()`.
- [ ] **Step 2: Run** `npx vitest run test/unit/projectModel.test.ts` → FAIL.
- [ ] **Step 3: Implement** the folder branch.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: resolve build target as one program per folder`.

### Task 5: `.sln` and `.vcxproj` support

**Files:**
- Create: `src/vcxproj.ts`, `test/unit/vcxproj.test.ts`, `test/fixtures/solution/` (a two-project VS 2022 solution: `Course.sln`, `Lab1/Lab1.vcxproj`, `Lab1/main.cpp`, `Lab1/pch.h`, `Lab2/Lab2.vcxproj`, `Lab2/main.cpp`, `Lab2/util/helper.cpp`, `common/shared.h`)
- Modify: `src/projectModel.ts`, `test/unit/projectModel.test.ts`

**Interfaces:**
- Produces:
  - `interface SolutionProject { name: string; vcxprojPath: string }`
  - `parseSolution(slnText: string, slnDir: string): SolutionProject[]` — lines matching `/^Project\("\{[^}]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+\.vcxproj)"/`; backslashes → `/`, resolved against `slnDir`. Solution folders (no `.vcxproj`) skipped.
  - `parseVcxproj(xml: string, projectDir: string, solutionDir: string): { sources: string[]; includeDirs: string[]; defines: string[] }` — with `fast-xml-parser`:
    - `sources`: every `ClCompile[@Include]` ending in `.cpp/.cc/.cxx`, skipping items whose `ExcludedFromBuild` is `true` for every configuration.
    - `includeDirs`, `defines`: from the first `ItemDefinitionGroup` whose `Condition` contains `Debug|x64`, else `Debug|`, else the first; split `AdditionalIncludeDirectories` / `PreprocessorDefinitions` on `;`, drop empty and `%(...)` entries, substitute `$(ProjectDir)` → `projectDir/`, `$(SolutionDir)` → `solutionDir/`, drop entries still containing `$(`, backslashes → `/`, resolve relative to `projectDir`. Drop defines `WIN32`, `_WINDOWS`, `_CONSOLE` (harmless but misleading on macOS); keep `_DEBUG`.

Project-picker rule (`resolveBuildTarget`): one project → use it. Several → if `chosenProject` names one of them use it, else if the active file lies inside exactly one project's directory use that, else return `pickProject`.

- [ ] **Step 1: Write failing tests:**
  - `parseSolution(Course.sln)` → `[{Lab1, …/Lab1/Lab1.vcxproj}, {Lab2, …/Lab2/Lab2.vcxproj}]`.
  - `parseVcxproj(Lab2.vcxproj)` → sources `[Lab2/main.cpp, Lab2/util/helper.cpp]`, includeDirs contains `…/common` (from `$(SolutionDir)common`), defines contains `_DEBUG` and not `_CONSOLE`.
  - a `ClCompile` excluded in all configurations is skipped.
  - `resolveBuildTarget(Lab2/main.cpp)` → `ok` with Lab2 (inside its folder); `resolveBuildTarget(solution/scratch.cpp)` (a file at the solution root, add it to the fixture) → `pickProject`; same call with `chosenProject: 'Lab1'` → Lab1.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/vcxproj.ts` and the solution branch.
- [ ] **Step 4: Run** `npm run test:unit` → PASS.
- [ ] **Step 5: Commit** `feat: build Visual Studio solutions from their project files`.

### Task 6: Compiler — arguments, build, diagnostics, explanations

**Files:**
- Create: `src/compiler.ts`, `src/explain.ts`, `test/unit/compiler.test.ts`, `test/unit/explain.test.ts`, `test/fixtures/errors/missing_semicolon/main.cpp`, `test/fixtures/spaces/C++ Projects/واجب 1/main.cpp`

**Interfaces:**
- Consumes: `BuildTarget` (Task 4), `ExecFn` (Task 1), shim paths (Task 3).
- Produces:
  - `type Arch = 'native' | 'x86_64'`
  - `buildArgs(target: BuildTarget, out: string, shimDir: string, arch: Arch): string[]` → exactly, in order: `-std=c++17 -g -O0 -Wall -fno-color-diagnostics -fno-caret-diagnostics -Wno-unknown-pragmas -include <shimDir>/cpp_starter_compat.h -I <shimDir>/include`, then `-I <dir>` per includeDir, `-D <def>` per define, `-arch x86_64` only when `arch === 'x86_64'`, the sources, `-o <out>`.
  - `outputPath(storageDir: string, target: BuildTarget): string` → `<storageDir>/builds/<sha1(target.key) first 12 hex>/<sanitised name>` (sanitised: non-`[A-Za-z0-9._-]` → `_`; empty → `program`).
  - `interface CompilerDiagnostic { file: string; line: number; column: number; severity: 'error' | 'warning' | 'note'; message: string }`
  - `parseDiagnostics(stderr: string, cwd: string): CompilerDiagnostic[]` — regex `/^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/m` per line (`fatal error` → `error`); linker lines `duplicate symbol '_main'` → one `error` diagnostic on the first source, line 1, message as-is.
  - `build(target: BuildTarget, opts: { exec: ExecFn; clang: string; storageDir: string; shimDir: string; arch: Arch }): Promise<{ ok: boolean; exe: string; diagnostics: CompilerDiagnostic[]; rawOutput: string }>` — creates the output dir, deletes any previous `exe` and `exe.dSYM` first (so a failed build can never leave an old executable behind — Review Focus 3), runs clang++ with `cwd = target.dir`.
  - `explain(message: string): string | undefined` in `src/explain.ts`, a table of `[RegExp, string]`:

| Pattern | Explanation |
|---|---|
| `/use of undeclared identifier '(cout\|cin\|endl\|string\|vector)'/` | `Write std::$1, or add 'using namespace std;' after your #include lines.` |
| `/expected ';'/` | `A semicolon (;) is missing at the end of the previous statement.` |
| `/'main' must return 'int'/` | `Change 'void main()' to 'int main()'. Visual Studio allows void main, but standard C++ does not.` |
| `/'(.+)' file not found/` | `The file '$1' could not be found. Check the spelling, and that the file is in the same folder as your .cpp files.` |
| `/duplicate symbol '_main'/` | `More than one file in this folder has a main() function. Each program needs its own folder.` |
| `/undefined symbols? for architecture/` | `A function is declared but its code was not found. Check that every .cpp file of your program is in the same folder.` |

- [ ] **Step 1: Write failing tests:**
  - `buildArgs` for a target with one include dir and define `_DEBUG`, `arch: 'native'` equals the exact array above; with `'x86_64'` contains `-arch`, `x86_64` immediately before the sources.
  - `outputPath` for name `واجب 1` matches `/builds\/[0-9a-f]{12}\/[A-Za-z0-9._-]+$/`; for name `""` ends in `/program`.
  - `parseDiagnostics` on `main.cpp:5:3: error: expected ';' after expression` → `{file: <cwd>/main.cpp, line 5, column 3, severity 'error'}`.
  - `build` on `hello` fixture with `realExec` → `ok: true`, exe exists, `exe.dSYM` exists.
  - `build` on `errors/missing_semicolon` after a successful build to the same output path → `ok: false`, exe does not exist, one `error` diagnostic on line 5.
  - `build` on `spaces/C++ Projects/واجب 1` → `ok: true` (Review Focus 2).
  - `explain` returns the table's text for each sample message, `undefined` for `unused variable 'x'`.
- [ ] **Step 2: Run** `npx vitest run test/unit/compiler.test.ts test/unit/explain.test.ts` → FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** `npm run test:unit` → PASS.
- [ ] **Step 5: Commit** `feat: compile with clang++ and explain common beginner errors`.

### Task 7: Build-and-debug, run-without-debugging, and breakpoint acceptance tests

This task carries the spec's anti-goal. If any breakpoint test here fails, fix the cause; never skip or loosen it. If the x86_64 (Rosetta) tests cannot pass after investigation, stop and report to the owner with the failing output instead of marking them skipped.

**Files:**
- Create: `src/debugAdapter.ts`, `src/runner.ts`, `test/integration/debug.test.ts`, `test/integration/helpers.ts`, `test/fixtures/input/main.cpp`
- Modify: `package.json` (debugger, commands, `cppStarter.architecture` setting), `src/extension.ts`

**Interfaces:**
- Consumes: `ensureToolchain` (Task 2), `resolveBuildTarget` (Tasks 4–5), `build`, `buildArgs`, `explain`, `Arch` (Task 6).
- Produces:
  - `package.json` → `contributes.debuggers: [{ "type": "cppstarter", "label": "C++ (Apple lldb)", "languages": ["cpp"] }]`; setting `cppStarter.architecture`: enum `native | x86_64`, default `native`, description "Build for Intel (x86_64) and run under Rosetta. For testing Intel support on Apple Silicon."
  - `registerDebugAdapter(context, getToolchain: () => Promise<Toolchain | undefined>)` in `src/debugAdapter.ts`: a `DebugAdapterDescriptorFactory` for `cppstarter` returning `new vscode.DebugAdapterExecutable(toolchain.lldbDap)`.
  - Launch configuration (built in code, never written to disk): `{ type: 'cppstarter', request: 'launch', name: 'C++: ' + target.name, program: exe, cwd: target.dir, args: [], runInTerminal: true, env: { CPP_STARTER_NO_PAUSE: process.env.CPP_STARTER_NO_PAUSE ?? '' } }` — `runInTerminal: true` makes lldb-dap start the program in VS Code's integrated terminal so `cin` works. Omit the `env` entry when the variable is unset.
  - Commands in `src/runner.ts`, each returning `Promise<boolean>` (true = build succeeded and the session/terminal started):
    - `cppStarter.startDebugging` (title "C++: Start Debugging", icon `$(debug-alt)`)
    - `cppStarter.runWithoutDebugging` (title "C++: Start Without Debugging")
    - `cppStarter.build` (title "C++: Build", icon `$(tools)`)
  - A `DiagnosticCollection` named `C++ Starter`; each diagnostic's message is the clang message, plus `\n💡 ` + `explain(message)` when an explanation exists.

Shared flow for all three commands:
1. `await vscode.workspace.saveAll(false)` (Review Focus 1).
2. File = active editor's file; if it isn't a C/C++ file, the most recently active `.cpp` editor (tracked with `onDidChangeActiveTextEditor`).
3. `resolveBuildTarget(file, fs, workspaceState.get('cppStarter.chosenProject'))`, then handle the result:
   - `noFile` → "Open a .cpp file first, then press F5."
   - `noSources` → "There are no .cpp files in this folder."
   - `multipleMains` → "More than one file in this folder has a main() function: <basenames joined by ', '>. Each program needs its own folder."
   - `pickProject` → QuickPick "Which project do you want to run?", store the choice in `workspaceState`, and retry.
4. `ensureToolchain()`; if undefined, stop (Task 2 has already shown its message).
5. `build(...)`, with `window.setStatusBarMessage('$(sync~spin) Building <name>…')`; then replace the diagnostics for the target's sources. On failure, run `workbench.actions.view.problems` and return false.
6. Then:
   - debug → `vscode.debug.startDebugging(workspace.getWorkspaceFolder(Uri.file(target.dir)), config)`.
   - run → `window.createTerminal({ name: 'C++: ' + target.name, shellPath: exe, cwd: target.dir })` and `.show()`. With `shellPath`, no shell is involved, so quoting can't break (Review Focus 2). The shim's exit pause keeps the window open.
   - build → `setStatusBarMessage('$(check) Build succeeded', 5000)`.

- [ ] **Step 1: Write the failing integration tests** in `test/integration/debug.test.ts`. `helpers.ts` provides `waitForStop(timeoutMs = 20000): Promise<{ file: string; line: number }>`. It registers a `DebugAdapterTracker` for `cppstarter`, waits for the `stopped` event with reason `breakpoint`, then calls `session.customRequest('stackTrace', { threadId, levels: 1 })`. It also provides `addBreakpoint(file, line1Based)`. The test environment sets `CPP_STARTER_NO_PAUSE=1`. Tests (each ends with `debug.stopDebugging()` and clears breakpoints):
  - `hello/main.cpp`, breakpoint on the `std::cout` line → stops at that file and line.
  - `multi/Student.cpp`, breakpoint inside a method called from `main.cpp` → stops in `Student.cpp` (Review Focus 5).
  - `multi/Student.h`, breakpoint inside an inline method → stops there.
  - `input/main.cpp` (`int n; std::cin >> n; int doubled = n * 2;` with a breakpoint on the `doubled` line) → after start, find the terminal opened during the session (`window.onDidOpenTerminal`), `sendText('21')`, and expect a stop on that line. Then `session.customRequest('evaluate', { expression: 'n', context: 'watch', frameId })` returns a result of `21`.
  - `solution/Lab2/util/helper.cpp`, breakpoint in the helper → stops (a `.sln` project).
  - `spaces/C++ Projects/واجب 1/main.cpp` → stops (Review Focus 2).
  - Unsaved edit: open `hello/main.cpp`, insert `std::cout << "x";\n` above the breakpoint line without saving, put the breakpoint on the inserted line, run the command → it stops on the inserted line and the document is no longer dirty (Review Focus 1). Restore the fixture afterwards.
  - Compile error: after a successful build of `hello`, insert `int x = ` without saving and run `cppStarter.startDebugging` → returns `false`, `debug.activeDebugSession` is undefined, and `languages.getDiagnostics(uri)` contains one error (Review Focus 3). Restore the fixture.
  - `twomains/lab1.cpp` → returns `false` and no session starts.
  - With setting `cppStarter.architecture = 'x86_64'`: repeat the `hello` and `multi/Student.cpp` breakpoint tests (Rosetta).
  - `cppStarter.runWithoutDebugging` on `hello` → returns `true`, and a terminal named `C++: hello` exists.
- [ ] **Step 2: Run** `npm run test:integration` → the new tests FAIL (commands not registered).
- [ ] **Step 3: Implement** `src/debugAdapter.ts` and `src/runner.ts`, and wire them in `activate()`.
- [ ] **Step 4: Run** `npm run test:integration` → PASS. Run it three times in a row; every run must pass, because a breakpoint test that only sometimes passes counts as failing.
- [ ] **Step 5: Commit** `feat: build and debug with Apple lldb-dap, no config files`.

### Task 8: Visual Studio shortcuts, toolbar, status bar and fn-key tip

**Files:**
- Create: `src/ui.ts`, `test/unit/manifest.test.ts`, `test/integration/ui.test.ts`
- Modify: `package.json`, `src/extension.ts`

**Interfaces:**
- Consumes: the three commands from Task 7.
- Produces: `package.json` → `contributes.keybindings`, exactly:

| key | command | when |
|---|---|---|
| `f5` | `cppStarter.startDebugging` | `editorLangId == cpp && !inDebugMode` |
| `ctrl+f5` | `cppStarter.runWithoutDebugging` | `editorLangId == cpp && !inDebugMode` |
| `ctrl+shift+b` | `cppStarter.build` | `editorLangId == cpp` |
| `cmd+shift+b` | `cppStarter.build` | `editorLangId == cpp` |

VS Code's own macOS defaults already provide F9 (toggle breakpoint), F10, F11, Shift+F11, Shift+F5, and F5-to-continue while debugging, so the extension doesn't rebind those. VS Code maps `.h` files to the `cpp` language, so these keys also work in headers.
- Produces: `contributes.menus["editor/title"]`: `cppStarter.startDebugging` (`navigation@1`) and `cppStarter.build` (`navigation@2`), both with `when: resourceLangId == cpp && !inDebugMode`.
- Produces: `registerUi(context)` in `src/ui.ts`:
  - Two left status bar items, visible only while the active editor's language is `cpp`: `$(play) Run` (tooltip "Build and debug (F5)") and `$(tools) Build` (tooltip "Build (Ctrl+Shift+B)").
  - The first time a `cpp` editor becomes active (`globalState` key `cppStarter.fnTipShown`), show: "Tip: on a Mac keyboard, hold fn and press F5 to run your program, or set F1, F2… to work as standard function keys." The "Open Keyboard Settings" button calls `env.openExternal(Uri.parse('x-apple.systempreferences:com.apple.Keyboard-Settings.extension'))`.

- [ ] **Step 1: Write failing tests:**
  - `manifest.test.ts` reads `package.json` and checks that the keybindings equal the table above and that both editor/title entries exist.
  - `ui.test.ts`: opening `hello/main.cpp` sets `globalState` `cppStarter.fnTipShown` to `true` (read it through a test-only command `cppStarter._getState` that is registered only when `context.extensionMode === ExtensionMode.Test`).
- [ ] **Step 2: Run** `npm run test:unit && npm run test:integration` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add Visual Studio shortcuts, run/build buttons and fn-key tip`.

### Task 9: Start page and "Create a new project"

**Files:**
- Create: `src/startPage.ts`, `src/projectTemplate.ts`, `test/unit/projectTemplate.test.ts`, `test/integration/startPage.test.ts`
- Modify: `package.json`, `src/extension.ts`

**Interfaces:**
- Produces: `HELLO_WORLD` in `src/projectTemplate.ts`, exactly (the Visual Studio 2022 console template body):

```cpp
#include <iostream>

int main()
{
    std::cout << "Hello World!\n";
}
```

- Produces: `createProject(parentDir: string, name: string): Promise<{ ok: true; dir: string; mainFile: string } | { ok: false; error: string }>`. Validation errors, in this order:
  - empty or whitespace-only → "Please enter a project name."
  - contains `/` or `:`, or starts with `.` → "A project name can't contain / or : or start with a dot."
  - the folder already exists → "A folder named '<name>' already exists here. Choose another name."

  It creates `parentDir` recursively and writes `main.cpp` = `HELLO_WORLD`.
- Produces: command `cppStarter.showStartPage` (title "C++: Show Start Page") opens a webview panel with viewType `cppStarter.startPage` and title "Get started". It uses a strict CSP with a nonce and VS Code theme CSS variables, and shows three buttons with Visual Studio's wording:
  - **Create a new project** → input box "Project name" (default `ConsoleApplication1`), then a QuickPick "Where should it be saved?" with `~/Documents/C++ Projects` (default) and "Choose another folder…". Then `createProject`, store `globalState` `cppStarter.pendingHint = dir`, and run `vscode.openFolder` on `dir`.
  - **Open a local folder** → `showOpenDialog({ canSelectFolders: true })` → `vscode.openFolder`.
  - **Open a project or solution** → `showOpenDialog({ filters: { 'Visual Studio solution': ['sln', 'vcxproj'] } })` → `vscode.openFolder` on the file's directory.
- On activation: show the start page if `globalState` `cppStarter.startPageShown` is unset (then set it). If `pendingHint` equals the first workspace folder's path, open `main.cpp`, show "Press F5 (or fn+F5) to run your program.", and clear `pendingHint`.

- [ ] **Step 1: Write failing tests:**
  - `projectTemplate.test.ts` in a temp dir: a valid name creates `<parent>/<name>/main.cpp` with content `=== HELLO_WORLD`; each invalid case returns its exact error; a parent `C++ Projects` that doesn't exist yet is created.
  - `startPage.test.ts`: running `cppStarter.showStartPage` gives a tab whose input is a `TabInputWebview` with `viewType` ending in `cppStarter.startPage`.
  - The newly created project builds and stops at a breakpoint: call `createProject` in a temp dir, then reuse Task 7's `waitForStop` on its `main.cpp`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:unit && npm run test:integration` → PASS.
- [ ] **Step 5: Commit** `feat: add start page with new project, open folder and open solution`.

### Task 10: IntelliSense through clangd

**Files:**
- Create: `src/intellisense.ts`, `test/integration/intellisense.test.ts`
- Modify: `src/extension.ts`, `src/runner.ts`

**Interfaces:**
- Consumes: `Toolchain` (Task 2), `buildArgs` (Task 6), `BuildTarget` (Task 4).
- Produces: `configureClangd(toolchain: Toolchain, shimDir: string): Promise<void>`. For each setting below, it writes a Global value only if the user has no global value of their own (`inspect().globalValue === undefined`), or if the current value is the one recorded as ours in `globalState` `cppStarter.clangdManaged`:
  - `clangd.path` = `toolchain.clangd`
  - `clangd.fallbackFlags` = `['-std=c++17', '-Wno-unknown-pragmas', '-include', <shimDir>/cpp_starter_compat.h, '-I', <shimDir>/include]`

  For loose folders, clangd then needs no file in the student's folder.
- Produces: `writeCompileCommands(target: BuildTarget, args: string[]): Promise<void>`, called after every build in solution mode only. It writes `compile_commands.json` next to the `.sln`, with one entry per source: `{ directory: target.dir, file, arguments: [clang, ...args without -o/out and without the other sources, '-c', file] }`. This is not a VS Code config file, so the spec's "no tasks.json/launch.json" rule still holds.

- [ ] **Step 1: Write the failing integration tests:**
  - Open `hello/main.cpp`. Within 20 s, `languages.getDiagnostics(uri)` has no error-severity entries, and `vscode.executeCompletionItemProvider` at the end of a temporarily inserted `std::co` returns an item labelled `cout`.
  - Open `test/fixtures/shims/pch.cpp` → no `file not found` diagnostic.
  - After building `solution/Lab2`, `solution/compile_commands.json` exists, and `helper.cpp` has no error that `common/shared.h` is missing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** and call `configureClangd` on activation once the toolchain is present.
- [ ] **Step 4: Run** `npm run test:integration` → PASS.
- [ ] **Step 5: Commit** `feat: configure clangd so beginners see no false errors`.

### Task 11: Marketplace packaging, README and CLAUDE.md

**Files:**
- Create: `README.md`, `CHANGELOG.md`, `media/icon.svg`, `media/icon.png`, `scripts/make-icon.mjs`, `CLAUDE.md`
- Modify: `package.json` (`displayName`, `description`, `icon`, `categories: ["Programming Languages", "Debuggers", "Education"]`, `keywords`, `repository`, `license: "MIT"`), `.vscodeignore`

**Interfaces:**
- Produces: `npm run package` creates `cpp-starter-mac-<version>.vsix` with no `vsce` warnings. The `.vsix` contains only `dist/`, `shims/`, `media/icon.png`, `README.md`, `CHANGELOG.md`, `LICENSE` and `package.json`.

- [ ] **Step 1: Write a failing check.** `test/unit/package.test.ts` runs `npx vsce ls`, asserts the file list is exactly the set above, and asserts that `shims/cpp_starter_compat.h` is included.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write the content and configuration:**
  - `scripts/make-icon.mjs` renders `media/icon.svg` (a simple `C++` monogram on a solid background) to a 128×128 PNG with the `@resvg/resvg-js` devDependency.
  - `README.md` covers:
    - who it's for
    - the three-step first run
    - the shortcut table, including VS Code's built-in F9/F10/F11/Shift+F11/Shift+F5
    - the fn-key tip
    - the "one program per folder" rule
    - which Windows-only lines are supported
    - "Tested on Apple Silicon. Intel Macs should work but are not yet tested on real hardware. Please report problems."
    - a "For maintainers" section explaining how to change `publisher` and publish (`vsce login`, `vsce publish`)
  - `CLAUDE.md` starts with the required `# CLAUDE.md` header and covers the build and test commands (including how to run a single vitest file and a single mocha test via `--grep`), the architecture paragraph from this plan, and the rule that breakpoint tests in `test/integration/debug.test.ts` must never be skipped.
  - `.vscodeignore`: `src/**`, `test/**`, `out/**`, `docs/**`, `scripts/**`, `media/icon.svg`, `node_modules/**`, `.superpowers/**`, `.claude-flow/**`, `*.map`.
- [ ] **Step 4: Run** `npm run test:unit && npm run package` → PASS, and the `.vsix` is created.
- [ ] **Step 5: Manual acceptance on the owner's Apple Silicon Mac.** Install it with `code --install-extension cpp-starter-mac-*.vsix` in a fresh VS Code profile (`code --profile "CPP Starter Test"`), then check:
  - The start page opens.
  - Create a new project, press fn+F5, and it stops at a breakpoint on the `cout` line.
  - Ctrl+F5 shows "Press any key to close this window . . .".
  - A folder with `system("pause")` and `cin` works.
  - Opening `test/fixtures/solution/Course.sln` asks which project to run.

  Record the results in the PR description.
- [ ] **Step 6: Commit** `docs: add README, icon and Marketplace packaging`.
