import copy
import unittest

from editor import _check_draft, _schema


class EditorialNoteTest(unittest.TestCase):
    def setUp(self):
        self.snapshot = {"themeId": "test", "sources": [{"id": "ref", "title": "資料", "url": "https://example.org/"}]}
        self.story = {
            "question": "なぜ点が二つ見えるの？",
            "explanation": "同じ星の光を二枚の鏡が少し違う向きへ返すので、離れたところに星の像が見える。",
            "visualCheck": "二枚の鏡についた名前を図で見比べる。",
        }
        scene = {"asset": "source", "sourceIds": ["ref"],
                 "ja": {"heading": "鏡からの光", "narration": "主鏡に光が届きます。",
                        "readings": [{"text": "主鏡", "kana": "しゅきょう"}]},
                 "en": {"heading": "The mirror", "narration": "Light reaches the main mirror."}}
        self.draft = {"materialRequest": "", "titles": {"ja": "鏡の光", "en": "Mirror light"},
                      "story": self.story, "scenes": [copy.deepcopy(scene) for _ in range(3)]}

    def check(self):
        return _check_draft(self.draft, self.snapshot, ["source"])

    def test_editorial_note_and_pronunciation_survive_projection(self):
        scene = self.draft["scenes"][0]
        plan = self.check()
        self.assertEqual(plan["story"], self.story)
        self.assertEqual(plan["scenes"][0]["ja"]["narration"], scene["ja"]["narration"])
        self.assertEqual(plan["scenes"][0]["ja"]["readings"][0]["text"], "主鏡")
        self.assertEqual(plan["scenes"][0]["en"], scene["en"])
        shape = _schema(["ref"], ["source"])["properties"]
        self.assertEqual(set(shape["story"]["required"]), set(self.story))
        localized = shape["scenes"]["items"]["properties"]
        self.assertIn("readings", localized["ja"]["required"])
        self.assertNotIn("readings", localized["en"]["properties"])

    def test_new_script_reports_missing_story_or_invalid_reading(self):
        self.draft["story"]["visualCheck"] = " "
        with self.assertRaisesRegex(ValueError, "画面で確かめること"):
            self.check()
        self.draft["story"]["visualCheck"] = "左右の鏡を見る。"
        self.draft["scenes"][0]["ja"]["readings"] = [{"text": "対象外の語", "kana": "よみ"}]
        with self.assertRaises(ValueError):
            self.check()

    def test_missing_material_retains_the_recoverable_reason(self):
        # A missing image is reported even though no narrative or reading could be generated.
        self.draft.update(materialRequest="どちらの鏡かを確かめるため、出所の分かる図が必要。", story={}, scenes=[])
        with self.assertRaisesRegex(ValueError, "追加資料が必要.*出所"):
            self.check()


if __name__ == "__main__":
    unittest.main()
