#include <cstdio>

// Global initializer: must not run before the debugger is attached either.
static int early = std::printf("init\n");

int main() {
    std::printf("main\n");
    return early > 0 ? 0 : 1;
}
