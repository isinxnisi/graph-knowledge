import unittest
from unittest.mock import patch

from media import FPS, _phrases, _scene_cues, _timed_scenes


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


if __name__ == "__main__":
    unittest.main()
