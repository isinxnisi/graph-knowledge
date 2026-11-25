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

    def test_migrated_pitch_keeps_adoption_and_creates_independent_cases_once_per_request(self):
        self.submit()
        self.desk.work_ideas(lambda *_: [self.card])
        pitch = self.desk.list_ideas("theme:tv")["items"][0]
        take = {**self.request, "ideaId": pitch["id"], "requestId": "original"}
        original = self.desk.submit("/api/cases", take, self.snapshot, self.models)
        with self.desk.db() as db:
            db.execute("UPDATE runs SET status='done',editions=? WHERE id=?", ('{"ja":{}}', original["runId"]))
            # Recreate the previous schema, which only linked ideas.case_id.
            db.execute("DROP VIEW idea_case_members")
            db.execute("DROP VIEW previous_video_ideas")
            db.execute("DROP TABLE idea_cases")
        self.desk.review(original["id"], {"lang": "ja", "runId": original["runId"], "reason": "元作品の採用理由"}, "adopted")
        self.desk = Ledger(self.path)
        self.snapshot.side_effect = AssertionError("同じテーマ版・案を再利用する")
        models = lambda: [{"id": "another", "available": True}]
        def another(key):
            return self.desk.submit("/api/cases", {**take, "model": "another", "requestId": key, "newIdeaCase": True},
                                    self.snapshot, models)
        with ThreadPoolExecutor(3) as pool:
            a, b, duplicate = pool.map(another, ("second", "third", "second"))
        self.assertEqual(a, duplicate)
        self.assertEqual(len({original["id"], a["id"], b["id"]}), 3)
        self.desk = Ledger(self.path)
        self.assertEqual(another("second"), a)
        with self.assertRaisesRegex(ValueError, "別の内容"):
            self.desk.submit("/api/cases", {**take, "requestId": "second"}, self.snapshot, self.models)
        saved, = self.desk.list_ideas("theme:tv")["items"]
        self.assertEqual((saved["caseId"], saved["status"]), (original["id"], "used"))
        self.assertEqual([s["number"] for s in saved["cases"]], [3, 2, 1])
        self.assertEqual({s["id"] for s in saved["cases"]}, {original["id"], a["id"], b["id"]})
        self.assertEqual([s["model"] for s in saved["cases"]], ["another", "another", "test"])
        self.assertEqual([s["status"] for s in saved["cases"]], ["queued", "queued", "done"])
        self.assertEqual(self.desk.case(original["id"])["reviews"][0]["reason"], "元作品の採用理由")
        listing = {c["id"]: c for c in self.desk.list_cases()}
        for c in saved["cases"]:
            detail = self.desk.case(c["id"])
            for item in (detail, listing[c["id"]]):
                self.assertEqual((item["ideaId"], item["ideaCaseNumber"], item["ideaCaseCount"]),
                                 (pitch["id"], c["number"], 3))
            if c["number"] > 1:
                self.assertEqual((detail["accepted"], detail["reviews"], detail["runs"][0]["parent"]), ({}, [], None))

    def test_previous_work_excludes_unrendered_cases_and_keeps_the_reference(self):
        case = self.desk.submit("/api/cases", {**self.request, "brief": "当時の制作依頼"}, self.snapshot, self.models)
        plan = {"titles": {"ja": "旧作"}, "story": {"explanation": "旧作の見どころ"}}
        with self.desk.db() as db:
            db.execute("UPDATE runs SET status='script_ready',plan=? WHERE id=?", (json.dumps(plan), case["runId"]))
        self.assertEqual(self.desk.list_ideas("theme:tv")["items"], [])
        with self.desk.db() as db:
            db.execute("""UPDATE runs SET status='done',editions='{"ja":{"timings":[]}}' WHERE id=?""",
                       (case["runId"],))
        legacy, = self.desk.list_ideas("theme:tv")["items"]
        self.assertEqual((legacy["origin"], legacy["caseId"], legacy["title"]), ("previous", case["id"], "旧作"))
        self.desk.review(case["id"], {"lang": "ja", "runId": case["runId"], "reason": "採用メモ"}, "adopted")
        self.snapshot.side_effect = AssertionError("元案件の保存済み版で制作する")
        new = {**self.request, "requestId": "remake", "ideaId": legacy["id"], "newIdeaCase": True}
        def make(data):
            return self.desk.submit("/api/cases", data, self.snapshot, self.models)
        result = make(new)
        self.assertEqual(make(new), result)
        self.assertNotEqual(case["id"], result["id"])
        detail = self.desk.case(result["id"])
        self.assertEqual((detail["title"], detail["brief"]), ("旧作", "仮題　旧作\n当時の制作依頼"))
        self.assertEqual((detail["ideaId"], detail["ideaCaseNumber"], detail["ideaCaseCount"]), (legacy["id"], 2, 2))
        self.assertEqual((detail["accepted"], detail["reviews"], detail["runs"][0]["plan"]), ({}, [], None))
        with self.desk.db() as db:
            db.execute("UPDATE runs SET status='done',editions=?,plan=? WHERE id=?",
                       ('{"ja":{}}', json.dumps({"titles": {"ja": "新作"}}), result["runId"]))
        self.desk = Ledger(self.path)
        restored, = self.desk.list_ideas("theme:tv")["items"]
        self.assertEqual(restored["id"], legacy["id"])
        self.assertEqual([(c["number"], c["title"]) for c in restored["cases"]], [(2, "新作"), (1, "旧作")])
        original = self.desk.case(case["id"])
        self.assertEqual((original["accepted"]["ja"], original["reviews"][0]["reason"]), (case["runId"], "採用メモ"))
        for invalid in ({"revision": 4}, {"ideaId": "previous-" + result["id"]},
                        {"ideaId": "previous-" + self.desk.reference["id"]}, {"newIdeaCase": "yes"}):
            with self.subTest(invalid=invalid), self.assertRaises((ValueError, KeyError)):
                make({**new, **invalid, "requestId": "invalid"})
        reference, = self.desk.list_ideas(self.desk.reference["themeId"])["items"]
        self.assertEqual((reference["origin"], len(reference["cases"])), ("reference", 1))


if __name__ == "__main__":
    unittest.main()
