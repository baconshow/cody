"""Typing along (cody/typist.py): input with the pointer still, in front of a Claude window, and nothing else."""
import threading
import time
import unittest

from cody import typist


class TypistTest(unittest.TestCase):
    def test_keys_are_input_without_the_pointer_moving_in_a_claude_window(self):
        t = typist.Typist()
        t.observe(1000, (10, 10), True, 0.0)
        self.assertFalse(t.typing(0.0), "the first look only sets the marks")
        t.observe(1000, (10, 10), True, 0.4)
        self.assertFalse(t.typing(0.4), "nothing happened")
        t.observe(1350, (10, 10), True, 0.8)
        self.assertTrue(t.typing(0.8), "input arrived, the pointer stayed: keys")
        self.assertTrue(t.typing(0.8 + typist.HOLD_S - 0.1))
        self.assertFalse(t.typing(0.8 + typist.HOLD_S + 0.1), "the pause got long")

    def test_a_mouse_move_is_not_typing(self):
        t = typist.Typist()
        t.observe(1000, (10, 10), True, 0.0)
        t.observe(1350, (12, 10), True, 0.4)
        self.assertFalse(t.typing(0.4))

    def test_keys_in_another_window_do_not_count_and_a_failed_probe_is_nothing(self):
        t = typist.Typist()
        t.observe(1000, (10, 10), False, 0.0)
        t.observe(1350, (10, 10), False, 0.4)
        self.assertFalse(t.typing(0.4), "typing somewhere else is none of Cody's business")
        t.observe(1700, (10, 10), True, 0.8)
        self.assertTrue(t.typing(0.8), "back in the Claude window, typing")
        t.observe(None, None, True, 1.2)
        t.observe(None, None, True, 1.6)
        self.assertTrue(t.typing(1.6), "a failed read changes nothing while the hold lasts")


class WatcherTest(unittest.TestCase):
    def test_the_thread_probes_and_the_answer_follows(self):
        probes = [(1000, (0, 0), True), (1000, (0, 0), True), (1200, (0, 0), True)] + [(1200, (0, 0), True)] * 50
        gave = threading.Event()

        def probe():
            if len(probes) <= 50:
                gave.set()
            return probes.pop(0)
        w = typist.TypistWatcher(True, probe=probe, platform="win32")
        w.start()
        self.assertTrue(gave.wait(5))
        time.sleep(typist.POLL_S)
        self.assertTrue(w.typing())
        w.stop()
        self.assertFalse(w.typing(), "stopped: not typing")

    def test_off_unless_asked_and_only_on_windows(self):
        for enabled, platform in ((False, "win32"), (True, "darwin")):
            w = typist.TypistWatcher(enabled, probe=lambda: self.fail("must not probe"), platform=platform)
            w.start()
            self.assertIsNone(w._thread)
            self.assertFalse(w.typing())

    def test_the_real_probe_reads_three_things_and_keeps_no_title(self):
        import sys
        if sys.platform != "win32":
            self.skipTest("Windows only")
        tick, pointer, focused = typist.probe_windows()
        self.assertTrue(tick is None or isinstance(tick, int))
        self.assertTrue(pointer is None or len(pointer) == 2)
        self.assertIsInstance(focused, bool)


if __name__ == "__main__":
    unittest.main()
