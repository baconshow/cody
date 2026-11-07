"""The Windows notification reader (cody/notices.py): important ones only, once, and nothing of the body."""
import base64
import json
import unittest

from cody import notices
from cody.hooks import HookFeed


class ImportantTest(unittest.TestCase):
    def test_messaging_mail_calendar_and_phone_apps_count(self):
        for app in ("WhatsApp", "Microsoft Teams", "Outlook", "Mail", "Calendar", "Phone Link", "Vincular ao Celular", "Slack"):
            self.assertTrue(notices.important(app, "anything"), app)

    def test_other_apps_count_only_with_an_urgent_word(self):
        self.assertFalse(notices.important("Google Chrome", "Download complete"))
        self.assertFalse(notices.important("Snipping Tool", "Saved to clipboard"))
        self.assertTrue(notices.important("Google Chrome", "Reminder: dentist at 3"))
        self.assertTrue(notices.important("Some App", "URGENTE: servidor fora"))

    def test_your_own_list_replaces_the_default(self):
        self.assertTrue(notices.important("Steam", "x", apps=("steam",)))
        self.assertFalse(notices.important("WhatsApp", "x", apps=("steam",)))


class WatcherTest(unittest.TestCase):
    def watcher(self, apps=None):
        self.now = [100.0]
        self.feed = HookFeed(language="en")
        return notices.NoticeWatcher(True, self.feed, apps, spawn=lambda: None, clock=lambda: self.now[0], platform="win32")

    def events(self):
        return self.feed.read(0)["events"]

    def test_an_important_toast_becomes_a_notice_with_the_app_and_the_title(self):
        w = self.watcher()
        w.hear(json.dumps({"id": 1, "app": "WhatsApp", "title": "Ana"}) + "\n")
        [event] = self.events()
        self.assertEqual((event["kind"], event["say"], event["app"]), ("notice", "WhatsApp: Ana", "WhatsApp"))
        self.assertEqual(notices.phrase(event["app"], "pt-BR"), "Novidade no WhatsApp.")
        self.assertEqual(self.feed.event(event["seq"]), event)

    def test_unimportant_junk_and_denied_access_make_no_event(self):
        w = self.watcher()
        w.hear(json.dumps({"id": 2, "app": "Google Chrome", "title": "Download complete"}))
        w.hear("not json")
        w.hear(json.dumps({"error": "Denied"}))
        w.hear(json.dumps([1, 2]))
        w.hear(json.dumps({"id": 3, "app": "", "title": "Reminder"}))
        self.assertEqual(self.events(), [])

    def test_the_same_toast_again_and_a_burst_are_said_once(self):
        w = self.watcher()
        line = json.dumps({"id": 4, "app": "Outlook", "title": "Weekly report"})
        w.hear(line)
        self.now[0] += 5
        w.hear(line)                                                     # the same, soon after: once
        w.hear(json.dumps({"id": 5, "app": "Teams", "title": "Standup"}))   # another, inside the breath: dropped
        self.assertEqual(len(self.events()), 1)
        self.now[0] += notices.BREATH_S
        w.hear(json.dumps({"id": 6, "app": "Teams", "title": "Standup"}))
        self.assertEqual(len(self.events()), 2)
        self.now[0] += notices.SAME_AGAIN_S
        w.hear(line)                                                     # the same, a minute later: again
        self.assertEqual(len(self.events()), 3)

    def test_the_title_is_trimmed_and_the_list_from_config_is_used(self):
        w = self.watcher(apps=["Steam"])
        w.hear(json.dumps({"id": 7, "app": "Steam", "title": "  a   very " + "long " * 40}))
        [event] = self.events()
        self.assertTrue(event["say"].startswith("Steam: a very long"))
        self.assertLessEqual(len(event["say"]), len("Steam: ") + notices.MAX_TITLE)

    def test_off_unless_asked_and_only_on_windows(self):
        for enabled, platform in ((False, "win32"), (True, "linux")):
            w = notices.NoticeWatcher(enabled, HookFeed(), spawn=lambda: self.fail("must not spawn"), platform=platform)
            w.start()
            self.assertIsNone(w._thread)

    def test_the_script_reads_the_first_line_only_and_asks_for_access(self):
        cmd = notices.command()
        self.assertEqual(cmd[0], "powershell.exe")
        script = base64.b64decode(cmd[-1]).decode("utf-16-le")
        self.assertIn("RequestAccessAsync", script)
        self.assertIn("Select-Object -First 1", script)
        self.assertNotIn("$texts[0]", script)      # indexing a WinRT list in PowerShell returned every line


if __name__ == "__main__":
    unittest.main()
