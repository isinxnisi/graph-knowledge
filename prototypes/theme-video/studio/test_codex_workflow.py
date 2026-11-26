"""Exercise the job queue with a local substitute for the creative session."""
from copy import deepcopy
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock

from ledger import CODEX_FILM, Ledger
from server import Handler


class CodexWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.desk = Ledger(Path(self.enterContext(tempfile.TemporaryDirectory())))
        self.calls = []
        self.snapshot = {"themeId": "theme:radio", "revision": 2, "title": "携帯ラジオ",
                         "sources": [{"id": "s1", "title": "資料", "url": "https://example.org/radio"}], "records": []}
        self.models = lambda: [{"id": "fixture@ultra", "available": True}]

    def submit(self, key, case=None, **fields):
        data = {"requestId": key, "model": "fixture@ultra", **fields}
        if not case:
            data.update(themeId="theme:radio", revision=2)
        return self.desk.submit("runs" if case else "cases", data, lambda *_: self.snapshot, self.models, case)

    def author(self, snapshot, brief, model, folder, lang, *, draft, plan, parent_folder, parent_plan, progress):
        self.calls.append((lang, draft, model, brief, snapshot, parent_folder, deepcopy(plan)))
        progress("制作中")
        result = deepcopy(plan or parent_plan or {"productionMode": CODEX_FILM, "titles": {}, "scenes": [],
                                                  "sources": snapshot["sources"], "authorDraft": {}})
        result["titles"][lang] = lang + " radio"
        if draft:
            result["authorDraft"][lang] = lang + "\nダイヤルが動く。"
        else:
            out = folder / lang
            out.mkdir(exist_ok=True)
            (out / "video.mp4").write_bytes(lang.encode())
            (out / "subtitles.srt").write_text("", encoding="utf-8")
            (out / "timings.json").write_text("[]", encoding="utf-8")
        return result

    def work(self, produce=None):
        old_process = Mock(side_effect=AssertionError("legacy creative pipeline"))
        self.assertTrue(self.desk.process_next(old_process, old_process, produce=produce or self.author))
        old_process.assert_not_called()

    def run_view(self, case, run):
        return next(r for r in self.desk.case(case)["runs"] if r["id"] == run)

    def test_free_theme_default_one_session_and_source_review_into_new_run(self):
        result = self.submit("free")
        cid, rid = result["id"], result["runId"]
        self.work()
        self.assertEqual((self.calls[0][:3], len(self.calls)), (("ja", False, "fixture@ultra"), 1))
        self.assertFalse(self.calls[0][4]["selectedVideoIdea"])
        run = self.run_view(cid, rid)
        self.assertEqual((run["productionMode"], run["status"], run["langs"]), (CODEX_FILM, "done", ["ja"]))
        self.assertEqual(self.desk.media(cid, rid, "ja", "video.mp4").read_bytes(), b"ja")
        self.desk.review(cid, {"runId": rid, "lang": "ja", "reason": "入口の音を残したい"}, "adopted")
        child = self.submit("next", cid, parent=rid, language="ja", reason="絵をもっと面白く")["runId"]
        self.work()
        self.assertIn("絵をもっと面白く", self.calls[-1][3])
        self.assertEqual(self.calls[-1][4]["previousJapanese"]["reviews"][0]["reason"], "入口の音を残したい")
        self.assertEqual(self.calls[-1][5].name, rid)
        self.assertEqual(self.run_view(cid, child)["status"], "done")
        self.assertEqual(self.desk.case(cid)["accepted"]["ja"], rid)

    def test_draft_child_keeps_chosen_text_and_english_uses_selected_movie(self):
        result = self.submit("draft", scriptFirst=True)
        cid, rid = result["id"], result["runId"]
        self.work()
        original = self.run_view(cid, rid)
        self.assertEqual((original["status"], original["editions"]), ("script_ready", {}))
        edited = self.submit("revision", cid, parent=rid, lang="ja", reason="音の間を変更",
                             draftText="最初の音が消えてから話す。")["runId"]
        self.desk.resume(cid, edited)
        self.work()
        self.assertEqual(self.calls[-1][6]["authorDraft"]["ja"], "最初の音が消えてから話す。")
        self.assertEqual(self.run_view(cid, rid)["plan"]["authorDraft"]["ja"], "ja\nダイヤルが動く。")
        english = self.submit("en", cid, parent=edited, language="en", scriptFirst=True)["runId"]
        self.work()
        self.assertEqual(self.calls[-1][0], "en")
        self.assertEqual(self.calls[-1][5].name, edited)
        self.assertEqual(self.run_view(cid, english)["plan"]["japaneseMasterRunId"], edited)
        english_edit = self.submit("en-edit", cid, parent=english, lang="en", reason="Cadence",
                                   draftText="Let the dial stop.")["runId"]
        self.desk.resume(cid, english_edit)
        self.work()
        self.assertEqual(self.calls[-1][5].name, edited)
        self.assertEqual(self.calls[-1][6]["authorDraft"]["en"], "Let the dial stop.")
        with self.assertRaisesRegex(ValueError, "元の版を選んで"):
            self.submit("cue", cid, parent=edited, lang="ja", reason="読み", sceneId="ja1", narration="変更")

    def test_pinned_idea_and_bilingual_resume_use_already_finished_japanese(self):
        data = {"themeId": "theme:radio", "revision": 2, "model": "fixture@ultra", "requestId": "ideas"}
        self.desk.submit_ideas(data, lambda *_: self.snapshot, self.models)
        card = {"title": "耳を近づける", "opening": "人が近づく", "payoff": "音量で動きが変わる",
                "needs": "本体の写真", "sourceIds": ["s1"]}
        self.desk.work_ideas(lambda *_: [card])
        idea = self.desk.list_ideas("theme:radio")["items"][0]
        result = self.submit("chosen", ideaId=idea["id"], language="both")
        cid, rid = result["id"], result["runId"]
        def interrupt_english(*args, **kwargs):
            if args[4] == "en":
                raise RuntimeError("仮の英語停止")
            return self.author(*args, **kwargs)
        self.work(interrupt_english)
        self.assertTrue(self.calls[0][4]["selectedVideoIdea"])
        self.assertIn(card["payoff"], self.calls[0][3])
        before = self.run_view(cid, rid)
        self.assertEqual((before["status"], set(before["editions"])), ("failed", {"ja"}))
        self.desk.resume(cid, rid)
        self.work()
        self.assertEqual([c[0] for c in self.calls], ["ja", "en"])
        self.assertEqual(self.calls[-1][5].name, rid)
        self.assertEqual(set(self.run_view(cid, rid)["editions"]), {"ja", "en"})

    def test_browser_can_save_a_long_japanese_draft_to_a_separate_trial(self):
        result = self.submit("draft-http", scriptFirst=True)
        cid, rid = result["id"], result["runId"]
        self.work()
        saved_text = "ラジオのつまみに手をかける。" * 1300
        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            server.ledger = self.desk
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            client = HTTPConnection(*server.server_address, timeout=10)
            try:
                body = json.dumps(dict(requestId="edited-http", model="fixture@ultra", parent=rid, lang="ja",
                                       reason="台本の手直し", draftText=saved_text), ensure_ascii=False).encode()
                self.assertGreater(len(body), 32768)
                client.request("POST", f"/api/cases/{cid}/runs", body, {"Content-Type": "application/json"})
                response = client.getresponse()
                self.assertEqual(response.status, 201)
                child = json.loads(response.read())["runId"]
                client.request("GET", f"/api/cases/{cid}")
                detail = json.loads(client.getresponse().read())
                edited = next(r for r in detail["runs"] if r["id"] == child)
                self.assertEqual((edited["plan"]["authorDraft"]["ja"], edited["status"]), (saved_text, "script_ready"))
                self.assertNotEqual(next(r for r in detail["runs"] if r["id"] == rid)["plan"], edited["plan"])
                author = self.desk.folder / "cases" / cid / rid / "author"
                author.mkdir()
                commission = {"model": "fixture", "effort": "ultra", "brief": "番組メモ", "prompt": "依頼した文",
                              "request": {"mode": "theme", "operatorRequest": "最初のひと呼吸を残す"}}
                (author / "ja-draft-commission.json").write_text(json.dumps(commission), encoding="utf-8")
                client.request("GET", f"/api/cases/{cid}")
                old = next(r for r in json.loads(client.getresponse().read())["runs"] if r["id"] == rid)
                self.assertEqual(old["authorCommissions"], [{"lang": "ja", "stage": "draft"}])
                self.assertNotIn("番組メモ", str(old))
                commission_url = f"/api/cases/{cid}/runs/{rid}/commissions/ja/draft"
                client.request("GET", commission_url)
                self.assertEqual(json.loads(client.getresponse().read()), commission)
                commission["identity"] = "絵、語り、音にチャンネル共通の空気を通す。"
                (author / "ja-draft-commission.json").write_text(json.dumps(commission), encoding="utf-8")
                client.request("GET", commission_url)
                self.assertEqual(json.loads(client.getresponse().read())["identity"], commission["identity"])
                for wrong in (commission_url.replace(cid, "0" * 32), commission_url.replace(rid, child),
                              commission_url.replace("/ja/", "/en/"), commission_url.replace("/draft", "/film")):
                    client.request("GET", wrong)
                    reply = client.getresponse()
                    self.assertEqual(reply.status, 404)
                    reply.read()
            finally:
                client.close()
                server.shutdown()
                thread.join()
