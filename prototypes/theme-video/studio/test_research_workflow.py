"""Regression coverage for run-local evidence and resuming a stored material request."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from editor import MaterialRequired
from research_workflow import write_with_research


class ResearchWorkflowTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        self.snapshot = {"themeId": "theme:test", "revision": 2, "title": "テスト", "records": [],
                         "sources": [{"id": "ref-1", "title": "当初の資料", "url": "https://example.org/old"}]}
        self.source = {"title": "資料", "url": "https://example.org/source", "locator": "図2",
                       "excerpt": "a moving boundary", "note": "境界線が動く。", "proof": {"bodySha256": "123"}}

    def run_writer(self, write):
        return write_with_research(self.snapshot, "境界を観察する", "model", "high", self.folder, None, write)

    def history(self):
        return json.loads((self.folder / "material-research.json").read_text(encoding="utf-8"))["rounds"]

    def test_receives_evidence_and_can_resume_without_repeating_search(self):
        frozen = deepcopy(self.snapshot)
        def write(snapshot):
            if not snapshot.get("productionResearch"):
                raise MaterialRequired("線が動く根拠が必要です")
            return snapshot
        result = {"sources": [self.source], "remaining": "映像の転載許可は未確認。", "usage": {"input_tokens": 2}}
        with patch("research_workflow.research_material", return_value=result) as research:
            enriched = self.run_writer(write)
            self.assertEqual(self.run_writer(write), enriched)
        research.assert_called_once()
        self.assertEqual(self.snapshot, frozen)
        added, = enriched["records"]
        self.assertEqual(added["evidence"][0]["id"], enriched["sources"][-1]["id"])
        self.assertEqual(added["evidence"][0]["excerpt"], self.source["excerpt"])
        self.assertEqual(enriched["productionResearch"]["limits"], [result["remaining"]])
        self.assertEqual(self.history()[0]["status"], "done")

    def test_missing_evidence_preserves_question_and_transport_error_can_retry(self):
        missing = Mock(side_effect=MaterialRequired("方向が必要"))
        nothing = {"sources": [], "remaining": "方向を特定できる映像資料が必要です。", "usage": {}}
        with patch("research_workflow.research_material", side_effect=[RuntimeError("接続失敗"), nothing]):
            with self.assertRaisesRegex(RuntimeError, "接続失敗"):
                self.run_writer(missing)
            with self.assertRaisesRegex(MaterialRequired, "方向を特定"):
                self.run_writer(missing)
        self.assertEqual([(r["need"], r["status"]) for r in self.history()],
                         [("方向が必要", "error"), ("方向が必要", "done")])
        self.assertEqual(missing.call_count, 2)

    def test_unreadable_candidates_trigger_a_different_search_before_waiting(self):
        missing = {"sources": [], "remaining": "映画館の候補では引用が一致しません。",
                   "retrySearch": True, "usage": {}}
        found = {"sources": [self.source], "remaining": "", "usage": {}}
        write = Mock(side_effect=[MaterialRequired("方向が必要"), "改稿"])
        with patch("research_workflow.research_material", side_effect=[missing, found]) as research:
            self.assertEqual(self.run_writer(write), "改稿")
        self.assertEqual(write.call_count, 2)
        previous, = research.call_args_list[1].args[5]
        self.assertEqual(previous["remaining"], missing["remaining"])
        self.assertEqual([entry["need"] for entry in self.history()], ["方向が必要", "方向が必要"])

    def test_unreadable_candidates_do_not_trigger_an_unbounded_search(self):
        missing = {"sources": [], "remaining": "原典の引用を照合できません。", "retrySearch": True}
        with patch("research_workflow.research_material", return_value=missing) as research:
            with self.assertRaisesRegex(MaterialRequired, "引用を照合"):
                self.run_writer(Mock(side_effect=MaterialRequired("方向が必要")))
        self.assertEqual(research.call_count, 2)

    def test_new_lead_is_researched_before_returning_to_the_script(self):
        original = {"sources": [], "remaining": "場面を特定できません。"}
        with patch("research_workflow.research_material", return_value=original):
            with self.assertRaises(MaterialRequired):
                self.run_writer(Mock(side_effect=MaterialRequired("該当する場面はどこか")))
        lead = "https://example.org/article"
        (self.folder / "material-leads.json").write_text(json.dumps({"urls": [lead]}), encoding="utf-8")
        write = Mock(return_value="台本")
        with patch("research_workflow.research_material", return_value={"sources": [self.source], "remaining": ""}) as search:
            self.assertEqual(self.run_writer(write), "台本")
            self.assertEqual(self.run_writer(write), "台本")
        search.assert_called_once()
        self.assertEqual(search.call_args.kwargs["leads"], [lead])
        self.assertEqual(self.history()[-1]["sourceLeads"], [lead])
        self.assertIn(self.source["url"], [s["url"] for s in write.call_args_list[0].args[0]["sources"]])
        self.assertNotIn(lead, [s["url"] for s in write.call_args_list[0].args[0]["sources"]])

    def test_live_search_is_scoped_to_research_and_requires_tool_activity(self):
        from subprocess import CompletedProcess
        from editor import _call_writer, _object, _writer_request
        request = _writer_request("model", "high", "research-test", "find a source", {}, _object({}))
        search = {"type": "item.completed", "item": {"type": "web_search", "query": "source"}}
        message = {"type": "item.completed", "item": {"type": "agent_message", "text": "{}"}}
        done = {"type": "turn.completed", "usage": {}}
        def reply(events):
            return CompletedProcess([], 0, stdout="\n".join(json.dumps(e) for e in events))
        with patch("editor._run", side_effect=[reply([search, message, done]), reply([message, done]),
                                                reply([search, message, done])]) as cli:
            self.assertEqual(_call_writer(request, research=True)[0], {})
            with self.assertRaisesRegex(RuntimeError, "ウェブ"):
                _call_writer(request, research=True)
            with self.assertRaisesRegex(RuntimeError, "文章生成以外"):
                _call_writer(request)
        self.assertIn('web_search="live"', cli.call_args_list[0].args[0])
        self.assertIn('web_search="disabled"', cli.call_args_list[2].args[0])
