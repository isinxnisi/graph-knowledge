"""Exercise the normal Studio queue against a private ledger and deterministic model replies."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image

import editor
import film_direction
import media
from ledger import Ledger
from test_film_direction import SNAP, polygon, setup_direction


class DirectedWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.desk = Ledger(self.folder)
        self.enterContext(patch.object(editor, "_selected_model", return_value=("fixture", "high")))

    def submit(self, key, *, case=None, **fields):
        data = {"requestId": key, "model": "fixture", "productionMode": editor.DIRECTED_FILM, **fields}
        if "lang" not in data:
            data.setdefault("language", "ja")
        if not case:
            data.update(themeId=SNAP["themeId"], revision=1)
        return self.desk.submit("runs" if case else "cases", data, lambda theme, rev: {**SNAP, "revision": rev},
                                lambda: [{"id": "fixture", "available": True}], case)

    def get_run(self, case, run):
        return next(item for item in self.desk.case(case)["runs"] if item["id"] == run)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is needed for real editions")
    def test_new_japanese_script_resume_and_english_edition_share_art_and_silence(self):
        def writer(request):
            data = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            return setup_direction(), {}

        def viewer(request, image):
            data = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            if "scene" in data:
                return polygon("#48666d"), {}
            if "cut" in data:
                return {"materialRequest": "", "repairs": [], "focusVerdict": {
                    "result": "clear", "basis": "青い角の移動が見える。", "observation": 1}}, {}
            return {"observations": [{"sceneId": sid, "seen": "紙の角が重なった。"}
                                     for sid in data["sceneIds"]], "focusSignals": [
                                        {"kind": "travel", "trace": "A・B・Cの順で角が右へ動いた。"}]}, {}

        def adapt(request):
            data = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(data["scenes"][1]["silentSeconds"], 2.5)
            self.assertTrue(data["scenes"][1]["picture"])
            self.assertNotIn("art", data["scenes"][1])
            return {"title": "A corner of paper", "scenes": [
                {"id": "s1", "heading": "", "narration": "Watch the corner."},
                {"id": "s2", "heading": "", "narration": ""}]}, {}

        guide = self.folder / "guide.jpg"
        Image.new("RGB", (128, 72), "#ded5c8").save(guide)
        self.enterContext(patch.object(film_direction, "style_reference", return_value=guide))
        self.enterContext(patch.object(film_direction, "view_cut", side_effect=viewer))
        director = self.enterContext(patch.object(film_direction, "_call_writer", side_effect=writer))
        translator = self.enterContext(patch.object(editor, "_call_writer", side_effect=adapt))
        self.enterContext(patch.object(media, "_voice", return_value=("fixture", None)))
        speech = self.enterContext(patch.object(media, "_speech", return_value=np.zeros(media.RATE // 4, dtype="<i2")))
        linux_font = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        if linux_font.is_file():
            from PIL import ImageFont
            for lang in ("ja", "en"):
                self.enterContext(patch.object(media._style(lang), "font",
                                              side_effect=lambda family, size: ImageFont.truetype(str(linux_font), size)))

        created = self.submit("new", scriptFirst=True)
        case, master = created["id"], created["runId"]
        self.desk.process_next(editor.generate_plan, media.render_edition)
        planned = self.get_run(case, master)
        self.assertEqual(planned["status"], "script_ready", planned["error"])
        self.assertEqual(planned["productionMode"], film_direction.MODE)
        self.assertEqual(planned["plan"]["scenes"][1]["ja"]["narration"], "")
        self.assertNotIn("art", planned["plan"]["scenes"][1])
        self.assertEqual(planned["storyboard"], f"/media/{case}/{master}/ja/storyboard.jpg")
        with Image.open(self.desk.media(case, master, "ja", "storyboard.jpg")) as board:
            self.assertEqual(board.format, "JPEG")
        speech.assert_not_called()
        translator.assert_not_called()

        self.desk = Ledger(self.folder)
        self.desk.resume(case, master)
        self.desk.process_next(editor.generate_plan, media.render_edition)
        japanese = self.get_run(case, master)
        self.assertEqual(japanese["status"], "done", japanese["error"])
        director_calls = director.call_count
        english_id = self.submit("english", case=case, language="en", parent=master)["runId"]
        self.desk.process_next(editor.generate_plan, media.render_edition)
        english = self.get_run(case, english_id)
        self.assertEqual(english["status"], "done", english["error"])
        self.assertEqual(english["plan"]["japaneseMasterRunId"], master)
        self.assertEqual(director.call_count, director_calls)
        translator.assert_called_once()
        self.assertEqual(speech.call_count, 2)
        self.assertEqual(english["plan"]["scenes"][1]["en"]["narration"], "")
        with self.desk.db() as db:
            plans = [json.loads(db.execute("SELECT plan FROM runs WHERE id=?", (run,)).fetchone()[0])
                     for run in (master, english_id)]
        for src, translated in zip(*(plan["scenes"] for plan in plans)):
            for key in ("art", "sound", "soundLayers", "silentSeconds"):
                self.assertEqual(src[key], translated[key])
        for run, lang, line in ((japanese, "ja", "紙の角を見てください。"), (english, "en", "Watch the corner.")):
            edition = run["editions"][lang]
            prefix = f"/media/{case}/{run['id']}/{lang}/"
            self.assertEqual(edition["contactSheet"], prefix + "contact-sheet.png")
            with Image.open(self.desk.media(case, run["id"], lang, "contact-sheet.png")) as sheet:
                self.assertEqual(sheet.format, "PNG")
            subtitles = self.desk.media(case, run["id"], lang, "subtitles.srt").read_text(encoding="utf-8")
            self.assertEqual(subtitles.count("-->"), 1)
            self.assertIn(line, subtitles)
            self.assertEqual(edition["timings"][1]["speech"], [])

    def test_old_interrupted_run_migrates_and_resumes_on_old_writer(self):
        created = self.submit("old", scriptFirst=True)
        case, run = created["id"], created["runId"]
        self.desk.pause(case, run)
        with self.desk.db() as db:
            # Reproduce the pre-directed schema including a trial without a saved plan.
            db.execute("ALTER TABLE runs DROP COLUMN production_mode")
        self.desk = Ledger(self.folder)
        self.assertEqual(self.get_run(case, run)["productionMode"], "boards-v1")
        self.desk.resume(case, run)
        old_plan = {"titles": {"ja": "旧稿"}, "sources": SNAP["sources"], "scenes": [
            {"id": "s1", "asset": "source", "ja": {"heading": "", "narration": "紙の記録です。"}}]}
        with patch.object(film_direction, "direct_film") as director, \
                patch("script_review.produce_japanese", return_value=old_plan) as legacy:
            self.desk.process_next(editor.generate_plan, media.render_edition)
            saved = self.get_run(case, run)
            self.assertEqual(saved["status"], "script_ready", saved["error"])
            self.assertEqual(saved["plan"], old_plan)
            self.assertNotIn("storyboard", saved)
            legacy.assert_called_once()
            director.assert_not_called()

    def test_bilingual_draft_adapts_only_changed_japanese_dialogue_before_render(self):
        master = film_direction.check_direction(setup_direction(), {"ref-1"})
        master.update(themeId=SNAP["themeId"], productionMode=film_direction.MODE, sources=SNAP["sources"])
        master["titles"]["en"] = "An edited title"
        for shot, line in zip(master["scenes"], ("Watch the corner.", "")):
            shot.update(en={"heading": "", "narration": line}, art=polygon("#48666d"))
        master["scenes"].append({**master["scenes"][0], "id": "s3", "en": {"heading": "", "narration": "My ending."}})
        labels = [{"ja": "紙の端", "en": "Margin", "x": 350, "y": 250, "size": 40, "color": "#213442"}]
        master["scenes"][0]["labels"] = labels
        created = self.submit("both scripts", language="both", scriptFirst=True)
        case, original = created["id"], created["runId"]
        render = Mock()
        self.desk.process_next(Mock(return_value=master), render)
        edit = {"case": case, "parent": original, "lang": "ja", "sceneId": "s1", "reason": "調整"}
        same_line = master["scenes"][0]["ja"]["narration"]
        readings = [{"text": "角", "kana": "かど"}]
        timing = self.submit("rhythm", **edit, narration=same_line, readings=readings,
                             visualTiming={"beforeVoice": .25, "afterVoice": .5})["runId"]
        saved = self.get_run(case, timing)
        self.assertEqual(saved["status"], "script_ready")
        self.assertFalse(self.desk.process_next(Mock(), render))
        self.assertEqual(saved["plan"]["scenes"][0]["en"]["narration"], "Watch the corner.")
        render.assert_not_called()

        def render_captions(plan, lang, folder, progress):
            line = plan["scenes"][0][lang]["narration"]
            (folder / "video.mp4").write_bytes(line.encode())
            (folder / "subtitles.srt").write_text(line, encoding="utf-8")
            (folder / "timings.json").write_text("[]", encoding="utf-8")

        self.desk.resume(case, timing)
        forbidden = Mock(side_effect=AssertionError("timing edit unexpectedly invoked a model"))
        self.desk.process_next(forbidden, render_captions)
        self.assertEqual(self.get_run(case, timing)["status"], "done")
        forbidden.assert_not_called()

        revised_line = "紙の端を見てください。"
        changed = self.submit("change dialogue", **edit, narration=revised_line)["runId"]
        queued = self.get_run(case, changed)
        self.assertEqual(queued["status"], "queued")
        self.assertNotIn("en", queued["plan"]["scenes"][0])
        self.desk = Ledger(self.folder)
        def english_writer(request):
            payload = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(payload["scenes"][0]["narration"], revised_line)
            return {"title": "New title", "scenes": [
                {"id": "s1", "heading": "", "narration": "Watch the edge.",
                 "labels": [{"ja": "紙の端", "en": "Edge"}]},
                {"id": "s2", "heading": "", "narration": "", "labels": []},
                {"id": "s3", "heading": "", "narration": "A new ending.", "labels": []}]}, {}
        with patch.object(editor, "_call_writer", side_effect=english_writer) as translator, \
                patch.object(film_direction, "direct_film") as director:
            self.desk.process_next(editor.generate_plan, render)
            revised = self.get_run(case, changed)
            self.assertEqual(revised["status"], "script_ready", revised["error"])
            self.assertEqual([s["en"]["narration"] for s in revised["plan"]["scenes"]],
                             ["Watch the edge.", "", "My ending."])
            self.assertEqual(revised["plan"]["titles"]["en"], "An edited title")
            self.assertEqual(revised["plan"]["scenes"][0]["labels"], labels)
            self.desk.resume(case, changed)
            self.desk.process_next(editor.generate_plan, render_captions)
            translator.assert_called_once()
            director.assert_not_called()
        self.assertEqual(self.get_run(case, changed)["status"], "done")
        self.assertEqual(self.desk.media(case, changed, "en", "subtitles.srt").read_text(encoding="utf-8"), "Watch the edge.")
        self.assertEqual(self.desk.media(case, timing, "en", "video.mp4").read_bytes(), b"Watch the corner.")
        self.assertEqual(self.get_run(case, original)["plan"]["scenes"][0]["ja"]["narration"], same_line)


if __name__ == "__main__":
    unittest.main()
