#include "Student.h"

// Task 7 sets a breakpoint in this method.
std::string Student::describe() const {
    return name_ + " has grade " + std::to_string(grade_);
}
