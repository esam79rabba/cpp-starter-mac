#include <stdio.h>

int main() {
    char name[20];
    int age;
    scanf_s("%s %d", name, 20, &age);
    printf_s("%s is %d\n", name, age);
    return 0;
}
