import json
import tempfile
import time
import unittest
from pathlib import Path

from cody.activity import ActivityMonitor, is_code_edit, tool_events


def assistant(tool: str, tool_input: dict, ts: str = "2026-10-31T12:00:00.000Z") -> str:
    return json.dumps({"type": "assistant", "timestamp": ts, "sessionId": "s1",
                       "message": {"content": [{"type": "tool_use", "name": tool, "input": tool_input}]}})


class ToolEventsTest(unittest.TestCase):
    def test_code_edit_only_for_source_files(self):
        self.assertTrue(is_code_edit("Edit", {"file_path": "C:\\repo\\app.py"}))
        self.assertTrue(is_code_edit("Write", {"file_path": "/repo/web/main.JS"}))
        self.assertFalse(is_code_edit("Edit", {"file_path": "/repo/README.md"}))
        self.assertFalse(is_code_edit("Read", {"file_path": "/repo/app.py"}))
        self.assertFalse(is_code_edit("Edit", {"file_path": "/repo/.gitignore"}))

    def test_only_the_tool_name_and_the_code_flag_leave(self):
        line = assistant("Bash", {"command": "echo secret", "description": "print"})
        self.assertEqual(tool_events(line), [{"tool": "Bash", "code": False}])

    def test_other_lines_give_nothing(self):
        self.assertEqual(tool_events(json.dumps({"type": "user", "message": {"content": "hi"}})), [])


class MonitorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.projects = Path(self.tmp.name)
        self.session = self.projects / "proj" / "s1.jsonl"
        self.session.parent.mkdir(parents=True)
        self.session.write_text(assistant("Read", {"file_path": "old.py"}) + "\n", encoding="utf-8")
        self.monitor = ActivityMonitor(self.projects)

    def tearDown(self):
        self.tmp.cleanup()

    def append(self, *lines: str) -> None:
        with self.session.open("a", encoding="utf-8") as out:
            out.write("".join(line + "\n" for line in lines))

    def test_first_sight_starts_at_the_end(self):
        self.monitor.scan()
        state = self.monitor.state(0)
        self.assertEqual(state["cursor"], 0)
        self.assertEqual(state["events"], [])
        self.assertEqual([s["id"] for s in state["sessions"]], ["s1"])

    def test_new_lines_become_events_after_the_cursor(self):
        self.monitor.scan()
        self.append(assistant("Edit", {"file_path": "main.js"}), assistant("Grep", {"pattern": "x"}))
        self.monitor.scan()
        state = self.monitor.state(0)
        self.assertEqual(state["cursor"], 2)
        self.append(assistant("WebSearch", {"query": "q"}))
        self.monitor.scan()
        self.assertEqual(self.monitor.state(2)["events"], [{"seq": 3, "tool": "WebSearch", "code": False}])
        self.assertEqual(state["events"][0], {"seq": 1, "tool": "Edit", "code": True})

    def test_partial_line_waits_for_its_end(self):
        self.monitor.scan()
        line = assistant("Bash", {"command": "ls"})
        with self.session.open("a", encoding="utf-8") as out:
            out.write(line[:30])
        self.monitor.scan()
        self.assertEqual(self.monitor.state(0)["cursor"], 0)
        with self.session.open("a", encoding="utf-8") as out:
            out.write(line[30:] + "\n")
        self.monitor.scan()
        self.assertEqual(self.monitor.state(0)["cursor"], 1)

    def test_bad_line_does_not_stop_the_scan(self):
        self.monitor.scan()
        self.append('{"type": "assistant", "timestamp": "2026-10-31T12:00:00Z", "tool_use" broken',
                    assistant("Glob", {"pattern": "*"}))
        self.monitor.scan()
        self.assertEqual(self.monitor.state(0)["cursor"], 1)

    def test_subagent_is_listed_and_goes_inactive(self):
        agent = self.projects / "proj" / "s1" / "subagents" / "agent-abc.jsonl"
        agent.parent.mkdir(parents=True)
        agent.write_text("", encoding="utf-8")
        clock = [time.time()]
        monitor = ActivityMonitor(self.projects, clock=lambda: clock[0])
        monitor.scan()
        agents = monitor.state(0)["sessions"][0]["agents"]
        self.assertEqual(agents, [{"id": "abc", "active": True}])
        clock[0] += 120
        self.assertFalse(monitor.state(0)["sessions"][0]["agents"][0]["active"])


if __name__ == "__main__":
    unittest.main()


class FailureEventTest(unittest.TestCase):
    def test_a_failed_tool_result_is_one_content_free_event(self):
        from cody.activity import FAILED, tool_events
        line = json.dumps({"type": "user", "timestamp": "2026-11-05T10:00:00Z", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "x", "is_error": True, "content": "secret output"}]}})
        self.assertEqual(tool_events(line), [{"tool": FAILED, "code": False}])
        ok = line.replace('"is_error": true', '"is_error": false')
        self.assertEqual(tool_events(ok), [])
        self.assertNotIn("secret", json.dumps(tool_events(line)))
        said_no = line.replace("secret output", "The user doesn't want to proceed with this tool use.")
        self.assertEqual(tool_events(said_no), [])
