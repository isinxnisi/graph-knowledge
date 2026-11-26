from pathlib import Path
import json
import hashlib
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import film_checkpoint
import media
from authored_media import FPS, _encode, _write_soundtrack
from film_preview import edit_proof, render_excerpt
from test_authored_media import film, scene


class CutPreviewTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.plan = film()
        self.plan["scenes"] = [scene("before", "表示中の字幕。", 0), scene("center", "", .5), scene("next", "", 2)]
        self.plan["scenes"][1]["sound"] = {"kind": "chime", "at": .8, "gain": .9}

    def test_native_resume_binds_evidence_model_and_parent_and_detects_damage(self):
        facts = {"sources": ["a"]}
        first = self.folder / "original.png"
        first.write_bytes(b"parent version")
        payload = dict(plan=self.plan, direction_hash="digest", seen=[], review={"repairs": []}, history=[], usage={})
        film_checkpoint.save_cut(self.folder, facts, "model", "high", first, **payload)
        self.assertEqual(payload, film_checkpoint.load_cut(self.folder, facts, "model", "high", first))
        self.assertIsNone(film_checkpoint.load_cut(self.folder, facts, "model", "ultra", first))
        self.assertIsNone(film_checkpoint.load_cut(self.folder, {"sources": ["b"]}, "model", "high", first))
        first.write_bytes(b"new parent")
        self.assertIsNone(film_checkpoint.load_cut(self.folder, facts, "model", "high", first))
        stored = self.folder / film_checkpoint.FILE
        data = json.loads(stored.read_bytes())
        data["cut"]["review"]["repairs"].append("changed")
        stored.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "照合"):
            film_checkpoint.read_saved_cut(self.folder)

    def test_director_proof_shows_neighbors_and_old_revision(self):
        shots = self.plan["scenes"]
        beat = {"sceneId": "center", "sampleAt": [.22, .45, .85]}
        file = edit_proof(self.folder, shots, 1, beat, previous=shots[1])
        with Image.open(file) as proof:
            self.assertGreater(proof.height, 1000)
        self.assertEqual(file, edit_proof(self.folder, shots, 1, beat, previous=shots[1]))
        shots[0]["art"]["background"] = "#123456"
        self.assertNotEqual(file, edit_proof(self.folder, shots, 1, beat, previous=shots[1]))

    def test_legacy_cut_requires_every_page_to_match_the_blind_viewing(self):
        from editor import _save_json, _writer_request
        from film_direction import check_direction, evidence_for, proof_sheet
        from test_film_direction import SNAP, polygon, setup_direction
        from writer_feedback import RevisionNeeded, request_digest

        stages = self.folder / "editor-stages"
        stages.mkdir()
        sequence = 0

        def record(stage, inputs, raw):
            nonlocal sequence
            req = _writer_request("model", "high", film_checkpoint.LEGACY_VERSION, stage, inputs, {})
            path = stages / (stage + "-" + request_digest(req) + ".json")
            _save_json(path, dict(request=req, stage=stage, inputSha256=request_digest(req), status="done", result=raw))
            sequence += 1
            os.utime(path, (1700000000 + sequence,) * 2)
            return req, path

        facts = {**SNAP, "commission": {"mode": "theme"}}
        direction = setup_direction()
        req, _ = record("direction", facts, direction)
        _save_json(self.folder / "editor-input.json", req)
        plan = check_direction(direction, ["ref-1"])
        art = polygon("#335577")
        for shot in plan["scenes"]:
            _, last_drawing = record("art-" + shot["id"], {"scene": dict(shot), "style": plan["style"]}, art)
            shot["art"] = art
        page = proof_sheet(stages, plan["scenes"], plan["visualBeat"])
        digest = hashlib.sha256(page.read_bytes()).hexdigest()
        ids = [s["id"] for s in plan["scenes"]]
        seen = [{"sceneId": sid, "seen": "紙の角が見える。"} for sid in ids]
        signals = [{"kind": "travel", "trace": "角が動く。"}]
        record("look-s1", dict(sceneIds=ids, focusSceneId="s2", imageSha256=digest),
               dict(observations=seen, focusSignals=signals))
        seen[-1]["focusSignals"] = signals
        cut = [{k: v for k, v in shot.items() if k != "art"} for shot in plan["scenes"]]
        review = dict(materialRequest="", repairs=[dict(sceneId="s1", target="edit", reason="文字が早い。")],
                      focusVerdict=dict(result="clear", basis="角を追える。", observation=1))
        record("edit-review", {"pass": 1, "cut": cut, "viewer": seen, "imageSha256": digest,
                               "commission": facts["commission"], "story": plan["story"], "visualBeat": plan["visualBeat"],
                               **evidence_for(facts, {"ref-1"})}, review)
        restored = film_checkpoint.load_cut(self.folder, facts, "model", "high")
        self.assertEqual(restored["review"]["repairs"], review["repairs"])
        entry = json.loads(last_drawing.read_bytes())
        entry["result"] = polygon("#dd2200")
        stat = last_drawing.stat()
        _save_json(last_drawing, entry)
        os.utime(last_drawing, ns=(stat.st_atime_ns, stat.st_mtime_ns))
        with self.assertRaisesRegex(RevisionNeeded, "試写画像と保存原画"):
            film_checkpoint.load_cut(self.folder, facts, "model", "high")

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
    def test_excerpt_matches_final_clock_with_already_visible_subtitle_and_sound(self):
        track = (4000 * np.sin(2 * np.pi * 210 * np.arange(media.RATE * 2) / media.RATE)).astype("<i2")
        with patch.object(media, "_voice", return_value=("fixture", None)), patch.object(media, "_speech", return_value=track):
            voice, cuts = _write_soundtrack(self.plan, "ja", self.folder, lambda _: None)
            _encode(self.folder, self.plan, "ja", voice, cuts, lambda _: None)
            clip = render_excerpt(self.folder, self.plan, 1)
        with patch("film_preview._write_soundtrack", side_effect=AssertionError):
            self.assertEqual(render_excerpt(self.folder, self.plan, 1), clip)
        start = cuts[1]["start"] - FPS
        def frames(path, first, count):
            raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-an", "-vf",
                    f"trim=start_frame={first}:end_frame={first + count},setpts=PTS-STARTPTS,scale=160:90", "-f", "rawvideo",
                    "-pix_fmt", "rgb24", "-"])
            return np.frombuffer(raw, dtype=np.uint8).astype(float).reshape(-1, 90, 160, 3)
        movie = self.folder / "video.mp4"
        # The selection starts mid-utterance and includes both cut boundaries.
        expected_frames = FPS * 2 + cuts[1]["frames"]
        excerpt = frames(clip, 0, expected_frames + 2)
        self.assertEqual(len(excerpt), expected_frames)
        full = frames(movie, start, expected_frames)
        self.assertLess(np.abs(excerpt - full).mean(axis=(1, 2, 3)).max(), 3)
        def audio(path):
            pcm = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ar", str(media.RATE),
                                           "-ac", "1", "-f", "s16le", "-"])
            return np.frombuffer(pcm, dtype="<i2").astype(float)
        expected = audio(movie)[start * media.RATE // FPS:][:expected_frames * media.RATE // FPS]
        actual = audio(clip)[:len(expected)]
        self.assertGreater(np.corrcoef(expected, actual)[0, 1], .98)
