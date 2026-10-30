#include <iostream>
#include "Student.h"

int main() {
    Student s("Ada", 95);
    std::cout << s.describe() << " (" << s.grade() << ")\n";
    return 0;
}
