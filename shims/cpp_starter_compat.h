// C++ Starter for Mac: compatibility layer for code written in Visual Studio on Windows.
// This header is force-included into every build (-include), so beginner code such as
// system("pause"), scanf_s or printf_s compiles unchanged on macOS.
#pragma once

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <cctype>
#include <tuple>
#include <type_traits>

#include <poll.h>
#include <termios.h>
#include <unistd.h>

// ---- keypress helpers ------------------------------------------------------------------

// CPP_STARTER_NO_PAUSE=1 disables every wait for a keypress (used by the tests).
inline bool cpp_starter_no_pause() {
    const char* v = std::getenv("CPP_STARTER_NO_PAUSE");
    return v != nullptr && v[0] == '1';
}

// Reads one key from stdin. Raw (unbuffered) terminal mode is used only when stdin is a
// terminal, and the terminal is always restored. Returns the key, or -1 on end of input.
inline int cpp_starter_read_key(bool echo) {
    termios saved;
    bool raw = false;
    if (isatty(STDIN_FILENO) && tcgetattr(STDIN_FILENO, &saved) == 0) {
        termios t = saved;
        t.c_lflag &= ~static_cast<tcflag_t>(ICANON);
        if (!echo) t.c_lflag &= ~static_cast<tcflag_t>(ECHO);
        t.c_cc[VMIN] = 1;
        t.c_cc[VTIME] = 0;
        raw = tcsetattr(STDIN_FILENO, TCSANOW, &t) == 0;
    }
    unsigned char c = 0;
    ssize_t n = read(STDIN_FILENO, &c, 1);
    if (raw) tcsetattr(STDIN_FILENO, TCSANOW, &saved);
    return n == 1 ? c : -1;
}

// ---- system("pause") / system("cls") ---------------------------------------------------

inline int cpp_starter_system(const char* command) {
    // Taken before `system` is turned into a macro below, so this is the real one.
    static int (*const real_system)(const char*) = ::system;
    if (command != nullptr) {
        bool is_pause = true;
        const char* want = "pause";
        size_t i = 0;
        for (; want[i] != '\0'; ++i) {
            if (std::tolower(static_cast<unsigned char>(command[i])) != want[i]) { is_pause = false; break; }
        }
        if (is_pause && command[i] == '\0') {
            std::fputs("Press any key to continue . . . ", stdout);
            std::fflush(stdout);
            if (!cpp_starter_no_pause()) cpp_starter_read_key(false);
            std::fputs("\n", stdout);
            std::fflush(stdout);
            return 0;
        }
        if (std::strcmp(command, "cls") == 0 || std::strcmp(command, "CLS") == 0) {
            std::fputs("\033[2J\033[H", stdout);
            std::fflush(stdout);
            return 0;
        }
    }
    return real_system(command);
}

namespace std {
using ::cpp_starter_system;
}
#define system cpp_starter_system

// ---- "Press any key to close this window" at exit --------------------------------------

inline void cpp_starter_exit_pause() {
    if (cpp_starter_no_pause() || !isatty(STDIN_FILENO)) return;
    std::fputs("\nProgram exited.\nPress any key to close this window . . .", stdout);
    std::fflush(stdout);
    cpp_starter_read_key(false);
}

inline const int cpp_starter_exit_pause_registered = std::atexit(cpp_starter_exit_pause);

// ---- Microsoft "_s" functions ----------------------------------------------------------

// Keeps pointers, drops everything else: scanf_s takes extra integer buffer-size arguments
// after each %s / %c, which plain scanf does not want.
template <class T>
auto cpp_starter_keep_pointer(T value) {
    if constexpr (std::is_pointer_v<T>) return std::make_tuple(value);
    else return std::tuple<>();
}

template <class... Args>
int scanf_s(const char* format, Args... args) {
    return std::apply([&](auto... p) { return std::scanf(format, p...); },
                      std::tuple_cat(cpp_starter_keep_pointer(args)...));
}

template <class... Args>
int fscanf_s(std::FILE* stream, const char* format, Args... args) {
    return std::apply([&](auto... p) { return std::fscanf(stream, format, p...); },
                      std::tuple_cat(cpp_starter_keep_pointer(args)...));
}

template <class... Args>
int sscanf_s(const char* buffer, const char* format, Args... args) {
    return std::apply([&](auto... p) { return std::sscanf(buffer, format, p...); },
                      std::tuple_cat(cpp_starter_keep_pointer(args)...));
}

// Macros (not functions) so the compiler still checks printf-style formats.
#define printf_s printf
#define fprintf_s fprintf
#define sprintf_s(buffer, size, ...) snprintf(buffer, size, __VA_ARGS__)

inline int strcpy_s(char* dst, std::size_t size, const char* src) {
    return std::snprintf(dst, size, "%s", src) < 0 ? 1 : 0;
}

template <std::size_t N>
int strcpy_s(char (&dst)[N], const char* src) {
    return strcpy_s(dst, N, src);
}
