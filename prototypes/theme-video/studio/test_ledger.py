"""Regression coverage for revisions and interrupted bilingual runs (no model calls)."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from editor import MaterialRequired
from ledger import Ledger
from writer_feedback import RevisionNeeded


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

    def test_revision_can_resume_same_run_after_restart(self):
        self.request.update(language="ja", scriptFirst=True)
        case = self.create()
        generate = Mock(side_effect=[RevisionNeeded("第8場面の読みを確認してください。"), self.plan])
        render = Mock()
        self.desk.process_next(generate, render)
        self.desk = Ledger(self.data)
        saved = self.desk.case(case["id"])["runs"][0]
        self.assertEqual((saved["status"], saved["error"]), ("needs_revision", "第8場面の読みを確認してください。"))
        self.assertEqual(self.desk.list_cases()[0]["states"]["ja"], "要改稿")
        self.desk.resume(case["id"], case["runId"])
        self.desk.process_next(generate, render)
        current, = self.desk.case(case["id"])["runs"]
        self.assertEqual((current["id"], current["status"], current["error"]), (case["runId"], "script_ready", None))
        render.assert_not_called()

    def test_material_wait_and_verified_sources_remain_with_the_same_run(self):
        self.request.update(language="ja", scriptFirst=True)
        case = self.create()
        message = "追加資料が必要です。場面転換の方向を確認してください。"
        run_dir = self.data / "cases" / case["id"] / case["runId"]
        record = run_dir / "material-research.json"
        round_one = {"status": "done", "need": "作中の場面転換の例", "sources": [
            {"title": "記録", "url": "https://example.org/film", "locator": "第3章", "excerpt": "a wipe",
             "note": "切り替えが始まる位置を確認できる"}], "remaining": "移動方向を調べる"}
        generation = Mock(side_effect=[MaterialRequired(message), self.plan])
        render = Mock()
        self.desk.process_next(generation, render)
        record.write_text(json.dumps({"rounds": [round_one]}), encoding="utf-8")
        self.desk = Ledger(self.data)
        detail = self.desk.case(case["id"])
        saved, = detail["runs"]
        self.assertEqual((saved["status"], saved["error"], detail["states"]["ja"]), ("needs_material", message, "資料待ち"))
        self.assertEqual(saved["materialResearch"], {"rounds": [round_one]})
        self.assertEqual(self.desk.list_cases()[0]["states"]["ja"], "資料待ち")
        self.desk.resume(case["id"], case["runId"])
        self.desk.process_next(generation, render)
        revised, = self.desk.case(case["id"])["runs"]
        self.assertEqual((revised["id"], revised["status"], revised["error"]), (case["runId"], "script_ready", None))
        self.assertEqual(revised["materialResearch"]["rounds"], [round_one])
        render.assert_not_called()
        for damaged in ("{", '{"rounds":[null]}'):
            record.write_text(damaged, encoding="utf-8")
            report = self.desk.case(case["id"])["runs"][0]["materialResearch"]
            self.assertEqual(report["rounds"], [])
            self.assertIn("読み込めません", report["error"])

    def test_only_legacy_material_errors_display_as_waiting_and_can_resume(self):
        self.request.update(language="ja", scriptFirst=True)
        case = self.create()
        for reason, status in (("追加資料が必要です。初出誌の出典", "needs_material"),
                               ("別のエラーに含まれた「追加資料が必要です。」", "failed")):
            with self.desk.db() as db:
                db.execute("UPDATE runs SET status='failed',error=? WHERE id=?", (reason, case["runId"]))
            self.desk = Ledger(self.data)
            saved, = self.desk.case(case["id"])["runs"]
            self.assertEqual((saved["status"], saved["error"], saved["materialResearch"]), (status, reason, None))
            with self.desk.db() as db:
                self.assertEqual(db.execute("SELECT status FROM runs WHERE id=?", (case["runId"],)).fetchone()[0], "failed")
            self.desk.resume(case["id"], case["runId"])
            self.assertEqual(self.desk.case(case["id"])["runs"][0]["status"], "queued")

    def test_editorial_alternative_starts_once_with_frozen_brief_and_sources(self):
        self.request.update(language="ja", scriptFirst=True)
        case = self.create()
        cid, source = case["id"], case["runId"]
        folder = self.data / "cases" / cid / source
        self.desk.process_next(Mock(side_effect=MaterialRequired("特定の場面は未確認")), self.render)
        proposal = {"title": "目の前で切り替える", "brief": "一枚の自作図で仕組みを試す", "reason": "両作の場面の直接比較を外す"}
        proposal_file = folder / "editorial-alternative.json"
        proposal_file.write_text(json.dumps(proposal))
        confirmed = {"status": "done", "need": "元案の調査", "remaining": "向きは未確認", "sources": [
            {"title": "原文", "url": "https://example.org/film", "locator": "概要", "excerpt": "wipe", "note": "技法の説明"}]}
        report_file = folder / "material-research.json"
        report_file.write_text(json.dumps({"rounds": [confirmed, {"status": "error", "sources": []}]}))
        key = self.desk.case(cid)["runs"][0]["editorialAlternative"]["fingerprint"]
        with self.assertRaises(ValueError):
            self.desk.start_alternative(cid, source, "outdated")
        with self.assertRaises(KeyError):
            self.desk.start_alternative("another", source, key)
        with ThreadPoolExecutor(max_workers=3) as threads:
            results = list(threads.map(lambda _: self.desk.start_alternative(cid, source, key), range(3)))
        new_run = results[0]["runId"]
        self.assertEqual(results, [{"id": cid, "runId": new_run}] * 3)
        chosen, retained = self.desk.case(cid)["runs"]
        self.assertEqual((chosen["parent"], chosen["model"], chosen["langs"]), (source, self.request["model"], ["ja"]))
        self.assertEqual((retained["id"], retained["status"], retained["editorialAlternative"]["startedRunId"]),
                         (source, "needs_material", new_run))
        self.assertEqual(retained["materialResearch"]["rounds"][0], confirmed)
        self.assertIn("すでに選択済み", retained["stopReport"]["next"])
        self.assertIsNone(chosen["stopReport"])
        self.assertEqual(self.desk.case(cid)["brief"], self.request["brief"])

        proposal_file.unlink()
        report_file.unlink()
        self.desk = Ledger(self.data)
        self.assertEqual(self.desk.start_alternative(cid, source, key)["runId"], new_run)
        write, render = Mock(return_value=deepcopy(self.plan)), Mock()
        self.desk.process_next(write, render)
        payload = write.call_args
        self.assertIn(proposal["brief"], payload.args[1])
        self.assertNotIn(self.request["brief"], payload.args[1])
        self.assertEqual(payload.kwargs["language"], "ja")
        self.assertNotIn("previous_japanese", payload.kwargs)
        research = json.loads((payload.args[3] / "material-research.json").read_text())
        self.assertEqual(research["inheritedFromRun"], source)
        self.assertEqual(research["rounds"], [{**confirmed, "inheritedFromRun": source}])
        self.assertEqual(self.desk.case(cid)["runs"][0]["status"], "script_ready")
        self.assertEqual(self.desk.case(cid)["runs"][0]["stopReport"]["concept"], proposal["title"])
        self.assertEqual(self.desk.case(cid)["title"], "試験用テーマ")
        self.assertEqual(self.desk.list_cases()[0]["title"], "試験用テーマ")
        render.assert_not_called()

        self.desk.resume(cid, new_run)
        self.desk.process_next(write, self.render)
        self.desk.submit("runs", dict(requestId="english", parent=new_run, model="test", language="en"),
                         self.snapshot, self.models, cid)
        self.desk.process_next(write, self.render)
        english = self.desk.case(cid)["runs"][0]
        self.assertEqual(english["plan"]["japaneseMasterRunId"], new_run)
        self.assertEqual(english["chosenAlternative"]["sourceRunId"], source)
        self.assertEqual(english["chosenAlternative"]["brief"], proposal["brief"])
        self.assertNotIn(self.request["brief"], write.call_args.args[1])

    def test_material_stop_explains_the_current_decision_and_supports_an_old_report(self):
        self.request.update(language="ja", brief="仮題　入れ替わる絵\n見終えたときの発見　境目の動きに気づく。")
        case = self.create()
        cid, run = case["id"], case["runId"]
        folder = self.data / "cases" / cid / run
        self.desk.process_next(Mock(side_effect=MaterialRequired("向きの記録が必要")), self.render)
        decision = {"outcome": "wait", "reason": "向きの記録が必要", "blockingPoint": "切り替わる方向を確かめられません。",
                    "viewerImpact": "どこから次の絵が現れたのか、比較できません。"}
        path = folder / "editorial-decision.json"
        def report():
            return self.desk.case(cid)["runs"][0]["stopReport"]
        def save_decision():
            path.write_text(json.dumps({"decision": decision}), encoding="utf-8")
        save_decision()
        self.assertEqual((report()["theme"], report()["concept"]), ("試験用テーマ", "入れ替わる絵"))
        self.assertEqual((report()["reason"], report()["impact"]), (decision["blockingPoint"], decision["viewerImpact"]))
        self.assertIn("追加調査して再開", report()["next"])
        self.assertNotIn("台本をもとに", report()["next"])
        decision.update(viewerImpact="")
        save_decision()
        self.assertEqual(report()["impact"], "")
        del decision["viewerImpact"], decision["blockingPoint"]
        save_decision()
        self.assertIn("この発見を映像で伝えるには", report()["impact"])
        self.assertIn("境目の動きに気づく", report()["impact"])
        decision.update(reason="過去の別の停止理由", viewerImpact="過去の影響")
        save_decision()
        self.assertEqual(report()["impact"], "")
        self.assertIn("向きの記録", report()["reason"])
        path.write_text("broken", encoding="utf-8")
        self.assertEqual(report()["impact"], "")
        self.desk.resume(cid, run)
        self.assertIsNone(report())

    def test_failure_and_interruptions_ask_for_the_action_that_applies(self):
        self.request.update(language="ja", scriptFirst=True)
        case = self.create()
        cid, run = case["id"], case["runId"]
        def report():
            return self.desk.case(cid)["runs"][0]["stopReport"]
        self.desk.pause(cid, run)
        self.assertIn("中断の操作", report()["reason"])
        self.desk.resume(cid, run)
        self.desk.process_next(Mock(side_effect=RuntimeError("モデルの利用上限に達しました。")), self.render)
        self.assertIn("上限", report()["reason"])
        self.assertIn("再び使えるようになったら", report()["next"])
        self.assertEqual(report()["impact"], "")
        self.desk.resume(cid, run)
        self.desk.process_next(Mock(side_effect=RevisionNeeded("第2場面の読みを確かめてください。")), self.render)
        self.assertIn("第2場面", report()["reason"])
        self.assertIn("改稿を再開", report()["next"])
        self.desk.resume(cid, run)
        old_stop = "清書稿の再確認で改稿が必要です。再開すると指摘を引き継ぎます。最初の場面を白地にしてください。"
        self.desk.process_next(Mock(side_effect=RevisionNeeded(old_stop)), self.render)
        self.assertIn("2回", report()["reason"])
        self.assertIn("白地", report()["reason"])
        self.desk.resume(cid, run)
        self.desk.process_next(Mock(return_value=self.plan), self.render)
        self.assertIn("台本が用意できました", report()["reason"])
        self.desk.resume(cid, run)
        self.desk.process_next(Mock(), self.render)
        self.assertIsNone(report())

    def test_only_current_proposal_on_waiting_japanese_run_can_start(self):
        self.request.update(language="ja")
        case = self.create()
        cid, source = case["id"], case["runId"]
        self.desk.process_next(Mock(side_effect=MaterialRequired("資料待ち")), self.render)
        path = self.data / "cases" / cid / source / "editorial-alternative.json"
        for malformed in ("{", "null", '{"title":"title"}'):
            path.write_text(malformed)
            self.assertIsNone(self.desk.case(cid)["runs"][0]["editorialAlternative"])
        path.write_text(json.dumps({"title": "新しい案", "brief": "図解", "reason": "再構成"}))
        key = self.desk.case(cid)["runs"][0]["editorialAlternative"]["fingerprint"]
        self.desk.resume(cid, source)
        with self.assertRaises(ValueError):
            self.desk.start_alternative(cid, source, key)
        self.assertIsNone(self.desk.case(cid)["runs"][0]["editorialAlternative"])
        self.assertEqual(len(self.desk.case(cid)["runs"]), 1)

    def test_optional_research_urls_are_atomic_deduplicated_and_scoped_to_waiting_run(self):
        self.request.update(language="ja", scriptFirst=True)
        case = self.create()
        case_id, run_id = case["id"], case["runId"]
        path = self.data / "cases" / case_id / run_id / "material-leads.json"
        wait = Mock(side_effect=MaterialRequired("追加資料が必要です。ワイプの具体例"))
        render = Mock()
        self.desk.process_next(wait, render)
        first, second = "https://archive.org/edition", "https://research.example.org/film.pdf"
        for invalid in ("http://archive.org/", "https://user:pass@archive.org/", "https://localhost/",
                        "https://127.0.0.1/", "https://127.1/", "https://[::1]/", "https://example.org:8443/",
                        "https://example.org/" + "x" * 2048, "https://host.local/", "https://archive.org/\nnext"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.desk.resume(case_id, run_id, [first, invalid])
        with self.assertRaises(ValueError):
            self.desk.resume(case_id, run_id, [first] * 7)
        self.assertFalse(path.exists())
        self.assertEqual(self.desk.case(case_id)["runs"][0]["status"], "needs_material")
        with ThreadPoolExecutor(2) as pool:
            list(pool.map(lambda _: self.desk.resume(case_id, run_id, [first, first]), range(2)))
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"urls": [first]})
        self.desk.process_next(wait, render)
        self.desk.resume(case_id, run_id, [first, second])
        self.desk.process_next(Mock(return_value=self.plan), render)
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"urls": [first, second]})
        with self.assertRaisesRegex(ValueError, "資料待ち"):
            self.desk.resume(case_id, run_id, [first])
        run, = self.desk.case(case_id)["runs"]
        self.assertEqual((run["status"], run["materialResearch"], run["plan"]["sources"]), ("script_ready", None, []))
        render.assert_not_called()

    def test_attaching_urls_after_a_search_error_requires_its_latest_matching_failure(self):
        case = self.create()
        case_id, run_id = case["id"], case["runId"]
        folder = self.data / "cases" / case_id / run_id
        error = "原資料の本文照合を実行できませんでした。"
        self.desk.process_next(Mock(side_effect=RuntimeError(error)), Mock())
        failed = {"status": "error", "error": error}
        for rounds in ([], [failed, {"status": "done"}], [{"status": "error", "error": "別の調査エラー"}], [failed]):
            with self.subTest(rounds=rounds):
                (folder / "material-research.json").write_text(json.dumps({"rounds": rounds}), encoding="utf-8")
                run, = self.desk.case(case_id)["runs"]
                self.assertEqual((run["status"], run["error"], run["canAddMaterialLeads"]), ("failed", error, rounds == [failed]))
                if rounds != [failed]:
                    with self.assertRaisesRegex(ValueError, "追加調査で停止"):
                        self.desk.resume(case_id, run_id, ["https://example.org/film"])
        self.desk.resume(case_id, run_id, ["https://example.org/film"])
        self.assertEqual(json.loads((folder / "material-leads.json").read_text(encoding="utf-8")), {"urls": ["https://example.org/film"]})
        self.assertEqual(self.desk.case(case_id)["runs"][0]["status"], "queued")

    def test_double_submit_and_revision_after_restart(self):
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: self.create(), range(2)))
        self.assertEqual(results[0], results[1])
        case, first = results[0]["id"], results[0]["runId"]
        self.assertTrue(self.desk.process_next(lambda *args, **kwargs: self.plan, self.render))
        self.desk.review(case, {"runId": first, "lang": "ja", "reason": "画面で対応が分かる"}, "adopted")
        edit = dict(requestId="b", parent=first, lang="en", sceneId="s1", narration="One star.",
                    model="test", reason="主語を明示")
        second = self.desk.submit("runs", edit, self.snapshot, self.models, case)["runId"]

        def interrupt(plan, lang, out, progress):
            self.desk.pause(case, second)
            progress("最初の発話")

        def no_model(*args, **kwargs):
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
        self.desk.process_next(lambda *args, **kwargs: self.plan, self.render)
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

        self.desk.process_next(lambda *args, **kwargs: self.plan, render)
        detail = self.desk.case(result["id"])["runs"][0]
        self.assertEqual(detail["status"], "failed")
        self.assertEqual(set(detail["editions"]), {"ja"})
        self.desk.resume(result["id"], result["runId"])
        self.desk.process_next(lambda *args, **kwargs: self.fail("script was already saved"), render)
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
        self.desk.process_next(lambda *args, **kwargs: self.plan, render)
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
        self.assertEqual(generate.call_args.kwargs["language"], "en")
        self.assertEqual(generate.call_args.kwargs["master_plan"], source["plan"])
        self.assertTrue(callable(generate.call_args.kwargs["progress"]))
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
        self.desk.process_next(lambda *args, **kwargs: self.plan, self.render)
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
        self.desk.process_next(lambda *args, **kwargs: self.plan, self.render)
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

    def test_stage_timing_and_narration_from_finished_cut_before_rendering_once(self):
        self.plan["editorialReview"] = {"reviewedCutSha256": "original"}
        self.plan["scenes"].append({"id": "s2", "ja": {"narration": "見えます。"},
                                   "en": {"narration": "Look."}})
        result = self.create()
        case, original = result["id"], result["runId"]
        self.desk.process_next(lambda *args, **kwargs: self.plan, self.render)
        edit = dict(parent=original, lang="ja", sceneId="s1", model="test", narration="ひとつ", reason="間の調整")
        def submit(key, **fields):
            return self.desk.submit("runs", {**edit, **fields, "requestId": key},
                                    self.snapshot, self.models, case)["runId"]
        auto = {"beforeVoice": None, "afterVoice": None}
        for invalid in ({}, {"beforeVoice": -1, "afterVoice": None}, {**auto, "afterVoice": False}):
            with self.subTest(timing=invalid), self.assertRaises(ValueError):
                submit("invalid", visualTiming=invalid)
        with self.assertRaises(ValueError):
            submit("invalid-en", lang="en", visualTiming=auto)
        self.assertEqual(len(self.desk.case(case)["runs"]), 1)
        saved = submit("preserve", visualTiming=auto, scriptFirst=True)
        preserved = self.desk.case(case)["runs"][0]
        self.assertEqual(preserved["langs"], ["ja"])
        self.assertEqual(preserved["status"], "script_ready")
        self.assertEqual(preserved["plan"]["editorialReview"], self.plan["editorialReview"])
        self.assertNotIn("visualTiming", preserved["plan"]["scenes"][0])
        timing = {"beforeVoice": 0, "afterVoice": 1.25}
        timed = submit("timing", parent=saved, visualTiming=timing)
        last = submit("line", parent=timed, sceneId="s2", narration="右上に見えます。")
        generate, render = Mock(), Mock(wraps=self.render)
        self.assertFalse(self.desk.process_next(generate, render))
        self.desk.resume(case, last)
        self.desk.process_next(generate, render)
        generate.assert_not_called()
        render.assert_called_once()
        final, prior, _, master = self.desk.case(case)["runs"]
        self.assertEqual((final["status"], prior["status"]), ("done", "script_ready"))
        self.assertEqual(final["plan"]["scenes"][0]["visualTiming"], timing)
        self.assertEqual(final["plan"]["scenes"][1]["ja"]["narration"], "右上に見えます。")
        self.assertEqual(master["plan"], self.plan)
        self.assertNotIn("editorialReview", prior["plan"])
        self.assertEqual(set(final["editions"]), {"ja"})

    def test_one_theme_can_have_two_episodes_and_distinct_rerun_briefs(self):
        first = self.create()
        other = self.desk.submit("/api/cases", {**self.request, "requestId": "2", "brief": "別の切り口"},
                                 self.snapshot, self.models)
        self.assertNotEqual(first["id"], other["id"])
        inputs = []
        def generate(snapshot, brief, model, folder, *, progress):
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
