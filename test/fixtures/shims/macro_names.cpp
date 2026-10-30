#include <iostream>

// Names that BSD system headers define as macros; valid C++ that compiles in Visual Studio.
enum Answer { FALSE, TRUE };
int MAX(int a, int b) { return a > b ? a : b; }
int MIN(int a, int b) { return a < b ? a : b; }
int isset = 0;

int main() {
    std::cout << MAX(TRUE, 3);
    return 0;
}
