"""The Settings screen's side on the computer: saving, the key, the QR route and who may change things."""
import base64
import io
import json
import tempfile
import unittest
import urllib.error
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
        with mock.patch.object(voice, "_eleven", return_value=b"mp3") as eleven:
            heard = settings.test_voice(config)
            self.assertEqual(heard["ok"], True)
            self.assertEqual(base64.b64decode(heard["audio"]), b"mp3", "the screen gets the audio to play")
            self.assertEqual(eleven.call_args.args[1]["voice_id"], "abcdefghij", "the saved voice")
            settings.test_voice(config, "zyxwvutsrq98")
            self.assertEqual(eleven.call_args.args[1], {"voice_id": "zyxwvutsrq98", "model": "eleven_flash_v2_5"},
                             "a voice being tried, before it is saved")
            settings.test_voice({"language": "en", "voice": None}, "zyxwvutsrq98")
            self.assertEqual(eleven.call_args.args[1]["model"], "eleven_flash_v2_5", "no saved voice: the usual model")
        self.assertFalse(settings.test_voice({"language": "en", "voice": None})["ok"])
        with self.assertRaises(settings.SettingsError):
            settings.test_voice(config, "../not-an-id")

    def test_a_voice_test_counts_against_the_same_limit_as_replies(self):
        config = {"language": "en", "voice": {"voice_id": "abcdefghij", "model": "eleven_flash_v2_5"}}
        with mock.patch.object(voice, "_take_synthesis_slot", side_effect=voice.VoiceError(429, "too many")), \
                mock.patch.object(voice, "_eleven") as eleven:
            self.assertEqual(settings.test_voice(config), {"ok": False, "reason": "too many"})
            eleven.assert_not_called()

    def test_voices_of_the_account_are_listed_by_name(self):
        answer = {"voices": [
            {"voice_id": "bbbbbbbbbb22", "name": "  Rachel   Calm ", "labels": {"accent": "american", "gender": "female",
                                                                              "age": "young", "use case": "narration"}},
            {"voice_id": "aaaaaaaaaa11", "name": "adam", "labels": None},
            {"voice_id": "../etc", "name": "Bad id"}, {"voice_id": "cccccccccc33", "name": "  "}, "not a voice",
            {"voice_id": "dddddddddd44", "name": "Zoe", "labels": {"accent": 7, "gender": ""}},
        ]}
        self.assertEqual(voice.voice_list(answer), [
            {"id": "aaaaaaaaaa11", "name": "adam", "about": ""},
            {"id": "bbbbbbbbbb22", "name": "Rachel Calm", "about": "american, female, young"},
            {"id": "dddddddddd44", "name": "Zoe", "about": ""},
        ])
        for broken in (None, [], {"voices": "x"}, {"other": 1}):
            self.assertEqual(voice.voice_list(broken), [])

    def test_listing_voices_needs_a_key_and_reports_why_it_failed(self):
        self.assertEqual(settings.voices(), {"ok": False, "reason": "no ElevenLabs API key on this computer",
                                             "voices": []})
        key = "sk_" + "a" * 40
        settings.set_key(key)
        answer = io.BytesIO(json.dumps({"voices": [{"voice_id": "aaaaaaaaaa11", "name": "Adam"}]}).encode())
        answer.__enter__ = lambda *_: answer
        answer.__exit__ = lambda *_: False
        with mock.patch("urllib.request.urlopen", return_value=answer) as opened:
            self.assertEqual(settings.voices(), {"ok": True, "voices": [{"id": "aaaaaaaaaa11", "name": "Adam",
                                                                       "about": ""}]})
            request = opened.call_args.args[0]
            self.assertEqual(request.full_url, "https://api.elevenlabs.io/v1/voices")
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.get_header("Xi-api-key"), key)
        refused = urllib.error.HTTPError("u", 401, "no", {}, io.BytesIO(
            b'{"detail": {"status": "missing_permissions", "message": "..."}}'))
        with mock.patch("urllib.request.urlopen", side_effect=refused):
            listed = settings.voices()
        self.assertEqual((listed["ok"], listed["reason"]), (False, "the key lacks permission for this"))
        self.assertNotIn(key, json.dumps(listed))
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("offline")):
            self.assertEqual(settings.voices()["reason"], "ElevenLabs did not answer")


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
            with mock.patch.object(settings, "voices", return_value={"ok": True, "voices": []}), \
                    mock.patch("cody.doctor.note_phone"):
                status, data = case.request("GET", "/api/settings/voices")
                self.assertEqual((status, data), (200, {"ok": True, "voices": []}))
                status, _ = case.request("GET", "/api/settings/voices", host="pc.example.ts.net")
                self.assertEqual(status, 403, "the account's voices are shown on the computer only")
            with mock.patch.object(settings, "test_voice", return_value={"ok": True, "audio": "bXAz"}) as heard:
                status, data = case.request("POST", "/api/settings/test", body=b'{"voice_id": "zyxwvutsrq98"}')
                self.assertEqual((status, data["audio"]), (200, "bXAz"))
                self.assertEqual(heard.call_args.args[1], "zyxwvutsrq98")
            status, data = case.request("POST", "/api/settings/test", body=b'{"voice_id": "../x"}')
            self.assertEqual(status, 400)
        finally:
            StatusRoutesTest.tearDownClass()


if __name__ == "__main__":
    unittest.main()
