// C++ Starter for Mac: compatibility layer for code written in Visual Studio on Windows.
// This header is force-included into every build (-include), so beginner code such as
// system("pause"), scanf_s or printf_s compiles unchanged on macOS.
#pragma once

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <cctype>
#include <cstdarg>
#include <tuple>
#include <type_traits>

// Only C++ standard library headers here: this file reaches every student file, and POSIX or
// macOS system headers would take names such as pause, read, link or ECHO away from them.
// Anything that needs those headers lives in cpp_starter_compat.cpp, which is compiled and
// linked into every program.

extern "C" {
// Set to 1 by the debugger (lldb `expression`) once it has attached; defined in the .cpp.
extern volatile int cpp_starter_debugger_attached;
bool cpp_starter_wait_for_debugger(void);
bool cpp_starter_no_pause(void);
int cpp_starter_read_key(bool echo);
int cpp_starter_kbhit(void);
int cpp_starter_register_exit_pause(void);
}

// ---- waiting for the debugger ----------------------------------------------------------

// With CPP_STARTER_WAIT_FOR_DEBUGGER set, nothing may run before the debugger has attached:
// not main, not a global initializer. This inline variable is defined before any user code in
// every translation unit (the header is force-included), so C++17 initializes it first.
inline const bool cpp_starter_debugger_ready = cpp_starter_wait_for_debugger();

// ---- system("pause") / system("cls") ---------------------------------------------------

// Case-insensitive match of the text at *p against a lower-case word; advances *p on success.
inline bool cpp_starter_eat_word(const char** p, const char* word) {
    const char* q = *p;
    for (; *word != '\0'; ++word, ++q) {
        if (std::tolower(static_cast<unsigned char>(*q)) != *word) return false;
    }
    *p = q;
    return true;
}

inline const char* cpp_starter_skip_space(const char* p) {
    while (*p != '\0' && std::isspace(static_cast<unsigned char>(*p))) ++p;
    return p;
}

inline int cpp_starter_system(const char* command) {
    // Taken before `system` is turned into a macro below, so this is the real one.
    static int (*const real_system)(const char*) = ::system;
    if (command != nullptr) {
        const char* p = cpp_starter_skip_space(command);
        const char* q = p;
        if (cpp_starter_eat_word(&q, "pause")) {
            q = cpp_starter_skip_space(q);
            bool quiet = false;
            if (*q == '>') {
                q = cpp_starter_skip_space(q + 1);
                quiet = cpp_starter_eat_word(&q, "nul");
                q = cpp_starter_skip_space(q);
                if (!quiet) q = "?";  // some other redirect: leave it to the real shell
            }
            if (*q == '\0') {
                if (!quiet) {
                    std::fputs("Press any key to continue . . . ", stdout);
                    std::fflush(stdout);
                }
                if (!cpp_starter_no_pause()) cpp_starter_read_key(false);
                if (!quiet) {
                    std::fputs("\n", stdout);
                    std::fflush(stdout);
                }
                return 0;
            }
        }
        q = p;
        if (cpp_starter_eat_word(&q, "cls") && *cpp_starter_skip_space(q) == '\0') {
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

// Registered before any user code runs, as the wait above; the handler is in the .cpp.
inline const int cpp_starter_exit_pause_registered = cpp_starter_register_exit_pause();

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

// Macros so the compiler still checks printf-style formats.
#define printf_s printf
#define fprintf_s fprintf

// sprintf_s(buf, size, fmt, ...) and the array form sprintf_s(buf, fmt, ...).
__attribute__((format(printf, 3, 4)))
inline int sprintf_s(char* buffer, std::size_t size, const char* format, ...) {
    va_list args;
    va_start(args, format);
    int n = std::vsnprintf(buffer, size, format, args);
    va_end(args);
    return n;
}

template <std::size_t N>
__attribute__((format(printf, 2, 3)))
int sprintf_s(char (&buffer)[N], const char* format, ...) {
    va_list args;
    va_start(args, format);
    int n = std::vsnprintf(buffer, N, format, args);
    va_end(args);
    return n;
}

inline int strcpy_s(char* dst, std::size_t size, const char* src) {
    return std::snprintf(dst, size, "%s", src) < 0 ? 1 : 0;
}

template <std::size_t N>
int strcpy_s(char (&dst)[N], const char* src) {
    return strcpy_s(dst, N, src);
}
