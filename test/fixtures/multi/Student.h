#pragma once
#include <string>

class Student {
public:
    Student(const std::string& name, int grade) : name_(name), grade_(grade) {}

    // Inline method: Task 7 sets a breakpoint here.
    int grade() const {
        return grade_;
    }

    std::string describe() const;

private:
    std::string name_;
    int grade_;
};
