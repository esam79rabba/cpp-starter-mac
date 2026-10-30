#define _CRT_SECURE_NO_WARNINGS
#pragma warning(disable: 4996)
#include <cstdio>
#include <cstring>

int main() {
    char buf[16];
    strcpy_s(buf, "hi");
    char other[16];
    sprintf_s(other, sizeof(other), "%s!", buf);
    strcpy_s(buf, other);
    printf("%s\n", buf);
    return 0;
}
