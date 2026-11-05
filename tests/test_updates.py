"""The opt-in update check: off asks nothing, on asks at most once a day and compares versions."""
import tempfile
import unittest
from pathlib import Path

from cody import updates


class UpdatesTest(unittest.TestCase):
    def test_off_asks_nothing(self):
        def fetch():
            raise AssertionError("must not ask GitHub")
        self.assertFalse(updates.status(False, fetch=fetch)["update"])

    def test_on_asks_once_a_day(self):
        calls = []

        def fetch():
            calls.append(1)
            return "v9.0.0"
        with tempfile.TemporaryDirectory() as tmp:
            first = updates.status(True, Path(tmp), clock=lambda: 1000, fetch=fetch)
            updates.status(True, Path(tmp), clock=lambda: 2000, fetch=fetch)
            updates.status(True, Path(tmp), clock=lambda: 1000 + updates.CHECK_EVERY_S + 1, fetch=fetch)
        self.assertEqual((first["latest"], first["update"]), ("v9.0.0", True))
        self.assertEqual(len(calls), 2)

    def test_version_compare(self):
        self.assertTrue(updates.newer("v1.10.0", "1.9.9"))
        self.assertFalse(updates.newer("1.2.0", "1.2.0"))
        self.assertFalse(updates.newer("nightly", "1.2.0"))


if __name__ == "__main__":
    unittest.main()
