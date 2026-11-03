"""A screenshot of the computer, only when you ask for one ("take a screenshot and send it to my phone").

capture() returns PNG bytes of all screens together. Nothing is written to disk on Windows (GDI through ctypes, PNG
encoded with zlib from the standard library); macOS uses the built-in `screencapture` and Linux tries `grim` (Wayland)
or ImageMagick's `import` (X11), through a temp file that is deleted right away. That image goes to your phone only.

look() is the other use, for "where is the export button?": a smaller picture that Claude does see (it goes into the
conversation, so only when you ask), plus where it sits on the screen, so the mini Cody can point at a spot Claude
names in the picture's pixels. Windows only: elsewhere look() returns the full picture without the geometry.
"""
from __future__ import annotations

import ctypes
import math
import operator
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from array import array

TIMEOUT_S = 10
# the largest picture Claude reads without scaling it down itself: then its coordinates match ours
LOOK_LONG_SIDE = 1568
LOOK_PIXELS = 1_150_000
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


def fit(width: int, height: int) -> tuple[int, int]:
    """The size of the look picture: the screen scaled down (never up) to at most LOOK_LONG_SIDE on the long side and
    LOOK_PIXELS in all."""
    scale = min(1.0, LOOK_LONG_SIDE / max(width, height), math.sqrt(LOOK_PIXELS / (width * height)))
    return max(1, int(width * scale)), max(1, int(height * scale))


def shrink(bgra: bytes, width: int, height: int, new_width: int, new_height: int) -> bytes:
    """32-bit pixels scaled to the new size by taking the nearest pixel (fast in pure Python: one pick per row)."""
    if (new_width, new_height) == (width, height):
        return bytes(bgra)
    pixels = memoryview(bgra).cast("I")
    xs = [min(width - 1, int((i + 0.5) * width / new_width)) for i in range(new_width)]
    pick = operator.itemgetter(*xs) if new_width > 1 else (lambda row: (row[xs[0]],))
    out = array("I")
    for j in range(new_height):
        y = min(height - 1, int((j + 0.5) * height / new_height))
        out.extend(pick(pixels[y * width:(y + 1) * width]))
    return out.tobytes()


def _grab_windows() -> tuple[bytes, tuple[int, int, int, int]]:
    """(BGRA pixels, (left, top, width, height)) of all screens together, in real pixels."""
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
        return pixels.raw, (left, top, width, height)
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


def _grab() -> tuple[bytes, tuple[int, int, int, int]]:
    try:
        return _grab_windows()
    except OSError as error:
        raise ScreenError("the screen could not be captured") from error


def capture() -> bytes:
    """PNG bytes of all screens; ScreenError when it cannot be taken."""
    if sys.platform == "win32":
        pixels, (_, _, width, height) = _grab()
        return encode_png(pixels, width, height)
    return _capture_with_tool()


def look(grab=None) -> tuple[bytes, dict | None]:
    """(PNG, view) for Claude to see: on Windows the picture is scaled down to fit() and view is {"left", "top",
    "width", "height"} of the screen area plus {"image_width", "image_height"}; elsewhere view is None."""
    if grab is None and sys.platform != "win32":
        return _capture_with_tool(), None
    pixels, (left, top, width, height) = (grab or _grab)()
    image_width, image_height = fit(width, height)
    small = shrink(pixels, width, height, image_width, image_height)
    view = {"left": left, "top": top, "width": width, "height": height,
            "image_width": image_width, "image_height": image_height}
    return encode_png(small, image_width, image_height), view


def to_screen(view: dict, x: float, y: float) -> tuple[int, int] | None:
    """A point in the look picture -> screen pixels; None when it falls outside the picture."""
    if not (0 <= x <= view["image_width"] and 0 <= y <= view["image_height"]):
        return None
    sx = view["left"] + round(x * view["width"] / view["image_width"])
    sy = view["top"] + round(y * view["height"] / view["image_height"])
    return (min(sx, view["left"] + view["width"] - 1), min(sy, view["top"] + view["height"] - 1))
