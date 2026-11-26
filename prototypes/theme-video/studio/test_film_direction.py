import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import film_direction as film


def scene(narration):
    return {"picture": "一枚の紙を折る前後で片方の角が重なる。", "medium": "documented",
            "sourceIds": ["ref-1"], "referenceScene": 0, "heading": "", "narration": narration,
            "readings": [], "leadSeconds": 0, "tailSeconds": 0, "silentSeconds": 0 if narration else 2.5,
            "sound": {"kind": "paper", "at": .65, "gain": .3}}


def setup_direction():
    return {"title": "紙の角", "style": "紙色を残し、青い角の動きを見せる。", "materialRequest": "",
            "story": {"question": "角がどこに届くか。", "explanation": "折ると二つの角が重なる。",
                      "visualCheck": "同じ色の角が一つに重なる瞬間。"},
            "visualBeat": {"sceneNumber": 2, "witness": "青い角が紙の上を右に滑り、折り目に届く。",
                           "signal": "travel", "sampleAt": [.05, .38, .95]},
            "scenes": [scene("紙の角を見てください。"), {**scene(""), "referenceScene": 1, "medium": "illustration", "sourceIds": []}]}


def polygon(color):
    return {"background": "#f6efe2", "layers": [{"name": "紙の角", "keys": [], "paths": [
        {"d": "M300 200 L650 200 L720 470 Z", "stroke": "#24333a", "fill": color, "width": 3}
    ]}]}


SNAP = {"themeId": "theme:paper", "title": "紙の角", "description": "折り方", "records": [
    {"text": "角は重なる", "evidence": [{"id": "ref-1", "locator": "紙", "excerpt": "折ると二つの角が重なる。"}]}
], "sources": [{"id": "ref-1", "title": "紙の記録", "url": "https://example.org/paper"}]}


class DirectionTests(unittest.TestCase):
    def test_watch_drawings_fix_only_addressed_shot_and_replay(self):
        fresh = []
        painted = []
        blind_pages = set()
        def writer(request):
            prompt = request["prompt"]
            inputs = json.loads(prompt.split("\n\n")[-1])
            if "sceneNumber" in inputs:
                fresh.append("revision")
                if inputs["target"] == "edit":
                    # Removing the last source in a revision goes back to its writer.
                    if "validationFeedback" not in inputs:
                        return {**scene("紙の端を見てください。"), "medium": "illustration", "sourceIds": []}, {}
                    self.assertIn("支える資料", inputs["validationFeedback"])
                    return {**scene("紙の端を見てください。"), "leadSeconds": 1.2}, {}
                self.assertIn("青い角が紙の上を右に滑り", inputs["repair"])
                self.assertIn("同じ位置", inputs["repair"])
                return {**scene(""), "picture": "青い角が右に進んで折り目に届く。", "medium": "illustration", "sourceIds": [],
                        "labels": [{"ja": "折り目", "x": 900, "y": 300, "size": 40, "color": "#24333a"}], "referenceScene": 1}, {}
            self.assertNotIn("cut", inputs)  # The editor must see the actual proof, through the image call.
            fresh.append("direction")
            return setup_direction(), {"input_tokens": 11}

        def viewer(request, path):
            inputs = json.loads(request["prompt"].split("\n\n")[-1])
            self.assertTrue(path.is_file())
            if "cut" in inputs:
                fresh.append("review")
                self.assertIn(path, blind_pages)
                self.assertEqual(inputs["visualBeat"]["sampleAt"], [.05, .38, .95])
                # The editor mistakenly claims success on pass one despite the independent pixel observation.
                repairs = [{"sceneId": "s1", "target": "edit", "reason": "紙の端を見る余白を一拍作る。"}] if inputs["pass"] == 2 else []
                return {"materialRequest": "", "repairs": repairs, "focusVerdict": {
                    "result": "clear", "observation": 1, "basis": "BからCで右端の様子が変わる。"}}, {}
            if "scene" in inputs:
                painted.append(inputs["scene"]["id"])
                if inputs["scene"]["id"] == "s2":
                    self.assertEqual(inputs["reusableLayers"]["names"], ["紙の角"])
                    self.assertEqual(inputs["visualBeat"]["signal"], "travel")
                    # First attempt and first repair only change opacity: a second repair finally moves the paper.
                    moves = "validationFeedback" in inputs
                    art = polygon("#48666d")
                    art["layers"][0]["keys"] = [{"at": at, "x": 250 * at if moves else 0, "y": 0, "rotate": 0,
                                                "scale": 1, "opacity": .6 + .4 * at} for at in (0, 1)]
                    return art, {}
                return polygon("#48666d"), {}
            self.assertIn("imageSha256", inputs)
            self.assertNotIn("story", inputs)
            self.assertNotIn("scene", inputs)
            self.assertNotIn("visualBeat", inputs)
            self.assertEqual(inputs["focusSceneId"], "s2")
            self.assertEqual(inputs["sceneIds"], ["s1", "s2"])
            blind_pages.add(path)
            with Image.open(path) as actual:
                self.assertEqual(actual.width, 432 * 3)
                # Compare ink positions away from the header and logo using only the JPEG.
                row = np.asarray(actual)[267 + 24 + 115, :, 0]
                edges = [np.where(col < 175)[0][0] for col in np.split(row, 3)]
            moved = edges[0] < edges[1] - 8 < edges[2] - 16
            trace = "A、B、Cの順に青い角の先端が右に寄る。" if moved else "A、B、Cで角は同じ位置にあり、色の濃さが変わる。"
            return {"observations": [{"sceneId": sid, "seen": "紙の角が見える。"} for sid in inputs["sceneIds"]],
                    "focusSignals": [{"kind": "travel" if moved else "appearance", "trace": trace}]}, {}

        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            guide = folder / "guide.jpg"
            Image.new("RGB", (600, 300), "#cfcec3").save(guide)
            with patch.object(film, "style_reference", return_value=guide), patch.object(film, "_call_writer", writer), \
                    patch.object(film, "view_cut", viewer):
                plan = film.direct_film(SNAP, "折り目を観察する", "model", "high", folder)
                self.assertEqual(fresh, ["direction", "review", "revision", "review", "revision", "revision", "review"])
                self.assertEqual(painted, ["s1", "s2", "s2", "s2"])
                self.assertEqual(plan["filmReview"]["changes"][0]["sceneId"], "s2")
                self.assertEqual(plan["filmReview"]["rounds"], 3)
                self.assertEqual(plan["filmReview"]["observations"][1]["focusSignals"][0]["kind"], "travel")
                self.assertEqual(plan["scenes"][1]["labels"][0]["ja"], "折り目")
                self.assertEqual(plan["sources"], SNAP["sources"])
                self.assertEqual(plan["scenes"][0]["leadSeconds"], 1.2)
                self.assertEqual(plan["model"]["usage"]["input_tokens"], 11)
                self.assertEqual(plan["scenes"][1]["silentSeconds"], 2.5)
                self.assertEqual(plan["scenes"][1]["ja"]["narration"], "")
                self.assertTrue((folder / "storyboard.jpg").is_file())
                self.assertEqual(film.direct_film(SNAP, "折り目を観察する", "model", "high", folder), plan)
                self.assertEqual(len(fresh), 7)
                self.assertEqual(len(painted), 4)

    def test_missing_central_evidence_reaches_research(self):
        with self.assertRaisesRegex(film.MaterialRequired, "初版"):
            film.check_direction({"materialRequest": "初版の扉を確認できる資料"}, [])

    def test_unreadable_middle_promotes_existing_edit_to_one_picture_repair(self):
        beat = {"sceneId": "s5", "witness": "中央で二つの面の間に境界が見える。", "signal": "moving-edge"}
        signals = [{"kind": "appearance", "trace": "Bで一面が薄茶色になる。"}]
        report = {"materialRequest": "", "focusVerdict": {"result": "unreadable", "basis": "Bに縁が見えない。", "observation": 0},
                  "repairs": [{"sceneId": "s5", "target": "edit", "reason": "余韻を短くする。"}]}
        result = film.check_review(report, ["s5"], beat, signals)
        self.assertEqual([r["target"] for r in result["repairs"]], ["picture"])
        self.assertIn("余韻", result["repairs"][0]["reason"])
        self.assertIn("Bで一面", result["repairs"][0]["reason"])

    def test_editor_receives_exactly_the_blind_page_that_contains_the_chosen_scene(self):
        direction = setup_direction()
        direction["scenes"] = [scene("一枚の紙です。") for _ in range(6)]
        direction["visualBeat"].update(sceneNumber=5, signal="arrangement", witness="二枚の紙の角が重なっている。")
        pages = {}

        def view(request, image):
            data = json.loads(request["prompt"].rsplit("\n\n", 1)[1])
            if "scene" in data:
                return polygon("#48666d"), {}
            if "cut" in data:
                self.assertEqual(image, pages[("s5", "s6")])
                self.assertNotEqual(image, pages[("s1", "s2", "s3", "s4")])
                return {"materialRequest": "", "repairs": [], "focusVerdict": {
                    "result": "clear", "basis": "Bで角の重なりが見える。", "observation": 1}}, {}
            ids = data["sceneIds"]
            pages[tuple(ids)] = image
            with Image.open(image) as sheet:
                self.assertEqual(sheet.size, (1296, 267 * len(ids)))
            self.assertNotIn("visualBeat", data)
            observed = {"observations": [{"sceneId": sid, "seen": "紙の角。"} for sid in ids]}
            if "s5" in ids:
                self.assertEqual(data["focusSceneId"], "s5")
                observed["focusSignals"] = [{"kind": "arrangement", "trace": "Bの右で二つの辺が接している。"}]
            else:
                self.assertNotIn("focusSceneId", data)
            return observed, {}

        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            guide = folder / "guide.jpg"
            Image.new("RGB", (64, 48), "white").save(guide)
            with patch.object(film, "style_reference", return_value=guide), patch.object(film, "view_cut", view), \
                    patch.object(film, "_call_writer", return_value=(direction, {})):
                plan = film.direct_film(SNAP, "紙を比べる", "model", "high", folder)
            self.assertEqual(len(plan["filmReview"]["observations"]), 6)

    def test_narration_readings_and_minimum_silent_frame(self):
        with self.assertRaisesRegex(ValueError, "無言尺"):
            film.check_shot({**scene(""), "silentSeconds": .001}, 1, {"ref-1"})
        with self.assertRaisesRegex(ValueError, "字幕にありません"):
            film.check_shot({**scene("紙を折る。"), "readings": [{"text": "竹", "kana": "タケ"}]}, 1, {"ref-1"})


if __name__ == "__main__":
    unittest.main()
