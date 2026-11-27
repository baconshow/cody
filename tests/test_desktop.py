"""Quick things on the computer (cody/desktop.py): the clipboard bitmap, saved screenshots, opening apps."""
import struct
import tempfile
import unittest
from pathlib import Path

from cody import desktop
from cody.abilities import Abilities
from cody.memory import Memory
from cody.screen import encode_png
from cody.timers import TimerStore


class DibTest(unittest.TestCase):
    def test_a_png_becomes_a_bottom_up_bitmap(self):
        # 2 x 2, top row red and green, bottom row blue and white (BGRA in, as the screen capture gives it)
        bgra = bytes([0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0])
        dib = desktop.png_to_dib(encode_png(bgra, 2, 2))
        size, width, height, planes, bits, compression = struct.unpack("<IiiHHI", dib[:20])
        self.assertEqual((size, width, height, planes, bits, compression), (40, 2, 2, 1, 32, 0))
        pixels = dib[40:]
        self.assertEqual(pixels[:8], bytes([255, 0, 0, 255, 255, 255, 255, 255]), "the bottom row comes first")
        self.assertEqual(pixels[8:], bytes([0, 0, 255, 255, 0, 255, 0, 255]))

    def test_other_pngs_are_refused(self):
        with self.assertRaises(ValueError):
            desktop.png_to_dib(b"GIF89a")
        with self.assertRaises(ValueError):
            desktop.png_to_dib(b"\x89PNG\r\n\x1a\n")       # no header


class SaveTest(unittest.TestCase):
    def test_only_the_latest_files_stay(self):
        with tempfile.TemporaryDirectory() as folder:
            clock = iter(range(1_700_000_000, 1_700_000_100, 7))
            paths = [desktop.save_screenshot(b"%d" % i, Path(folder), keep=2, now=lambda: next(clock))
                     for i in range(4)]
            self.assertEqual(len(list(Path(folder).glob("screenshot-*.png"))), 2)
            self.assertEqual(paths[-1].read_bytes(), b"3")
            self.assertFalse(paths[0].exists())

    def test_same_second_gets_a_new_name(self):
        with tempfile.TemporaryDirectory() as folder:
            a = desktop.save_screenshot(b"a", Path(folder), now=lambda: 1_700_000_000)
            b = desktop.save_screenshot(b"b", Path(folder), now=lambda: 1_700_000_000)
            self.assertNotEqual(a, b)
            self.assertEqual((a.read_bytes(), b.read_bytes()), (b"a", b"b"))


class OpenAppTest(unittest.TestCase):
    def test_windows_opens_the_fixed_target(self):
        started = []
        self.assertEqual(desktop.open_app("Task Manager", "win32", start=started.append), "task_manager")
        self.assertEqual(started, ["taskmgr.exe"])

    def test_macos_uses_open(self):
        calls = []
        desktop.open_app("calculator", "darwin", run=lambda cmd, **kw: calls.append(cmd))
        self.assertEqual(calls, [["open", "-a", "Calculator"]])

    def test_unknown_and_unsupported(self):
        with self.assertRaisesRegex(ValueError, "unknown"):
            desktop.open_app("cmd.exe /c del", "win32", start=lambda t: self.fail("never started"))
        with self.assertRaisesRegex(ValueError, "unsupported"):
            desktop.open_app("paint", "darwin", run=lambda *a, **k: self.fail("never run"))
        with self.assertRaisesRegex(ValueError, "unsupported"):
            desktop.open_app("calculator", "linux")

    def test_the_tool_answers_claude(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            opened = []
            abilities = Abilities("en", store=TimerStore(base / "t.json"), memory=Memory(base / "m.json"),
                                  opener=lambda name: opened.append(name) or "calculator")
            schema = next(t for t in abilities.tools() if t["name"] == "open_app")
            self.assertEqual(schema["inputSchema"]["properties"]["name"]["enum"], list(desktop.APPS))
            self.assertIn("Opened calculator", abilities.call("open_app", {"name": "calculator"})["content"][0]["text"])
            self.assertEqual(opened, ["calculator"])

            def unknown(name):
                raise ValueError("unknown")
            abilities = Abilities("en", store=TimerStore(base / "t.json"), memory=Memory(base / "m.json"),
                                  opener=unknown)
            result = abilities.call("open_app", {"name": "chrome"})
            self.assertTrue(result["isError"])
            self.assertIn("Start-Process", result["content"][0]["text"])


if __name__ == "__main__":
    unittest.main()
