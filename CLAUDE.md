# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build                                   # esbuild bundle to dist/extension.js
npx tsc --noEmit                                # typecheck
npm run test:unit                               # vitest; run `npm run build` first (package.test.ts checks dist/extension.js)
npx vitest run test/unit/compiler.test.ts       # one unit file
CPP_STARTER_SHIM_X86=1 npx vitest run test/unit/shims.test.ts   # shim tests as x86_64 under Rosetta
npm run test:integration                        # build + tsc + downloaded VS Code with clangd installed; mocha
MOCHA_GREP="breakpoint" npm run test:integration   # one integration test, by name (mocha --grep)
npm run package                                 # cpp-starter-mac-<version>.vsix (vsce, --no-dependencies)
```

The `--configLoader runner` flag is set in the `test:unit` script in `package.json`, not in `vitest.config.ts`. `MOCHA_GREP` is read in `test/integration/index.ts` and forwarded by `runTests.ts`. Integration tests need Apple's command line tools and open real VS Code windows. `test/unit/package.test.ts` runs `vsce ls` and pins the vsix contents (`dist/`, `shims/`, `media/icon.png`, README, CHANGELOG, LICENSE, package.json).

## Architecture

Extension for beginner C++ students on macOS: one keypress builds with Apple `clang++` and debugs with Apple `lldb-dap`. Intel is only tested through x86_64 builds under Rosetta (`cppStarter.architecture = "x86_64"`).

- `extension.ts` wires activation. `exec.ts` is the only process layer (`ExecFn`, `realExec` over `execFile`, argument arrays, injectable in tests).
- `toolchain.ts` / `toolchainUi.ts`: detect clang++, lldb-dap, clangd and the SDK via `xcrun` (`detectToolchainStatus`: ok / missing / outdated); one-click `xcode-select --install` only when missing (outdated tools get a Software Update message); `ensureToolchain()`; "C++: Check Tools"; `onToolchainFound` lets `extension.ts` configure clangd once the tools first appear.
- `projectModel.ts`: one program per folder; finds a `.sln` in the file's dir and up to 3 ancestors. `vcxproj.ts` parses `.sln`/`.vcxproj` (fast-xml-parser) for sources, include dirs, defines.
- `compiler.ts`: builds the clang++ args (`-std=c++17 -g -O0 -isysroot <sdk>`, plus `-include shims/cpp_starter_compat.h`, and links `shims/cpp_starter_compat.cpp` after the student's sources), parses diagnostics, deletes the old exe/dSYM before building. `explain.ts` turns diagnostics into plain English.
- `runner.ts`: F5 / Ctrl+F5 / build commands and the Problems panel. `debugAdapter.ts`: debug type `cppstarter` mapped to `lldb-dap`, plus a DebugConfigurationProvider that turns VS Code's own F5 / Run menu (focus outside a C++ editor, no launch.json, so the config has no `program`) into the extension's build-then-debug or run flow and returns `undefined`. `ui.ts`: status bar, editor toolbar, fn-key tip. `startPage.ts` + `projectTemplate.ts`: Get started webview and new project.
- `intellisense.ts` / `intellisenseCore.ts`: sets clangd global settings (tracking which are "ours"), writes a merged `compile_commands.json` next to the `.sln` (symlink-safe, trusted workspaces only).

### Build then debug flow

F5 saves files, builds (stale exe/dSYM removed first; a compile error stops here and fills Problems), then starts a debug session of type `cppstarter`. Ctrl+F5 runs the same exe in a terminal without a debugger.

### Attach handshake (why it is built this way)

lldb-dap's own `runInTerminal` launch is blocked by macOS SIP, so the program is not launched by lldb. Instead:

1. The program is started in a VS Code integrated terminal with env `CPP_STARTER_WAIT_FOR_DEBUGGER=<ready file>`.
2. The force-included `shims/cpp_starter_compat.h` defines an inline variable, before any user code, whose initializer calls `cpp_starter_wait_for_debugger()` in `shims/cpp_starter_compat.cpp`; C++17 initializes it before main or any global initializer. That function writes the pid to the ready file and spins (bounded to 60 s) on `extern "C" volatile int cpp_starter_debugger_attached` (one definition, in the .cpp).
3. The session uses `launchCommands: ['process attach --pid N', 'expression -- cpp_starter_debugger_attached = 1']`, so lldb attaches only after the program has fully loaded (attaching earlier under Rosetta stops inside dyld) and breakpoints are installed before the program continues.

The header and the .cpp together implement `system("pause"/"pause>nul"/"cls")`, `scanf_s`/`printf_s`/`sprintf_s`/`strcpy_s`, the exit "Press any key to close this window . . ." pause, and restores the terminal on Ctrl+C. `CPP_STARTER_NO_PAUSE=1` disables every wait. `shims/include/` holds `pch.h`, `stdafx.h`, `conio.h`.

## Rules that are not obvious

- Never skip, `.skip`, or loosen the breakpoint tests in `test/integration/debug.test.ts`. They are the only proof the attach handshake works.
- `shims/cpp_starter_compat.h` may include only C++ standard library headers (it is force-included into every student file); anything POSIX lives in `shims/cpp_starter_compat.cpp`. `test/fixtures/shims/macro_names.cpp` and `posix_names.cpp` guard this; keep them passing. The .cpp calls POSIX functions through `dlsym` on libSystem, because a student global such as `int read` would otherwise take over the shim's `read` at link time.
- Never write `tasks.json`, `launch.json` or workspace settings into the student's folder. Settings are global and tracked as "ours" (see `intellisense.ts`).
- Spawn child processes with argument arrays through `exec.ts`, never shell strings (paths contain spaces, `+`, Arabic).
