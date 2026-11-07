"""Custom scenes (cody/custom.py): data checked field by field, kept in the data folder, undone by voice."""
import json
import tempfile
import unittest
from pathlib import Path

from cody import custom

RAINBOW = {"id": "rainbow", "parts": [
    {"color": "#ff4d4d", "boxes": [[0, 24, 0, 30, 1.5, 1.5]]},
    {"color": "#ffd23f", "boxes": [[0, 26, 0, 30, 1.5, 1.5]], "clip": "bob"},
    {"sign": ["hello", "world"], "box": [20, 10, 0, 8, 5, 1], "ink": "#7dff9b"},
]}


class ValidateTest(unittest.TestCase):
    def test_a_good_scene_comes_out_clean_with_defaults(self):
        scene, errors = custom.validate(RAINBOW)
        self.assertEqual(errors, [])
        self.assertEqual((scene["id"], scene["trigger"], scene["priority"], scene["custom"]), ("rainbow", "request", 45.0, True))
        self.assertEqual(len(scene["parts"]), 3)
        self.assertEqual(scene["parts"][2]["sign"], ["hello", "world"])
        self.assertNotIn("over", scene)
        over, _ = custom.validate({**RAINBOW, "over": True, "trigger": "music", "priority": 30})
        self.assertEqual((over["over"], over["trigger"], over["priority"]), (True, "music", 30.0))

    def test_every_problem_is_named(self):
        _, errors = custom.validate({"id": "Bad id", "trigger": "moon", "priority": 500, "parts": [
            {"color": "red", "boxes": [[0, 0, 0, 1, 1]]}, {"clip": "fly", "boxes": [[999, 0, 0, 1, 1, 1]]}, {"boxes": []}, "x"]})
        joined = "\n".join(errors)
        for word in ("id:", "trigger:", "priority:", "parts[0].color", "parts[0].boxes", "parts[1].clip", "parts[1].boxes",
                     "parts[2].boxes", "parts[3]"):
            self.assertIn(word, joined)
        self.assertEqual(custom.validate("nope")[1], ["the scene must be an object with id and parts"])
        self.assertIn("parts:", custom.validate({"id": "x", "parts": []})[1][0])
        self.assertTrue(custom.validate({"id": "x", "parts": [{"boxes": [[0, 0, 0, 1, 1, True]]}]})[1])

    def test_code_cannot_hide_in_a_scene(self):
        scene, errors = custom.validate({"id": "x", "parts": [{"boxes": [[0, 0, 0, 1, 1, 1]], "onclick": "alert(1)"}], "script": "x"})
        self.assertEqual(errors, [])
        self.assertEqual(set(scene), {"id", "trigger", "priority", "parts", "custom"}, "unknown keys are dropped")
        self.assertEqual(set(scene["parts"][0]), {"boxes"})


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = [1000.0]
        self.store = custom.CustomScenes(Path(self.tmp.name) / "custom", clock=lambda: self.now[0])

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_list_undo(self):
        scene, errors = self.store.create(RAINBOW)
        self.assertEqual(errors, [])
        self.assertEqual([s["id"] for s in self.store.list()], ["rainbow"])
        first = self.store.version()
        self.now[0] += 1
        self.store.create({"id": "moon", "parts": [{"boxes": [[0, 30, 0, 4, 4, 4]], "color": "#ffffff"}]})
        self.assertEqual([s["id"] for s in self.store.list()], ["rainbow", "moon"])
        self.assertNotEqual(self.store.version(), first, "the page sees a change")
        self.assertEqual(self.store.undo(), "moon", "undo takes the newest")
        self.assertEqual(self.store.undo("nope"), None)
        self.assertEqual(self.store.undo("rainbow"), "rainbow")
        self.assertEqual(self.store.list(), [])
        self.assertIsNone(self.store.undo())

    def test_bad_data_is_refused_and_a_damaged_file_is_skipped(self):
        scene, errors = self.store.create({"id": "x"})
        self.assertIsNone(scene)
        self.assertTrue(errors)
        self.assertEqual(self.store.list(), [])
        self.store.create(RAINBOW)
        (Path(self.tmp.name) / "custom" / "broken.json").write_text("{not json", encoding="utf-8")
        (Path(self.tmp.name) / "custom" / "wrong.json").write_text(json.dumps({"id": "wrong"}), encoding="utf-8")
        self.assertEqual([s["id"] for s in self.store.list()], ["rainbow"])

    def test_at_most_twelve(self):
        for i in range(custom.MAX_SCENES):
            self.assertEqual(self.store.create({"id": f"s{i}", "parts": [{"boxes": [[0, 0, 0, 1, 1, 1]]}]})[1], [])
        _, errors = self.store.create({"id": "one-more", "parts": [{"boxes": [[0, 0, 0, 1, 1, 1]]}]})
        self.assertIn("undo one first", errors[0])
        self.assertEqual(self.store.create({"id": "s3", "parts": [{"boxes": [[0, 0, 0, 2, 2, 2]]}]})[1], [], "an existing one may change")

    def test_a_scene_asked_for_lasts_a_while(self):
        self.assertIsNone(self.store.wanted())
        self.store.want("headphones", 20)
        self.assertEqual(self.store.wanted(), "headphones")
        self.now[0] += 19
        self.assertEqual(self.store.wanted(), "headphones")
        self.now[0] += 2
        self.assertIsNone(self.store.wanted())
        self.store.want("party", 100000)
        self.now[0] += custom.MAX_SECONDS + 1
        self.assertIsNone(self.store.wanted(), "capped")
        self.store.want("party")
        self.store.want(None)
        self.assertIsNone(self.store.wanted(), "take it off")
        self.assertEqual(self.store.list(), [], "the wanted file is not a scene")


if __name__ == "__main__":
    unittest.main()
