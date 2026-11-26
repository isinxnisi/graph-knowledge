import unittest

from authored_art import art_frame, prepare_art, validate_art


def pose(at, x, y, opacity=1):
    return {"at": at, "x": x, "y": y, "opacity": opacity, "scale": 1, "rotate": 0}


def sample():
    return {"background": "#ffffff", "layers": [{"name": "版画の小舟",
            "paths": [{"d": "M -45 0 Q 0 65 45 0 Z", "fill": "#345678", "stroke": "#223344", "width": 3}],
            "keys": [pose(0, 120, 300), pose(1, 380, 300)]}]}


class AuthoredArtTest(unittest.TestCase):
    def test_subject_moves_while_frame_stays_open_for_the_caption(self):
        frame = prepare_art(sample())
        for t, x in ((0, 120), (.5, 250), (1, 380)):
            img = frame(t)
            self.assertEqual((img.mode, img.size), ("RGB", (1280, 720)))
            self.assertEqual(img.getpixel((x, 310)), (52, 86, 120))
            self.assertEqual(img.getpixel((x, 690)), (255, 255, 255))
        self.assertEqual(frame(1).getpixel((120, 310)), (255, 255, 255))

    def test_curves_and_independent_static_copies(self):
        art = sample()
        layer = art["layers"][0]
        layer["keys"] = []
        layer["paths"][0]["d"] = "M 80 100 c 10 -60 30 -60 50 0 h 10 v 40 H80 Z"
        frame = prepare_art(art)
        initial = frame(.5)
        self.assertEqual(initial.getpixel((105, 110)), (52, 86, 120))
        initial.putpixel((105, 110), (0, 0, 0))
        self.assertEqual(frame(1).getpixel((105, 110)), (52, 86, 120))

    def test_opacity_composites_the_entire_layer_over_previous_art(self):
        art = sample()
        art["layers"][0]["keys"] = [pose(0, 200, 200, 0), pose(1, 200, 200, 1)]
        frame = prepare_art(art)
        self.assertEqual(frame(0).getpixel((200, 210)), (255, 255, 255))
        half = frame(.5).getpixel((200, 210))
        self.assertTrue(all(abs(a-b) <= 1 for a, b in zip(half, (153, 170, 187))))

    def test_rotation_and_zoom_are_around_the_authored_pivot(self):
        art = sample()
        art["layers"][0]["paths"][0]["d"] = "M 20 0 h 15 v 10 h -15 Z"
        art["layers"][0]["keys"] = [{**pose(0, 300, 300), "rotate": 90, "scale": 2}]
        frame = art_frame(art, .8)
        self.assertEqual(frame.getpixel((290, 350)), (52, 86, 120))
        self.assertEqual(frame.getpixel((350, 310)), (255, 255, 255))

    def test_hole_reveals_the_lower_layer_while_the_ring_moves(self):
        bottom = sample()
        layer = bottom["layers"][0]
        layer["keys"] = []
        layer["paths"][0].update(d="M0 0h800v500h-800z", fill="#dc8030", stroke="none")
        bottom["layers"].append({"name": "のぞき穴",
            "paths": [{"d": "M-50 -50h100v100h-100z M-15 -15h30v30h-30z",
                       "fill": "#172936", "stroke": "none", "width": 0}],
            "keys": [pose(0, 410, 420), pose(1, 280, 310)]})
        render = prepare_art(bottom)
        for t, x, y in ((0, 410, 420), (1, 280, 310)):
            self.assertEqual(render(t).getpixel((x, y)), (220, 128, 48))
            self.assertEqual(render(t).getpixel((x + 29, y)), (23, 41, 54))

    def test_referenced_character_keeps_every_path_and_can_change_position(self):
        first = validate_art(sample())
        raw = {"background": "#ffffff", "layers": [{"reuseLayer": 0, "keys": [pose(0, 640, 400)]}]}
        second = validate_art(raw, first)
        self.assertEqual(second["layers"][0]["paths"], first["layers"][0]["paths"])
        self.assertNotEqual(second["layers"][0]["keys"], first["layers"][0]["keys"])
        self.assertEqual(prepare_art(second)(0).getpixel((640, 410)), (52, 86, 120))
        raw["layers"][0]["keys"] = None
        self.assertEqual(validate_art(raw, first), first)
        with self.assertRaises(ValueError):
            validate_art(raw)
        raw["layers"][0]["reuseLayer"] = 1
        with self.assertRaises(ValueError):
            validate_art(raw, first)

    def test_bad_geometry_is_reported_before_rendering(self):
        for d in ("http://example.org", "M 4 3 L", "M 1 2 Z", "M 1 2 L 3 4 script",
                  "M0 0h1e300", "M0 0h3000h3000"):
            with self.subTest(d=d):
                art = sample()
                art["layers"][0]["paths"][0]["d"] = d
                with self.assertRaises(ValueError):
                    validate_art(art)
        for keys in ([pose(1, 1, 1), pose(.2, 1, 1)], [pose(0, float("nan"), 1)], [pose(True, 1, 1)]):
            with self.subTest(keys=keys):
                art = sample()
                art["layers"][0]["keys"] = keys
                with self.assertRaises(ValueError):
                    validate_art(art)
