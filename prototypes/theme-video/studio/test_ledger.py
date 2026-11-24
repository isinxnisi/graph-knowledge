"""Regression coverage for revisions and interrupted bilingual runs (no model calls)."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import unittest

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
