"""Start with Windows: one value in the current user's Run key (no admin rights), the same one the installer sets.

    HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run    Cody = "<install folder>\\Cody.exe" --background
"""
from __future__ import annotations

import sys

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
VALUE = "Cody"


def _registry():
    if sys.platform != "win32":
        return None
    import winreg
    return winreg


def command(exe: str | None = None) -> str:
    return f'"{exe or sys.executable}" --background'


def enabled(registry=None) -> bool:
    reg = registry or _registry()
    if reg is None:
        return False
    try:
        with reg.OpenKey(reg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _kind = reg.QueryValueEx(key, VALUE)
    except OSError:
        return False
    return isinstance(value, str) and "cody" in value.casefold()


def set_enabled(on: bool, exe: str | None = None, registry=None) -> bool:
    """Turns starting with Windows on or off. Returns the new state (False when it could not be changed)."""
    reg = registry or _registry()
    if reg is None:
        return False
    try:
        with reg.CreateKeyEx(reg.HKEY_CURRENT_USER, RUN_KEY, 0, reg.KEY_SET_VALUE) as key:
            if on:
                reg.SetValueEx(key, VALUE, 0, reg.REG_SZ, command(exe))
            else:
                try:
                    reg.DeleteValue(key, VALUE)
                except FileNotFoundError:
                    pass
    except OSError:
        return enabled(reg)
    return enabled(reg)
