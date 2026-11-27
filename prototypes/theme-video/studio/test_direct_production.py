import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

import numpy as np

from author_voice import voice_service
import direct_production as production
from ledger import Ledger


class DirectProductionTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.snap = {"themeId": "theme:paper", "revision": 4, "title": "一枚の紙",
                     "description": "", "records": [], "sources": [{"id": "ref-1", "title": "紙",
                     "url": "https://example.org/paper"}]}
        self.enterContext(patch("direct_production._selected_model", return_value=("fixture", "high")))

    def test_client_can_request_spoken_reading_and_measure_wav(self):
        shutil.copyfile(production.ROOT / "author_say.py", self.root / "say.py")
        with patch("media._voice", return_value=("fixture", None)), patch("media._speech",
                  return_value=np.zeros(12000, dtype="<i2")) as voice, voice_service(self.root):
            report = json.loads(subprocess.check_output([sys.executable, "say.py", "ja", "いちにち"],
                                                        cwd=self.root, timeout=15))
            voice.assert_called_once_with("いちにち", "ja", "fixture", None)
            self.assertEqual(report["seconds"], .5)
            self.assertEqual(report["credit"], "VOICEVOX:青山龍星")
            with wave.open(str(self.root / report["wav"]), "rb") as wav:
                self.assertEqual(wav.getframerate(), 24000)

    def test_direct_job_checks_its_own_cli_catalog(self):
        desk = Ledger(self.root)
        model = "gpt-6.2-sol@ultra"
        request = {"themeId": self.snap["themeId"], "revision": 4, "model": model, "requestId": "create"}
        catalogs = {"author_models_fn": lambda: [{"id": model, "available": True}]}
        snapshot = lambda *_: self.snap
        with self.assertRaisesRegex(ValueError, "選択したモデル"):
            desk.submit("cases", {**request, "productionMode": "boards-v1"}, snapshot, list, **catalogs)
        job = desk.submit("cases", request, snapshot, list, **catalogs)
        self.assertEqual(desk.case(job["id"])["runs"][0]["model"], model)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
    def test_default_job_imports_authored_movie_without_a_script_or_review_stage(self):
        desk = Ledger(self.root)
        job = desk.submit("cases", {"themeId": self.snap["themeId"], "revision": 4, "model": "fixture",
                          "requestId": "create"}, lambda *_: self.snap, lambda: [{"id": "fixture", "available": True}])
        requests = []

        def author(work, prompt, model, effort, progress):
            requests.append(prompt)
            self.assertEqual((model, effort), ("fixture", "high"))
            self.assertTrue((work / "references/goddard.mp4").is_file())
            self.assertTrue((work / "inputs/theme.json").is_file())
            (work / "project/animation.txt").write_text("original artwork", encoding="utf-8")
            out = work / "output"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                            "-i", "testsrc2=size=160x90:rate=24", "-f", "lavfi", "-i", "sine=frequency=440",
                            "-t", "0.75", "-c:v", "libx264", "-c:a", "aac", str(out / "video.mp4")], check=True)
            (out / "subtitles.srt").write_text("1\n00:00:00,125 --> 00:00:00,650\n紙。\n", encoding="utf-8")
            (out / "sources.json").write_text('["ref-1"]', encoding="utf-8")
            return {"output_tokens": 0}

        def unexpected(*args, **kwargs):
            self.fail("旧制作工程が呼ばれました")

        with patch("direct_runtime.run_author", side_effect=author):
            self.assertTrue(desk.process_next(unexpected, unexpected, produce=production.produce))
        run = desk.case(job["id"])["runs"][0]
        self.assertEqual(run["status"], "done", run["error"])
        self.assertEqual(len(requests), 1)
        self.assertEqual(run["plan"]["titles"]["ja"], self.snap["title"])
        self.assertEqual(run["plan"]["scenes"][0]["ja"]["narration"], "紙。")
        self.assertEqual(run["plan"]["sources"], self.snap["sources"])
        self.assertEqual(run["editions"]["ja"]["timings"][0]["start"], .125)
        self.assertTrue(desk.media(job["id"], job["runId"], "ja", "video.mp4").is_file())

    def test_failed_delivery_resumes_its_workspace_and_successful_import_is_idempotent(self):
        args = (self.snap, "", "fixture", self.root, "ja")
        kwargs = dict(draft=True, plan=None, parent_folder=None, parent_plan=None, progress=lambda _: None)

        def writer(work, prompt, *_):
            self.assertIn("前回の納品", prompt)
            self.assertTrue((work / "project/notes.md").is_file())
            (work / "output/draft.md").write_text("ここで一拍待つ。", encoding="utf-8")
            return {}

        def interrupted(work, *_):
            guide = (work / "TOOLS.md").read_text(encoding="utf-8")
            self.assertIn("collaboration.spawn_agent", guide)
            self.assertIn("fetch_reference.py", guide)
            (work / "project/notes.md").write_text("途中稿", encoding="utf-8")
            return {}
        with patch("direct_runtime.run_author", side_effect=interrupted), self.assertRaisesRegex(ValueError, "draft.md"):
            production.produce(*args, **kwargs)
        with patch("direct_runtime.run_author", side_effect=writer) as finish:
            plan = production.produce(*args, **kwargs)
            self.assertEqual(plan, production.produce(*args, **kwargs))
            self.assertEqual(finish.call_count, 1)
            self.assertEqual(plan["authorDraft"]["ja"], "ここで一拍待つ。")

    def test_import_rejects_link_in_an_authored_project(self):
        outside = self.root / "private.txt"
        outside.write_text("host")
        work = self.root / "workspace"
        work.mkdir()
        target = work / "paint.dat"
        target.hardlink_to(outside)
        with self.assertRaisesRegex(ValueError, "通常のファイル"):
            production.copy_project(work, work, self.root / "next")


if __name__ == "__main__":
    unittest.main()
