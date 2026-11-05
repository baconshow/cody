"""The Claude Code plugin in this repository: manifest, marketplace, hooks and commands."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cody import __version__, hooks, launcher, setup

ROOT = Path(__file__).resolve().parent.parent


def load(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


class PluginFilesTest(unittest.TestCase):
    def test_manifest_and_marketplace(self):
        plugin = load(".claude-plugin/plugin.json")
        market = load(".claude-plugin/marketplace.json")
        self.assertEqual(plugin["name"], "cody")
        self.assertEqual(plugin["version"], __version__)
        self.assertTrue((ROOT / plugin["icon"]).is_file())
        self.assertEqual([p["name"] for p in market["plugins"]], ["cody"])
        self.assertEqual(market["plugins"][0]["source"], "./")
        self.assertNotIn("Claude", plugin["name"] + market["name"])          # fan art: no Claude in product names

    def test_hooks_never_block_a_session(self):
        events = load("hooks/hooks.json")["hooks"]
        self.assertEqual(set(events), set(hooks.EVENTS))
        for groups in events.values():
            command = groups[0]["hooks"][0]["command"]
            self.assertTrue(command.endswith("|| exit 0"))
            self.assertIn("${CLAUDE_PLUGIN_ROOT}/cody.py", command)

    def test_commands_have_a_description(self):
        for name in ("setup", "status", "voice"):
            text = (ROOT / "commands" / f"{name}.md").read_text(encoding="utf-8")
            self.assertTrue(text.startswith("---\ndescription: "), name)
            self.assertNotIn("dangerously-skip-permissions", text)


class NoDoubleHooksTest(unittest.TestCase):
    def settings(self, data) -> Path:
        folder = Path(tempfile.mkdtemp())
        path = folder / "settings.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_install_is_skipped_when_the_plugin_is_on(self):
        path = self.settings({"enabledPlugins": {"cody@cody": True}})
        self.assertIn("plugin", hooks.install(path=path))
        self.assertNotIn("hooks", json.loads(path.read_text(encoding="utf-8")))
        self.assertTrue(setup.hooks_installed(path))

    def test_a_disabled_plugin_does_not_count(self):
        path = self.settings({"enabledPlugins": {"cody@cody": False, "other@x": True}})
        self.assertFalse(hooks.plugin_enabled(path))
        self.assertIn("added", hooks.install(path=path))

    def test_feed_counts_a_doubled_needs_you_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "events.jsonl"
            feed = hooks.HookFeed(path)
            line = json.dumps({"t": 100.0, "e": "needs_you", "s": "abc"}) + "\n"
            later = json.dumps({"t": 110.0, "e": "needs_you", "s": "abc"}) + "\n"
            path.write_text(line + line + later, encoding="utf-8")
            self.assertEqual(len(feed.read(0)["events"]), 2)


class CommandsTest(unittest.TestCase):
    def test_voice_window_does_not_open_a_second_session(self):
        from cody import cli
        with mock.patch.object(launcher, "voice_session_running", return_value=True), \
                mock.patch.object(launcher, "open_voice_window") as opener, mock.patch("builtins.print"):
            self.assertEqual(cli.main(["--voice-window"]), 0)
        opener.assert_not_called()

    def test_start_runs_the_server_detached_once(self):
        popen, opened = mock.Mock(), []
        config = {"port": 7420}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(launcher, "data_dir", return_value=Path(tmp)):
            with mock.patch.object(launcher, "server_running", return_value=False):
                launcher.start_server(popen, config, opened.append, platform="linux")
            with mock.patch.object(launcher, "server_running", return_value=True):
                launcher.start_server(popen, config, opened.append, platform="linux")
            popen.call_args.kwargs["stdout"].close()
        self.assertEqual(popen.call_count, 1)
        self.assertTrue(popen.call_args.kwargs["start_new_session"])
        self.assertEqual(opened, ["http://127.0.0.1:7420/"] * 2)


if __name__ == "__main__":
    unittest.main()
