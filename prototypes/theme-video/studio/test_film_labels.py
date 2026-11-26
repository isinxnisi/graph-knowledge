from copy import deepcopy
from pathlib import Path
import unittest
from unittest.mock import patch

from PIL import ImageChops, ImageFont

import editor
import media
from authored_media import prepare_scene
from film_labels import validate_labels
from test_film_direction import polygon


class FilmLabelsTest(unittest.TestCase):
    def setUp(self):
        self.labels = validate_labels([
            {"ja": "山田　太郎", "x": 340, "y": 290, "color": "#173344", "size": 44},
            {"ja": "佐藤　花子", "x": 910, "y": 290, "color": "#173344", "size": 44}])
        self.shot = {"id": "s1", "asset": "authored", "art": polygon("#d5cdbc"),
                     "ja": {"heading": "", "narration": ""}, "silentSeconds": 2, "sourceIds": ["s"],
                     "labels": self.labels}
        self.master = {"productionMode": "directed-film-v1", "titles": {"ja": "記名"},
                       "themeId": "t", "scenes": [self.shot], "sources": []}
        self.words = [{"ja": "山田　太郎", "en": "Taro Yamada"}, {"ja": "佐藤　花子", "en": "Hanako Sato"}]
        self.translation = {"title": "Credits", "scenes": [
            {"id": "s1", "heading": "", "narration": "", "labels": self.words}]}

    def test_literal_words_are_translated_at_the_same_points_in_both_real_pictures(self):
        payload, schema = editor._adaptation_request(self.master, {"themeId": "t", "title": "記名"}, "")
        self.assertEqual(payload["scenes"][0]["labels"], [label["ja"] for label in self.labels])
        self.assertIn("labels", schema["properties"]["scenes"]["items"]["required"])
        shot = editor._apply_adaptation(self.translation, self.master)["scenes"][0]
        self.assertEqual(shot["labels"], [{**label, **word} for label, word in zip(self.labels, self.words)])
        linux_font = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        for lang in ("ja", "en"):
            if linux_font.exists():
                self.enterContext(patch.object(media._style(lang), "font",
                                              side_effect=lambda family, size: ImageFont.truetype(str(linux_font), size)))
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


if __name__ == "__main__":
    unittest.main()
