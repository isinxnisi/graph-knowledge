from concurrent.futures import ThreadPoolExecutor
import json
import tempfile
import unittest
from unittest.mock import Mock

from ledger import Ledger


class IdeaLedgerTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = temp.name
        self.desk = Ledger(self.path)
        self.request = {"themeId": "theme:tv", "revision": 3, "model": "test", "requestId": "generate"}
        self.models = lambda: [{"id": "test", "available": True}]
        self.snapshot = Mock(side_effect=lambda theme, rev: {
            "themeId": theme, "revision": rev, "title": "テレビの実験",
            "sources": [{"id": "s1", "title": "テイントンの回想", "url": "https://example.org/witness"}]})
        self.card = {"title": "テレビの実験相手", "opening": "人形が装置に向き合う",
                     "payoff": "人形から人へ実験相手が変わる", "needs": "映った像の資料", "sourceIds": ["s1"]}

    def submit(self, **fields):
        return self.desk.submit_ideas({**self.request, **fields}, self.snapshot, self.models)

    def test_later_and_case_link_survive_restart_and_retry_without_refetch(self):
        with ThreadPoolExecutor(2) as pool:
            batches = list(pool.map(lambda _: self.submit(), range(2)))
        self.assertEqual(batches[0], batches[1])
        self.assertEqual(self.submit(requestId="same-active-batch"), batches[0])
        second = {**self.card, "title": "別の一本", "payoff": "別の出来事が見えてくる"}
        self.desk.work_ideas(lambda *_: [self.card, second])
        view = self.desk.list_ideas("theme:tv")
        self.assertEqual((len(view["items"]), view["batches"][0]["count"]), (2, 2))
        card, unused = view["items"]
        self.assertEqual(card["sources"][0]["url"], "https://example.org/witness")
        self.desk.set_idea_status(card["id"], "later")
        self.desk = Ledger(self.path)
        self.assertEqual(self.desk.list_ideas("theme:tv")["items"][0]["status"], "later")

        self.snapshot.side_effect = AssertionError("採用時に新版を取得してはいけない")
        take = {**self.request, "ideaId": card["id"], "language": "ja", "scriptFirst": True}
        def make(key, **fields):
            return self.desk.submit("/api/cases", {**take, "requestId": key, **fields}, self.snapshot, self.models)
        with self.assertRaises(ValueError):
            make("wrong-theme", themeId="another")
        with self.assertRaises(ValueError):
            make("wrong-revision", revision=4)
        with ThreadPoolExecutor(2) as pool:
            cases = list(pool.map(make, ["take1", "take2"]))
        self.assertEqual(cases[0], cases[1])
        case = self.desk.case(cases[0]["id"])
        self.assertEqual((len(case["runs"]), case["ideaId"], case["title"]), (1, card["id"], card["title"]))
        for field in ["opening", "payoff", "needs"]:
            self.assertIn(card[field], case["brief"])
        self.assertIn("s1", case["brief"])
        self.assertEqual(self.desk.list_cases()[0]["themeTitle"], "テレビの実験")
        self.desk = Ledger(self.path)
        saved = self.desk.list_ideas("theme:tv")["items"]
        self.assertEqual((saved[0]["status"], saved[0]["caseId"]), ("used", case["id"]))
        self.assertEqual((saved[1]["id"], saved[1]["status"]), (unused["id"], "candidate"))
        with self.assertRaises(ValueError):
            self.desk.set_idea_status(card["id"], "later")

    def test_batch_recovery_partial_failure_and_additional_generation(self):
        batch = self.submit()["batchId"]
        # Simulate stopping the service while waiting for a model reply.
        with self.desk.db() as db:
            db.execute("UPDATE idea_batches SET status='running' WHERE id=?", (batch,))
        self.desk = Ledger(self.path)
        self.assertTrue(self.desk.work_ideas(lambda *_: [self.card, {**self.card, "sourceIds": ["wrong"]}]))
        view = self.desk.list_ideas("theme:tv")
        self.assertEqual(view["items"], [])
        self.assertEqual(view["batches"][0]["status"], "failed")
        self.submit(requestId="retry")
        self.desk.work_ideas(lambda *_: [self.card, self.card])
        card = self.desk.list_ideas("theme:tv")["items"][0]
        self.desk.set_idea_status(card["id"], "later")
        self.submit(requestId="more")
        writer = Mock(return_value=[self.card])
        self.desk.work_ideas(writer)
        self.assertEqual(writer.call_args.args[3][0]["status"], "later")
        view = self.desk.list_ideas("theme:tv")
        self.assertEqual((len(view["items"]), view["batches"][0]["count"]), (1, 0))
        self.desk.set_idea_status(card["id"], "candidate")
        self.assertEqual(self.desk.list_ideas("theme:tv")["items"][0]["status"], "candidate")
        self.assertFalse(self.desk.work_ideas(writer))

    def test_previous_work_excludes_unrendered_cases_and_keeps_the_reference(self):
        case = self.desk.submit("/api/cases", self.request, self.snapshot, self.models)
        plan = {"titles": {"ja": "旧作"}, "story": {"explanation": "旧作の見どころ"}}
        with self.desk.db() as db:
            db.execute("UPDATE runs SET status='script_ready',plan=? WHERE id=?", (json.dumps(plan), case["runId"]))
        self.assertEqual(self.desk.list_ideas("theme:tv")["items"], [])
        with self.desk.db() as db:
            db.execute("""UPDATE runs SET status='done',editions='{"ja":{"timings":[]}}' WHERE id=?""",
                       (case["runId"],))
        legacy, = self.desk.list_ideas("theme:tv")["items"]
        self.assertEqual((legacy["origin"], legacy["caseId"], legacy["title"]), ("previous", case["id"], "旧作"))
        self.assertEqual(self.desk.list_ideas(self.desk.reference["themeId"])["items"][0]["origin"], "reference")


if __name__ == "__main__":
    unittest.main()
