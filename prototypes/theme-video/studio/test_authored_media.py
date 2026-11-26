import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import media
from authored_media import _write_soundtrack, validate_sound_layers


def scene(identifier, text, seconds):
    x = 560
    art = {"background": "#f5f1e7", "layers": [
        {"name": "糸巻き", "paths": [{"d": "M -24 -18 L 24 -18 L 16 0 L 24 18 L -24 18 L -16 0 Z",
                                   "fill": "#305b66", "stroke": "#333333", "width": 2}],
         "keys": [{"at": t, "x": x + 100 * t, "y": 320, "scale": 1, "rotate": 0,
                   "opacity": 1} for t in (0, 1)]}]}
    return {"id": identifier, "asset": "authored", "art": art, "ja": {"heading": "", "narration": text},
            "en": {"heading": "", "narration": "A spool." if text else ""}, "leadSeconds": .125,
            "tailSeconds": .25, "silentSeconds": seconds, "sourceIds": ["s"],
            "sound": {"kind": "none", "at": 0, "gain": 0}}


def film():
    first = scene("intro", "糸巻き。", 0)
    first["ja"]["readings"] = [{"text": "糸巻き", "kana": "いとまき"}]
    first["sound"] = {"kind": "tap", "at": 1, "gain": 1}
    return {"productionMode": "directed-film-v1", "titles": {"ja": "糸巻き", "en": "Spool"},
            "sources": [{"id": "s", "url": "https://example.org/spool", "title": "Spool"}],
            "scenes": [first, scene("roll", "", .5)]}


class AuthoredMediaTest(unittest.TestCase):
    def test_separate_tones_can_overlap_and_decay_after_the_cut(self):
        low = {"wave": "sine", "at": .5, "seconds": .4, "hzFrom": 420, "hzTo": 420,
               "attack": .01, "release": .04, "gain": .6}
        high = {**low, "wave": "triangle", "hzFrom": 710, "hzTo": 710, "gain": .45}
        scrape = {**low, "wave": "noise", "at": 1, "hzFrom": 2400, "hzTo": 300, "gain": .4}
        plan = film()
        plan["scenes"] = [scene("wind", "", .5), scene("rest", "", .5)]
        plan["scenes"][0]["soundLayers"] = [low, high, scrape]
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            def render_sound():
                _, cuts = _write_soundtrack(plan, "ja", work, lambda _: None)
                return cuts, media._read_pcm((work / "mix.wav").read_bytes())
            cuts, pcm = render_sound()
            self.assertEqual(cuts[0]["layerTimes"], [.25, .25, .5])
            self.assertFalse(pcm[:media.RATE // 4].any())
            # Both chosen frequencies are present at the same time, independently of the preset library.
            sample = pcm[round(.30 * media.RATE):round(.40 * media.RATE)]
            spectrum = np.abs(np.fft.rfft(sample * np.hanning(len(sample))))
            self.assertGreater(spectrum[42], 15 * spectrum[38])
            self.assertGreater(spectrum[71], 15 * spectrum[66])
            self.assertGreater(np.abs(pcm[round(.67 * media.RATE):round(.88 * media.RATE)]).max(), 75)
            self.assertFalse(pcm[round(.901 * media.RATE):].any())
            self.assertTrue(np.array_equal(render_sound()[1], pcm))

    def test_invalid_wave_and_envelope_give_repairable_errors(self):
        layer = {"wave": "noise", "at": .25, "seconds": .2, "hzFrom": 1200, "hzTo": 500,
                 "attack": .03, "release": .09, "gain": .4}
        for change in ({"wave": "speak"}, {"at": True}, {"gain": float("nan")}, {"hzTo": 10000},
                       {"seconds": .08}, {"release": 0}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_sound_layers([{**layer, **change}])
        with self.assertRaises(ValueError):
            validate_sound_layers([layer] * 21)
        self.assertEqual(validate_sound_layers([layer]), [layer])

    def test_picture_only_film_does_not_start_a_voice_engine(self):
        plan = film()
        plan["scenes"] = [scene("roll", "", .5)]
        with tempfile.TemporaryDirectory() as name, patch("media._voice") as engine:
            voice, cuts = _write_soundtrack(plan, "ja", Path(name), lambda _: None)
            engine.assert_not_called()
            self.assertEqual(voice, "語りなし")
            self.assertEqual(cuts[0]["frames"], 12)
            self.assertEqual((Path(name) / "subtitles.srt").read_bytes(), b"")

    def test_measured_speech_and_a_cut_point_sound_continue_into_silent_shot(self):
        with tempfile.TemporaryDirectory() as name, patch("media._voice", return_value=("fixture", None)), \
                patch("media._speech", return_value=np.zeros(media.RATE // 4, dtype="<i2")) as synth:
            work = Path(name)
            _, cuts = _write_soundtrack(film(), "ja", work, lambda _: None)
            self.assertEqual(synth.call_count, 1)
            self.assertNotIn("糸巻き", synth.call_args.args[0])
            self.assertEqual(cuts[0]["frames"], 15)
            self.assertEqual(cuts[0]["sound"], 15 / media.FPS)
            self.assertEqual(cuts[1], {"start": 15, "frames": 12, "cues": [], "sound": None, "layerTimes": []})
            pcm = media._read_pcm((work / "mix.wav").read_bytes())
            self.assertFalse(pcm[:15000].any())
            self.assertTrue(pcm[15000:18000].any())
            srt = (work / "subtitles.srt").read_text(encoding="utf-8")
            self.assertIn("00:00:00,125 --> 00:00:00,375\n糸巻き。", srt)

    def test_pause_before_publishing_keeps_the_existing_edition(self):
        def pause(_):
            raise RuntimeError("fixture pause")
        with tempfile.TemporaryDirectory() as name, patch("media._voice", return_value=("fixture", None)):
            work = Path(name)
            (work / "video.mp4").write_bytes(b"old")
            with self.assertRaisesRegex(RuntimeError, "fixture pause"):
                media.render_edition(film(), "ja", work, pause)
            self.assertEqual([p.name for p in work.iterdir()], ["video.mp4"])
            self.assertEqual((work / "video.mp4").read_bytes(), b"old")

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is needed for the video fixture")
    def test_real_render_and_decoded_contact_sheet(self):
        with tempfile.TemporaryDirectory() as name, patch("media._voice", return_value=("fixture", None)), \
                patch("media._speech", return_value=np.zeros(media.RATE // 4, dtype="<i2")):
            work = Path(name)
            # CI outside Windows may have only DejaVu Sans, so this fixture uses English copy.
            system_font = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
            style = media._style("en")
            if system_font.is_file():
                from PIL import ImageFont
                self.enterContext(patch.object(style, "font", side_effect=lambda family, size:
                                               ImageFont.truetype(str(system_font), size)))
            result = media.render_edition(film(), "en", work)
            self.assertEqual(result["duration"], 6.125)
            timings = json.loads((work / "timings.json").read_text(encoding="utf-8"))
            self.assertEqual(timings[1]["speech"], [])
            self.assertAlmostEqual(timings[0]["soundAt"], timings[1]["start"])
            with Image.open(work / "contact-sheet.png") as sheet:
                self.assertEqual(sheet.size, (960, 360))
            probe = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,nb_frames",
                                             "-of", "json", str(work / "video.mp4")])
            video, audio = json.loads(probe)["streams"]
            self.assertEqual((video["codec_name"], audio["codec_name"]), ("h264", "aac"))
            self.assertEqual(int(video["nb_frames"]), 147)
            self.assertIn("A spool.", (work / "subtitles.srt").read_text(encoding="utf-8"))
