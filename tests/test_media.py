"""The music reader (cody/media.py): the headphones come from one word a child process prints, nothing more."""
import base64
import threading
import time
import unittest
from unittest import mock

from cody import media


class FakeChild:
    """What the watcher sees of the PowerShell child: lines to read, and a way to end it."""

    def __init__(self, lines, hold=None):
        self._lines = list(lines)
        self._hold = hold                  # an Event: the stream waits on it after the lines (a child that stays up)
        self.terminated = False

    @property
    def stdout(self):
        yield from self._lines
        if self._hold is not None:
            self._hold.wait(5)

    def terminate(self):
        self.terminated = True
        if self._hold is not None:
            self._hold.set()

    def wait(self, timeout=None):
        return 0


class MediaWatcherTest(unittest.TestCase):
    def test_the_last_word_counts_while_it_is_fresh(self):
        now = [100.0]
        w = media.MediaWatcher(True, spawn=lambda: None, clock=lambda: now[0])
        self.assertFalse(w.playing())
        w.hear("playing\n")
        self.assertTrue(w.playing())
        now[0] += media.STALE_S - 1
        self.assertTrue(w.playing())
        now[0] += 2                        # the child went quiet (it died, the machine slept): nothing is playing
        self.assertFalse(w.playing())
        w.hear("silent")
        self.assertFalse(w.playing())
        w.hear("Spotify: Playing")        # not a word of the protocol: ignored, the child never says more than one word
        self.assertFalse(w.playing())

    def test_reads_the_child_and_ends_it_on_stop(self):
        hold = threading.Event()
        child = FakeChild(["silent\n", "playing\n"], hold)
        w = media.MediaWatcher(True, spawn=lambda: child)
        w.start()
        for _ in range(100):
            if w.playing():
                break
            time.sleep(0.01)
        self.assertTrue(w.playing())
        w.stop()
        w._thread.join(2)
        self.assertTrue(child.terminated)
        self.assertFalse(w.playing())      # after the stop, nothing is playing

    def test_starts_the_child_again_when_it_ends_and_gives_up_after_the_last_retry(self):
        spawns = []

        def spawn():
            spawns.append(1)
            return FakeChild(["playing\n"])
        with mock.patch.object(media, "RETRY_S", (0.01, 0.01, 0.01)):
            w = media.MediaWatcher(True, spawn=spawn)
            w.start()
            w._thread.join(3)
        self.assertEqual(len(spawns), 4)   # the first start and the three retries
        self.assertFalse(w.playing())

    def test_off_when_disabled_or_not_on_windows(self):
        for enabled, platform in ((False, "win32"), (True, "darwin"), (True, "linux")):
            w = media.MediaWatcher(enabled, spawn=lambda: self.fail("must not spawn"), platform=platform)
            w.start()
            self.assertIsNone(w._thread)
            self.assertFalse(w.playing())

    def test_the_command_is_windows_powershell_with_the_script_encoded(self):
        cmd = media.command()
        self.assertEqual(cmd[0], "powershell.exe")
        self.assertIn("-NoProfile", cmd)
        script = base64.b64decode(cmd[-1]).decode("utf-16-le")
        self.assertEqual(script, media.SCRIPT)
        self.assertIn("GlobalSystemMediaTransportControlsSessionManager", script)
        self.assertIn("'playing'", script)
        for private in ("Title", "Artist", "SourceAppUserModelId", "GetMediaPropertiesAsync"):
            self.assertNotIn(private, script)      # it never reads what is playing, only whether


if __name__ == "__main__":
    unittest.main()
