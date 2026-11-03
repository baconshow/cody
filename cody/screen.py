"""A screenshot of the computer, only when you ask for one ("take a screenshot and send it to my phone").

capture() returns PNG bytes of all screens together. Nothing is written to disk on Windows (GDI through ctypes, PNG
encoded with zlib from the standard library); macOS uses the built-in `screencapture` and Linux tries `grim` (Wayland)
or ImageMagick's `import` (X11), through a temp file that is deleted right away. The image goes to your phone only: it
is never sent to Claude.
"""
from __future__ import annotations

import ctypes
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

TIMEOUT_S = 10
SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN = 76, 77, 78, 79


class ScreenError(Exception):
    pass


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def encode_png(bgra: bytes, width: int, height: int) -> bytes:
    """32-bit BGRA rows, top to bottom -> an RGB PNG."""
    rgb = bytearray(width * height * 3)
    rgb[0::3], rgb[1::3], rgb[2::3] = bgra[2::4], bgra[1::4], bgra[0::4]
    stride = width * 3
    raw = b"".join(b"\x00" + rgb[y * stride:(y + 1) * stride] for y in range(height))   # filter 0 on every row
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(raw, 6)) + _chunk(b"IEND", b"")


class _BitmapInfoHeader(ctypes.Structure):
    _fields_ = [("biSize", ctypes.c_uint32), ("biWidth", ctypes.c_int32), ("biHeight", ctypes.c_int32),
                ("biPlanes", ctypes.c_uint16), ("biBitCount", ctypes.c_uint16), ("biCompression", ctypes.c_uint32),
                ("biSizeImage", ctypes.c_uint32), ("biXPelsPerMeter", ctypes.c_int32),
                ("biYPelsPerMeter", ctypes.c_int32), ("biClrUsed", ctypes.c_uint32), ("biClrImportant", ctypes.c_uint32)]


def _capture_windows() -> bytes:
    user32, gdi32 = ctypes.windll.user32, ctypes.windll.gdi32
    try:
        user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))   # per-monitor: real pixels on scaled screens
    except (AttributeError, OSError):
        user32.SetProcessDPIAware()
    left, top, width, height = (user32.GetSystemMetrics(i) for i in
                                (SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN))
    if width <= 0 or height <= 0:
        raise ScreenError("no screen to capture")
    for f in (user32.GetDC, gdi32.CreateCompatibleDC, gdi32.CreateCompatibleBitmap, gdi32.SelectObject):
        f.restype = ctypes.c_void_p
    user32.ReleaseDC.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    gdi32.DeleteDC.argtypes = gdi32.DeleteObject.argtypes = [ctypes.c_void_p]
    gdi32.CreateCompatibleDC.argtypes = [ctypes.c_void_p]
    gdi32.CreateCompatibleBitmap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
    gdi32.SelectObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    gdi32.BitBlt.argtypes = [ctypes.c_void_p] + [ctypes.c_int] * 4 + [ctypes.c_void_p] + [ctypes.c_int] * 2 + [ctypes.c_uint32]
    gdi32.GetDIBits.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p,
                                ctypes.c_void_p, ctypes.c_uint]
    screen = user32.GetDC(None)
    memory = gdi32.CreateCompatibleDC(screen)
    bitmap = gdi32.CreateCompatibleBitmap(screen, width, height)
    try:
        gdi32.SelectObject(memory, bitmap)
        if not gdi32.BitBlt(memory, 0, 0, width, height, screen, left, top, 0x00CC0020 | 0x40000000):  # SRCCOPY|CAPTUREBLT
            raise ScreenError("the screen could not be copied (locked screen?)")
        info = _BitmapInfoHeader(ctypes.sizeof(_BitmapInfoHeader), width, -height, 1, 32, 0, 0, 0, 0, 0, 0)
        pixels = ctypes.create_string_buffer(width * height * 4)
        if gdi32.GetDIBits(memory, bitmap, 0, height, pixels, ctypes.byref(info), 0) != height:
            raise ScreenError("the screen pixels could not be read")
        return encode_png(pixels.raw, width, height)
    finally:
        gdi32.DeleteObject(bitmap)
        gdi32.DeleteDC(memory)
        user32.ReleaseDC(None, screen)


def _capture_with_tool() -> bytes:
    """macOS screencapture, or grim / ImageMagick import on Linux, into a temp file read and deleted at once."""
    if sys.platform == "darwin":
        command = ["screencapture", "-x", "-t", "png"]
    elif shutil.which("grim"):
        command = ["grim"]
    elif shutil.which("import"):
        command = ["import", "-window", "root"]
    else:
        raise ScreenError("no screenshot tool found (install grim or ImageMagick)")
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        done = subprocess.run([*command, path], capture_output=True, timeout=TIMEOUT_S, check=False, shell=False)
        with open(path, "rb") as image:
            data = image.read()
        if done.returncode != 0 or not data.startswith(b"\x89PNG"):
            raise ScreenError("the screenshot tool failed (screen recording permission?)")
        return data
    except (OSError, subprocess.SubprocessError) as error:
        raise ScreenError("the screenshot tool failed") from error
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def capture() -> bytes:
    """PNG bytes of all screens; ScreenError when it cannot be taken."""
    if sys.platform == "win32":
        try:
            return _capture_windows()
        except OSError as error:
            raise ScreenError("the screen could not be captured") from error
    return _capture_with_tool()
