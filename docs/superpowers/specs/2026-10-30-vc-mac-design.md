# Visual Studio-style C++ for Mac students: design

Date: 2026-10-30
Status: draft, awaiting approval (builder check done, owner's answers added)

## Intent and the why

Many beginner C++ courses are taught with Visual Studio on Windows. Students
with Mac laptops get stuck before they write their first loop: they don't know
how to install a compiler, VS Code's debugger setup is confusing and often
doesn't stop at breakpoints, there's no obvious "new project" step, and the
course's instructions ("press F5", "Build → Build Solution") don't match
anything in VS Code. Visual Studio for Mac was retired and never supported C++.

The course content itself is standard C++: variables, loops, arrays, pointers,
data structures, OOP, `cin`/`cout`. No MFC, Win32 or other Windows-only APIs.
So the gap is the *experience* around the code, not the compiler. This project
is a free VS Code extension that gives Mac students a Visual Studio-like
experience for beginner C++, using Apple's own compiler and debugger.

## Who it's for

Beginner C++ students on macOS (Apple Silicon and Intel) whose course, teacher
or textbook assumes Visual Studio 2022 on Windows. They receive assignments as
loose `.cpp`/`.h` files most of the time, and occasionally as a full Visual
Studio solution (`.sln` + `.vcxproj`). They will find the extension on their
own on the VS Code Marketplace, with nobody to help them.

## Success

A student goes from a fresh Mac to stepping through their first program with
breakpoints in a few minutes, without reading a setup guide, and course
instructions written for Visual Studio on Windows mostly just work.

## Anti-goal (the failure that matters most)

**The debugger not stopping at breakpoints.** If everything else works but a
student's breakpoint is ignored, the extension has failed. Debugger
reliability is the first acceptance criterion and must be verified for
single-file programs, multi-file programs, `.sln` projects, and programs that
read input with `cin`.

Hardware for verification (owner's answer): the owner has an Apple Silicon Mac
only. Apple Silicon is verified on real hardware. Intel is verified as well as
possible by building and debugging x86_64 programs under Rosetta, and the
Marketplace listing invites Intel users to report problems. Treat full Intel
verification as a known gap. *Designer's call.*

## Goals

### 1. First-run setup with no terminal commands

- On activation, check whether Apple's Command Line Tools (clang++, lldb) are
  installed.
- If missing, show one clear message ("C++ tools are not installed. Install
  now?"). Clicking it triggers Apple's installer (`xcode-select --install`).
  The extension waits, re-checks, and confirms ("✓ Ready to build C++").
- Also make sure whatever debugging component is required is present (see
  "Left to the builder"). The student never has to install it by hand.

### 2. Start page and new project

A start page opens the first time (and is reachable later via a command),
similar to Visual Studio's start window, with three actions:

- **Create a new project**: asks for a name and a location (default
  `~/Documents/C++ Projects`), creates a folder containing `main.cpp` with Hello
  World, opens it, and shows a hint: "Press F5 (or fn+F5) to run". Pressing F5
  immediately must build, run and stop at breakpoints with no further setup.
- **Open a folder**: for loose `.cpp` files sent by a teacher.
- **Open a project or solution**: for a `.sln`/`.vcxproj`.

Only the Console App template is in scope.

### 3. Build and debug with zero config files

- **One program per folder** (owner's decision). F5 compiles every `.cpp` file
  in the folder of the currently active file (not its subfolders) into one
  program with debug info and no optimisation, then runs it under the
  debugger. A `Week1/`, `Week2/` layout therefore works: each folder is its own
  program.
- If that folder contains more than one `main()`, don't show the raw linker
  error. Explain in plain words that each program needs its own folder.
  *Designer's call.*
- For a `.sln`/`.vcxproj` (in the first release, owner's decision), the
  extension builds the project's `.cpp` files and honours its additional
  include directories and preprocessor defines. Other settings (configurations,
  platforms, precompiled-header options, language standard) are ignored in
  favour of the extension's defaults. If the solution has several projects,
  ask once which one to run and remember the choice. It does not show the
  solution's structure (no Solution Explorer). *Scope of `.vcxproj` support is
  the designer's call.*
- Students never see or edit `tasks.json` or `launch.json`.
- The program runs in a console where `cin` input works, and the console stays
  open after the program ends with Visual Studio's "Press any key to close this
  window" behavior.
- Compile errors appear in VS Code's Problems panel, with a plain-English
  explanation added for common beginner errors.
- Language standard: C++17 (Visual Studio 2022 defaults to C++14, and C++17
  accepts beginner C++14 code). *Designer's call.*

### 4. Visual Studio shortcuts

When the extension is active, these keys behave as in Visual Studio on Windows:

| Key | Action |
|---|---|
| F5 | Start debugging |
| Ctrl+F5 | Start without debugging |
| Shift+F5 | Stop |
| F9 | Toggle breakpoint |
| F10 | Step over |
| F11 | Step into |
| Shift+F11 | Step out |
| Ctrl+Shift+B | Build |

On first use, tell the student once that on Mac keyboards the F-keys need
`fn` (or the macOS "use F1, F2, etc. keys as standard function keys" setting),
with a button that opens that macOS setting.

### 5. Light touch on the UI

VS Code keeps its own look, theme and panel names. Add:

- A run/debug button in the editor toolbar and a visible "▶ Run" item in the
  status bar. (VS Code only allows icons in the editor toolbar, so the big
  green labelled button from the mockup becomes an icon plus a text status bar
  item.)
- A Build button.

No Visual Studio theme, no Solution Explorer, no fake menus. VS Code
extensions cannot add top-level menus to the Mac menu bar.

### 6. Windows-only lines that beginners copy from course material

Beginner code written in Visual Studio should compile unchanged when it uses:

- `system("pause")` (wait for a key) and `system("cls")` (clear screen)
- `#include "pch.h"` / `#include "stdafx.h"`
- `#include <conio.h>` with `_getch()` / `getch()`
- `scanf_s`, `printf_s` in their common forms
- `#pragma warning(disable: ...)` and `_CRT_SECURE_NO_WARNINGS`

This must not require edits to the student's files.

### 7. IntelliSense that doesn't confuse beginners

A freshly created project must show no false red squiggles (for example
"cannot open `<iostream>`"), and code completion should work for standard
library types.

## Non-goals

- MFC, Win32, `windows.h` or any Windows API.
- The MSVC compiler itself, or exact MSVC behavior/diagnostics.
- A Visual Studio theme, Solution Explorer, Error List, Autos/Locals naming.
- Project templates other than Console App; multiple projects open at once;
  settings screens.
- Windows or Linux support.
- Usage tracking/telemetry of any kind.

## Constraints

- Platform: macOS only, Apple Silicon and Intel; minimum macOS version as old
  as Apple's current Command Line Tools support.
- Toolchain: Apple clang and lldb from the Xcode Command Line Tools. Full Xcode
  must not be required.
- Written in TypeScript as a VS Code extension.
- Published free on the VS Code Marketplace, MIT license, source on GitHub.
  The publisher account belongs to the project owner, who will create it with
  guidance.
- All user-facing text in English, written for beginners.
- The owner knows C++ and some JavaScript; Claude builds the extension and the
  owner steers and tests on real Macs.

## Decisions made in conversation

- Owner's: light-touch UI (option A) over a full Visual Studio makeover.
- Owner's: new project = folder with `main.cpp` Hello World, ready for F5.
- Owner's: loose `.cpp` files are the main case; `.sln` support ships in the
  first release too.
- Owner's: one program per folder.
- Owner's: public and free on the Marketplace.
- Owner's: testing hardware is Apple Silicon only.
- Designer's calls (owner may overrule): TypeScript; Apple clang/lldb; Visual
  Studio 2022 as the reference; English; MIT; no telemetry; C++17; default
  project location `~/Documents/C++ Projects`; plain-words message for
  multiple `main()`; `.vcxproj` support limited to files, include directories
  and defines, with a remembered project picker; Intel verified via Rosetta.

## Left to the builder

- Which debug adapter to use (candidates: CodeLLDB, Apple's `lldb-dap`,
  Microsoft C/C++ with lldb), chosen on breakpoint reliability across
  architectures and `cin` support; whether to depend on another extension or
  bundle one.
- Which language service provides IntelliSense (Microsoft C/C++ or clangd),
  and how it is configured silently.
- How the Windows-only lines in Goal 6 are handled (for example a forced
  include header and a shim include directory).
- How the console stays open and accepts input (integrated vs external
  terminal).
- How Mac key conflicts with the shortcut table are resolved.
- Extension name, icon and Marketplace listing text.
- Test strategy, including how breakpoint reliability is verified automatically.
