import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess

from editor import (MaterialRequired, WEBB_BOARDS, WEBB_ID, _apply_adaptation, _check_draft, _schema, _visual_materials,
                    generate_ideas, generate_plan, list_models)
from script_review import _audience_cut


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

    def test_original_demo_is_available_from_fixed_theme_evidence_before_additional_research(self):
        for excerpt, available in (("nearly identical wipe transitions", True), ("two films", False)):
            payload = {"records": [{"evidence": [{"excerpt": excerpt}]}]}
            assets = _visual_materials(self.snapshot, "ワイプに注目する", "ja", payload)
            self.assertEqual("wipe-demo" in assets, available)
            self.assertEqual("illustrations" in payload, available)

    def test_original_demo_can_describe_its_own_motion(self):
        shot = self.draft["scenes"][0]
        shot.update(asset="wipe-demo", sourceIds=[])
        shot["ja"] = {"heading": "", "narration": "道の向こうから星が入ってきます。", "readings": []}
        assets = ["wipe-demo", "source"]
        result = _check_draft(self.draft, self.snapshot, assets, "ja")
        self.assertEqual(result["scenes"][0]["sourceIds"], [])
        self.assertEqual([s["id"] for s in result["sources"]], ["ref"])
        with self.assertRaisesRegex(ValueError, "図版"):
            _check_draft(self.draft, self.snapshot, ["source"], "ja")
        self.draft["scenes"][1]["sourceIds"] = []
        with self.assertRaisesRegex(ValueError, "場面2"):
            _check_draft(self.draft, self.snapshot, assets, "ja")
        self.draft["scenes"] = [shot]
        with self.assertRaisesRegex(ValueError, "テーマ"):
            _check_draft(self.draft, self.snapshot, assets, "ja")

    def test_unheaded_source_passes_draft_review_and_english_adaptation(self):
        line = self.draft["scenes"][0]
        line["ja"]["heading"] = ""
        self.assertEqual(self.check()["scenes"][0]["en"]["heading"], line["en"]["heading"])
        line["en"]["heading"] = ""
        master = self.check()
        picture = _audience_cut(master)["scenes"][0]["picture"]
        self.assertNotIn("「」", picture)
        self.assertIn("example.org 資料", picture)
        english = {"title": "Light", "scenes": [{"id": s["id"], **s["en"]} for s in master["scenes"]]}
        self.assertEqual(_apply_adaptation(english, master)["scenes"][0]["en"]["heading"], "")
        english["scenes"][0]["heading"] = "An extra heading"
        with self.assertRaisesRegex(ValueError, "日本語版"):
            _apply_adaptation(english, master)

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

    def test_webb_board_without_authored_heading_passes_japanese_and_english(self):
        scene = self.draft["scenes"][0]
        scene["ja"]["heading"] = ""
        scene["en"]["heading"] = ""
        self.snapshot["sources"].extend({"id": sid} for sid in {sid for sid, _ in WEBB_BOARDS.values()})
        for board, (sid, _) in WEBB_BOARDS.items():
            with self.subTest(board=board):
                scene.update(asset=board, sourceIds=[sid])
                master = _check_draft(self.draft, self.snapshot, [board, "source"], language="ja")
                english = {"title": "Light", "scenes": [{"id": f"s{i}", **s["en"]}
                           for i, s in enumerate(self.draft["scenes"], 1)]}
                self.assertEqual(_apply_adaptation(english, master)["scenes"][0]["en"]["heading"], "")

    def test_visible_heading_reports_scene_language_and_length(self):
        self.snapshot["sources"].append({"id": "nasa-aligned"})
        scene = self.draft["scenes"][1]
        scene.update(asset="aligned", sourceIds=["nasa-aligned"])
        assets = ["source", "aligned"]
        master = _check_draft(self.draft, self.snapshot, assets)
        for lang, label in [("ja", "日本語"), ("en", "英語")]:
            for invalid, reason in [("", "空欄"), ("a" * 111, "111字")]:
                with self.subTest(language=lang, reason=reason):
                    scene[lang]["heading"] = invalid
                    expected = f"場面2の{label}の見出し.*{reason}.*110字"
                    with self.assertRaisesRegex(ValueError, expected):
                        _check_draft(self.draft, self.snapshot, assets)
                    if lang == "en":
                        english = {"title": "Light", "scenes": [{"id": f"s{i}", **s["en"]}
                                   for i, s in enumerate(self.draft["scenes"], 1)]}
                        with self.assertRaisesRegex(ValueError, expected):
                            _apply_adaptation(english, master)
                scene[lang]["heading"] = master["scenes"][1][lang]["heading"]

    def test_overlapping_readings_report_the_scene_and_both_terms(self):
        line = self.draft["scenes"][1]["ja"]
        line["narration"] = "十八の像は、十八枚の鏡から届きました。"
        line["readings"] = [{"text": "十八", "kana": "じゅうはち"}, {"text": "十八枚", "kana": "じゅうはちまい"}]
        with self.assertRaisesRegex(ValueError, "場面2の日本語の読み指定.*「十八」と「十八枚」.*重なって"):
            self.check()
        line["readings"][0] = {"text": "十八の像", "kana": "じゅうはちのぞう"}
        self.assertEqual(self.check()["scenes"][1]["ja"]["readings"], line["readings"])

    def test_new_script_reports_missing_story_or_invalid_reading(self):
        self.draft["story"]["visualCheck"] = " "
        with self.assertRaisesRegex(ValueError, "画面で確かめること"):
            self.check()
        self.draft["story"]["visualCheck"] = "左右の鏡を見る。"
        self.draft["scenes"][0]["ja"]["readings"] = [{"text": "対象外の語", "kana": "よみ"}]
        with self.assertRaises(ValueError):
            self.check()

    def test_multiscene_visual_note_survives_without_changing_the_narration(self):
        detail = "一枚だけ鏡を傾けてから視線を写真に移す。" * 24
        self.draft["story"]["visualCheck"] = detail
        plan = self.check()
        self.assertEqual(plan["story"]["visualCheck"], detail)
        self.assertEqual(plan["scenes"][0]["ja"]["narration"], "主鏡に光が届きます。")

    def test_missing_material_retains_the_recoverable_reason(self):
        # A missing image is reported even though no narrative or reading could be generated.
        self.draft.update(materialRequest="どちらの鏡かを確かめるため、出所の分かる図が必要。", story={}, scenes=[])
        with self.assertRaisesRegex(MaterialRequired, "追加資料が必要.*出所"):
            self.check()

    def test_model_menu_uses_each_visible_model_supported_levels(self):
        def model(slug, levels, visibility="list"):
            return {"slug": slug, "visibility": visibility,
                    "supported_reasoning_levels": [{"effort": effort} for effort in levels]}

        models = [model("hidden-astra", ["ultra"], "hide"), model("gpt-6-astra", ["high", "xhigh", "ultra"]),
                  model("gpt-6-sol", ["high", "medium"]), model("previous-astra", ["max"])]
        responses = [CompletedProcess([], 0), CompletedProcess([], 0, stdout=json.dumps({"models": models}))]
        with patch("editor._catalog", None), patch("editor.shutil.which", return_value="codex"), \
                patch("editor._run", side_effect=responses):
            choices = list_models()
            self.assertEqual([c["id"] for c in choices], ["gpt-6-astra", "gpt-6-astra@xhigh", "gpt-6-astra@ultra",
                                                         "gpt-6-sol", "gpt-6-sol@medium"])
            self.assertEqual([(c["modelId"], c["effort"]) for c in choices[:3]],
                             [("gpt-6-astra", e) for e in ("high", "xhigh", "ultra")])
            self.assertTrue(all(c["available"] for c in choices))
            with self.assertRaisesRegex(ValueError, "選択したモデル"):
                generate_plan(self.snapshot, "", "gpt-6-sol@ultra", ".")

    def test_idea_generation_compares_prior_choices_and_allows_one_or_no_new_ideas(self):
        snapshot = {**self.snapshot, "title": "鏡を調整する", "description": "", "records": []}
        old = {"title": "二枚の鏡", "opening": "二つの点を見渡す。", "payoff": "光が二枚から来たと気づく。",
               "needs": "", "sourceIds": ["ref"]}
        new = {"title": "鏡をのぞき込む人", "opening": "鏡に誰かの目が映る。", "payoff": "どこから見たら像が結ぶか。",
               "needs": "鏡をのぞく人の記録と、視線をたどる図が必要。", "sourceIds": []}
        existing = [{**old, "status": "later", "sourceIds": ["ref-from-a-different-revision"]}]
        choice = {"id": "model@ultra", "modelId": "model", "effort": "ultra", "available": True}
        with patch("editor.list_models", return_value=[choice]), patch("editor._call_writer") as writer:
            writer.return_value = ({"ideas": [old, new, {**new, "title": "別の仮題"}]}, {})
            self.assertEqual(generate_ideas(snapshot, "", choice["id"], existing), [new])
            request = writer.call_args.args[0]
            self.assertEqual((request["model"], request["effort"]), ("model", "ultra"))
            payload = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(payload["existingIdeas"], [{k: existing[0][k] for k in ("title", "opening", "payoff", "status")}])
            self.assertNotIn("ref-from-a-different-revision", request["prompt"])
            self.assertEqual(request["outputSchema"]["properties"]["ideas"]["items"]["properties"]
                             ["sourceIds"]["items"]["enum"], ["ref"])
            writer.return_value = ({"ideas": []}, {})
            self.assertEqual(generate_ideas(snapshot, "", choice["id"], existing), [])
            for ids, needs in ((["ref-from-a-different-revision"], ""), ([], "")):
                writer.return_value = ({"ideas": [{**new, "sourceIds": ids, "needs": needs}]}, {})
                with self.assertRaises(ValueError):
                    generate_ideas(snapshot, "", choice["id"], existing)

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
        scope = {"question": "どの鏡でしょう？", "outline": "光を確かめる。",
                 "beats": [{"meaning": "光が届く。", "visibleTest": "写真の光を見る。", "sourceIds": ["nasa-mosaic"]}]}

        commands = []
        inputs = []
        def run(args, **kwargs):
            commands.append(args)
            inputs.append(json.loads(kwargs["input"].rsplit("\n\n", 1)[1]))
            fields = json.loads((kwargs["cwd"] / "shape.json").read_text(encoding="utf-8"))["properties"]
            stage = response
            if "beats" in fields:
                stage = scope
            elif "retelling" in fields:
                stage = {"retelling": "光が届きました。", "unclear": "どの鏡でしょう？"}
            elif "revisedScope" in fields:
                stage = {"revisedScope": scope, "revisionReason": "光の行き先を示す。", "script": japanese}
            elif "checks" in fields:
                stage = {"ready": True, "blockingIssue": "", "checks": [
                    {"beatId": "b1", "sceneIds": ["s1"], "quote": "主鏡に光が届きます。",
                     "supported": True, "evidence": "光が届く語りがある。"}]}
            return CompletedProcess(args, 0, stdout="\n".join(map(json.dumps, [
                {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(stage)}},
                {"type": "turn.completed", "usage": {"input_tokens": 10}}])))

        choices = [{"id": "model", "modelId": "model", "effort": "high", "available": True},
                   {"id": "model@ultra", "modelId": "model", "effort": "ultra", "available": True}]
        with tempfile.TemporaryDirectory() as temp, patch("editor._run", side_effect=run), \
                patch("editor.list_models", return_value=choices):
            root = Path(temp)
            def generate(language, master=None):
                selection = "model@ultra" if language == "ja" else "model"
                return generate_plan(snapshot, "", selection, root / language, language=language, master_plan=master)

            original_snapshot = copy.deepcopy(snapshot)
            master = generate("ja")
            self.assertEqual(set(master["titles"]), {"ja"})
            self.assertTrue(all("en" not in s for s in master["scenes"]))
            ja_input = json.loads((root / "ja/editor-input.json").read_text(encoding="utf-8"))
            self.assertEqual((ja_input["model"], ja_input["effort"]), ("model", "ultra"))
            self.assertEqual((master["model"]["requested"], master["model"]["effort"]), ("model", "ultra"))
            self.assertEqual(commands[-1][commands[-1].index("-m") + 1], "model")
            self.assertIn('model_reasoning_effort="ultra"', commands[-1])
            self.assertEqual(len(commands), 5)
            self.assertNotIn("assets", inputs[0])
            self.assertNotIn("boardMaterials", inputs[0])
            self.assertEqual(set(inputs[2]), {"scenes"})
            self.assertEqual(set(inputs[2]["scenes"][0]), {"id", "narration", "picture"})
            self.assertNotIn("webb-", str(inputs[2]))
            self.assertNotIn("鏡からの光", inputs[2]["scenes"][0]["picture"])
            self.assertEqual(master["editorialReview"]["checks"][0]["sceneIds"], ["s1"])
            self.assertEqual(master["editorialReview"]["initialScript"],
                             [{k: s["ja"][k] for k in ("heading", "narration")} for s in japanese["scenes"]])
            self.assertEqual(master["model"]["usage"]["input_tokens"], 50)
            self.assertEqual(generate("ja"), master)
            self.assertEqual(len(commands), 5)
            fields = ja_input["outputSchema"]["properties"]["script"]["properties"]
            self.assertEqual(fields["titles"]["required"], ["ja"])
            self.assertNotIn("en", fields["scenes"]["items"]["properties"])
            materials = json.loads(ja_input["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(set(materials["boardMaterials"]), set(WEBB_BOARDS) - {"webb-tilt"})
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
            self.assertEqual((en_input["model"], en_input["effort"]), ("model", "high"))
            self.assertEqual((adaptation["model"]["requested"], adaptation["model"]["effort"]), ("model", "high"))
            self.assertIn('model_reasoning_effort="high"', commands[-1])
            en_fields = en_input["outputSchema"]["properties"]
            self.assertEqual(set(en_fields["scenes"]["items"]["required"]), {"id", "heading", "narration"})
            self.assertEqual(adaptation["adaptation"]["masterPlanSha256"], en_input["masterPlanSha256"])
            self.assertEqual(adaptation["adaptation"]["masterModel"], master["model"])

            response = {**english, "scenes": english["scenes"][::-1]}
            with self.assertRaisesRegex(ValueError, "順序"):
                generate_plan(snapshot, "", "model", root / "en-revision", language="en", master_plan=master)
            self.assertEqual(inputs[-1]["previousOutput"], response)
            self.assertIn("順序", inputs[-1]["validationFeedback"])
            response = english
            recovered = generate_plan(snapshot, "", "model", root / "en-revision", language="en", master_plan=master)
            self.assertEqual(recovered["adaptation"], adaptation["adaptation"])
            self.assertEqual(recovered["model"]["usage"]["input_tokens"], 40)
            accepted = json.loads((root / "en-revision/editor-input.json").read_text(encoding="utf-8"))
            self.assertEqual(accepted["masterPlanSha256"], en_input["masterPlanSha256"])
            self.assertEqual(accepted["prompt"].rsplit("\n\n", 1)[-1], json.dumps(inputs[-1], ensure_ascii=False))
            with self.assertRaises(ValueError):
                generate("en")
            self.assertEqual(master, frozen)


if __name__ == "__main__":
    unittest.main()
