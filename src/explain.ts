const EXPLANATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /use of undeclared identifier '(cout|cin|endl|string|vector)'/,
    "Write std::$1, or add 'using namespace std;' after your #include lines.",
  ],
  [/expected ';'/, 'A semicolon (;) is missing at the end of the previous statement.'],
  [
    /'main' must return 'int'/,
    "Change 'void main()' to 'int main()'. Visual Studio allows void main, but standard C++ does not.",
  ],
  [
    /'(.+)' file not found/,
    "The file '$1' could not be found. Check the spelling, and that the file is in the same folder as your .cpp files.",
  ],
  [
    /duplicate symbol '_main'/,
    'More than one file in this folder has a main() function. Each program needs its own folder.',
  ],
  [
    /undefined symbols? for architecture/i,
    'A function is declared but its code was not found. Check that every .cpp file of your program is in the same folder.',
  ],
];

/** Plain-English help for a compiler or linker message, or undefined when there is none. */
export function explain(message: string): string | undefined {
  for (const [pattern, text] of EXPLANATIONS) {
    const match = pattern.exec(message);
    if (match) return text.replace(/\$(\d)/g, (_, n: string) => match[Number(n)] ?? '');
  }
  return undefined;
}
