#include <cstdio>

int main() {
    char b[16];
    sprintf_s(b, "%d-%s", 7, "x");
    puts(b);
    char c[16];
    sprintf_s(c, sizeof(c), "%s=%d", "y", 8);
    puts(c);
    return 0;
}
