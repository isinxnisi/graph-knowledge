"""Regression coverage for revisions and interrupted bilingual runs (no model calls)."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from ledger import Ledger


class LedgerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.data = Path(tmp.name)
        self.desk = Ledger(self.data)
        self.request = dict(themeId="theme:test", revision=3, model="test", brief="二つの図を比べる", requestId="a")
        self.models = lambda: [{"id": "test", "available": True}]
        self.snapshot = lambda theme, rev: {"themeId": theme, "revision": rev, "title": "試験用テーマ"}
        self.plan = {"titles": {"ja": "観察", "en": "Look"}, "sources": [], "scenes": [
            {"id": "s1", "ja": {"narration": "ひとつ"}, "en": {"narration": "One."}}]}

    def create(self):
        return self.desk.submit("/api/cases", self.request, self.snapshot, self.models)

    def render(self, plan, lang, out, progress):
        progress("書き出し")
        (out / "video.mp4").write_bytes(lang.encode())
        (out / "subtitles.srt").write_text(plan["scenes"][0][lang]["narration"], encoding="utf-8")
        (out / "timings.json").write_text(json.dumps([{"id": "s1", "start": 0, "end": 1}]))

    def test_retry_and_adaptation_keep_their_own_model_and_effort(self):
        high, ultra = "gpt-6-astra", "gpt-6-astra@ultra"
        self.models = lambda: [{"id": key, "available": True} for key in (high, ultra)]
        self.request.update(model=ultra, language="ja")
        case = self.create()
        generate = Mock(side_effect=[RuntimeError("中断"), self.plan])
        self.desk.process_next(generate, self.render)
        failed = self.desk.case(case["id"])["runs"][0]
        self.assertEqual((failed["model"], failed["status"]), (ultra, "failed"))
        self.desk = Ledger(self.data)
        self.desk.resume(case["id"], case["runId"])
        self.desk.process_next(generate, self.render)
        self.assertEqual([call.args[2] for call in generate.call_args_list], [ultra, ultra])

        self.desk.submit("runs", dict(requestId="translate", parent=case["runId"], model=high, language="en"),
                         self.snapshot, self.models, case["id"])
        self.desk.process_next(Mock(return_value=deepcopy(self.plan)), self.render)
        english, japanese = self.desk.case(case["id"])["runs"]
        self.assertEqual((english["model"], english["plan"]["japaneseMasterRunId"]), (high, japanese["id"]))
        self.assertEqual(japanese["model"], ultra)

    def test_double_submit_and_revision_after_restart(self):
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: self.create(), range(2)))
        self.assertEqual(results[0], results[1])
        case, first = results[0]["id"], results[0]["runId"]
        self.assertTrue(self.desk.process_next(lambda *args: self.plan, self.render))
        self.desk.review(case, {"runId": first, "lang": "ja", "reason": "画面で対応が分かる"}, "adopted")
        edit = dict(requestId="b", parent=first, lang="en", sceneId="s1", narration="One star.",
                    model="test", reason="主語を明示")
        second = self.desk.submit("runs", edit, self.snapshot, self.models, case)["runId"]

        def interrupt(plan, lang, out, progress):
            self.desk.pause(case, second)
            progress("最初の発話")

        def no_model(*args):
            self.fail("An edited or checkpointed plan must not call the model")

        self.desk.process_next(no_model, interrupt)
        self.desk = Ledger(self.data)
        self.assertEqual(self.desk.case(case)["runs"][0]["status"], "interrupted")
        self.desk.resume(case, second)
        self.desk.process_next(no_model, self.render)
        self.desk.review(case, {"runId": second, "lang": "en", "reason": "修正を確認"}, "adopted")
        self.desk.review(case, {"runId": first, "lang": "en", "reason": "主語が必要"}, "rework")
        detail = self.desk.case(case)
        self.assertEqual(detail["accepted"], {"ja": first, "en": second})
        self.assertEqual(self.desk.list_cases()[0]["states"], {"ja": "採用済み", "en": "採用済み"})
        self.assertEqual(set(detail["runs"][0]["editions"]), {"en"})
        self.assertEqual(detail["runs"][1]["editions"]["en"]["reviewStatus"], "rework")
        self.assertEqual(self.desk.media(case, first, "en", "subtitles.srt").read_text(), "One.")
        self.assertEqual(self.desk.media(case, second, "en", "subtitles.srt").read_text(), "One star.")
        with self.assertRaises(ValueError):
            self.desk.submit("runs", {**edit, "narration": "Another."}, self.snapshot, self.models, case)

    def test_japanese_recommission_freezes_the_selected_versions_words_and_feedback(self):
        result = self.create()
        case, parent = result["id"], result["runId"]
        self.desk.process_next(lambda *args: self.plan, self.render)
        self.desk.review(case, {"runId": parent, "lang": "ja", "reason": "なぜ並べるのかが残った。"}, "rework")
        self.desk.review(case, {"runId": parent, "lang": "en", "reason": "English only."}, "rework")
        self.desk.submit("runs", {"requestId": "rewrite", "parent": parent, "language": "ja", "model": "test",
                                 "scriptFirst": True}, self.snapshot, self.models, case)
        self.desk.review(case, {"runId": parent, "lang": "ja", "reason": "依頼を送った後の感想。"}, "rework")
        self.desk = Ledger(self.data)
        generate = Mock(return_value=self.plan)
        self.desk.process_next(generate, self.render)
        previous = generate.call_args.kwargs["previous_japanese"]
        self.assertEqual(previous["runId"], parent)
        self.assertEqual(previous["narrations"], [s["ja"]["narration"] for s in self.plan["scenes"]])
        self.assertNotIn("asset", str(previous))
        self.assertEqual([(r["kind"], r["reason"]) for r in previous["reviews"]],
                         [("rework", "なぜ並べるのかが残った。")])

    def test_retry_keeps_finished_edition_and_script(self):
        result = self.create()
        calls = []

        def render(plan, lang, out, progress):
            calls.append(lang)
            if calls == ["ja", "en"]:
                raise RuntimeError("音声エンジンが停止")
            self.render(plan, lang, out, progress)

        self.desk.process_next(lambda *args: self.plan, render)
        detail = self.desk.case(result["id"])["runs"][0]
        self.assertEqual(detail["status"], "failed")
        self.assertEqual(set(detail["editions"]), {"ja"})
        self.desk.resume(result["id"], result["runId"])
        self.desk.process_next(lambda *args: self.fail("script was already saved"), render)
        self.assertEqual(calls, ["ja", "en", "en"])
        self.assertEqual(self.desk.case(result["id"])["runs"][0]["status"], "done")

    def test_script_first_survives_restart_and_renders_reviewed_bilingual_plan(self):
        self.request["scriptFirst"] = True
        self.plan["scenes"][0]["ja"]["narration"] = "一日が始まります。"
        self.plan["scenes"].append({"id": "s2", "ja": {"narration": "日付が変わりました。"},
                                    "en": {"narration": "The date has changed."}})
        result = self.create()
        case, first = result["id"], result["runId"]
        generate = Mock(return_value=self.plan)
        render = Mock(wraps=self.render)
        self.desk.process_next(generate, render)
        self.desk = Ledger(self.data)
        parent = self.desk.case(case)["runs"][0]
        self.assertEqual((parent["status"], parent["editions"], parent["plan"]), ("script_ready", {}, self.plan))
        self.assertFalse(self.desk.process_next(generate, render))
        render.assert_not_called()
        with self.assertRaises(ValueError):
            self.desk.review(case, dict(runId=first, lang="ja", reason="台本確認"), "adopted")

        readings = [{"text": "一日", "kana": "ついたち"}]
        edit = dict(requestId="reading", parent=first, lang="ja", sceneId="s1", model="test",
                    narration=self.plan["scenes"][0]["ja"]["narration"], readings=readings, reason="日付の読み")
        revised = self.desk.submit("runs", edit, self.snapshot, self.models, case)["runId"]
        expected = deepcopy(self.plan)
        expected["scenes"][0]["ja"]["readings"] = readings
        child, original = self.desk.case(case)["runs"]
        self.assertEqual(original, parent)
        self.assertEqual((child["parent"], child["status"], child["editions"]), (first, "script_ready", {}))
        self.assertEqual(child["plan"], expected)
        self.assertFalse(self.desk.process_next(generate, render))

        self.desk.resume(case, revised)
        self.desk = Ledger(self.data)
        self.assertTrue(self.desk.process_next(generate, render))
        generate.assert_called_once()
        self.assertEqual([(c.args[1], c.args[0]) for c in render.call_args_list], [("ja", expected), ("en", expected)])
        detail = self.desk.case(case)
        child, original = detail["runs"]
        self.assertEqual(original, parent)
        self.assertEqual(child["status"], "done")
        self.assertEqual(set(child["editions"]), {"ja", "en"})
        self.assertEqual(detail["accepted"], {})

    def test_interrupted_first_generation_restores_script_review_before_render(self):
        self.request["scriptFirst"] = True
        result = self.create()
        render = Mock(wraps=self.render)
        with self.assertRaises(KeyboardInterrupt):
            self.desk.process_next(Mock(side_effect=KeyboardInterrupt), render)
        self.desk = Ledger(self.data)
        self.assertEqual(self.desk.case(result["id"])["runs"][0]["status"], "interrupted")
        self.desk.resume(result["id"], result["runId"])
        self.desk.process_next(lambda *args: self.plan, render)
        self.assertEqual(self.desk.case(result["id"])["runs"][0]["status"], "script_ready")
        render.assert_not_called()

    def test_japanese_draft_then_english_adaptation_from_the_selected_cut(self):
        self.request.update(language="ja", scriptFirst=True)
        master = deepcopy(self.plan)
        master["editorialReview"] = {"reviewedCutSha256": "hash-of-original-script"}
        del master["titles"]["en"]
        del master["scenes"][0]["en"]
        result = self.create()
        case, draft = result["id"], result["runId"]
        generate = Mock(return_value=master)
        render = Mock(wraps=self.render)
        self.desk.process_next(generate, render)
        self.assertEqual(generate.call_args.kwargs["language"], "ja")
        self.assertTrue(callable(generate.call_args.kwargs["progress"]))
        self.assertEqual(self.desk.list_cases()[0]["states"], {"ja": "台本確認", "en": "未生成"})
        self.assertEqual(self.desk.case(case)["runs"][0]["langs"], ["ja"])
        render.assert_not_called()

        def submit(key, **fields):
            return self.desk.submit("runs", dict(requestId=key, model="test", **fields),
                                    self.snapshot, self.models, case)["runId"]

        with self.assertRaises(ValueError):
            submit("adapt-too-early", language="en", parent=draft)
        with self.assertRaises(ValueError):
            submit("en-not-written", lang="en", sceneId="s1", narration="One.", reason="語りを修正", parent=draft)
        revised = submit("edit-ja", lang="ja", sceneId="s1", narration="星がひとつ。", reason="対象を明示", parent=draft)
        self.desk.resume(case, revised)
        self.desk = Ledger(self.data)
        self.desk.process_next(generate, render)
        self.assertEqual((generate.call_count, render.call_count), (1, 1))
        self.assertEqual(render.call_args.args[1], "ja")
        before = self.desk.case(case)
        source = next(r for r in before["runs"] if r["id"] == revised)
        self.assertEqual(source["langs"], ["ja"])
        self.assertEqual(source["plan"]["scenes"][0]["ja"]["narration"], "星がひとつ。")
        self.assertNotIn("editorialReview", source["plan"])
        self.assertEqual(next(r for r in before["runs"] if r["id"] == draft)["plan"]["editorialReview"],
                         master["editorialReview"])
        self.assertEqual(before["accepted"], {})

        english = submit("adapt", language="en", parent=revised, scriptFirst=True)
        translated = deepcopy(source["plan"])
        translated["scenes"][0]["en"] = {"narration": "A single star."}
        translated["titles"]["en"] = "One star"
        generate.return_value = translated
        self.desk.process_next(generate, render)
        self.assertEqual(generate.call_args.kwargs, {"language": "en", "master_plan": source["plan"]})
        self.assertEqual(render.call_count, 1)
        draft_en = self.desk.case(case)["runs"][0]
        self.assertEqual((draft_en["id"], draft_en["parent"], draft_en["status"], draft_en["langs"]),
                         (english, revised, "script_ready", ["en"]))
        self.assertEqual(draft_en["plan"]["japaneseMasterRunId"], revised)
        with self.assertRaises(ValueError):
            submit("wrong-language", lang="ja", parent=english, sceneId="s1", narration="ふたつ", reason="語順")
        revised_en = submit("edit-en", lang="en", parent=english, sceneId="s1", narration="That is one star.",
                            reason="導入の語順")
        self.desk.resume(case, revised_en)
        self.desk.process_next(generate, render)
        self.assertEqual((generate.call_count, render.call_count), (2, 2))
        self.assertEqual(render.call_args.args[1], "en")
        after = self.desk.case(case)
        self.assertEqual(after["states"], {"ja": "確認待ち", "en": "確認待ち"})
        self.assertEqual(after["accepted"], {})
        self.assertEqual(next(r for r in after["runs"] if r["id"] == revised), source)
        self.assertEqual(after["runs"][0]["plan"]["japaneseMasterRunId"], revised)
        self.assertEqual(set(after["runs"][0]["editions"]), {"en"})

    def test_adaptation_requires_a_playable_japanese_edition_in_the_same_case(self):
        request = dict(requestId="english", model="test", language="en")
        with self.assertRaises(ValueError):
            self.desk.submit("/api/cases", {**self.request, **request}, self.snapshot, self.models)
        first = self.create()
        case, source = first["id"], first["runId"]
        self.desk.process_next(lambda *args: self.plan, self.render)
        other = self.desk.submit("/api/cases", {**self.request, "requestId": "other"}, self.snapshot, self.models)
        for fields, case_id in [({}, case), ({"parent": source}, other["id"]),
                                ({"parent": source, "lang": "en"}, case)]:
            with self.subTest(fields=fields, case_id=case_id), self.assertRaises(ValueError):
                self.desk.submit("runs", {**request, **fields}, self.snapshot, self.models, case_id)
        self.desk.media(case, source, "ja", "video.mp4").unlink()
        with self.assertRaises(ValueError):
            self.desk.submit("runs", {**request, "parent": source}, self.snapshot, self.models, case)

    def test_invalid_reading_rolls_back_and_finished_correction_only_renders_japanese(self):
        review = {"reviewedCutSha256": "hash-of-visible-cut", "checks": [{"sceneIds": ["s1"]}]}
        self.plan["editorialReview"] = review
        self.plan["scenes"][0]["ja"]["narration"] = "一日が始まります。"
        result = self.create()
        case, first = result["id"], result["runId"]
        self.desk.process_next(lambda *args: self.plan, self.render)
        for lang in ("ja", "en"):
            self.desk.review(case, dict(lang=lang, runId=first, reason="初稿を採用"), "adopted")
        parent = self.desk.case(case)
        edit = dict(requestId="reading", parent=first, lang="ja", sceneId="s1", model="test",
                    narration="一日が始まります。", reason="日付の読み")
        for invalid in ([{"text": "二日", "kana": "ふつか"}], [{"text": "一日", "kana": "first"}]):
            with self.subTest(readings=invalid), self.assertRaises(ValueError):
                self.desk.submit("runs", {**edit, "readings": invalid}, self.snapshot, self.models, case)
            self.assertEqual(self.desk.case(case), parent)

        readings = [{"text": "一日", "kana": "ついたち"}]
        child = self.desk.submit("runs", {**edit, "readings": readings}, self.snapshot, self.models, case)["runId"]
        render = Mock(wraps=self.render)
        generate = Mock()
        self.desk.process_next(generate, render)
        generate.assert_not_called()
        render.assert_called_once()
        revised_plan, lang = render.call_args.args[:2]
        self.assertEqual((lang, revised_plan["scenes"][0]["ja"]["readings"]), ("ja", readings))
        self.assertEqual(revised_plan["editorialReview"], review)
        detail = self.desk.case(case)
        self.assertEqual(detail["runs"][0]["plan"]["editorialReview"], review)
        self.assertEqual(detail["accepted"], {"ja": first, "en": first})
        self.assertEqual(detail["runs"][1], parent["runs"][0])
        self.assertEqual(set(detail["runs"][0]["editions"]), {"ja"})
        self.desk.review(case, dict(lang="ja", runId=child, reason="読みを確認"), "adopted")
        self.assertEqual(self.desk.case(case)["accepted"], {"ja": child, "en": first})

    def test_one_theme_can_have_two_episodes_and_distinct_rerun_briefs(self):
        first = self.create()
        other = self.desk.submit("/api/cases", {**self.request, "requestId": "2", "brief": "別の切り口"},
                                 self.snapshot, self.models)
        self.assertNotEqual(first["id"], other["id"])
        inputs = []
        def generate(snapshot, brief, model, folder):
            inputs.append(brief)
            return self.plan
        self.desk.process_next(generate, self.render)
        self.desk.process_next(generate, self.render)
        self.desk.submit("runs", dict(requestId="3", model="test", parent=first["runId"], reason="星の配置を強調"),
                         self.snapshot, self.models, first["id"])
        self.desk.process_next(generate, self.render)
        self.assertIn("星の配置を強調", inputs[-1])


if __name__ == "__main__":
    unittest.main()
