import unittest
from unittest.mock import patch

from media import _phrases, _timed_scenes


class SubtitleTest(unittest.TestCase):
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
