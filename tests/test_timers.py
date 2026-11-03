import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cody import timers, voice
from cody.abilities import Abilities
from cody.memory import Memory
from cody.pointer import Pointer
from cody.timers import TimerStore, end_time

BRT = timezone(timedelta(hours=-3))
NOW = datetime(2026, 11, 3, 14, 0, tzinfo=BRT)


class EndTimeTest(unittest.TestCase):
    def test_minutes_from_now(self):
        ends_at, kind = end_time(minutes=10, now=NOW)
        self.assertEqual(kind, "timer")
        self.assertEqual(ends_at, (NOW + timedelta(minutes=10)).timestamp())

    def test_a_time_later_today_or_tomorrow(self):
        today, kind = end_time(at="15:30", now=NOW)
        self.assertEqual(kind, "reminder")
        self.assertEqual(datetime.fromtimestamp(today, BRT), NOW.replace(hour=15, minute=30))
        tomorrow, _ = end_time(at="9h05", now=NOW)
        self.assertEqual(datetime.fromtimestamp(tomorrow, BRT), NOW.replace(hour=9, minute=5) + timedelta(days=1))

    def test_bad_requests(self):
        for minutes, at, problem in ((None, None, "when"), (5, "10:00", "when"), (0, None, "minutes"),
                                     (-1, None, "minutes"), (0.1, None, "minutes"), (True, None, "minutes"), ("5", None, "minutes"),
                                     (8 * 24 * 60, None, "minutes"), (None, "25:00", "at"), (None, "noon", "at")):
            with self.assertRaises(ValueError) as caught:
                end_time(minutes, at, NOW)
            self.assertEqual(str(caught.exception), problem, (minutes, at))


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "timers.json"
        self.now = 1_000_000.0
        self.store = TimerStore(self.path, clock=lambda: self.now)

    def test_set_list_and_cancel(self):
        pizza = self.store.add("pizza", self.now + 600, "timer")
        self.store.add("call Ana", self.now + 3600, "reminder")
        self.assertEqual([t["label"] for t in self.store.running()], ["pizza", "call Ana"])
        self.assertEqual(self.store.cancel("PIZ"), [pizza])
        self.assertEqual([t["label"] for t in self.store.running()], ["call Ana"])
        self.assertEqual(len(self.store.cancel("all")), 1)
        self.assertEqual(self.store.running(), [])

    def test_a_ringing_timer_can_be_stopped_by_voice(self):
        self.store.add("pizza", self.now + 60, "timer")
        self.now += 65
        self.assertEqual([t["label"] for t in self.store.cancel("pizza")], ["pizza"])
        self.assertEqual(timers.for_phone(self.path, clock=lambda: self.now)["timers"], [])

    def test_cancel_needs_something_to_match(self):
        self.store.add("pizza", self.now + 600, "timer")
        self.assertEqual(self.store.cancel(""), [])
        self.assertEqual(self.store.cancel("tea"), [])
        self.assertEqual(len(self.store.running()), 1)

    def test_at_most_twenty_running(self):
        for i in range(timers.MAX_TIMERS):
            self.store.add(f"t{i}", self.now + 60 + i, "timer")
        with self.assertRaises(ValueError) as caught:
            self.store.add("one more", self.now + 60, "timer")
        self.assertEqual(str(caught.exception), "full")

    def test_at_most_thirty_set_an_hour_even_if_they_already_ended(self):
        for i in range(timers.MAX_CREATED_PER_HOUR):
            self.store.add(f"t{i}", self.now + 10, "timer")
            self.now += 20                                   # each one ends before the next is set
        with self.assertRaises(ValueError) as caught:
            self.store.add("one more", self.now + 10, "timer")
        self.assertEqual(str(caught.exception), "busy")
        self.now += 3600
        self.assertEqual(self.store.add("later", self.now + 10, "timer")["label"], "later")

    def test_cancel_by_a_short_piece_needs_the_whole_label(self):
        self.store.add("chá", self.now + 600, "timer")
        self.store.add("pizza", self.now + 600, "timer")
        self.assertEqual(self.store.cancel("a"), [])
        self.assertEqual([t["label"] for t in self.store.cancel("chá")], ["chá"])

    def test_a_damaged_file_is_never_overwritten(self):
        self.path.write_text("{hand edit gone wrong", encoding="utf-8")
        with self.assertRaises(OSError):
            self.store.add("pizza", self.now + 60, "timer")
        self.assertEqual(self.path.read_text(encoding="utf-8"), "{hand edit gone wrong")

    def test_ended_timers_ring_for_a_while_then_go(self):
        self.store.add("tea", self.now + 60, "timer")
        self.now += 120
        phone = timers.for_phone(self.path, clock=lambda: self.now)
        self.assertEqual([t["label"] for t in phone["timers"]], ["tea"], "ended a minute ago: still rings")
        self.assertEqual(phone["timers"][0]["say"], "Time's up: tea.")
        self.now += timers.RING_WINDOW_S
        self.assertEqual(timers.for_phone(self.path, clock=lambda: self.now)["timers"], [])
        self.now += timers.KEEP_ENDED_S
        self.store.add("new", self.now + 60, "timer")
        self.assertEqual([t["label"] for t in timers.read(self.path)], ["new"], "old ones pruned on the next write")

    def test_a_broken_file_reads_as_empty(self):
        self.path.write_text("{not json", encoding="utf-8")
        self.assertEqual(timers.read(self.path), [])
        self.path.write_text(json.dumps({"timers": [{"id": "../x", "ends_at": 1, "kind": "timer"}, "junk"]}),
                             encoding="utf-8")
        self.assertEqual(timers.read(self.path), [])

    def test_labels_are_one_short_line(self):
        timer = self.store.add("pizza\n\x00" + "x" * 200, self.now + 60, "timer")
        self.assertNotIn("\n", timer["label"])
        self.assertLessEqual(len(timer["label"]), timers.MAX_LABEL)

    def test_phrases(self):
        self.assertEqual(timers.phrase({"kind": "reminder", "label": "ligar"}, "pt-BR"), "Lembrete: ligar.")
        self.assertEqual(timers.phrase({"kind": "timer", "label": ""}, "pt-BR"), "Acabou o tempo!")


class AlertTextTest(unittest.TestCase):
    def test_only_known_keys_and_running_timers_have_words(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "timers.json"
            timer = TimerStore(path).add("pizza", datetime.now().timestamp() + 60, "timer")
            self.assertEqual(voice.alert_text(f"timer:{timer['id']}", "en", path), "Time's up: pizza.")
            self.assertEqual(voice.alert_text("done", "pt-BR", path), "Pronto! O Claude terminou.")
            for bad in ("timer:00000000", "timer:../x", "anything", "", None):
                self.assertIsNone(voice.alert_text(bad, "en", path), bad)

    def test_alert_audio_without_voice_is_404(self):
        with self.assertRaises(voice.VoiceError) as caught:
            voice.alert_audio("done", None)
        self.assertEqual(caught.exception.status, 404)

    def test_alert_audio_uses_the_words_made_here(self):
        heard = []
        audio = voice.alert_audio("needs_you", {"voice_id": "v" * 20, "model": "m_test"}, "en",
                                  synthesize=lambda text, v, lang: heard.append(text) or b"mp3")
        self.assertEqual((audio, heard), (b"mp3", ["Claude needs you at the computer."]))


class TimerToolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.abilities = Abilities("en", store=TimerStore(base / "timers.json", clock=lambda: NOW.timestamp()),
                                   memory=Memory(base / "memory.json"),
                                   pointer=Pointer(look=lambda: (b"", None), start=None, path=base / "p.json"),
                                   now=lambda: NOW)

    def text(self, arguments: dict) -> str:
        return self.abilities.call("timer", arguments)["content"][0]["text"]

    def test_set_tells_when_it_rings(self):
        self.assertEqual(self.text({"action": "set", "minutes": 25, "label": "focus"}),
                         'Timer "focus" set: rings at 14:25.')
        self.assertEqual(self.text({"action": "set", "at": "18:00", "label": "call Ana"}),
                         'Reminder "call Ana" set: rings at 18:00.')
        self.assertIn('"focus" at 14:25', self.text({"action": "list"}))

    def test_mistakes_are_tool_errors(self):
        for arguments in ({"action": "set", "label": "x"}, {"action": "set", "minutes": -2},
                          {"action": "dance"}, {"action": "cancel", "label": "nothing"}):
            self.assertTrue(self.abilities.call("timer", arguments).get("isError"), arguments)


if __name__ == "__main__":
    unittest.main()
