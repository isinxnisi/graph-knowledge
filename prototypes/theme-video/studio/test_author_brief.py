import json
from pathlib import Path
import tempfile
import unittest
import wave

from author_brief import write_brief


class AuthorBriefTest(unittest.TestCase):
    def test_channel_identity_is_part_of_commission_with_reusable_brand_and_sound(self):
        brief = write_brief(self.workspace, self.snapshot, "").read_text(encoding="utf-8")
        identity = (self.workspace / "CHANNEL.md").read_text(encoding="utf-8")
        self.assertIn("同じ番組に帰ってきた", identity)
        self.assertIn("各回の切り口", identity)
        self.assertIn("お任せします", brief)
        self.assertNotIn("紙色と濃紺", brief)
        for asset in ("brand.png", "brand-light.png", "opening.wav"):
            self.assertTrue((self.workspace / "references" / asset).is_file())

    def setUp(self):
        self.workspace = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.snapshot = {
            "themeId": "theme:example", "revision": 4, "title": "一枚の切符", "description": "開業日の駅",
            "sources": [{"id": "ref-1", "url": "https://example.org/ticket", "title": "乗客の日記"}],
            "records": [{"text": "乗客による記録", "evidence": [{"id": "ref-1", "locator": "第2頁",
                                                            "excerpt": "原文" * 220 + "最終行"}]}],
            "productionResearch": {"sourceIds": ["ref-1"], "limits": ["駅員の発言は未確認"]},
        }

    def read(self, name):
        return json.loads((self.workspace / "inputs" / name).read_bytes())

    def test_theme_evidence_and_optional_reference_films_travel_with_the_request(self):
        brief = write_brief(self.workspace, self.snapshot, "")
        self.assertNotIn("原文", brief.read_text(encoding="utf-8"))
        self.assertEqual(self.read("theme.json"), self.snapshot)
        self.assertEqual(self.read("request.json"), {"mode": "theme", "operatorRequest": ""})
        refs = self.workspace / "references"
        for name in ("walkman.mp4", "goddard.mp4"):
            self.assertEqual((refs / name).read_bytes()[4:8], b"ftyp")
        films = Path(__file__).resolve().parents[1]
        guide = (refs / "README.md").read_text(encoding="utf-8")
        for source in ("walkman/figures/listen.svg", "goddard-remotion/art.tsx", "goddard-remotion/film.tsx"):
            name = Path(source).name
            self.assertEqual((refs / name).read_bytes(), (films / source).read_bytes())
            self.assertIn(f"]({name})", guide)
        with wave.open(str(refs / "opening.wav")) as chime:
            self.assertGreater(chime.getnframes(), chime.getframerate())

    def test_commission_keeps_pitch_suggestions_separate_from_operator_and_parent_feedback(self):
        self.snapshot["selectedVideoIdea"] = True
        previous = {"title": "以前の版", "reviews": [{"reason": "駅の音がよかった"}]}
        pitch = "仮題　窓越しの駅\n冒頭　切符を大写しにする\n見終えたときの発見　穴で時刻が分かる\n今回の試行で重視する点\n旅人の視点"
        write_brief(self.workspace, self.snapshot, pitch, previous_japanese=previous)
        req = self.read("request.json")
        self.assertEqual(req["previousJapanese"], previous)
        self.assertEqual(req["intendedDiscovery"], "穴で時刻が分かる")
        self.assertEqual(req["possibleOpening"], "切符を大写しにする")
        self.assertEqual(req["operatorRequest"], "旅人の視点")
        (self.workspace / "film.tsx").write_text("my cut")
        en = write_brief(self.workspace, self.snapshot, pitch, language="en", previous_japanese=previous)
        self.assertIn("英語版", en.read_text(encoding="utf-8"))
        self.assertEqual((self.workspace / "film.tsx").read_text(), "my cut")


if __name__ == "__main__":
    unittest.main()
