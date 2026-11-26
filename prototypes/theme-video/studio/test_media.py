from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
from media import FPS, RATE, WIPE_DEMO, _phrases, _read_pcm, _scene_cues, _timed_scenes, render_edition
from channel_sound import opening_notes


class SubtitleTest(unittest.TestCase):
    def test_focus_change_finishes_before_the_spoken_observation(self):
        from webb.boards import Boards
        boards = Boards.__new__(Boards)
        with patch.object(boards, "focus_shot", side_effect=lambda position: position):
            self.assertEqual(boards.frame("focus", .2), .2)
            self.assertEqual(boards.frame("focus", .2, voice_starts_at=.2), .5)
            self.assertEqual(boards.frame("focus", 1, voice_starts_at=.2), 1)

    def test_focus_concentrates_the_spot_without_dimming_it(self):
        import numpy as np
        from webb.boards import Boards
        start, end = [np.array(Boards.spot_in_focus(p))[:, :, 0].astype(float) - 32
                      for p in (0, 1)]
        self.assertGreater(end.max(), start.max())
        self.assertAlmostEqual(end.sum() / start.sum(), 1, delta=.02)

    def test_an_authored_picture_can_precede_the_voice_or_cut_on_the_last_word(self):
        line = {"narration": "鏡を動かします。"}
        scene = {"asset": "source", "ja": line, "en": {"narration": "Move the mirror."},
                 "visualTiming": {"beforeVoice": 1.75, "afterVoice": 0}}
        with patch("media._speech", return_value=[0] * 1000):
            ja = _scene_cues(scene, "ja", "test", None, True)
            en = _scene_cues(scene, "en", "test", None, True)
            scene["visualTiming"] = {"beforeVoice": 0, "afterVoice": 2.5}
            cut = _scene_cues(scene, "ja", "test", None, True)
        self.assertEqual(ja[0], (42, "", None))
        self.assertEqual(ja[-1][1], line["narration"])
        self.assertEqual((en[0][0], en[-1][0]), (26, 14))
        self.assertEqual(cut[0][1], line["narration"])
        self.assertEqual(cut[-1], (60, "", None))

    def test_leading_ellipsis_gives_the_viewer_time_before_the_answer(self):
        scene = {"asset": "webb-tilt", "ja": {"narration": "鏡を動かします。……一点が動きました。"}}
        with patch("media._speech", return_value=[0] * 1000):
            cues = _scene_cues(scene, "ja", "test", None, False)
        self.assertEqual(cues[2], (5 + FPS, "", None))
        self.assertEqual(cues[3][1], "……一点が動きました。")

    def test_shared_phrase_boundary_for_speech_and_captions(self):
        sentence = ("These eighteen spots show the same star, each formed by light reflected "
                    "from a different primary mirror segment.")
        parts = _phrases(sentence, "en")
        self.assertEqual(" ".join(parts), sentence)
        self.assertEqual(parts[0], "These eighteen spots show the same star,")
        self.assertTrue(parts[-1].endswith("primary mirror segment."))

    def test_camera_progress_continues_across_adjacent_scenes_on_the_same_board(self):
        shots = ("webb-map", "webb-map", "webb-return", "webb-map")
        scenes = [{"asset": shot} for shot in shots]
        lengths = (40, 80, 24, 36)
        cues = [[(frames, "", None)] for frames in lengths]
        with patch("media._scene_cues", side_effect=cues):
            timed = list(_timed_scenes(scenes, "ja", "voice", None, lambda _: None))
        self.assertEqual([(offset, duration) for _, _, offset, duration in timed],
                         [(0, 120), (40, 120), (0, 24), (0, 36)])


class OpeningSoundTest(unittest.TestCase):
    def test_opening_uses_the_reference_notes_once_and_respects_the_authored_entrance(self):
        plan = {"sources": [], "titles": {"ja": "見本", "en": "Sample"}, "scenes": [
            {"id": "s1", "asset": "source", "ja": {"heading": "", "narration": "はじめ。"},
             "en": {"heading": "", "narration": "Begin."}}]}
        scene = plan["scenes"][0]
        speech = np.full(RATE, 16000, dtype="<i2")
        board = Image.new("RGB", (4, 4))
        def capture_mix(args, *, cwd, **kwargs):
            self.samples = _read_pcm((cwd / "mix.wav").read_bytes())
            (cwd / "video.mp4").write_bytes(b"encoded fixture")

        with TemporaryDirectory() as tmp, ExitStack() as stack:
            for name, value in (("_voice", ("test", None)), ("_speech", speech), ("_board", board),
                                ("_credit", board), ("render_wipe", board)):
                stack.enter_context(patch("media." + name, return_value=value))
            stack.enter_context(patch("media.subprocess.run", side_effect=capture_mix))
            for lang in ("ja", "en"):
                render_edition(plan, lang, tmp)
                voice_start = round(26 * RATE / FPS)
                start, tone = next(opening_notes(RATE))
                self.assertTrue(np.array_equal(self.samples[start:start+1000], np.rint(tone[:1000] * 32767)))
                self.assertLess(np.abs(self.samples[voice_start:voice_start+RATE] - speech).max(), 2000)
                self.assertIn("00:00:01,083 -->", (Path(tmp) / "subtitles.srt").read_text(encoding="utf-8"))
            baseline = self.samples.copy()
            render_edition(plan, "en", tmp)
            self.assertTrue(np.array_equal(self.samples, baseline))

            scene["visualTiming"] = {"beforeVoice": 0}
            render_edition(plan, "ja", tmp)
            self.assertTrue(np.array_equal(self.samples[:RATE], speech))

            del scene["visualTiming"]
            scene["asset"] = WIPE_DEMO
            render_edition(plan, "ja", tmp)
            self.assertFalse(self.samples[:round(0.2 * RATE)].any())
            self.assertTrue(self.samples[:voice_start].any())  # The paper swish still plays.


if __name__ == "__main__":
    unittest.main()
