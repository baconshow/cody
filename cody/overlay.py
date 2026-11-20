"""The mini Cody on the computer screen: a small pixel-art Cody that flies to a spot and points at it with a speech
bubble ("right here! click Export"), then leaves. Started by the voice channel (cody/pointer.py), one JSON line per
point on stdin:

    {"x": 812, "y": 64, "text": "Right here!", "seconds": 8}     screen pixels, all screens together

A borderless, always-on-top Tk window you can click through (WS_EX_TRANSPARENT) and that never takes the focus
(WS_EX_NOACTIVATE), painted with one key color that Windows leaves see-through. It exits when stdin ends, so it
never outlives the voice session. Windows only; standard library only (tkinter and ctypes).
"""
from __future__ import annotations

import ctypes
import json
import math
import queue
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import font as tkfont

if __package__ in (None, ""):          # started as a script by the voice channel: make the cody package importable
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

KEY = "#ff00fe"                       # the see-through color: nothing else is painted with it
FRAME_MS = 16
FLIGHT_S = 0.7
ARC_PX = 70                           # how high the flight curves, at 100% scale
BOB_PX = 3
BUBBLE_WIDTH = 240                    # where the text wraps, at 100% scale
GWL_EXSTYLE = -20
WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE = 0x80000, 0x20, 0x80, 0x08000000
SW_SHOWNOACTIVATE = 4

from cody.sprite import COLOR, SPRITE, SPRITE_BOX, ease, layout, local  # noqa: E402


class Overlay:
    def __init__(self, root: tk.Tk, commands: queue.Queue):
        self.root = root
        self.commands = commands
        self.canvas = tk.Canvas(root, bg=KEY, highlightthickness=0, bd=0)
        self.canvas.pack(fill="both", expand=True)
        self.scale = self._scale()
        self.u = max(2, round(3 * self.scale))
        self.font = tkfont.Font(family="Segoe UI", size=11, weight="bold")
        self.place = None              # the current layout; None while hidden
        self.flight = None             # (from x, from y, to x, to y, start time)
        self.until = 0.0
        self.yours = 0                 # the window you were typing in: it keeps the keyboard

    def keep_focus(self) -> None:
        """Tk makes its own window the foreground one (an invisible window would take your typing): give it back."""
        user32 = ctypes.windll.user32
        front = user32.GetForegroundWindow()
        if front and front != self.hwnd():
            self.yours = front
        elif front and self.yours:
            user32.SetForegroundWindow(self.yours)

    def _scale(self) -> float:
        try:
            return ctypes.windll.user32.GetDpiForWindow(self.hwnd()) / 96
        except (AttributeError, OSError):
            return 1.0

    def hwnd(self) -> int:
        return ctypes.windll.user32.GetParent(self.root.winfo_id())

    def tick(self) -> None:
        try:
            while True:
                command = self.commands.get_nowait()
                if command is None:
                    self.root.destroy()
                    return
                try:
                    self.show(command)
                except Exception:  # noqa: BLE001 - one bad command must not freeze the overlay on screen
                    self.hide()
        except queue.Empty:
            pass
        try:
            self.move()
            self.keep_focus()
        except Exception:  # noqa: BLE001
            self.hide()
        self.root.after(FRAME_MS, self.tick)

    def hide(self) -> None:
        self.canvas.delete("all")                           # all see-through: gone, and nothing to click through
        self.place = None

    def show(self, command: dict) -> None:
        try:
            spot = (int(command["x"]), int(command["y"]))
            seconds = max(1.0, min(30.0, float(command.get("seconds", 8))))
        except (KeyError, TypeError, ValueError, OverflowError):
            return
        text = str(command.get("text") or "")[:80]
        old = self.place
        self.draw(text, spot)
        start = (old["x"], old["y"]) if old else (self.place["x"] + 160 * self.scale, self.place["y"] + 160 * self.scale)
        self.flight = (*start, self.place["x"], self.place["y"], time.monotonic())
        self.until = time.monotonic() + FLIGHT_S + seconds

    def draw(self, text: str, spot: tuple[int, int]) -> None:
        u = self.u
        c = self.canvas
        c.delete("all")
        sprite = ((SPRITE_BOX[2] - SPRITE_BOX[0]) * u, (SPRITE_BOX[3] - SPRITE_BOX[1]) * u)
        pad = 2 * u
        if text:
            lines_w = min(self.font.measure(text), int(BUBBLE_WIDTH * self.scale))
            probe = c.create_text(0, 0, text=text, font=self.font, width=lines_w, anchor="nw")
            x0, y0, x1, y1 = c.bbox(probe)
            c.delete(probe)
            bubble = (x1 - x0 + 2 * pad, y1 - y0 + 2 * pad)
        else:
            bubble = (0, 0)
        area = self._screen()
        self.place = layout(spot, area, sprite, bubble, u)
        sx, sy = self.place["sprite"]
        for rect in SPRITE:
            x0, y0, x1, y1, color = local(rect, self.place["flip"])
            c.create_rectangle(sx + x0 * u, sy + y0 * u, sx + x1 * u - 1, sy + y1 * u - 1,
                               fill=COLOR[color], outline=COLOR[color])
        if text:
            bx, by = self.place["bubble"]
            bw, bh = bubble
            notch = u                                       # pixel-art corners: the corner voxel is cut
            c.create_polygon(bx + notch, by, bx + bw - notch, by, bx + bw - notch, by + notch, bx + bw, by + notch,
                             bx + bw, by + bh - notch, bx + bw - notch, by + bh - notch, bx + bw - notch, by + bh,
                             bx + notch, by + bh, bx + notch, by + bh - notch, bx, by + bh - notch, bx, by + notch,
                             bx + notch, by + notch, fill=COLOR["bubble"], outline=COLOR["ink"], width=max(1, u // 2))
            c.create_text(bx + pad, by + pad, text=text, font=self.font, fill=COLOR["ink"], anchor="nw",
                          width=bw - 2 * pad)

    def _screen(self) -> tuple[int, int, int, int]:
        metrics = ctypes.windll.user32.GetSystemMetrics
        return metrics(76), metrics(77), metrics(78), metrics(79)

    def move(self) -> None:
        if self.place is None:
            return
        now = time.monotonic()
        if now > self.until:
            self.hide()
            return
        x0, y0, x1, y1, t0 = self.flight
        t = min(1.0, (now - t0) / FLIGHT_S)
        k = ease(t)
        x = x0 + (x1 - x0) * k
        y = y0 + (y1 - y0) * k - math.sin(math.pi * t) * ARC_PX * self.scale
        if t >= 1:
            y += math.sin((now - t0) * 3) * BOB_PX * self.scale
        self.root.geometry(f"{self.place['w']}x{self.place['h']}+{round(x)}+{round(y)}")


def read_commands(commands: queue.Queue) -> None:
    for line in sys.stdin.buffer:
        try:
            command = json.loads(line)
        except ValueError:
            continue
        if isinstance(command, dict):
            commands.put(command)
    commands.put(None)                                      # stdin ended: the voice session closed


def main() -> None:
    if sys.platform != "win32":
        sys.exit("the overlay runs on Windows only")
    user32 = ctypes.windll.user32
    try:
        user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))   # real pixels, the same as the screenshot
    except (AttributeError, OSError):
        user32.SetProcessDPIAware()
    yours = user32.GetForegroundWindow()                    # before Tk starts and takes it
    root = tk.Tk()
    root.withdraw()
    root.overrideredirect(True)
    root.configure(bg=KEY)
    root.attributes("-topmost", True)
    root.attributes("-transparentcolor", KEY)
    root.geometry("1x1+-32000+-32000")
    root.update_idletasks()
    commands: queue.Queue = queue.Queue()
    overlay = Overlay(root, commands)
    hwnd = overlay.hwnd()
    style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE)
    user32.ShowWindow(hwnd, SW_SHOWNOACTIVATE)              # shown without taking the focus from what you are doing
    overlay.yours = yours
    overlay.keep_focus()
    threading.Thread(target=read_commands, args=(commands,), daemon=True).start()
    root.after(FRAME_MS, overlay.tick)
    root.mainloop()


if __name__ == "__main__":
    main()
