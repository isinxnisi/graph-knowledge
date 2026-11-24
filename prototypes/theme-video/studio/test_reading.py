import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import wave

import numpy as np

import media
from speech_reading import apply_readings, validate_readings


class SceneReadingTest(unittest.TestCase):
    def test_canonical_map_repeated_surface_and_single_pass(self):
        sentence = "一日と一日、そしてつい。"
        words = validate_readings(sentence, [
            {"text": "一日", "kana": "ツイタチ"},
            {"text": "つい", "kana": "おもわず"},
            {"text": "一日", "kana": "ﾂｲﾀﾁ"},
        ])
        self.assertEqual(len(words), 2)
        self.assertEqual(apply_readings(sentence, words), "ツイタチとツイタチ、そしておもわず。")
        self.assertEqual(apply_readings("一日とつい", [{"text": "一日", "kana": "ついたち"}, words[1]]),
                         "ついたちとおもわず")
        self.assertEqual(validate_readings(sentence, None), [])
        spaced = "HD  84406を観測した。"
        entry = {"text": "HD  84406", "kana": "ほし"}
        self.assertEqual(media._utterances({"narration": spaced, "readings": [entry]}, "ja"),
                         [("HD 84406を観測した。", "ほしを観測した。")])

    def test_problematic_entries_are_rejected_before_synthesis(self):
        for bad in [
            [{"text": "二日", "kana": "ふつか"}], [{"text": "一日", "kana": "1にち"}],
            [{"text": "一日", "kana": "ー"}], [{"text": "一日", "kana": ""}],
            [{"text": "一日", "kana": "ついたち"}, {"text": "一日", "kana": "いちにち"}],
            [{"text": "一日", "kana": "ついたち"}, {"text": "日", "kana": "ひ"}],
            [{"text": "一日。", "kana": "ついたち"}], {}, ["一日"],
        ]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_readings("一日。", bad)
        with self.assertRaises(ValueError):
            validate_readings("一" * 200, [{"text": "一", "kana": "あ" * 20}])

    def test_long_captions_keep_the_corrected_term_intact(self):
        term = "ジェームズウェッブ宇宙望遠鏡"
        caption = "あ" * 20 + term + "い" * 24 + "。"
        rules = [{"text": term, "kana": "ジェイダブリューエスティー"}]
        lines = media._utterances({"narration": caption, "readings": rules}, "ja")
        self.assertEqual("".join(text for text, _ in lines), caption)
        self.assertEqual("".join(sound for _, sound in lines), caption.replace(term, rules[0]["kana"]))
        self.assertTrue(any(term in text for text, _ in lines))
        self.assertTrue(all(text == sound for text, sound in media._utterances({"narration": caption}, "ja")))
        self.assertEqual(media._utterances({"narration": "One star.", "readings": rules}, "en"),
                         [("One star.", "One star.")])

    def test_cache_and_preview_use_the_actual_pronunciation(self):
        def audio_request(base, route, params, data=b""):
            if route == "/audio_query":
                queries.append(params["text"])
                return b"{}"
            result = io.BytesIO()
            media._save_wav(result, np.arange(4000, dtype="<i2"))
            return result.getvalue()

        queries = []
        with TemporaryDirectory() as folder, patch.object(media, "media_home", return_value=Path(folder)), \
                patch.object(media, "_voicevox", return_value=("local", 1, "test")), \
                patch.object(media, "_request", side_effect=audio_request):
            date = [{"text": "一日", "kana": "ついたち"}]
            duration = [{"text": "一日", "kana": "いちにち"}]
            with ThreadPoolExecutor(max_workers=2) as workers:
                previews = list(workers.map(lambda _: media.preview_reading("一日。", date), range(2)))
            self.assertEqual(previews[0], previews[1])
            first = previews[0]
            self.assertEqual(media.preview_reading("一日。", date), first)
            media.preview_reading("一日。", duration)
            self.assertEqual(queries, ["ついたち。", "いちにち。"])
            with wave.open(io.BytesIO(first), "rb") as audio:
                self.assertEqual((audio.getnchannels(), audio.getframerate(), audio.getsampwidth()), (1, 24000, 2))
                self.assertGreater(audio.getnframes(), 0)


if __name__ == "__main__":
    unittest.main()
