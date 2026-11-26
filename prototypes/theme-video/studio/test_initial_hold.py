import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from authored_art import art_frame
from film_direction import check_direction, direct_film
from test_film_direction import SNAP, polygon, scene, setup_direction


class InitialHoldTest(unittest.TestCase):
    def test_only_completed_earlier_scenes_can_supply_art_and_old_scripts_still_paint(self):
        old = setup_direction()
        self.assertTrue(all("initialArt" not in shot for shot in check_direction(old, ["ref-1"])["scenes"]))
        for number, mode, ref in [(0, "holdEnd", 0), (1, "reuse", 0), (1, "reuse", 2), (1, "unknown", 1)]:
            with self.subTest(mode=mode, ref=ref), self.assertRaises(ValueError):
                draft = setup_direction()
                draft["scenes"][number].update(initialArt=mode, referenceScene=ref)
                check_direction(draft, ["ref-1"])

    def test_single_paint_can_be_replayed_frozen_and_retypeset_in_independent_shots(self):
        draft = setup_direction()
        draft["scenes"][1].update(initialArt="reuse", heading="もういちど")
        draft["scenes"].append({**scene("折れた先が残ります。"), "referenceScene": 2, "initialArt": "holdEnd",
                                "labels": [{"ja": "端", "track": {"layer": "端の札"}}]})
        art = polygon("#3476a1")
        art["layers"][0]["keys"] = [
            {"at": t, "x": x, "y": 0, "scale": 1, "rotate": 0, "opacity": 1}
            for t, x in ((0, 0), (.8, 140))]
        calls = []
        def direction(request):
            calls.append("direction")
            props = request["outputSchema"]["properties"]["scenes"]["items"]["properties"]
            self.assertIn("holdEnd", props["initialArt"]["enum"])
            return draft, {}

        def vision(request, path):
            inputs = json.loads(request["prompt"].rsplit("\n\n", 1)[-1])
            if "availableLayers" in inputs:
                calls.append("typeset")
                # The first reply changes a printed word. Feedback should reach this
                # same typesetter; no new art or complete script should be commissioned.
                word = "端" if inputs.get("validationFeedback") else "別の語"
                self.assertEqual(inputs["availableLayers"][0]["name"], "紙の角")
                return {"labels": [{"ja": word, "track": {"layer": "紙の角"}}]}, {}
            if "sceneIds" in inputs:
                calls.append("watch")
                return {"observations": [{"sceneId": i, "seen": "角の形が見える。"} for i in inputs["sceneIds"]],
                        "focusSignals": [{"kind": "travel", "trace": "中央の青い角が右に移る。"}]}, {}
            if "cut" in inputs:
                calls.append("review")
                return {"materialRequest": "", "repairs": [], "focusVerdict": {
                    "result": "clear", "basis": "角が移った。", "observation": 1}}, {}
            calls.append("paint-" + inputs["scene"]["id"])
            return art, {}

        with TemporaryDirectory() as folder, patch("film_direction._call_writer", side_effect=direction), \
                patch("film_direction.view_cut", side_effect=vision):
            plan = direct_film(SNAP, "", "model", "high", Path(folder))
            source, replay, held = plan["scenes"]
            self.assertEqual(calls, ["direction", "paint-s1", "typeset", "typeset", "watch", "review"])
            self.assertEqual(source["art"], replay["art"])
            self.assertIsNot(source["art"]["layers"][0], replay["art"]["layers"][0])
            self.assertEqual(replay["ja"]["heading"], "もういちど")
            self.assertEqual(held["ja"]["narration"], "折れた先が残ります。")
            self.assertEqual(held["labels"][0]["track"]["layer"], "紙の角")
            last = art_frame(source["art"], 1).tobytes()
            for at in (0, .4, 1):
                self.assertEqual(last, art_frame(held["art"], at).tobytes())
            calls.clear()
            resumed = direct_film(SNAP, "", "model", "high", Path(folder))
            self.assertEqual(resumed, plan)
            self.assertFalse(calls)


if __name__ == "__main__":
    unittest.main()
