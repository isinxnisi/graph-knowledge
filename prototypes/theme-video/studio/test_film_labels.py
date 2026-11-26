from copy import deepcopy
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import ImageChops, ImageFont

import editor
import media
from authored_media import prepare_scene
from film_labels import physical_labels, validate_label_targets, validate_labels
from test_authored_art import pose


def card():
    return {"background": "#f6efe2", "layers": [{"name": "札", "paths": [
        {"d": "M-110 -46 H110 V46 H-110 Z", "fill": "#13283d", "stroke": "none", "width": 0}],
        "keys": [pose(0, 240, 350), pose(1, 640, 350)]}]}


class FilmLabelsTest(unittest.TestCase):
    def setUp(self):
        self.labels = validate_labels([
            {"ja": "山田　太郎", "x": 340, "y": 290, "color": "#173344", "size": 44},
            {"ja": "佐藤　花子", "x": 910, "y": 290, "color": "#173344", "size": 44}])
        self.shot = {"id": "s1", "asset": "authored", "art": card(),
                     "ja": {"heading": "", "narration": ""}, "silentSeconds": 2, "sourceIds": ["s"],
                     "labels": self.labels}
        self.master = {"productionMode": "directed-film-v1", "titles": {"ja": "記名"},
                       "themeId": "t", "scenes": [self.shot], "sources": []}
        self.words = [{"ja": "山田　太郎", "en": "Taro Yamada"}, {"ja": "佐藤　花子", "en": "Hanako Sato"}]
        self.translation = {"title": "Credits", "scenes": [
            {"id": "s1", "heading": "", "narration": "", "labels": self.words}]}
        linux_font = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        if linux_font.exists():
            for lang in ("ja", "en"):
                self.enterContext(patch.object(media._style(lang), "font",
                                              side_effect=lambda family, size: ImageFont.truetype(str(linux_font), size)))

    def test_literal_words_are_translated_at_the_same_points_in_both_real_pictures(self):
        payload, schema = editor._adaptation_request(self.master, {"themeId": "t", "title": "記名"}, "")
        self.assertEqual(payload["scenes"][0]["labels"], [label["ja"] for label in self.labels])
        self.assertIn("labels", schema["properties"]["scenes"]["items"]["required"])
        shot = editor._apply_adaptation(self.translation, self.master)["scenes"][0]
        self.assertEqual(shot["labels"], [{**label, **word} for label, word in zip(self.labels, self.words)])
        for lang in ("ja", "en"):
            blank = prepare_scene({**shot, "labels": []}, lang)(.5)
            delta = ImageChops.difference(prepare_scene(shot, lang)(.5), blank)
            for label in self.labels:
                x, y = label["x"], label["y"]
                area = (x - 250, y - 55, x + 250, y + 55)
                left, top, right, bottom = delta.crop(area).getbbox()
                self.assertAlmostEqual((left + right) / 2 + area[0], x, delta=6)
                self.assertAlmostEqual((top + bottom) / 2 + area[1], y, delta=12)
            self.assertIsNone(delta.crop((0, 562, 1280, 720)).getbbox())
        self.assertNotIn("en", self.shot["labels"][0])

    def test_bad_layout_or_mismatched_translation_is_repairable_and_old_contract_is_unchanged(self):
        for changes in ({"x": -1}, {"size": 0}, {"color": "invalid"}, {"ja": "two\nlines"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_labels([{**self.labels[0], **changes}])
        with self.assertRaisesRegex(ValueError, "間隔"):
            validate_labels([self.labels[0], self.labels[0]])
        for bad in (self.words[:1], list(reversed(self.words)), [{**self.words[0], "en": ""}, self.words[1]]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                editor._apply_adaptation({**self.translation, "scenes": [
                    {**self.translation["scenes"][0], "labels": bad}]}, self.master)
        previous = deepcopy(self.master)
        del previous["scenes"][0]["labels"]
        line = {k: v for k, v in self.translation["scenes"][0].items() if k != "labels"}
        mapped = editor._apply_adaptation({"title": "Credits", "scenes": [line]}, previous)
        self.assertNotIn("labels", mapped["scenes"][0])
        _, schema = editor._adaptation_request(previous, {"themeId": "t", "title": "記名"}, "")
        self.assertNotIn("labels", schema["properties"]["scenes"]["items"]["properties"])

    def test_printed_ink_follows_the_card_turn_fade_and_occlusion_in_both_languages(self):
        art = self.shot["art"]
        layer = art["layers"][0]
        layer["keys"] = [pose(0, 220, 320), pose(.25, 320, 320),
                         {**pose(.5, 500, 320, .5), "rotate": 90, "scale": 1.5},
                         pose(.65, 640, 320, 0), pose(.75, 800, 320), pose(1, 900, 320)]
        art["layers"].append({"name": "手前の衝立", "paths": [{"d": "M710 140 H940 V510 H710 Z",
            "fill": "#e7d49e", "stroke": "none", "width": 0}], "keys": []})
        label = {"ja": "開く", "x": 25, "y": 0, "size": 40, "color": "auto", "track": {"layer": "札", "from": .2, "until": .8}}
        self.shot["labels"] = validate_labels([label])
        payload, _ = editor._adaptation_request(self.master, {"themeId": "t", "title": "札の動き"}, "")
        self.assertEqual(payload["scenes"][0]["labels"], [{"ja": "開く", **label["track"]}])
        self.translation["scenes"][0]["labels"] = [{"ja": "開く", "en": "OPEN"}]
        shot = editor._apply_adaptation(self.translation, self.master)["scenes"][0]
        for lang in ("ja", "en"):
            with self.subTest(lang=lang):
                drawing = prepare_scene(shot, lang)
                host = prepare_scene({**shot, "labels": []}, lang)
                delta = lambda at: ImageChops.difference(drawing(at), host(at))
                for hidden in (0, .19, .65, .75, .8, 1):
                    self.assertIsNone(delta(hidden).getbbox())
                initial = delta(.25)
                l, t, r, b = initial.getbbox()
                self.assertAlmostEqual((l + r) / 2, 345, delta=6)
                self.assertAlmostEqual((t + b) / 2, 320, delta=10)
                half = delta(.5)
                l, t, r, b = half.getbbox()
                self.assertAlmostEqual((l + r) / 2, 500, delta=12)
                self.assertAlmostEqual((t + b) / 2, 357.5, delta=8)
                self.assertGreater(b - t, r - l)
                # Light type on the dark card; ink and face fade as one object.
                self.assertGreater(initial.getextrema()[0][1], 200)
                self.assertAlmostEqual(half.getextrema()[0][1], initial.getextrema()[0][1] / 2, delta=9)
                dark_ink = {**shot["labels"][0], "color": "#11283d"}
                corrected = prepare_scene({**shot, "labels": [dark_ink]}, lang)(.25)
                self.assertIsNone(ImageChops.difference(corrected, drawing(.25)).getbbox())

    def test_replacing_type_on_the_same_spot_and_unambiguous_attachment(self):
        def short(word, start, end):
            return {"ja": word, "track": {"layer": "札", "from": start, "until": end}}
        labels = validate_labels([short("開く", 0, .4), short("閉じる", .4, 1)])
        self.assertEqual((labels[0]["x"], labels[0]["size"], labels[0]["color"]), (0, 40, "auto"))
        validate_label_targets(labels, self.shot["art"])
        with self.assertRaisesRegex(ValueError, "間隔"):
            validate_labels([short("開く", 0, .5), short("閉じる", .4, 1)])
        for invalid in ((0, 0), (-1, 1), (0, 2), (.8, .2)):
            with self.assertRaises(ValueError):
                validate_labels([short("開く", *invalid)])
        for art in ({"layers": []}, {"layers": self.shot["art"]["layers"] * 2}):
            with self.assertRaisesRegex(ValueError, "貼り先"):
                validate_label_targets(labels, art)

    def test_motion_proof_keeps_only_ink_visible_while_the_object_transforms(self):
        keys = [pose(0, 30, 20, 0), pose(.25, 70, 20, 0), pose(.4, 70, 20),
                {**pose(.75, 70, 20), "rotate": 90, "scale": 2}]
        layer = self.shot["art"]["layers"][0]
        layer["keys"] = keys
        def interval(word, start, end):
            return {"ja": word, "track": {"layer": "札", "from": start, "until": end}}
        rotating = interval("回転", .6, .7)
        labels = [interval("消えたまま移動", 0, .24), interval("フェードのみ", .25, .4), rotating,
                  interval("着地後", .75, 1), {"ja": "固定"}]
        self.assertEqual(physical_labels({**self.shot, "labels": labels}), [rotating])

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is needed for the delivered cut")
    def test_timed_free_type_appears_only_inside_the_decoded_static_shot(self):
        self.shot["art"]["layers"][0]["keys"] = [pose(0, 300, 300)]
        self.shot.update(sound={"kind": "none", "gain": 0, "at": 0}, silentSeconds=1)
        self.shot["labels"] = validate_labels([{"ja": "OPEN", "track": {"layer": "", "from": .3, "until": .7}}])
        with tempfile.TemporaryDirectory() as tmp:
            media.render_edition(self.master, "ja", Path(tmp))
            raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(Path(tmp) / "video.mp4"), "-vf",
                "crop=180:80:550:260,format=gray", "-frames:v", "24", "-f", "rawvideo", "pipe:1"])
            pixels = np.frombuffer(raw, dtype='u1').reshape(24, 80, 180)
            self.assertGreater(pixels[0].min(), 200)
            self.assertLess(pixels[12].min(), 80)
            self.assertGreater(pixels[-1].min(), 200)


if __name__ == "__main__":
    unittest.main()
