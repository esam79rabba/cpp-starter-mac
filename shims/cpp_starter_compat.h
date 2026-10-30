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

#include <csignal>
#include <cstdarg>
#include <poll.h>
#include <termios.h>
#include <unistd.h>

// ---- waiting for the debugger ----------------------------------------------------------

// Apple's lldb-dap cannot start a program in the terminal itself on macOS (its launcher is a
// system binary that no debugger may attach to), so "Start Debugging" runs the program in the
// terminal with CPP_STARTER_WAIT_FOR_DEBUGGER=<file>. The program writes its pid to that file
// once it is fully loaded and waiting here; only then does lldb attach (attaching earlier,
// during dyld start-up under Rosetta, stops the program inside dyld). After attaching, the
// extension's lldb commands set cpp_starter_debugger_attached = 1 while the program is still
// stopped, so breakpoints are in place before it continues. Until then nothing may run: not
// main, not a global initializer. This inline variable is defined before any user code in
// every translation unit (the header is force-included), so C++17 orders its initialization
// first. C linkage gives lldb a stable, unmangled name to assign.
extern "C" {
inline volatile int cpp_starter_debugger_attached = 0;
}

inline const bool cpp_starter_debugger_ready = [] {
    const char* ready_file = std::getenv("CPP_STARTER_WAIT_FOR_DEBUGGER");
    if (ready_file == nullptr || ready_file[0] == '\0') return true;
    if (std::FILE* f = std::fopen(ready_file, "w")) {
        std::fprintf(f, "%d\n", static_cast<int>(getpid()));
        std::fclose(f);
    }
    unsetenv("CPP_STARTER_WAIT_FOR_DEBUGGER");  // not for programs this one starts
    for (int i = 0; i < 6000; ++i) {  // 60 seconds
        if (cpp_starter_debugger_attached != 0) return true;
        usleep(10000);
    }
    std::fputs("The debugger did not start. Close this window and try again.\n", stderr);
    std::_Exit(1);
}();

// ---- keypress helpers ------------------------------------------------------------------

// CPP_STARTER_NO_PAUSE=1 disables every wait for a keypress (used by the tests).
inline bool cpp_starter_no_pause() {
    const char* v = std::getenv("CPP_STARTER_NO_PAUSE");
    return v != nullptr && v[0] == '1';
}

// While stdin is in raw mode, Ctrl+C / kill / hangup must not leave the terminal broken:
// the handler restores the saved settings, reinstates the previous handler and re-raises.
struct cpp_starter_term_state {
    termios saved;
    struct sigaction previous[3];
};
inline cpp_starter_term_state cpp_starter_term;
inline constexpr int cpp_starter_signals[3] = {SIGINT, SIGTERM, SIGHUP};

inline void cpp_starter_restore_and_reraise(int sig) {
    tcsetattr(STDIN_FILENO, TCSANOW, &cpp_starter_term.saved);
    for (int i = 0; i < 3; ++i) {
        if (cpp_starter_signals[i] == sig) sigaction(sig, &cpp_starter_term.previous[i], nullptr);
    }
    raise(sig);
}

// Reads one key from stdin. Raw (unbuffered) terminal mode is used only when stdin is a
// terminal, and the terminal is always restored. Returns the key, or -1 on end of input.
inline int cpp_starter_read_key(bool echo) {
    bool raw = false;
    if (isatty(STDIN_FILENO) && tcgetattr(STDIN_FILENO, &cpp_starter_term.saved) == 0) {
        termios t = cpp_starter_term.saved;
        t.c_lflag &= ~static_cast<tcflag_t>(ICANON);
        if (!echo) t.c_lflag &= ~static_cast<tcflag_t>(ECHO);
        t.c_cc[VMIN] = 1;
        t.c_cc[VTIME] = 0;
        struct sigaction sa;
        std::memset(&sa, 0, sizeof sa);
        sa.sa_handler = cpp_starter_restore_and_reraise;
        sigemptyset(&sa.sa_mask);
        for (int i = 0; i < 3; ++i) sigaction(cpp_starter_signals[i], &sa, &cpp_starter_term.previous[i]);
        raw = tcsetattr(STDIN_FILENO, TCSANOW, &t) == 0;
        if (!raw) {
            for (int i = 0; i < 3; ++i) sigaction(cpp_starter_signals[i], &cpp_starter_term.previous[i], nullptr);
        }
    }
    unsigned char c = 0;
    ssize_t n = read(STDIN_FILENO, &c, 1);
    if (raw) {
        tcsetattr(STDIN_FILENO, TCSANOW, &cpp_starter_term.saved);
        for (int i = 0; i < 3; ++i) sigaction(cpp_starter_signals[i], &cpp_starter_term.previous[i], nullptr);
    }
    return n == 1 ? c : -1;
}

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
