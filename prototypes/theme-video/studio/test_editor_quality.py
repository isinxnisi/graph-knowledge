import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess

from editor import WEBB_BOARDS, WEBB_ID, _check_draft, _schema, generate_plan


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

    def test_japanese_first_then_localization_of_immutable_master(self):
        snapshot = {**self.snapshot, "themeId": WEBB_ID, "title": "テスト", "description": "", "records": [],
                    "sources": [*self.snapshot["sources"], {"id": "nasa-mosaic", "title": "初期画像"},
                                {"id": "nasa-aligned", "title": "整列画像"}]}
        japanese = copy.deepcopy(self.draft)
        del japanese["titles"]["en"]
        for scene, asset in zip(japanese["scenes"], ("webb-sky", "webb-map", "webb-return")):
            del scene["en"]
            scene["asset"] = asset
            scene["sourceIds"] = [WEBB_BOARDS[asset][0]]
        english = {"title": "Light in the mirror", "scenes": [
            {"id": f"s{i}", "heading": "Follow the light", "narration": "Here is the same star."}
            for i in range(1, 4)]}
        response = japanese

        def run(args, **kwargs):
            return CompletedProcess(args, 0, stdout="\n".join(map(json.dumps, [
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(response)}},
                {"type": "turn.completed", "usage": {"input_tokens": 10}}])))

        with tempfile.TemporaryDirectory() as temp, patch("editor._run", side_effect=run), \
                patch("editor.list_models", return_value=[{"id": "model", "available": True}]):
            root = Path(temp)
            def generate(language, master=None):
                return generate_plan(snapshot, "", "model", root / language, language=language, master_plan=master)

            original_snapshot = copy.deepcopy(snapshot)
            master = generate("ja")
            self.assertEqual(set(master["titles"]), {"ja"})
            self.assertTrue(all("en" not in s for s in master["scenes"]))
            ja_input = json.loads((root / "ja/editor-input.json").read_text(encoding="utf-8"))
            fields = ja_input["outputSchema"]["properties"]
            self.assertEqual(fields["titles"]["required"], ["ja"])
            self.assertNotIn("en", fields["scenes"]["items"]["properties"])
            materials = json.loads(ja_input["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(set(materials["boardMaterials"]), set(WEBB_BOARDS))
            self.assertEqual(materials["productionSourceNote"]["sourceId"], "nasa-aligned")

            frozen = copy.deepcopy(master)
            response = english
            adaptation = generate("en", master)
            self.assertEqual(master, frozen)
            self.assertEqual(snapshot, original_snapshot)
            self.assertEqual(adaptation["titles"], {"ja": master["titles"]["ja"], "en": english["title"]})
            for localized, original in zip(adaptation["scenes"], master["scenes"]):
                self.assertEqual({k: v for k, v in localized.items() if k != "en"}, original)
            self.assertEqual(adaptation["sources"], master["sources"])
            self.assertEqual(adaptation["story"], master["story"])
            en_input = json.loads((root / "en/editor-input.json").read_text(encoding="utf-8"))
            en_fields = en_input["outputSchema"]["properties"]
            self.assertEqual(set(en_fields["scenes"]["items"]["required"]), {"id", "heading", "narration"})
            self.assertEqual(adaptation["adaptation"]["masterPlanSha256"], en_input["masterPlanSha256"])
            self.assertEqual(adaptation["adaptation"]["masterModel"], master["model"])

            response = {**english, "scenes": english["scenes"][::-1]}
            with self.assertRaisesRegex(ValueError, "順序"):
                generate("en", master)
            with self.assertRaises(ValueError):
                generate("en")
            self.assertEqual(master, frozen)


if __name__ == "__main__":
    unittest.main()
