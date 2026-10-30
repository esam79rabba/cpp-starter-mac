// Replacement for Windows <conio.h>. Reads single keys from stdin.
#pragma once

#include "../cpp_starter_compat.h"

inline int _getch() { return cpp_starter_read_key(false); }
inline int _getche() { return cpp_starter_read_key(true); }
inline int getch() { return _getch(); }
inline int getche() { return _getche(); }

// Non-zero when a key is waiting. In a terminal this becomes true after Enter is pressed,
// because the terminal delivers input line by line.
inline int _kbhit() { return cpp_starter_kbhit(); }
inline int kbhit() { return _kbhit(); }
