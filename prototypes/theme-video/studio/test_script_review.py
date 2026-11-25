from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from editor import _check_draft, _schema
from script_review import _audience_cut, produce_japanese
from writer_feedback import RevisionNeeded


class ScriptReviewTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.snapshot = {"themeId": "example", "sources": [{"id": "ref", "title": "記録", "url": "https://example.org/"}]}
        self.materials = {"theme": "鏡", "description": "観測", "angle": "点を並べる理由を知りたい。",
                          "records": [], "sources": self.snapshot["sources"], "assets": ["source"],
                          "previousJapanese": {"narrations": ["以前の語り"], "reviews": [{"reason": "前作の感想"}]}}
        self.scope = {"question": "なぜ並べたのか？", "outline": "散らばった点から、鏡の位置をたどる。",
                      "beats": [{"meaning": "鏡の位置と対応させ、どの鏡の変化か追える。",
                                 "sourceIds": ["ref"], "visibleTest": "鏡の形と点を見比べる。"}]}
        self.words = "鏡と同じ並びだから、どの鏡の変化かが分かります。"
        self.draft = {"titles": {"ja": "鏡の位置"}, "story": {k: "位置を確かめる。"
                      for k in ("question", "explanation", "visualCheck")}, "materialRequest": "",
                      "scenes": [{"sourceIds": ["ref"], "asset": "source",
                                  "visualTiming": {"beforeVoice": 2, "afterVoice": None},
                                  "ja": {"heading": "光の地図", "narration": self.words, "readings": []}}]}
        self.revision = {"revisedScope": self.scope, "revisionReason": "識別した後の使い道まで伝える。", "script": self.draft}
        self.reader = {"retelling": "散らばった点を見た。", "unclear": "次に何をするのか。"}

    def produce(self, progress=None):
        return produce_japanese(self.snapshot, self.materials, _schema(["ref"], ["source"], "ja"),
                                "model", "high", self.folder, progress)

    def verdict(self, quote):
        return {"checks": [{"beatId": "b1", "sceneIds": ["s1"], "supported": True, "quote": quote,
                            "evidence": "並べた理由を聞ける。"}], "ready": True, "blockingIssue": ""}

    def test_failed_check_reopens_structure_and_can_resume_with_previous_feedback(self):
        # A positive self-evaluation has no authority without a real line in the selected scene.
        missing = self.verdict("画面にも語りにもない言葉")
        outputs = (self.scope, self.draft, self.reader, self.revision, missing, self.revision, missing)
        with patch("script_review._call_writer", side_effect=[(v, {}) for v in outputs]) as writer:
            with self.assertRaisesRegex(RevisionNeeded, "再確認で改稿が必要"):
                self.produce()
            self.assertEqual(writer.call_count, 7)
            self.assertFalse((self.folder / "editor-input.json").exists())
            audience = json.loads(writer.call_args_list[2].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(audience["scenes"][0]["beforeVoiceSeconds"], 2)
            self.assertNotIn("afterVoiceSeconds", audience["scenes"][0])
            self.assertNotIn("並べる理由を知りたい", str(audience))
            self.assertNotIn("前作の感想", str(audience))
            for call_index in (0, 3, 4):
                self.assertIn("前作の感想", writer.call_args_list[call_index].args[0]["prompt"])

        with patch("script_review._call_writer", side_effect=[(self.revision, {}), (self.verdict("鏡と同じ並び"), {})]) as retry:
            plan = self.produce()
            self.assertEqual(retry.call_count, 2)
            instruction = json.loads(retry.call_args_list[0].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertFalse(instruction["finalReview"]["checks"][0]["supported"])
            self.assertEqual(plan["editorialReview"]["rounds"], 3)
            self.assertEqual(plan["scenes"][0]["visualTiming"], {"beforeVoice": 2, "afterVoice": None})

    def test_a_missing_picture_is_recorded_before_generating_or_reviewing_a_substitute_script(self):
        gap = {"materialRequest": "左右の位置を同じ向きで見比べる模式図が必要です。"}
        with patch("script_review._call_writer", side_effect=[(self.scope, {}), (gap, {})]) as writer:
            with self.assertRaisesRegex(ValueError, "追加資料が必要.*模式図"):
                self.produce()
            self.assertEqual(writer.call_count, 2)
            request = json.loads(writer.call_args_list[0].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertNotIn("assets", request)
            entry = json.loads(next((self.folder / "editor-stages").glob("02-draft-*")).read_text(encoding="utf-8"))
            self.assertEqual(entry["status"], "failed")
            self.assertEqual(entry["result"], gap)
            self.assertFalse((self.folder / "editor-input.json").exists())

    def test_negative_visual_hold_returns_to_the_writer_and_keeps_the_reader_blind(self):
        bad = deepcopy(self.draft)
        bad["scenes"][0]["visualTiming"]["afterVoice"] = -1
        outputs = [self.scope, bad, self.draft, self.reader, self.revision, self.verdict("鏡と同じ並び")]
        progress = []
        with patch("script_review._call_writer", side_effect=[(v, {"tokens": 10}) for v in outputs]) as writer:
            plan = self.produce(progress.append)
            repair = json.loads(writer.call_args_list[2].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(repair["previousOutput"], bad)
            self.assertIn("語りの前後の秒数", repair["validationFeedback"])
            self.assertEqual(repair["correctionAttempt"], 1)
            reader = json.loads(writer.call_args_list[3].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(set(reader), {"scenes"})
            self.assertNotIn("afterVoiceSeconds", reader["scenes"][0])
            self.assertTrue(any("指摘を返して修正中" in message for message in progress))
            self.assertEqual(plan["model"]["usage"], {"tokens": 60})
        with patch("script_review._call_writer") as cached:
            self.assertEqual(self.produce(), plan)
            cached.assert_not_called()

    def test_exhaustion_and_resume_use_the_last_defective_output_and_count_every_call_once(self):
        invalid_drafts = []
        for value in (-1, -2, -3):
            bad = deepcopy(self.draft)
            bad["scenes"][0]["visualTiming"]["afterVoice"] = value
            invalid_drafts.append(bad)
        outputs = [self.scope, *invalid_drafts]
        with patch("script_review._call_writer", side_effect=[(v, {"tokens": 1}) for v in outputs]) as writer:
            with self.assertRaisesRegex(RevisionNeeded, "2回修正"):
                self.produce()
            self.assertEqual(writer.call_count, 4)
        records = list((self.folder / "editor-stages").glob("02-draft-*.json"))
        self.assertEqual(len(records), 3)
        self.assertTrue(all(json.loads(p.read_text(encoding="utf-8"))["status"] == "failed" for p in records))
        outputs = [self.draft, self.reader, self.revision, self.verdict("鏡と同じ並び")]
        with patch("script_review._call_writer", side_effect=[(v, {"tokens": 1}) for v in outputs]) as writer:
            plan = self.produce()
            self.assertEqual(writer.call_count, 4)
            repair = json.loads(writer.call_args_list[0].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(repair["previousOutput"], invalid_drafts[-1])
            self.assertEqual(repair["correctionAttempt"], 3)
            self.assertEqual(plan["model"]["usage"], {"tokens": 8})

    def test_reader_repair_is_blind_and_a_usable_legacy_failed_result_is_revalidated(self):
        bad_reader = {"retelling": "", "unclear": ""}
        outputs = [self.scope, self.draft, bad_reader, self.reader, self.revision, self.verdict("鏡と同じ並び")]
        with patch("script_review._call_writer", side_effect=[(v, {}) for v in outputs]) as writer:
            original = self.produce()
            repair = json.loads(writer.call_args_list[3].args[0]["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(set(repair), {"previousOutput", "validationFeedback", "correctionAttempt", "scenes"})
            self.assertEqual(repair["previousOutput"], bad_reader)
        path = next((self.folder / "editor-stages").glob("02-draft-*.json"))
        entry = json.loads(path.read_text(encoding="utf-8"))
        entry.update(status="failed", error="旧検査で失敗")
        path.write_text(json.dumps(entry, ensure_ascii=False), encoding="utf-8")
        with patch("script_review._call_writer") as writer:
            self.assertEqual(self.produce(), original)
            writer.assert_not_called()
        entry = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(entry["status"], "done")
        self.assertEqual(entry["previousValidationError"], "旧検査で失敗")

    def test_pause_before_automatic_repair_and_writer_timeout_do_not_trigger_more_calls(self):
        bad = deepcopy(self.draft)
        bad["scenes"][0]["visualTiming"]["afterVoice"] = -1

        def check_pause(message):
            if "指摘を返して修正中" in message:
                raise InterruptedError("paused")

        with patch("script_review._call_writer", side_effect=[(self.scope, {}), (bad, {})]) as writer:
            with self.assertRaises(InterruptedError):
                self.produce(check_pause)
            self.assertEqual(writer.call_count, 2)
        with patch("script_review._call_writer", side_effect=TimeoutError("service timed out")) as writer:
            with self.assertRaises(TimeoutError):
                self.produce()
            self.assertEqual(writer.call_count, 1)

    def test_longer_japanese_script_and_continuous_board_reach_the_blind_reader(self):
        shot = {**self.draft["scenes"][0], "asset": "webb-layout", "sourceIds": ["nasa-aligned"]}
        self.draft["scenes"] = [shot] * 13
        self.snapshot["sources"].append({"id": "nasa-aligned", "title": "配列"})
        plan = _check_draft(self.draft, self.snapshot, ["webb-layout"], "ja")
        audience = _audience_cut(plan)["scenes"]
        self.assertEqual(len(audience), 13)
        self.assertIn("s13までを通して一度だけ", audience[0]["picture"])
        self.assertNotIn("同じ符号B3が現れる", audience[1]["picture"])
