import { describe, expect, it } from 'vitest';
import { explain } from '../../src/explain';

describe('explain', () => {
  it.each([
    ["use of undeclared identifier 'cout'", "Write std::cout, or add 'using namespace std;' after your #include lines."],
    ["use of undeclared identifier 'vector'", "Write std::vector, or add 'using namespace std;' after your #include lines."],
    ["expected ';' after expression", 'A semicolon (;) is missing at the end of the previous statement.'],
    ["'main' must return 'int'", "Change 'void main()' to 'int main()'. Visual Studio allows void main, but standard C++ does not."],
    ["'cstdlib' file not found", "The file 'cstdlib' could not be found. Check the spelling, and that the file is in the same folder as your .cpp files."],
    ["duplicate symbol '_main' in:", 'More than one file in this folder has a main() function. Each program needs its own folder.'],
    ['Undefined symbols for architecture arm64', 'A function is declared but its code was not found. Check that every .cpp file of your program is in the same folder.'],
  ])('explains %s', (message, expected) => {
    expect(explain(message)).toBe(expected);
  });

  it('returns undefined for unknown messages', () => {
    expect(explain("unused variable 'x'")).toBeUndefined();
  });
});
