import unittest

from PIL import ImageChops, ImageColor

from media import _board, _credit, _style
from channel_style import FOOT, H, INK, ORANGE, PAPER, W


class ChannelStyleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fonts = _style("ja").fonts
        if not all((fonts / face).is_file() for face in
                   ("YuGothB.ttc", "YuGothM.ttc", "yumindb.ttf", "georgia.ttf", "segoeui.ttf", "segoeuib.ttf")):
            raise unittest.SkipTest("Plunodeの制作フォントが必要です。")

    def test_source_frame_and_credits_keep_channel_geometry_in_both_editions(self):
        scene = {"asset": "source", "sourceIds": ["s1"],
                 "ja": {"heading": "星の記録"}, "en": {"heading": "A record of the star"}}
        plan = {"scenes": [scene], "sources": [{"id": "s1", "title": "Observation record",
                                                "url": "https://example.org/record"}]}
        for lang in ("ja", "en"):
            with self.subTest(lang=lang):
                board = _board(plan, scene, lang, set())
                credits = _credit(plan, lang, set(), "Plunode")
                for image in (board, credits):
                    self.assertEqual(image.size, (1280, 720))
                    for point in ((55, 32), (74, 22)):
                        self.assertEqual(image.getpixel(point), ImageColor.getrgb(ORANGE))
                self.assertEqual(board.getpixel((2, 561)), ImageColor.getrgb(PAPER))
                self.assertEqual(board.getpixel((2, 562)), ImageColor.getrgb(INK))
                self.assertEqual(credits.getpixel((68, 178)), ImageColor.getrgb("#78868a"))

                captioned = board.copy()
                caption = "同じ星です。" if lang == "ja" else "It is the same star."
                _style(lang).subtitle(captioned, caption)
                box = ImageChops.difference(captioned, board).getbbox()
                self.assertIsNotNone(box)
                self.assertGreater(box[1], FOOT)
                self.assertLess(box[3], H)
                self.assertAlmostEqual((box[0] + box[2]) / 2, W / 2, delta=14)

    def test_generated_japanese_captions_wrap_without_changing_the_words(self):
        caption = "望遠鏡を一つの星に向けていますが、鏡の向きがそろうまでは同じ星が別々の場所に映ります。"
        style = _style("ja")
        self.assertEqual(style.caption_breaks(caption), caption)
        lines = style.caption_breaks(caption, wrap_japanese=True).splitlines()
        self.assertEqual(len(lines), 2)
        self.assertEqual("".join(lines), caption)
        self.assertFalse(lines[1].startswith("、"))


if __name__ == "__main__":
    unittest.main()
