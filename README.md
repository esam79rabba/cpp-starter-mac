# C++ Starter for Mac

Write, run and debug C++ on a Mac the way you did in Visual Studio. Press F5, stop at breakpoints, step through your code, and get compiler errors explained in plain English. It is free and uses the tools Apple already provides (`clang++`, `lldb-dap`).

## Who it's for

Beginner C++ students on macOS, especially those who learned on Visual Studio in Windows and want the same workflow: open a folder, press F5, see the program run. You do not need to write a `tasks.json`, a `launch.json` or a Makefile.

## First run

1. **Install the extension.** It also installs the clangd extension for code completion. If Apple's command line tools are missing, the extension offers a one-click install (the same as `xcode-select --install`). You can re-check any time with **C++: Check Tools** in the Command Palette.
2. **Create a project.** On the **Get started** page choose **Create a new project**, or open a folder that already contains `.cpp` files. Run **C++: Show Start Page** to see the page again.
3. **Press F5.** Your program builds, then runs in the terminal. Click in the left margin to set a breakpoint first and it stops there.

## Shortcuts

| Key | What it does |
| --- | --- |
| F5 | Build and start debugging |
| Ctrl+F5 | Build and run without debugging (waits for a key at the end) |
| Ctrl+Shift+B (or Cmd+Shift+B) | Build only |
| F9 | Toggle a breakpoint (built into VS Code) |
| F10 | Step over (built into VS Code) |
| F11 | Step into (built into VS Code) |
| Shift+F11 | Step out (built into VS Code) |
| Shift+F5 | Stop debugging (built into VS Code) |

**Mac keyboards:** the top row usually controls brightness and volume. Hold **fn** and press F5 (fn+F5), or turn on "Use F1, F2, etc. keys as standard function keys" in System Settings, Keyboard.

## One program per folder

Every folder is one program. All `.cpp` files directly in the folder are built together; files in subfolders are not. Exactly one of those files may contain `main`. If you open a Visual Studio `.sln` or `.vcxproj`, the extension reads the source files, include folders and defines from it, and asks which project to run when there are several.

## Windows-only code that works

Code copied from Visual Studio projects compiles unchanged for these:

- `system("pause")`, `system("pause>nul")` and `system("cls")`
- `scanf_s`, `printf_s`, `fprintf_s`, `sprintf_s`, `strcpy_s`
- `#include "pch.h"`, `#include "stdafx.h"` and `#include <conio.h>` (`_getch`, `_getche`, `_kbhit`)
- The "Press any key to close this window . . ." wait at the end of Ctrl+F5 and F5 runs

Code that uses Windows-only libraries such as `<windows.h>` or MFC won't compile on a Mac. You'll see a "file not found" error for those headers.

## Status

Tested on Apple Silicon. Intel Macs should work but are not yet tested on real hardware. Please report problems.

## For maintainers

- `npm run test:unit` and `npm run test:integration` run the tests. `npm run package` builds `cpp-starter-mac-<version>.vsix`.
- The `publisher` in `package.json` is a placeholder (`cpp-starter`). Change it to your own Marketplace publisher id before publishing.
- Publish with `npx vsce login <publisher>` and then `npx vsce publish`.
- The `repository` field is left out on purpose, and the `package` script passes `--allow-missing-repository`. Add `repository` to `package.json` once the GitHub repository exists, then remove that flag.
- `npm run icon` regenerates `media/icon.png` from `media/icon.svg`.
