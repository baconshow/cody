"""Where the mouse pointer is on the computer screen, so the mascot on the phone can look at it.

Only the position leaves this module, from -1 to 1 across all screens together (x left to right, y top to bottom),
read at request time: nothing is stored. Windows only for now (GetCursorPos and GetSystemMetrics from user32, through
the standard library). Anywhere else, or when the read fails (locked screen, remote session), the position is None and
the mascot simply looks around on its own.
"""
from __future__ import annotations

import ctypes
import sys

# GetSystemMetrics: the box around all screens (the virtual screen)
SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN = 76, 77, 78, 79


class _Point(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def normalize(x: int, y: int, area: tuple[int, int, int, int]) -> dict | None:
    """(x, y) in screen pixels -> {"x", "y"} from -1 to 1 inside area (left, top, width, height)."""
    left, top, width, height = area
    if width <= 0 or height <= 0:
        return None
    nx = (x - left) / width * 2 - 1
    ny = (y - top) / height * 2 - 1
    return {"x": round(max(-1.0, min(1.0, nx)), 4), "y": round(max(-1.0, min(1.0, ny)), 4)}


def read_windows() -> dict | None:
    user32 = ctypes.windll.user32
    point = _Point()
    if not user32.GetCursorPos(ctypes.byref(point)):
        return None
    area = tuple(user32.GetSystemMetrics(i) for i in
                 (SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN))
    return normalize(point.x, point.y, area)


def position() -> dict | None:
    """{"x", "y"} from -1 to 1, or None outside Windows or when the read fails."""
    if sys.platform != "win32":
        return None
    try:
        return read_windows()
    except (OSError, AttributeError):
        return None
