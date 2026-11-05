"""The voice session launcher, starting with Windows and the tray app's menu actions."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cody import autostart, hooks, launcher, tray


class LauncherTest(unittest.TestCase):
    def test_mcp_config_is_real_json_with_the_channel(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = launcher.write_mcp_config(Path(tmp))
            data = json.loads(path.read_text(encoding="utf-8"))
        server = data["mcpServers"]["cody"]
        self.assertEqual(server["command"], sys.executable)
        self.assertTrue(server["args"][0].endswith("channel.py"))

    def test_frozen_app_runs_its_console_build(self):
        with mock.patch.object(sys, "frozen", True, create=True), \
                mock.patch.object(sys, "executable", str(Path("C:/Apps/Cody/Cody.exe"))):
            self.assertEqual(launcher.channel_command()["args"], ["--channel"])
            self.assertTrue(launcher.channel_command()["command"].endswith("cody-cli.exe"))
            self.assertTrue(hooks.hook_command().endswith('cody-cli.exe" --hook || exit 0'))

    def test_hook_command_of_the_app_is_recognized_as_ours(self):
        group = {"hooks": [{"command": '"C:/Apps/Cody/cody-cli.exe" --hook || exit 0'}]}
        self.assertTrue(hooks._ours(group))
        self.assertTrue(hooks._ours({"hooks": [{"command": '"python" "/x/cody.py" --hook || exit 0'}]}))
        self.assertFalse(hooks._ours({"hooks": [{"command": "other-tool --hook"}]}))

    def test_voice_arguments_keep_screen_tools_asking(self):
        args = launcher.voice_arguments("claude", Path("m.json"))
        self.assertIn("--dangerously-load-development-channels", args)
        self.assertNotIn("--dangerously-skip-permissions", args)
        tools = args[args.index("--allowedTools") + 1:]
        self.assertIn("mcp__cody__reply", tools)
        self.assertNotIn("mcp__cody__screenshot", tools)
        self.assertNotIn("mcp__cody__look", tools)

    def test_run_voice_sets_the_voice_flag_and_folder(self):
        seen = {}

        def run(command, cwd, env):
            seen.update(command=command, cwd=cwd, env=env)
            return 0
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(launcher, "data_dir", return_value=Path(tmp)):
            code = launcher.run_voice(Path(tmp), run=run, which=lambda _n: "/bin/claude", env={})
        self.assertEqual(code, 0)
        self.assertEqual(seen["env"], {"CODY_VOICE": "1"})
        self.assertEqual(seen["command"][0], "/bin/claude")

    def test_without_claude_nothing_runs(self):
        self.assertEqual(launcher.run_voice(Path("."), run=None, which=lambda _n: None), 127)
        self.assertEqual(launcher.open_voice_window(Path("."), popen=None, which=lambda _n: None),
                         launcher.CLAUDE_MISSING)

    def test_new_window_on_each_system(self):
        calls = []
        which = {"claude": "/bin/claude", "xterm": "/usr/bin/xterm"}.get
        for platform in ("win32", "darwin", "linux"):
            self.assertIsNone(launcher.open_voice_window(Path("/w"), popen=lambda *a, **k: calls.append((a, k)),
                                                         which=which, platform=platform))
        self.assertIn("creationflags", calls[0][1])
        self.assertEqual(calls[1][0][0][0], "osascript")
        self.assertEqual(calls[2][0][0][0], "/usr/bin/xterm")

    def test_voice_folder_prefers_the_argument_then_the_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(launcher.voice_folder(tmp), Path(tmp).resolve())
            self.assertEqual(launcher.voice_folder(None, {"voice_folder": tmp}), Path(tmp).resolve())
        self.assertEqual(launcher.voice_folder("/does/not/exist", {}), Path.cwd())

    def test_session_running_needs_a_live_port(self):
        self.assertFalse(launcher.voice_session_running(read=lambda _p: None))
        self.assertFalse(launcher.voice_session_running(read=lambda _p: {"port": "x"}))

        def refuse(*_a, **_k):
            raise OSError
        self.assertFalse(launcher.voice_session_running(read=lambda _p: {"port": 5000}, connect=refuse))
        self.assertTrue(launcher.voice_session_running(read=lambda _p: {"port": 5000},
                                                       connect=lambda *_a, **_k: mock.Mock()))


class FakeRegistry:
    HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ = 1, 2, 3

    def __init__(self):
        self.values = {}

    class _Key:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    def OpenKey(self, *_a):  # noqa: N802 - winreg API
        return self._Key()

    CreateKeyEx = OpenKey

    def QueryValueEx(self, _key, name):  # noqa: N802
        if name not in self.values:
            raise FileNotFoundError
        return self.values[name], self.REG_SZ

    def SetValueEx(self, _key, name, _r, _kind, value):  # noqa: N802
        self.values[name] = value

    def DeleteValue(self, _key, name):  # noqa: N802
        if name not in self.values:
            raise FileNotFoundError
        del self.values[name]


class AutostartTest(unittest.TestCase):
    def test_on_and_off(self):
        reg = FakeRegistry()
        self.assertFalse(autostart.enabled(reg))
        self.assertTrue(autostart.set_enabled(True, "C:/Apps/Cody/Cody.exe", reg))
        self.assertEqual(reg.values["Cody"], '"C:/Apps/Cody/Cody.exe" --background')
        self.assertFalse(autostart.set_enabled(False, registry=reg))
        self.assertFalse(autostart.set_enabled(False, registry=reg))      # already off: still fine


class TrayTest(unittest.TestCase):
    config = {"port": 7420, "language": "pt-BR", "voice_folder": None}

    def test_labels_in_both_languages(self):
        self.assertEqual(set(tray.LABELS["en"]), set(tray.LABELS["pt-BR"]))
        self.assertEqual(tray.labels("fr"), tray.LABELS["en"])

    def test_title_tells_the_voice_session_state(self):
        self.assertIn("ligada", tray.title(self.config, running=True))
        self.assertIn("desligada", tray.title(self.config, running=False))

    def test_actions_open_the_right_pages(self):
        opened = []
        do = tray.actions(self.config, stop=lambda: opened.append("stop"), open_url=opened.append)
        for key in ("open", "status", "settings", "quit"):
            do[key]()
        self.assertEqual(opened, ["http://127.0.0.1:7420/", "http://127.0.0.1:7420/#status",
                                  "http://127.0.0.1:7420/#settings", "stop"])

    def test_voice_is_not_opened_twice(self):
        opener = mock.Mock(return_value=None)
        with mock.patch.object(launcher, "voice_session_running", return_value=True):
            self.assertIsNone(tray.start_voice(self.config, opener))
        opener.assert_not_called()
        with mock.patch.object(launcher, "voice_session_running", return_value=False):
            tray.start_voice(self.config, opener)
        opener.assert_called_once_with(Path.home())

    def test_failed_voice_start_opens_the_status_screen(self):
        opened = []
        with mock.patch.object(tray, "start_voice", return_value="no claude"):
            tray.actions(self.config, stop=None, open_url=opened.append)["voice"]()
        self.assertEqual(opened, ["http://127.0.0.1:7420/#status"])


if __name__ == "__main__":
    unittest.main()


class CliTest(unittest.TestCase):
    def test_version(self):
        from cody import __version__, cli
        with mock.patch("builtins.print") as said:
            self.assertEqual(cli.main(["--version"]), 0)
        said.assert_called_once_with(__version__)

    def test_routes(self):
        from cody import cli
        with mock.patch("cody.hooks.run_hook", return_value=0) as hook:
            self.assertEqual(cli.main(["--hook"]), 0)
        hook.assert_called_once()
        with mock.patch("cody.launcher.run_voice", return_value=7) as voice:
            self.assertEqual(cli.main(["--voice"]), 7)
        voice.assert_called_once()
        with mock.patch("cody.tray.main", return_value=0) as tray_main:
            self.assertEqual(cli.main(["--tray", "--background"]), 0)
        tray_main.assert_called_once_with(["--tray", "--background"])
        with mock.patch("cody.server.main", return_value=0) as server:
            self.assertEqual(cli.main(["--port", "7500"]), 0)
        server.assert_called_once_with(["--port", "7500"])

    def test_only_the_windowed_app_opens_the_tray_by_itself(self):
        from cody import cli
        self.assertFalse(cli.windowed_app())
        with mock.patch.object(sys, "frozen", True, create=True):
            with mock.patch.object(sys, "executable", "C:/Apps/Cody/Cody.exe"):
                self.assertTrue(cli.windowed_app())
            with mock.patch.object(sys, "executable", "C:/Apps/Cody/cody-cli.exe"):
                self.assertFalse(cli.windowed_app())
