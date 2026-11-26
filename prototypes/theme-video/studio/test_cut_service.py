"""Preview a retained Japanese cut through the same HTTP endpoints used by the desk."""
from contextlib import closing
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import numpy as np

from film_checkpoint import read_saved_cut, save_cut
from ledger import Ledger
from server import Handler
from test_authored_media import film


class CutServiceTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.desk = Ledger(Path(tmp.name))
        ids = self.desk.submit("new", {"themeId": "example", "revision": 3, "language": "ja",
            "model": "test", "requestId": "trial", "productionMode": "directed-film-v1"},
            lambda theme, rev: {"themeId": theme, "revision": rev, "title": "紙"},
            lambda: [{"id": "test", "available": True}])
        self.case, self.run = ids["id"], ids["runId"]
        self.folder = self.desk.folder / "cases" / self.case / self.run
        self.folder.mkdir(parents=True, exist_ok=True)
        with self.desk.db() as db:
            db.execute("UPDATE runs SET status='needs_revision',error=? WHERE id=?", (
                "原画を修正して試写しましたが、予定した発見が届いていません。s2 札の字が指に重なっています。", self.run))
        self.plan = {"titles": {"ja": "指と札"}, "scenes": [{"id": "s1", "ja": {"heading": "", "narration": ""}},
                      {"id": "s2", "ja": {"heading": "札", "narration": "指が離れます。"}}]}
        self.save()
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.ledger, server.access, server.preview_slot = self.desk, None, threading.Lock()
        self.port = server.server_port
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": .05}, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.url = f"/api/cases/{self.case}/runs/{self.run}/cut"

    def save(self):
        save_cut(self.folder, {}, "test", "high", None, plan=self.plan, direction_hash="test", seen=[],
                 review={"repairs": [{"sceneId": "s2", "reason": "札の字が指に重なっています。"}]}, history=[], usage={})

    def fetch(self, method, path, data=None, **headers):
        with closing(HTTPConnection("127.0.0.1", self.port, timeout=10)) as client:
            body = None if data is None else json.dumps(data).encode()
            if body:
                headers["Content-Type"] = "application/json"
            client.request(method, path, body=body, headers=headers)
            res = client.getresponse()
            return res.status, dict(res.getheaders()), res.read()

    def test_open_then_play_one_excerpt_without_retrying_or_replacing_the_run(self):
        def render(folder, plan, index):
            self.assertEqual((folder, index, plan), (self.folder, 1, self.plan))
            clip = folder / "cut-previews" / ("a" * 64 + ".mp4")
            clip.parent.mkdir()
            clip.write_bytes(b"0123456789")
            return clip
        with patch("film_checkpoint.read_saved_cut", wraps=read_saved_cut) as restore, \
                patch("film_preview.render_excerpt", side_effect=render) as encode:
            state, = self.desk.case(self.case)["runs"]
            self.assertTrue(state["cutAvailable"])
            self.assertIn("場面2　札の字が指に重なっています。", state["stopReport"]["reason"])
            restore.assert_not_called()
            status, _, raw = self.fetch("GET", self.url)
            self.assertEqual(status, 200)
            cut = json.loads(raw)
            self.assertEqual(cut["scenes"][1]["issue"], "札の字が指に重なっています。")
            encode.assert_not_called()
            status, _, raw = self.fetch("POST", self.url + "/excerpts", {"sceneId": "s2", "cutId": cut["cutId"]})
            self.assertEqual(status, 200)
            media = json.loads(raw)["video"]
            self.assertEqual(restore.call_count, 1)
            self.assertEqual(encode.call_count, 1)
            status, headers, part = self.fetch("GET", media, Range="bytes=2-5")
            self.assertEqual((status, headers["Content-Range"], part), (206, "bytes 2-5/10", b"2345"))
            self.assertEqual(self.fetch("HEAD", media)[2], b"")
            self.assertEqual(self.desk.case(self.case)["runs"][0]["status"], "needs_revision")
            other = "b" * 32
            self.assertEqual(self.fetch("GET", media.replace(self.case, other))[0], 404)
            self.assertEqual(self.fetch("GET", self.url.replace(self.case, other))[0], 404)

    def test_newer_cut_wrong_scene_and_running_state_do_not_render(self):
        cut = self.desk.cut_index(self.case, self.run)
        self.plan["scenes"][1]["ja"]["heading"] = "違う稿"
        self.save()
        with patch("film_preview.render_excerpt") as encode:
            self.assertEqual(self.fetch("POST", self.url + "/excerpts", {"sceneId": "s2", "cutId": cut["cutId"]})[0], 400)
            newer = self.desk.cut_index(self.case, self.run)
            self.assertNotEqual(cut["cutId"], newer["cutId"])
            self.assertEqual(self.fetch("POST", self.url + "/excerpts", {"sceneId": "other", "cutId": newer["cutId"]})[0], 400)
            with self.desk.db() as db:
                db.execute("UPDATE runs SET status='running',error=NULL WHERE id=?", (self.run,))
            self.assertEqual(self.fetch("GET", self.url)[0], 400)
            self.assertNotIn("cutAvailable", self.desk.case(self.case)["runs"][0])
            encode.assert_not_called()

    def test_editing_a_script_previews_the_childs_own_art_speech_and_timing_before_render(self):
        plan = film()
        first = plan["scenes"][0]
        first["id"] = "s2"  # The old checkpoint has a pending issue for this ID.
        plan["filmReview"] = {"rounds": 2}
        with self.desk.db() as db:
            db.execute("UPDATE runs SET status='script_ready',error=NULL,plan=? WHERE id=?", (json.dumps(plan), self.run))
        parent = self.desk.cut_index(self.case, self.run)
        self.assertTrue(parent["reviewed"])
        runs_url = f"/api/cases/{self.case}/runs"
        line = "紙の端を見ます。"
        status, _, raw = self.fetch("POST", runs_url, {"parent": self.run, "lang": "ja", "sceneId": "s2", "model": "test",
            "requestId": "edit", "reason": "読みと間を調整", "narration": line, "readings": [{"text": "端", "kana": "ハシ"}],
            "visualTiming": {"beforeVoice": .5, "afterVoice": .25}})
        self.assertEqual(status, 201, raw)
        child = json.loads(raw)["runId"]
        child_folder = self.folder.parent / child
        self.assertFalse(child_folder.exists())
        view = self.desk.case(self.case)["runs"][0]
        self.assertEqual((view["id"], view["status"], view["cutAvailable"]), (child, "script_ready", True))
        self.assertNotIn("art", view["plan"]["scenes"][0])  # Only the public summary is stripped.
        url = f"{runs_url}/{child}/cut"
        status, _, raw = self.fetch("GET", url)
        cut = json.loads(raw)
        self.assertEqual(status, 200)
        self.assertFalse(cut["reviewed"])
        self.assertNotEqual(parent["cutId"], cut["cutId"])
        self.assertEqual((cut["scenes"][0]["narration"], cut["scenes"][0]["issue"]), (line, ""))

        def encode(work, draft, lang, voice, cuts, progress, *, frame_range):
            shot = draft["scenes"][0]
            self.assertEqual((shot["art"], shot["leadSeconds"], shot["tailSeconds"]), (first["art"], .5, .25))
            self.assertIn("00:00:00,500 -->", (work / "subtitles.srt").read_text(encoding="utf-8"))
            self.assertIn(line, (work / "subtitles.srt").read_text(encoding="utf-8"))
            (work / "video.mp4").write_bytes(b"child excerpt")

        with patch("film_checkpoint.read_saved_cut", side_effect=AssertionError("unexpected parent restore")), \
                patch("media._voice", return_value=("fixture", None)), patch("media._speech", return_value=np.zeros(3000, dtype='<i2')) as speech, \
                patch("film_preview._encode", side_effect=encode) as encoder:
            self.assertEqual(self.fetch("POST", url + "/excerpts", {"cutId": parent["cutId"], "sceneId": "s2"})[0], 400)
            status, _, raw = self.fetch("POST", url + "/excerpts", {"cutId": cut["cutId"], "sceneId": "s2"})
            self.assertEqual(status, 200, raw)
            self.assertIn("ハシ", speech.call_args.args[0])
            encoder.assert_called_once()
            self.assertEqual(self.fetch("GET", json.loads(raw)["video"])[2], b"child excerpt")
        self.assertEqual(self.desk.case(self.case)["runs"][0]["status"], "script_ready")


if __name__ == "__main__":
    unittest.main()
