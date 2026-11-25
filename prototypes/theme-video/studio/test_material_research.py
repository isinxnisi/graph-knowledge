import json
import hashlib
import unittest
from unittest.mock import patch

from material_research import research_material
from pdf_material import match_excerpts


class MaterialResearchTest(unittest.TestCase):
    def setUp(self):
        self.snapshot = {"title": "鏡の調整", "description": "", "records": [], "sources": []}
        self.candidate = {"title": "Commissioning note", "url": "https://example.org/source",
                          "locator": "2022-02-18", "excerpt": "Each spot corresponds to a mirror.",
                          "note": "鏡の向きについての記録。"}

    def search(self):
        return research_material(self.snapshot, "", "打ち上げ後の調整の根拠と写真が必要です。", "example-model", "high", [])

    def test_only_matched_and_supported_evidence_reaches_the_editor(self):
        other = {**self.candidate, "url": "https://example.org/other"}
        proof = {"url": self.candidate["url"], "bodySha256": "aa", "textSha256": "bb", "excerptSha256": "cc"}
        found = {"sources": [self.candidate, other], "remaining": "写真は未確認。"}
        review = {"supported": [{"index": 0, "note": "星像と鏡の対応についての記述。"}], "remaining": "写真は未取得。"}
        with patch("material_research._call_writer", side_effect=[(found, {"input_tokens": 2}), (review, {"input_tokens": 3})]) as writer, \
             patch("material_research._verify", return_value=[
                 {"proof": proof, "context": "commissioning context", "locator": "PDFファイルの2ページ"},
                 {"error": "引用不一致"}]):
            result = self.search()
        self.assertEqual(len(result["sources"]), 1)
        self.assertEqual(result["sources"][0]["proof"], proof)
        self.assertEqual(result["sources"][0]["note"], review["supported"][0]["note"])
        self.assertEqual(result["sources"][0]["locator"], "PDFファイルの2ページ")
        self.assertEqual(result["remaining"], review["remaining"])
        self.assertEqual(result["usage"], {"input_tokens": 5})
        self.assertIs(writer.call_args_list[0].kwargs["research"], True)
        self.assertFalse(writer.call_args_list[1].kwargs.get("research", False))
        self.assertIn("commissioning context", writer.call_args_list[1].args[0]["prompt"])

    def test_unverifiable_excerpt_returns_concrete_need_without_claiming_a_source(self):
        with patch("material_research._call_writer", return_value=({"sources": [self.candidate], "remaining": ""}, {})) as writer, \
             patch("material_research._verify", return_value=[{"error": "抜粋を原資料の本文に見つけられませんでした。"}]):
            result = self.search()
        self.assertEqual(result["sources"], [])
        self.assertTrue(result["retrySearch"])
        self.assertIn("抜粋", result["remaining"])
        self.assertEqual(writer.call_count, 1)

    def test_no_candidates_keeps_the_missing_material(self):
        with patch("material_research._call_writer", return_value=({"sources": [], "remaining": "図が見つかりません。"}, {})), \
             patch("material_research._verify") as verifier:
            result = self.search()
        verifier.assert_not_called()
        self.assertEqual(result["remaining"], "図が見つかりません。")
        self.assertEqual(result["sources"], [])

    def test_search_receives_original_source_urls_and_recent_research_only(self):
        self.snapshot["sources"] = [{"id": "ref-10", "title": "原資料", "url": "https://example.org/original#section"}]
        previous = [{"need": str(i), "sources": [{**self.candidate, "proof": {"unused": "x" * 100000}}]}
                    for i in range(6)]
        with patch("material_research._call_writer",
                   return_value=({"sources": [], "remaining": "特定の映画の場面は未確認。"}, {})) as writer:
            research_material(self.snapshot, "ワイプの作例", "技法の原典", "model", "high", previous,
                              leads=["https://example.org/lead"])
        data = json.loads(writer.call_args.args[0]["prompt"].rsplit("\n\n", 1)[1])
        self.assertEqual(data["production"]["sources"][0], self.snapshot["sources"][0])
        self.assertEqual(data["sourceLeads"], ["https://example.org/lead"])
        self.assertEqual([r["need"] for r in data["previous"]], ["3", "4", "5"])
        self.assertNotIn("proof", data["previous"][-1]["sources"][0])

    def test_pdf_quotes_stay_on_physical_pages_and_hash_original_bytes(self):
        raw = b"%PDF-1.7 original document bytes"
        pages = ["Header. An inter-", "Header. national paper. More\nwords on this page."]
        queries = ["More words", "inter- Header.", "international", "Header."]
        found, crossing, repaired, repeated = match_excerpts(raw, pages, queries, "example")
        self.assertEqual(found["proof"]["pages"], [2])
        self.assertEqual(found["proof"]["bodySha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(found["proof"]["excerptSha256"], hashlib.sha256(b"More words").hexdigest())
        self.assertIn("2ページ", found["locator"])
        self.assertIn("error", crossing)
        self.assertIn("error", repaired)
        self.assertEqual(repeated["proof"]["pages"], [1, 2])
