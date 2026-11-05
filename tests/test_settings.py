"""The Settings screen's side on the computer: saving, the key, the QR route and who may change things."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cody import settings, voice


class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.config_path = self.folder / "config.json"
        self.config_path.write_text(json.dumps({"port": 7420, "allowed_logins": ["me@example.com"]}))
        for target in ("cody.settings.data_dir", "cody.store.data_dir"):
            patcher = mock.patch(target, return_value=self.folder)
            patcher.start()
            self.addCleanup(patcher.stop)
        env = mock.patch.dict("os.environ", {"ELEVENLABS_API_KEY": ""})
        env.start()
        self.addCleanup(env.stop)
        home_key = mock.patch.object(voice, "KEY_FILE", self.folder / "no-home-key")
        home_key.start()
        self.addCleanup(home_key.stop)

    def test_save_keeps_other_keys_and_checks_values(self):
        config = settings.save({"language": "pt-BR", "voice_provider": "sounds", "voice_id": "abcdefghij12"},
                               self.config_path)
        self.assertEqual((config["language"], config["voice_provider"]), ("pt-BR", "sounds"))
        self.assertEqual(config["voice"]["voice_id"], "abcdefghij12")
        self.assertEqual(json.loads(self.config_path.read_text())["allowed_logins"], ["me@example.com"])
        for bad in ({"language": "fr"}, {"voice_provider": "robot"}, {"voice_id": "../x"},
                    {"voice_folder": "/does/not/exist"}):
            with self.assertRaises(settings.SettingsError):
                settings.save(bad, self.config_path)

    def test_key_is_saved_privately_and_never_shown(self):
        self.assertFalse(settings.set_key(""))
        with self.assertRaises(settings.SettingsError):
            settings.set_key("short")
        key = "sk_" + "a" * 40
        self.assertTrue(settings.set_key(key))
        self.assertEqual(voice._api_key(), key)
        config = settings.save({}, self.config_path)
        shown = json.dumps(settings.public(config, settings_path=self.folder / "settings.json"))
        self.assertNotIn(key, shown)
        self.assertIn('"has_key": true', shown)
        self.assertFalse(settings.set_key(""))

    def test_an_unreadable_config_is_never_overwritten(self):
        self.config_path.write_text('{"port": 7420, "allowed_logins": ["me@example.com"],}')     # a trailing comma
        with self.assertRaises(settings.SettingsError):
            settings.save({"language": "pt-BR"}, self.config_path)
        self.assertIn("allowed_logins", self.config_path.read_text())

    def test_first_run_is_remembered(self):
        self.assertFalse(settings.first_run_done(self.folder))
        settings.apply_switches({"first_run_done": True})
        self.assertTrue(settings.first_run_done(self.folder))

    def test_voice_test_reports_the_reason(self):
        config = {"language": "en", "voice": {"voice_id": "abcdefghij", "model": "eleven_flash_v2_5"}}
        with mock.patch.object(voice, "_eleven", side_effect=voice.VoiceError(502, "ElevenLabs: payment pending")):
            self.assertEqual(settings.test_voice(config), {"ok": False, "reason": "payment pending"})
        with mock.patch.object(voice, "_eleven", return_value=b"mp3"):
            self.assertEqual(settings.test_voice(config), {"ok": True})
        self.assertFalse(settings.test_voice({"language": "en", "voice": None})["ok"])


class SettingsRoutesTest(unittest.TestCase):
    def test_changes_only_from_the_computer_and_qr(self):
        from tests.test_doctor import StatusRoutesTest
        case = StatusRoutesTest("test_status_lists_the_checks")
        StatusRoutesTest.setUpClass()
        try:
            with mock.patch("cody.doctor.note_phone"):
                status, data = case.request("POST", "/api/settings", host="pc.example.ts.net",
                                            body=b'{"language": "pt-BR"}')
            self.assertEqual(status, 403)
            with mock.patch.object(case.app, "change_settings", return_value={"ok": 1}):
                status, _ = case.request("POST", "/api/settings", body=b'{"language": "pt-BR"}')
            self.assertEqual(status, 200)
            status, data = case.request("GET", "/api/settings")
            self.assertEqual(status, 200)
            self.assertNotIn("key", {k for k in data if k != "has_key"})
        finally:
            StatusRoutesTest.tearDownClass()


if __name__ == "__main__":
    unittest.main()
