// C++ Starter for Mac: the compiled half of the compatibility layer.
// Everything that needs POSIX or macOS system headers lives here, in its own translation unit,
// so those headers never reach student code: names such as pause, read, link or ECHO stay free.
// It is compiled and linked into every program, after the student's sources.

#include <csignal>
#include <dlfcn.h>
#include <poll.h>
#include <sys/types.h>
#include <termios.h>
#include <unistd.h>

// The force-included header supplies the declarations below; included again for clarity.
#include "cpp_starter_compat.h"

// A student's own global (for example `int read = 0;`) has the same unmangled symbol as the
// POSIX function, and the static linker would bind this file's calls to it. So the POSIX
// functions are looked up in libSystem at run time, where no student symbol can shadow them.
namespace {

template <class F>
F libc(const char* name) {
    static void* const handle = dlopen("/usr/lib/libSystem.B.dylib", RTLD_LAZY | RTLD_NOLOAD);
    return reinterpret_cast<F>(dlsym(handle == nullptr ? RTLD_DEFAULT : handle, name));
}

struct Posix {
    ssize_t (*read)(int, void*, size_t);
    int (*poll)(pollfd*, nfds_t, int);
    int (*isatty)(int);
    int (*tcgetattr)(int, termios*);
    int (*tcsetattr)(int, int, const termios*);
    int (*sigaction)(int, const struct sigaction*, struct sigaction*);
    int (*raise)(int);
    pid_t (*getpid)();
    int (*usleep)(useconds_t);
    int (*unsetenv)(const char*);
};

const Posix& posix() {
    static const Posix p = {
        libc<ssize_t (*)(int, void*, size_t)>("read"),
        libc<int (*)(pollfd*, nfds_t, int)>("poll"),
        libc<int (*)(int)>("isatty"),
        libc<int (*)(int, termios*)>("tcgetattr"),
        libc<int (*)(int, int, const termios*)>("tcsetattr"),
        libc<int (*)(int, const struct sigaction*, struct sigaction*)>("sigaction"),
        libc<int (*)(int)>("raise"),
        libc<pid_t (*)()>("getpid"),
        libc<int (*)(useconds_t)>("usleep"),
        libc<int (*)(const char*)>("unsetenv"),
    };
    return p;
}

}  // namespace

// ---- waiting for the debugger ----------------------------------------------------------

// Apple's lldb-dap cannot start a program in the terminal itself on macOS (its launcher is a
// system binary that no debugger may attach to), so "Start Debugging" runs the program in the
// terminal with CPP_STARTER_WAIT_FOR_DEBUGGER=<file>. The program writes its pid to that file
// once it is fully loaded and waiting here; only then does lldb attach (attaching earlier,
// during dyld start-up under Rosetta, stops the program inside dyld). After attaching, the
// extension's lldb commands set cpp_starter_debugger_attached = 1 while the program is still
// stopped, so breakpoints are in place before it continues. The header calls this from an
// inline variable defined before any user code in every translation unit, so it runs before
// main and before any global initializer. C linkage gives lldb a stable, unmangled name.
extern "C" volatile int cpp_starter_debugger_attached = 0;

extern "C" bool cpp_starter_wait_for_debugger(void) {
    const char* ready_file = std::getenv("CPP_STARTER_WAIT_FOR_DEBUGGER");
    if (ready_file == nullptr || ready_file[0] == '\0') return true;
    const Posix& p = posix();
    if (std::FILE* f = std::fopen(ready_file, "w")) {
        std::fprintf(f, "%d\n", static_cast<int>(p.getpid()));
        std::fclose(f);
    }
    p.unsetenv("CPP_STARTER_WAIT_FOR_DEBUGGER");  // not for programs this one starts
    for (int i = 0; i < 6000; ++i) {  // 60 seconds
        if (cpp_starter_debugger_attached != 0) return true;
        p.usleep(10000);
    }
    std::fputs("The debugger did not start. Close this window and try again.\n", stderr);
    std::_Exit(1);
}

// ---- keypress helpers ------------------------------------------------------------------

// CPP_STARTER_NO_PAUSE=1 disables every wait for a keypress (used by the tests).
extern "C" bool cpp_starter_no_pause(void) {
    const char* v = std::getenv("CPP_STARTER_NO_PAUSE");
    return v != nullptr && v[0] == '1';
}

namespace {

// While stdin is in raw mode, Ctrl+C / kill / hangup must not leave the terminal broken:
// the handler restores the saved settings, reinstates the previous handler and re-raises.
termios saved_term;
struct sigaction previous_handlers[3];
constexpr int handled_signals[3] = {SIGINT, SIGTERM, SIGHUP};

void restore_and_reraise(int sig) {
    const Posix& p = posix();
    p.tcsetattr(STDIN_FILENO, TCSANOW, &saved_term);
    for (int i = 0; i < 3; ++i) {
        if (handled_signals[i] == sig) p.sigaction(sig, &previous_handlers[i], nullptr);
    }
    p.raise(sig);
}

void restore_handlers() {
    for (int i = 0; i < 3; ++i) posix().sigaction(handled_signals[i], &previous_handlers[i], nullptr);
}

}  // namespace

// Reads one key from stdin. Raw (unbuffered) terminal mode is used only when stdin is a
// terminal, and the terminal is always restored. Returns the key, or -1 on end of input.
extern "C" int cpp_starter_read_key(bool echo) {
    const Posix& p = posix();
    bool raw = false;
    if (p.isatty(STDIN_FILENO) && p.tcgetattr(STDIN_FILENO, &saved_term) == 0) {
        termios t = saved_term;
        t.c_lflag &= ~static_cast<tcflag_t>(ICANON);
        if (!echo) t.c_lflag &= ~static_cast<tcflag_t>(ECHO);
        t.c_cc[VMIN] = 1;
        t.c_cc[VTIME] = 0;
        struct sigaction sa;
        std::memset(&sa, 0, sizeof sa);
        sa.sa_handler = restore_and_reraise;
        sigemptyset(&sa.sa_mask);
        for (int i = 0; i < 3; ++i) p.sigaction(handled_signals[i], &sa, &previous_handlers[i]);
        raw = p.tcsetattr(STDIN_FILENO, TCSANOW, &t) == 0;
        if (!raw) restore_handlers();
    }
    unsigned char c = 0;
    ssize_t n = p.read(STDIN_FILENO, &c, 1);
    if (raw) {
        p.tcsetattr(STDIN_FILENO, TCSANOW, &saved_term);
        restore_handlers();
    }
    return n == 1 ? c : -1;
}

// Non-zero when a key is waiting. In a terminal this becomes true after Enter is pressed,
// because the terminal delivers input line by line.
extern "C" int cpp_starter_kbhit(void) {
    pollfd fd = {STDIN_FILENO, POLLIN, 0};
    return posix().poll(&fd, 1, 0) > 0 && (fd.revents & POLLIN) ? 1 : 0;
}

// ---- "Press any key to close this window" at exit --------------------------------------

namespace {

void exit_pause() {
    if (cpp_starter_no_pause() || !posix().isatty(STDIN_FILENO)) return;
    std::fputs("\nProgram exited.\nPress any key to close this window . . .", stdout);
    std::fflush(stdout);
    cpp_starter_read_key(false);
}

}  // namespace

extern "C" int cpp_starter_register_exit_pause(void) {
    static const int registered = std::atexit(exit_pause);
    return registered;
}
