#include <iostream>

// Names that POSIX headers (<unistd.h>, <termios.h>) declare; valid C++ in Visual Studio.
void pause() { std::cout << "p"; }
const int ECHO = 1;
int link = 3;
int read = 0;

int main() {
    pause();
    read = link + ECHO;
    std::cout << read << '\n';
    return 0;
}
