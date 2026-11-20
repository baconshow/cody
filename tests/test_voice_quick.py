"""The quick screenshot (cody/voice.py): "Cody, take a screenshot" is answered on the spot, without Claude."""
import unittest
from pathlib import Path
from unittest import mock

from cody import screen, voice

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 20


class PrintCommandTest(unittest.TestCase):
    def test_short_sentences_asking_for_a_screenshot(self):
        for text in ("printa", "Cody, printa", "tira um print", "tira print", "tirar um print da tela", "print da tela",
                     "captura de tela", "screenshot", "take a screenshot", "screen shot please", "print screen",
                     "capture the screen", "take a picture of my screen"):
            self.assertTrue(voice.is_print_command(text), text)

    def test_anything_else_goes_to_claude(self):
        for text in ("what time is it", "manda um print pro meu WhatsApp agora mesmo", "send a screenshot to my WhatsApp, please",
                     "print the invoice", "o que faz o print no python", "imprime isso", "printer"):
            self.assertFalse(voice.is_print_command(text), text)


class QuickPrintTest(unittest.TestCase):
    def setUp(self):
        voice._quick_images.clear()

    def test_the_picture_is_kept_here_and_served_by_image(self):
        answer = voice.say({"text": "tira um print"}, Path("no-channel.json"), language="pt-BR", capture=lambda: PNG)
        self.assertEqual(answer["request_id"], "")
        self.assertEqual(answer["quick"]["text"], voice.QUICK_TEXT["pt-BR"]["print_done"])
        image_id = answer["quick"]["image"]
        self.assertRegex(image_id, r"^[A-Za-z0-9_-]+$")
        self.assertEqual(voice.image(image_id, Path("no-channel.json")), PNG)   # no channel needed

    def test_in_english_and_without_a_channel(self):
        answer = voice.say({"text": "take a screenshot"}, Path("no-channel.json"), capture=lambda: PNG)
        self.assertEqual(answer["quick"]["text"], voice.QUICK_TEXT["en"]["print_done"])

    def test_a_failed_capture_is_said_not_raised(self):
        def broken():
            raise screen.ScreenError("locked")
        answer = voice.say({"text": "screenshot"}, Path("no-channel.json"), capture=broken)
        self.assertEqual(answer["quick"], {"text": voice.QUICK_TEXT["en"]["print_failed"], "image": None})

    def test_only_the_latest_few_pictures_stay(self):
        ids = [voice.quick_print(capture=lambda: PNG)["quick"]["image"] for _ in range(voice.MAX_QUICK_IMAGES + 2)]
        self.assertEqual(len(voice._quick_images), voice.MAX_QUICK_IMAGES)
        with self.assertRaises(voice.VoiceError):
            voice.image(ids[0], Path("no-channel.json"))    # the oldest is gone (and there is no channel to ask)
        self.assertEqual(voice.image(ids[-1], Path("no-channel.json")), PNG)

    def test_other_sentences_still_need_the_channel(self):
        with self.assertRaises(voice.VoiceError) as caught:
            voice.say({"text": "what time is it"}, Path("no-channel.json"), capture=lambda: self.fail("no capture"))
        self.assertEqual(caught.exception.status, 503)


class QuickUsageTest(unittest.TestCase):
    """"How much usage do I have left?" is said, and the two numbers stay in the box at the bottom."""

    def test_the_numbers_are_spoken_and_shown(self):
        known = {"five_hour": {"used": 42, "resets_at": 1_800_000_000.0}, "seven_day": {"used": 10, "resets_at": 1_800_000_000.0},
                 "age_s": 60.0}
        with mock.patch.object(voice.usage, "read", return_value=known):
            answer = voice.say({"text": "how much usage do I have left"}, Path("no-channel.json"), capture=lambda: self.fail("no capture"))
        self.assertEqual(answer["request_id"], "")
        self.assertTrue(answer["quick"]["text"].startswith("Session: 42% used"), answer["quick"]["text"])
        self.assertEqual(answer["quick"]["show"], "session 42% · week 10%")
        self.assertIsNone(answer["quick"]["image"])

    def test_unknown_usage_is_said_with_nothing_in_the_box(self):
        with mock.patch.object(voice.usage, "read", return_value=None):
            answer = voice.say({"text": "quanto resta de uso?"}, Path("no-channel.json"), language="pt-BR", capture=lambda: PNG)
        self.assertEqual(answer["quick"]["text"], voice.usage.TEXT["pt-BR"]["unknown"])
        self.assertIsNone(answer["quick"]["show"])


if __name__ == "__main__":
    unittest.main()
