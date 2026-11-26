from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from PIL import Image

import film_direction as film
import research_workflow as workflow
from editor import _draft_input, _writer_request
from idea_store import film_commission
from test_film_direction import SNAP, polygon, setup_direction
from writer_feedback import request_digest


class MaterialDirectionTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(self.enterContext(TemporaryDirectory()))
        self.snapshot = {**SNAP, "productionMode": film.MODE}
        self.brief = ("仮題　手元の二つの角\n冒頭の演出案　当時の紙を接写する。\n見終えたときの発見　角が重なること。"
                      "\n要確認の根拠・素材　原品の写真と折り筋を照合する。\n今回の試行で重視する点\n無言の時間を残す。")
        self.original = {**setup_direction(), "materialRequest": "原品の写真と折り筋。", "title": "未確認の現物"}

    def test_older_and_current_saved_openings_are_suggestions_when_the_ledger_confirms_a_pitch(self):
        for opening in ("冒頭", "冒頭の演出案"):
            brief = self.brief.replace("冒頭の演出案　", opening + "　")
            with self.subTest(opening=opening):
                commission = film_commission(brief, from_idea=True)
                self.assertEqual(commission["possibleOpening"], "当時の紙を接写する。")
                self.assertEqual(commission["operatorRequest"], "無言の時間を残す。")
                self.assertEqual(film_commission(brief, from_idea=False), {"mode": "theme", "operatorRequest": brief})

    def test_failed_search_and_old_proposal_recover_the_draft_for_review_without_search(self):
        source = {"url": "https://example.org/paper2", "excerpt": "a folded corner", "title": "別資料",
                  "locator": "図二", "note": "紙を折る場面。"}
        rounds = [{"status": "done", "sources": [source], "need": "原品の写真", "remaining": "未確認"},
                  {"status": "error", "sources": [], "need": "原品の写真", "error": "接続失敗"}]
        for name, value in (("material-research.json", {"rounds": rounds}),
                            ("editorial-decision.json", {"need": "原品の写真", "instructionVersion": "plunode-video-editorial-decision-3"}),
                            ("editorial-alternative.json", {"title": "別企画"})):
            (self.folder / name).write_text(json.dumps(value), encoding="utf-8")
        enriched = workflow._supplement(self.snapshot, rounds)
        old_inputs = {**_draft_input(enriched, self.brief), "productionResearch": enriched["productionResearch"]}
        request = _writer_request("model", "high", "plunode-film-direction-2", "先代の演出契約", old_inputs, {})
        digest = request_digest(request)
        records = self.folder / "editor-stages"
        records.mkdir()
        log = records / f"direction-{digest}.json"
        log.write_text(json.dumps({"request": request, "stage": "direction", "inputSha256": digest,
                                   "status": "failed", "result": self.original}), encoding="utf-8")
        guide = self.folder / "guide.jpg"
        Image.new("RGB", (100, 70), "#cec9c0").save(guide)
        def edit(request):
            inputs = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            self.assertEqual(inputs["commission"]["operatorRequest"], "無言の時間を残す。")
            self.assertEqual(inputs["commission"]["possibleOpening"], "当時の紙を接写する。")
            self.assertEqual(inputs["candidate"]["title"], "未確認の現物")
            self.assertEqual(len(inputs["candidate"]["scenes"]), 2)
            self.assertEqual(len(inputs["sources"]), 2)
            return {"outcome": "produce", "reason": "原品の再現を外し折り目の作例で同じ発見を見せる。",
                    "essentialFact": "", "direction": {**setup_direction(), "title": "番組の紙で試す"}}, {}
        def view(request, image):
            data = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            if "scene" in data:
                return polygon("#7c9fb0"), {}
            if "cut" in data:
                return {"materialRequest": "", "repairs": [], "focusVerdict": {
                    "result": "clear", "basis": "紙の角が移る。", "observation": 1}}, {}
            return {"observations": [{"sceneId": i, "seen": "紙の角"} for i in data["sceneIds"]],
                    "focusSignals": [{"kind": "travel", "trace": "紙の角が移る。"}]}, {}
        def write(materials):
            return film.direct_film(materials, self.brief, "model", "high", self.folder)
        with patch.object(film, "style_reference", return_value=guide), patch.object(film, "view_cut", side_effect=view), \
                patch.object(film, "_call_writer", side_effect=edit) as editor, patch.object(workflow, "research_material") as search:
            plan = workflow.write_with_research(self.snapshot, self.brief, "model", "high", self.folder, None, write)
            self.assertEqual(plan["titles"]["ja"], "番組の紙で試す")
            self.assertEqual(workflow.write_with_research(self.snapshot, self.brief, "model", "high", self.folder, None, write), plan)
            editor.assert_called_once()
            search.assert_not_called()
        self.assertFalse((self.folder / "editorial-alternative.json").exists())
        self.assertEqual(json.loads(log.read_text(encoding="utf-8"))["result"], self.original)

    def test_required_observation_enters_research_only_after_review_of_actual_draft(self):
        brief = "現物に刻まれた年を自分で読み取れることを必須とする。"
        self.assertEqual(film_commission(brief), {"mode": "theme", "operatorRequest": brief})
        self.assertEqual(film_commission(self.brief, from_idea=False), {"mode": "theme", "operatorRequest": self.brief})
        def writer(request):
            inputs = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            if "candidate" not in inputs:
                return self.original, {}
            self.assertEqual(inputs["commission"]["operatorRequest"], brief)
            return {"outcome": "research", "reason": "作例では観客が原品の年を読めない。",
                    "essentialFact": "原品の年を読める写真と利用条件。", "direction": None}, {}
        def write(materials):
            return film.direct_film(materials, brief, "model", "high", self.folder)
        with patch.object(film, "_call_writer", side_effect=writer) as author, \
                patch.object(workflow, "research_material", side_effect=RuntimeError("fixture search")) as search:
            with self.assertRaisesRegex(RuntimeError, "fixture search"):
                workflow.write_with_research(self.snapshot, brief, "model", "high", self.folder, None, write)
        self.assertEqual(author.call_count, 2)
        self.assertIn("原品の年を読める写真", search.call_args.args[2])
        with self.assertRaisesRegex(ValueError, "編集判断"):
            film.check_gap_decision({"outcome": "produce", "reason": "十分", "direction": deepcopy(self.original),
                                     "essentialFact": ""}, ["ref-1"])
