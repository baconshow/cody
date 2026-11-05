import json
import tempfile
import unittest
from pathlib import Path

from cody import claude_process, cursor
from cody.config import DEFAULT_PORT, load_config


class ConfigTest(unittest.TestCase):
    def load(self, data) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return load_config(path, system=lambda: "en")

    def test_defaults_without_a_file(self):
        config = load_config(Path("does-not-exist.json"), system=lambda: "en")
        self.assertEqual(config, {"port": DEFAULT_PORT, "extra_hosts": [], "allowed_logins": [], "language": "en",
                                  "voice": None, "voice_folder": None,
                                  "voice_provider": "device", "update_check": False})

    def test_invalid_values_fall_back(self):
        config = self.load({"port": 80, "extra_hosts": ["ok.ts.net", "bad host/"], "language": "fr",
                            "voice": {"voice_id": "../etc"}})
        self.assertEqual(config["port"], DEFAULT_PORT)
        self.assertEqual(config["extra_hosts"], ["ok.ts.net"])
        self.assertEqual(config["language"], "en")
        self.assertIsNone(config["voice"])

    def test_allowed_logins(self):
        config = self.load({"allowed_logins": ["Me@Example.com", "bad login", 3]})
        self.assertEqual(config["allowed_logins"], ["me@example.com"])

    def test_voice_gets_the_default_model(self):
        config = self.load({"voice": {"voice_id": "AbCdEfGhIjKlMnOpQrSt"}, "language": "pt-BR"})
        self.assertEqual(config["voice"], {"voice_id": "AbCdEfGhIjKlMnOpQrSt", "model": "eleven_flash_v2_5"})
        self.assertEqual(config["language"], "pt-BR")


class RateLimitTest(unittest.TestCase):
    def test_sliding_minute(self):
        from cody.server import RateLimit
        clock = [0.0]
        limit = RateLimit(2, clock=lambda: clock[0])
        self.assertEqual([limit.allow(), limit.allow(), limit.allow()], [True, True, False])
        clock[0] = 61
        self.assertTrue(limit.allow())


class PngTest(unittest.TestCase):
    def test_bgra_pixels_become_a_valid_rgb_png(self):
        import struct
        import zlib
        from cody.screen import encode_png
        bgra = bytes([0, 0, 255, 255, 255, 0, 0, 255]) * 2      # red, blue / red, blue
        png = encode_png(bgra, 2, 2)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(struct.unpack(">II", png[16:24]), (2, 2))
        start = png.index(b"IDAT") + 4
        length = struct.unpack(">I", png[start - 8:start - 4])[0]
        raw = zlib.decompress(png[start:start + length])
        self.assertEqual(raw, (b"\x00" + bytes([255, 0, 0, 0, 0, 255])) * 2)


class CursorTest(unittest.TestCase):
    def test_normalize_across_screens(self):
        area = (-1920, 0, 3840, 1080)
        self.assertEqual(cursor.normalize(-1920, 0, area), {"x": -1.0, "y": -1.0})
        self.assertEqual(cursor.normalize(0, 540, area), {"x": 0.0, "y": 0.0})
        self.assertEqual(cursor.normalize(5000, 5000, area), {"x": 1.0, "y": 1.0})
        self.assertIsNone(cursor.normalize(0, 0, (0, 0, 0, 0)))


class ClaudeProcessTest(unittest.TestCase):
    def test_tasklist_output(self):
        self.assertTrue(claude_process.parse_tasklist(0, '"claude.exe","1234","Console","1","200 K"\n'))
        self.assertFalse(claude_process.parse_tasklist(0, "INFO: No tasks are running.\n"))
        self.assertFalse(claude_process.parse_tasklist(1, '"claude.exe","1"'))

    def test_found_process_means_open(self):
        watcher = claude_process.ClaudeWatcher(lambda: 0, run=lambda: True, now=lambda: 10_000)
        self.assertTrue(watcher.is_open())

    def test_without_a_process_recent_activity_decides(self):
        recent = claude_process.ClaudeWatcher(lambda: 9_900, run=lambda: None, now=lambda: 10_000)
        old = claude_process.ClaudeWatcher(lambda: 1_000, run=lambda: None, now=lambda: 10_000)
        self.assertTrue(recent.is_open())
        self.assertFalse(old.is_open())

    def test_probe_is_cached(self):
        calls = []
        clock = [0.0]
        watcher = claude_process.ClaudeWatcher(lambda: 0, run=lambda: calls.append(1) or True,
                                               monotonic=lambda: clock[0])
        watcher.is_open()
        watcher.is_open()
        clock[0] += claude_process.CACHE_S
        watcher.is_open()
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
