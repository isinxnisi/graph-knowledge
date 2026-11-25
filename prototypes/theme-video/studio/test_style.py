import unittest

from PIL import Image, ImageChops, ImageColor

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
                # A source introduction puts its heading and publication side by side.
                bare = _board(plan, {**scene, lang: {"heading": ""}}, lang, set())
                self.assertEqual(board.getpixel((180, 401)), ImageColor.getrgb(ORANGE))
                self.assertEqual(bare.getpixel((180, 401)), ImageColor.getrgb(PAPER))
                paper = Image.new("RGB", board.size, PAPER)
                ink = ImageChops.difference(board, paper)
                for area in ((66, 130, 666, 357), (730, 128, 1210, 300)):
                    self.assertIsNotNone(ink.crop(area).getbbox())
                self.assertEqual(credits.getpixel((68, 178)), ImageColor.getrgb("#78868a"))

                captioned = board.copy()
                caption = "同じ星です。" if lang == "ja" else "It is the same star."
                _style(lang).subtitle(captioned, caption)
                box = ImageChops.difference(captioned, board).getbbox()
                self.assertIsNotNone(box)
                self.assertGreater(box[1], FOOT)
                self.assertLess(box[3], H)
                self.assertAlmostEqual((box[0] + box[2]) / 2, W / 2, delta=14)

    def test_wipe_reveals_two_stationary_pictures_and_keeps_the_caption_rail_clear(self):
        from wipe_board import PANEL, render

        for lang in ("ja", "en"):
            with self.subTest(lang=lang):
                start, middle, held, end = [render(lang, t) for t in (0, .49, .54, 1)]
                left, top, right, bottom = PANEL
                self.assertEqual(ImageChops.difference(start, end).getbbox(), PANEL)
                self.assertEqual(middle.tobytes(), held.tobytes())
                for box, original in [((left, top, W//2, bottom), end),
                                      ((W//2+60, top, right, bottom), start)]:
                    self.assertIsNone(ImageChops.difference(middle.crop(box), original.crop(box)).getbbox())
                self.assertEqual(middle.getpixel((W//2, FOOT)), ImageColor.getrgb(INK))

    def test_generated_japanese_captions_wrap_without_changing_the_words(self):
        caption = "望遠鏡を一つの星に向けていますが、鏡の向きがそろうまでは同じ星が別々の場所に映ります。"
        style = _style("ja")
        self.assertEqual(style.caption_breaks(caption), caption)
        lines = style.caption_breaks(caption, wrap_japanese=True).splitlines()
        self.assertEqual(len(lines), 2)
        self.assertEqual("".join(lines), caption)
        self.assertFalse(lines[1].startswith("、"))

    def test_single_and_paired_titles_take_the_stage_without_section_labels(self):
        sources = [{"id": "en", "title": "A record of the star", "url": "https://example.org/"},
                   {"id": "ja", "title": "星の記録", "url": "https://example.jp/"}]
        scene = {"asset": "source", "ja": {"heading": ""}, "en": {"heading": ""}}
        for lang in ("ja", "en"):
            for ids, centers in ((["en"], [640]), (["en", "ja"], [334, 946])):
                with self.subTest(lang=lang, sources=ids):
                    board = _board({"sources": sources}, {**scene, "sourceIds": ids}, lang, set())
                    paper = Image.new("RGB", board.size, PAPER)
                    ink = ImageChops.difference(board, paper)
                    self.assertIsNone(ink.crop((0, 64, W, 128)).getbbox())
                    for center in centers:
                        half = (W // len(centers)) // 2
                        box = ink.crop((center-half, 128, center+half, 306)).getbbox()
                        self.assertIsNotNone(box)
                        self.assertAlmostEqual((box[0] + box[2])/2, half, delta=10)


if __name__ == "__main__":
    unittest.main()
