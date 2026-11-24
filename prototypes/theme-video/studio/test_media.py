import unittest
from media import _phrases


class SubtitleTest(unittest.TestCase):
    def test_shared_phrase_boundary_for_speech_and_captions(self):
        sentence = ("These eighteen spots show the same star, each formed by light reflected "
                    "from a different primary mirror segment.")
        parts = _phrases(sentence, "en")
        self.assertEqual(" ".join(parts), sentence)
        self.assertEqual(parts[0], "These eighteen spots show the same star,")
        self.assertTrue(parts[-1].endswith("primary mirror segment."))


if __name__ == "__main__":
    unittest.main()
