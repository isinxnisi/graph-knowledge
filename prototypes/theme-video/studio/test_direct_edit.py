import copy
import unittest

from authored_art import validate_art
from direct_edit import apply_edit, edit_schema, layer_catalog, multi_art_schema, validate_multi_art


def layer(name, color):
    return {"name": name, "paths": [{"d": "M0 0 L30 0 L15 20 Z", "fill": color, "stroke": "none", "width": 0}],
            "keys": []}


def key(at, x):
    return {"at": at, "x": x, "y": 250, "scale": 1, "rotate": 0, "opacity": 1}


def change(kind, **fields):
    return {"op": kind, "why": "札が枠から外れた瞬間を見せる", **fields}


class DirectEditTest(unittest.TestCase):
    def setUp(self):
        self.original = validate_art({"background": "#fff", "layers": [
            layer("部屋", "#bca"), layer("指先", "#ea6"), layer("札", "#156")]})
        self.other = validate_art({"background": "#123", "layers": [layer("赤い印", "#c45")]})
        self.refs = {"s4": self.other}

    def apply(self, *changes):
        return apply_edit(self.original, self.refs, {"changes": list(changes)})

    def test_motion_preserves_the_entire_stage_and_other_layers(self):
        before = copy.deepcopy(self.original)
        out = self.apply(change("motion", layer=2, keys=[key(0, 140), key(1, 290)]))
        self.assertEqual(out["layers"][2]["keys"][-1]["x"], 290)
        self.assertEqual(out["layers"][2]["paths"], before["layers"][2]["paths"])
        self.assertEqual(out["layers"][:2], before["layers"][:2])
        self.assertEqual(out["background"], before["background"])
        out["layers"][1]["paths"].clear()
        self.assertEqual(self.original, before)

    def test_rearrange_borrow_and_touch_a_path_with_stable_indices(self):
        out = self.apply(change("remove", layer=0), change("move", layer=2, before=1),
                         change("borrow", source="s4", sourceLayer=0, keys=[key(0, 99)], before=1),
                         change("add", drawing=layer("床", "#795"), before=2),
                         change("reshape", layer=1, path=0, d="M0 0 L12 8 L1 2 Z"),
                         change("recolor", layer=1, path=0, fill=None, stroke="#a00", width=2))
        self.assertEqual([l["name"] for l in out["layers"]], ["床", "札", "赤い印", "指先"])
        self.assertEqual(out["layers"][1], self.original["layers"][2])
        self.assertEqual(out["layers"][2]["paths"], self.other["layers"][0]["paths"])
        self.assertEqual(self.other["layers"][0]["keys"], [])
        self.assertEqual(out["layers"][2]["keys"][0]["x"], 99)
        self.assertEqual(out["layers"][3]["paths"][0], {
            "d": "M0 0 L12 8 L1 2 Z", "fill": "#ea6", "stroke": "#a00", "width": 2})

    def test_partial_drawing_and_background(self):
        room = self.original["layers"][0]
        room["paths"].extend([layer(n, c)["paths"][0] for n, c in (("窓", "#abc"), ("壁", "#def"))])
        out = self.apply(change("background", color="#edc"), change("removePath", layer=0, path=0),
                         change("recolor", layer=0, path=2, fill="#131", width=None, stroke=None),
                         change("addPath", layer=0, drawing=layer("席", "#928")["paths"][0]))
        self.assertEqual(out["background"], "#edc")
        self.assertEqual([p["fill"] for p in out["layers"][0]["paths"]], ["#abc", "#131", "#928"])
        self.assertEqual(len(room["paths"]), 3)

    def test_reused_copies_can_have_distinct_names_for_tracked_lettering(self):
        borrow = change("borrow", source="s4", sourceLayer=0, keys=None, before=None)
        out = self.apply(borrow, {**borrow, "as": "取消の印"}, change("rename", layer=2, name="行動の札"))
        self.assertEqual([v["name"] for v in out["layers"][-3:]], ["行動の札", "赤い印", "取消の印"])
        self.assertEqual(out["layers"][-1]["paths"], out["layers"][-2]["paths"])
        artist = validate_multi_art({"background": "#fff", "layers": [
            {"from": "s4", "reuseLayer": 0, "keys": None, "as": "別名の印"}]}, self.refs)
        self.assertEqual(artist["layers"][0]["name"], "別名の印")
        self.assertEqual(self.other["layers"][0]["name"], "赤い印")

    def test_wrong_target_conflicting_and_unexplained_changes_are_rejected_without_writes(self):
        before = copy.deepcopy(self.original)
        for changes in (
                [],
                [change("reshoot", layer=0)],
                [change("background", color="#fff")],
                [change("motion", layer=True, keys=[])],
                [change("remove", layer=-1)], [change("reshape", layer=1, path=1, d="M0 0 L2 3")],
                [change("recolor", layer=1, path=0, stroke=None, width=None, fill=None)],
                [change("background", color="#123"), change("background", color="#456")],
                [change("motion", layer=1, keys=[key(1, 2)]), change("remove", layer=1)],
                [change("remove", layer=1), change("motion", layer=1, keys=[])],
                [change("move", layer=1, before=1)], [change("move", layer=1, before=20)],
                [change("removePath", layer=1, path=0), change("reshape", layer=1, path=0, d="M0 0 L2 2")],
                [change("motion", layer=1, keys=[key(1, 2), key(0, 2)])],
                [change("borrow", source="s4", sourceLayer=5, keys=None, before=None)],
                [change("borrow", source="unauthorized", sourceLayer=0, keys=None, before=None)],
                [{**change("remove", layer=1), "why": "  "}],
                [{**change("remove", layer=1), "overwrite": True}],
                [change("removePath", layer=1, path=0)],
                [change("background", color="#123"), change("addPath", layer=1, drawing=None)],
                [change("add", drawing=layer("余分", "#457"), before=None)] * 46):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.apply(*changes)
        self.assertEqual(self.original, before)

    def test_a_full_artist_pass_can_mix_its_old_art_with_other_shots(self):
        refs = {"previousArt": self.original, **self.refs}
        raw = {"background": "#efd", "layers": [{"from": "previousArt", "reuseLayer": 1, "keys": None},
                                                {"from": "s4", "reuseLayer": 0, "keys": [key(0, 43)]},
                                                layer("新しい台", "#093")]}
        out = validate_multi_art(raw, refs)
        self.assertEqual(out["layers"][0], self.original["layers"][1])
        self.assertEqual(out["layers"][1]["paths"], self.other["layers"][0]["paths"])
        self.assertEqual(out["layers"][1]["keys"][0]["x"], 43)
        self.assertEqual(self.other["layers"][0]["keys"], [])
        self.assertEqual(layer_catalog(out)[1], {"index": 1, "name": "赤い印", "paths": 1, "keys": 1})
        for bad in ({"reuseLayer": 1, "keys": None}, {"from": "s4", "reuseLayer": 1, "keys": None},
                    {"from": "s5", "reuseLayer": 0, "keys": None}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_multi_art({**raw, "layers": [bad]}, refs)

    def test_schemas_only_offer_supplied_sources_and_existing_edit_targets(self):
        refs = {"s1": self.original, "s4": self.other}
        options = edit_schema(self.original, refs)["properties"]["changes"]["items"]["anyOf"]
        specs = {s["properties"]["op"]["enum"][0]: s["properties"] for s in options}
        self.assertEqual(specs["borrow"]["source"]["enum"], ["s1", "s4"])
        self.assertEqual(specs["move"]["layer"]["enum"], [0, 1, 2])
        self.assertEqual(multi_art_schema(refs)["properties"]["layers"]["items"]
                         ["anyOf"][1]["properties"]["from"]["enum"], ["s1", "s4"])
        self.assertNotIn("anyOf", multi_art_schema({})["properties"]["layers"]["items"])
        self.assertNotIn("borrow", [s["properties"]["op"]["enum"][0] for s in
                                    edit_schema(self.original, {})["properties"]["changes"]["items"]["anyOf"]])


if __name__ == "__main__":
    unittest.main()
