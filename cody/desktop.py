"""Quick things on the computer for the voice session, so Claude never writes a script for them.

  copy_image(png) → bool          the screenshot onto the clipboard, ready to paste (Windows)
  save_screenshot(png, folder)    a PNG file Claude can hand to another session; only the latest few are kept
  open_app(name) → what opened    a few everyday apps by name: calculator, paint, notepad, files, settings, task manager
  png_to_dib(png) → bytes         pure: the PNG Cody encodes (cody/screen.py) as a bottom-up 32-bit bitmap

The clipboard gets two copies of the picture: PNG (what browsers, chat apps and Office paste) and a bitmap (what Paint
and older apps paste). Windows only, through ctypes: elsewhere copy_image returns False and Claude says so.
"""
from __future__ import annotations

import ctypes
import os
import struct
import subprocess
import sys
import time
import zlib
from pathlib import Path

KEEP_FILES = 5
CLIPBOARD_TRIES = 10              # another app may hold the clipboard for a moment
CLIPBOARD_WAIT_S = 0.05
GMEM_MOVEABLE = 0x0002
CF_DIB = 8
# name -> (Windows target for os.startfile, macOS app for `open -a`); None: not on that system
APPS = {
    "calculator": ("calc.exe", "Calculator"),
    "paint": ("mspaint.exe", None),
    "notepad": ("notepad.exe", "TextEdit"),
    "files": ("explorer.exe", "Finder"),
    "settings": ("ms-settings:", "System Settings"),
    "task_manager": ("taskmgr.exe", "Activity Monitor"),
}


def png_to_dib(png: bytes) -> bytes:
    """An 8-bit RGB PNG with filter 0 on every row (the kind encode_png writes) -> BITMAPINFOHEADER + BGRA rows,
    bottom row first. ValueError for any other PNG."""
    if not png.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a PNG")
    pos, header, data = 8, None, []
    while pos + 8 <= len(png):
        length, kind = struct.unpack(">I4s", png[pos:pos + 8])
        body = png[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            data.append(body)
        pos += 12 + length
    if header is None or header[2:] != (8, 2, 0, 0, 0):
        raise ValueError("only 8-bit RGB PNGs without interlacing")
    width, height = header[0], header[1]
    raw = zlib.decompress(b"".join(data))
    stride = width * 3 + 1
    if len(raw) != stride * height or any(raw[y * stride] != 0 for y in range(height)):
        raise ValueError("only filter 0 rows")
    rgb = b"".join(raw[y * stride + 1:(y + 1) * stride] for y in range(height - 1, -1, -1))   # bottom row first
    bgra = bytearray(width * height * 4)
    bgra[0::4], bgra[1::4], bgra[2::4] = rgb[2::3], rgb[1::3], rgb[0::3]
    bgra[3::4] = b"\xff" * (width * height)
    info = struct.pack("<IiiHHIIiiII", 40, width, height, 1, 32, 0, len(bgra), 0, 0, 0, 0)
    return info + bytes(bgra)


def _global(kernel32, data: bytes):
    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
    if not handle:
        raise OSError("GlobalAlloc failed")
    pointer = kernel32.GlobalLock(handle)
    if not pointer:
        kernel32.GlobalFree(handle)
        raise OSError("GlobalLock failed")
    ctypes.memmove(pointer, data, len(data))
    kernel32.GlobalUnlock(handle)
    return handle


def copy_image(png: bytes) -> bool:
    """The picture onto the Windows clipboard. False when it could not (not Windows, clipboard busy)."""
    if sys.platform != "win32":
        return False
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    kernel32.GlobalAlloc.restype = kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
    kernel32.GlobalLock.argtypes = kernel32.GlobalUnlock.argtypes = kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
    user32.CreateWindowExW.restype = user32.SetClipboardData.restype = ctypes.c_void_p
    user32.CreateWindowExW.argtypes = [ctypes.c_uint32, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32,
                                       ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                       ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
    user32.OpenClipboard.argtypes = user32.DestroyWindow.argtypes = [ctypes.c_void_p]
    user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
    user32.RegisterClipboardFormatW.argtypes = [ctypes.c_wchar_p]
    formats = [(user32.RegisterClipboardFormatW("PNG"), png)]
    try:
        formats.append((CF_DIB, png_to_dib(png)))
    except ValueError:
        pass                              # a PNG from elsewhere: the PNG copy alone
    # SetClipboardData needs a clipboard owner: a hidden window of our own, gone right after
    window = user32.CreateWindowExW(0, "STATIC", None, 0, 0, 0, 0, 0, None, None, None, None)
    try:
        for _ in range(CLIPBOARD_TRIES):
            if user32.OpenClipboard(window):
                break
            time.sleep(CLIPBOARD_WAIT_S)
        else:
            return False
        try:
            user32.EmptyClipboard()
            copied = False
            for kind, data in formats:
                handle = _global(kernel32, data)
                if user32.SetClipboardData(kind, handle):
                    copied = True             # the clipboard owns the memory now
                else:
                    kernel32.GlobalFree(handle)
            return copied
        finally:
            user32.CloseClipboard()
    finally:
        if window:
            user32.DestroyWindow(window)


def save_screenshot(png: bytes, folder: Path, keep: int = KEEP_FILES, now=time.time) -> Path:
    """The picture as a file, so Claude can hand its path to another session; older ones beyond `keep` are deleted."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / time.strftime("screenshot-%Y%m%d-%H%M%S.png", time.localtime(now()))
    serial = 1
    while path.exists():
        serial += 1
        path = path.with_name(f"{path.stem.split('_')[0]}_{serial}.png")
    path.write_bytes(png)
    shots = sorted(folder.glob("screenshot-*.png"), key=lambda p: p.stat().st_mtime)
    for old in shots[:-keep]:
        old.unlink(missing_ok=True)
    return path


def open_app(name: str, platform: str = sys.platform, start=None, run=subprocess.run) -> str:
    """Opens one of APPS. Returns the name opened; ValueError("unknown") or ValueError("unsupported")."""
    key = str(name or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key not in APPS:
        raise ValueError("unknown")
    windows, mac = APPS[key]
    if platform == "win32":
        (start or os.startfile)(windows)                               # noqa: S606 - a fixed name from APPS
    elif platform == "darwin" and mac:
        run(["open", "-a", mac], check=True, capture_output=True, timeout=10)
    else:
        raise ValueError("unsupported")
    return key
