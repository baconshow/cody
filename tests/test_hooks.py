import io
import json
import tempfile
import unittest
from pathlib import Path

from cody import hooks
from cody.hooks import HookFeed, classify, install, record, run_hook, with_hooks, without_hooks

COMMAND = '"python" "/x/cody.py" --hook'


class RecordTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "events.jsonl"

    def test_classify(self):
        self.assertEqual(classify({"hook_event_name": "UserPromptSubmit", "prompt": "secret"}), "start")
        self.assertEqual(classify({"hook_event_name": "Stop"}), "done")
        self.assertEqual(classify({"hook_event_name": "Notification", "notification_type": "permission_prompt"}),
                         "needs_you")
        self.assertIsNone(classify({"hook_event_name": "Notification", "notification_type": "idle_prompt"}))
        self.assertIsNone(classify({"hook_event_name": "PreToolUse"}))

    def test_only_kind_time_and_a_bit_of_the_session_are_kept(self):
        payload = {"hook_event_name": "UserPromptSubmit", "prompt": "my password is hunter2",
                   "session_id": "abcdef12-3456-7890", "cwd": "/home/me/secret-project"}
        self.assertTrue(record(payload, self.path, env={}, clock=lambda: 10.0))
        line = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(line, {"t": 10.0, "e": "start", "s": "abcdef12-345"})

    def test_the_voice_session_is_skipped(self):
        self.assertFalse(record({"hook_event_name": "Stop"}, self.path, env={"CODY_VOICE": "1"}))
        self.assertFalse(self.path.exists())

    def test_a_big_file_starts_over(self):
        self.path.write_text("x" * (hooks.MAX_FILE + 1), encoding="utf-8")
        record({"hook_event_name": "Stop", "session_id": "s"}, self.path, env={})
        self.assertEqual(len(self.path.read_text(encoding="utf-8").splitlines()), 1)

    def test_run_hook_never_fails(self):
        for raw in (b"", b"not json", b"[1, 2]", json.dumps({"hook_event_name": "Stop"}).encode()):
            self.assertEqual(run_hook(io.BytesIO(raw), self.path), 0)
        self.assertEqual(len(self.path.read_text(encoding="utf-8").splitlines()), 1)


class FeedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "events.jsonl"
        self.path.write_text(json.dumps({"t": 1, "e": "needs_you", "s": "old"}) + "\n", encoding="utf-8")
        self.feed = HookFeed(self.path, "en")
        self.assertEqual(self.feed.read(0), {"cursor": 0, "events": []}, "the past is not news")

    def add(self, when: float, kind: str, session: str = "a") -> None:
        with self.path.open("a", encoding="utf-8") as out:
            out.write(json.dumps({"t": when, "e": kind, "s": session}) + "\n")

    def test_a_long_turn_is_done_and_a_short_one_is_quiet(self):
        self.add(100, "start")
        self.add(105, "done")
        self.add(200, "start", "b")
        self.add(260, "done", "b")
        events = self.feed.read(0)["events"]
        self.assertEqual([(e["kind"], e["seconds"]) for e in events], [("done", 60)])
        self.assertEqual(events[0]["say"], "Done! Claude finished.")

    def test_needs_you_and_the_cursor(self):
        self.add(100, "needs_you")
        first = self.feed.read(0)
        self.assertEqual(first["cursor"], 1)
        self.add(110, "needs_you")
        self.assertEqual([e["seq"] for e in self.feed.read(first["cursor"])["events"]], [2])

    def test_a_line_still_being_written_waits(self):
        with self.path.open("a", encoding="utf-8") as out:
            out.write('{"t": 100, "e": "needs_')
        self.assertEqual(self.feed.read(0)["events"], [])
        with self.path.open("a", encoding="utf-8") as out:
            out.write('you", "s": "a"}\n')
        self.assertEqual(len(self.feed.read(0)["events"]), 1)

    def test_a_file_started_over_is_read_from_the_top(self):
        self.path.write_text(json.dumps({"t": 5, "e": "needs_you", "s": "z"}) + "\n", encoding="utf-8")
        self.assertEqual(len(self.feed.read(0)["events"]), 1)

    def test_junk_lines_are_skipped(self):
        with self.path.open("a", encoding="utf-8") as out:
            out.write("garbage\n{}\n" + json.dumps({"t": "x", "e": "done"}) + "\n")
        self.add(100, "needs_you")
        self.assertEqual(len(self.feed.read(0)["events"]), 1)


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "settings.json"
        self.mine = {"model": "opus", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify"}]}]}}

    def test_adding_keeps_everything_else_and_is_idempotent(self):
        once = with_hooks(self.mine, COMMAND)
        self.assertEqual(once["model"], "opus")
        self.assertEqual(len(once["hooks"]["Stop"]), 2)
        self.assertEqual(sorted(once["hooks"]), ["Notification", "Stop", "UserPromptSubmit"])
        self.assertEqual(with_hooks(once, COMMAND), once)
        self.assertEqual(without_hooks(once), self.mine)

    def test_install_and_uninstall_a_settings_file(self):
        self.path.write_text(json.dumps(self.mine), encoding="utf-8")
        self.assertIn("added", install(path=self.path, command=COMMAND))
        backups = list(self.path.parent.glob("settings.json.cody-backup-*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(json.loads(backups[0].read_text(encoding="utf-8")), self.mine)
        self.assertEqual(install(path=self.path, command=COMMAND), "Nothing to change.")
        self.assertIn("removed", install(remove=True, path=self.path))
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), self.mine)

    def test_invalid_settings_are_left_alone(self):
        self.path.write_text("{oops", encoding="utf-8")
        self.assertIn("nothing changed", install(path=self.path, command=COMMAND))
        self.assertEqual(self.path.read_text(encoding="utf-8"), "{oops")

    def test_the_command_points_at_this_repo(self):
        command = hooks.hook_command()
        self.assertTrue(command.endswith('cody.py" --hook || exit 0'), "a missing script must never exit with 2")
        self.assertNotIn("\\", command)
        self.assertIsNotNone(hooks.OURS.search(command))
        self.assertIsNone(hooks.OURS.search('"python" "/x/not-cody.pyc" --hooks'))


if __name__ == "__main__":
    unittest.main()
