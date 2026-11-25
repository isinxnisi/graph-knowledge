"""Cuts for the Webb alignment film. Observational coordinates refer to the NASA plates in studio/assets."""
from functools import lru_cache
import math
import os
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageColor, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from channel_style import BOLD, ChannelFrame, FOOT, H, INK, LATIN, ORANGE, PAPER, SERIF, W


ASSETS = ROOT / "studio" / "assets"
GOLD = ("#dbb672", "#e9c989", "#d8b579", "#f0d69c", "#cfaa69")
AMBER, MUTED = "#ffad67", "#566466"
# Spot centers in NASA's annotated initial mosaic (1024 × 694). The unannotated
# plate is the same mosaic at 1240 × 840. B3 is clear of the neighboring spots.
MOSAIC_SPOTS = ((512, 88), (700, 203), (455, 236), (356, 295), (384, 294), (337, 323),
                (543, 344), (765, 406), (309, 417), (359, 429), (90, 439), (298, 500),
                (438, 516), (450, 510), (585, 516), (217, 549), (270, 616), (895, 547))
B3_BEFORE, B3_AFTER = MOSAIC_SPOTS[-1], (725, 289)
SEARCH_SOURCE = (0, 72, 1240, 838)
SEARCH_BOX = (55, 87, 757, 521)
ARRAY_SOURCE = (0, 0, 920, 920)
ARRAY_BOX = (694, 142, 1082, 530)
# The official, unlabelled image is the same observation at 1024 square.
# Crop the "IMAGE ARRAY" title at the top while retaining all eighteen spots.
UNLABELLED_SOURCE = (0, 85, 1024, 1003)
LAYOUT_BOX = (678, 113, 1146, 533)


def ease(start, end, position):
    t = min(1.0, max(0.0, (position - start) / (end - start)))
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def tint(first, last, t):
    return tuple(round(mix(a, b, t)) for a, b in zip(ImageColor.getrgb(first), ImageColor.getrgb(last)))


def project(point, source, box):
    x, y = point
    l, t, r, b = source
    return (mix(box[0], box[2], (x-l)/(r-l)), mix(box[1], box[3], (y-t)/(b-t)))


def ring(draw, point, radius, color, width=3):
    x, y = point
    draw.ellipse((x-radius, y-radius, x+radius, y+radius), outline=color, width=width)


def trace(draw, points, fraction, color, width=3):
    """A leader follows the reader's eye between a diagram and its evidence."""
    lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
    remaining = sum(lengths) * fraction
    for a, b, length in zip(points, points[1:], lengths):
        if remaining <= 0:
            return
        t = min(1, remaining/length)
        tip = (mix(a[0], b[0], t), mix(a[1], b[1], t))
        draw.line((a, tip), fill=color, width=width)
        remaining -= length


# Flat-topped hexagons. This is the viewing orientation of NASA's 18 February
# image array, in which B4 is at the top and B3 is the upper right outer corner.
# The central opening is deliberately empty.
def mirror_cells(center, radius):
    for q in range(-2, 3):
        for r in range(-2, 3):
            if max(abs(q), abs(r), abs(q+r)) > 2 or (q, r) == (0, 0):
                continue
            x = center[0] + 1.5*radius*q
            y = center[1] + math.sqrt(3)*radius*(r+q/2)
            yield (q, r), (x, y)


@lru_cache(maxsize=48)
def gilded_segment(q, r, radius):
    """A continuous, softly reflected band reads as polished metal on all eighteen pieces."""
    size = 2*radius+1
    yy, xx = np.mgrid[0:size, 0:size]/radius-1
    phase = 1.5*q + xx + .7*(math.sqrt(3)*(r+q/2)+yy)
    sheen = .56*np.exp(-((phase-.3)/1.05)**2) - .30*np.exp(-((phase-1.8)/.72)**2) + .07*(xx-yy)
    gold = np.array(ImageColor.getrgb(GOLD[(3*q+r) % len(GOLD)]))
    colors = gold + np.maximum(sheen, 0)[:, :, None]*(np.array([255, 245, 204])-gold)
    colors += np.minimum(sheen, 0)[:, :, None]*(gold-np.array([105, 77, 45]))
    tile = Image.fromarray(np.clip(colors, 0, 255).astype("uint8"))
    points = [(radius + (radius-1.4)*math.cos(i*math.pi/3),
               radius + (radius-1.4)*math.sin(i*math.pi/3)) for i in range(6)]
    draw = ImageDraw.Draw(tile)
    draw.line([*points, points[0]], fill="#8a714b", width=2)
    draw.line(points[3:6], fill="#fff0bf", width=2)
    # Antialias the silhouette once, including at the two sloping outer corners.
    mask = Image.new("L", (size*3, size*3))
    ImageDraw.Draw(mask).polygon([(3*x, 3*y) for x, y in points], fill=255)
    return tile, mask.resize(tile.size, Image.Resampling.LANCZOS)


class Boards(ChannelFrame):
    def __init__(self, lang="ja", *, identifying_segments=False):
        if lang not in ("ja", "en"):
            raise ValueError(f"Unknown language: {lang}")
        fonts = Path(os.environ.get("PLUNODE_STUDIO_FONTS", Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"))
        super().__init__(fonts, lang)
        self.identifying_segments = identifying_segments
        self.images = {}
        for name in ("mosaic", "mosaic-labels", "aligned", "aligned-unlabelled"):
            with Image.open(ASSETS / (name + ".jpg")) as image:
                self.images[name] = image.convert("RGB")
        self.b3_detail = self.images["mosaic-labels"].crop((815, 472, 973, 608)).resize(
            (255, 219), Image.Resampling.LANCZOS)

    def copy_for(self, ja, en):
        return ja if self.lang == "ja" else en

    def plate(self, canvas, name, source, box):
        # resize(box=...) samples fractional source coordinates without a crop followed by rounding.
        size = (box[2]-box[0], box[3]-box[1])
        canvas.paste(self.images[name].resize(size, Image.Resampling.BICUBIC, box=source), box[:2])

    def heading(self, draw, x, y, lines, *, light=False, size=58, width=460):
        for n, line in enumerate(lines):
            self.text(draw, x, y+n*(size+17), line, size, family=SERIF, color=PAPER if light else INK,
                      max_width=width)

    def mirror(self, canvas, center, radius, light=0, sweep=None, *, label=True):
        """The traveling glint separates the physical pieces without simulating deployment."""
        selected = None
        for (q, r), (x, y) in mirror_cells(center, radius):
            tile, mask = gilded_segment(q, r, radius)
            if sweep is not None:
                band = max(0.0, 1-abs((x-.32*y)-sweep)/(2*radius))
                if band:
                    tile = Image.blend(tile, Image.new("RGB", tile.size, "#fff1c5"), band*.65)
            if (q, r) == (2, -2):
                selected = (x, y)
                if light:
                    tile = Image.blend(tile, Image.new("RGB", tile.size, ORANGE), light*.88)
            canvas.paste(tile, (round(x-radius), round(y-radius)), mask)
        if light > 0 and label:
            self.text(ImageDraw.Draw(canvas), *selected, "B3", round(radius*.55), family=BOLD,
                      anchor="mm", color=tint(ORANGE, INK, light))
        return selected

    def frame(self, shot, progress, *, voice_starts_at=None):
        p = min(1, max(0, progress))
        if shot == "array":
            return self.array_plate()
        if shot == "layout":
            return self.layout_shot(p)
        if shot == "focus":
            # An authored silent lead shows the optical change before the first line
            # names its location. The mirror reveal stays in the second half.
            if voice_starts_at is not None and 0 < voice_starts_at < 1:
                if p <= voice_starts_at:
                    p = .5 * p / voice_starts_at
                else:
                    p = .5 + .5 * (p - voice_starts_at) / (1 - voice_starts_at)
            return self.focus_shot(p)
        if shot in ("sky", "return"):
            return self.sky(p, ending=shot == "return")
        if shot == "mirror":
            return self.mirror_shot(p)
        if shot == "tilt":
            return self.tilt_shot(p)
        if shot == "identify":
            return self.identify(p)
        if shot == "map":
            return self.map_shot(p)
        raise ValueError(f"Unknown Webb shot: {shot}")

    @lru_cache(maxsize=4)
    def paper(self, label):
        canvas = Image.new("RGB", (W, H), PAPER)
        draw = ImageDraw.Draw(canvas)
        self.brand(draw)
        self.evidence_label(draw, label)
        self.caption_rail(draw)
        return canvas

    @lru_cache(maxsize=1)
    def array_plate(self):
        canvas = Image.new("RGB", (W, H), INK)
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((443, 0, W, FOOT-1), fill="#050505")
        self.plate(canvas, "aligned-unlabelled", UNLABELLED_SOURCE, (561, 12, 1162, 551))
        self.brand(draw, light=True)
        self.text(draw, 61, 142, self.copy_for("ウェッブ宇宙望遠鏡", "Webb Space Telescope"),
                  21, color="#c3cfd0", family=BOLD)
        self.heading(draw, 59, 207, self.copy_for(("なぜ、", "六角形に？"), ("Why a", "hexagon?")),
                     light=True, size=61, width=357)
        draw.line((62, 408, 124, 408), fill=ORANGE, width=3)
        self.text(draw, 62, 448, self.copy_for("観測画像", "Observation"), 22, color=PAPER, family=BOLD)
        self.text(draw, 62, 483, "2022.02.18", 20, color="#bfccce", family=LATIN)
        self.text(draw, 62, 517, "NASA/STScI/J. DePasquale", 17, color="#bfccce", family=LATIN)
        return canvas

    @lru_cache(maxsize=1)
    def layout_plate(self):
        canvas = self.paper(self.copy_for("模式図と観測画像", "Mirror diagram and observation")).copy()
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 76, 60, self.copy_for("主鏡の並び", "Mirror layout"), 38, family=SERIF)
        self.text(draw, 677, 60, self.copy_for("星の像の並び", "Images of the star"), 38, family=SERIF)
        self.plate(canvas, "aligned-unlabelled", UNLABELLED_SOURCE, LAYOUT_BOX)
        self.text(draw, 678, 539, "NASA/STScI/J. DePasquale   /   2022.02.18", 16, family=LATIN, color=MUTED)
        return canvas

    def layout_shot(self, p):
        canvas = self.layout_plate().copy()
        draw = ImageDraw.Draw(canvas)
        match = ease(.28, .50, p)
        label = ease(.56, .72, p)
        # Align the two hexagons in orientation and scale. B3 is the upper-right
        # outer facet in both; its actual spot stays fixed on the photograph.
        mirror = self.mirror(canvas, (321, 318), 50, light=match, label=False)
        point = project(tuple(v*1024/920 for v in B3_AFTER), UNLABELLED_SOURCE, LAYOUT_BOX)
        if match:
            ring(draw, point, mix(29, 23, match), tint("#181818", AMBER, match), width=3)
        if label:
            self.text(draw, *mirror, "B3", 29, anchor="mm", family=BOLD, color=tint(ORANGE, INK, label))
            self.text(draw, point[0]+33, point[1], "B3", 27, family=BOLD, anchor="lm",
                      color=tint("#181818", AMBER, label))
        return canvas

    @staticmethod
    def spot_in_focus(sharpness):
        # An illustrative spot of light. Concentrate its halo at a fixed centre.
        # No observed pixel values or measured changes in spot size are shown.
        yy, xx = np.mgrid[-34:35, -34:35]
        u, v = .92*xx + .39*yy, -.39*xx + .92*yy
        core = np.exp(-.5*((u/12)**2 + (v/9)**2))
        halo = np.exp(-.5*((u/16)**2 + (v/13)**2))
        blurred = .58*core + .14*halo
        # Gather the same illustrated light into a brighter core with a legible
        # edge. A tiny Gaussian alone reads as a star that is fading away.
        radius = np.sqrt((u/14)**2 + (v/11)**2)
        focused = .88*np.clip((1.14-radius)/.25, 0, 1) + .1*halo
        focused *= blurred.sum()/focused.sum()
        intensity = np.clip((1-sharpness)*blurred + sharpness*focused, 0, 1)
        dark, light = np.array([32, 52, 62]), np.array([255, 249, 224])
        return Image.fromarray((dark + intensity[:, :, None]*(light-dark)).astype("uint8"))

    @lru_cache(maxsize=1)
    def focus_plate(self):
        canvas = self.paper(self.copy_for("像の変化の模式図", "Illustrated change in focus")).copy()
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 76, 60, self.copy_for("主鏡の並び", "Mirror layout"), 38, family=SERIF)
        self.text(draw, 677, 60, self.copy_for("星の像の並び", "Images of the star"), 38, family=SERIF)
        draw.rectangle((678, 109, 1146, 533), fill="#20343e")
        blurred = self.spot_in_focus(0)
        for cell, (x, y) in mirror_cells((912, 318), 50):
            if cell == (2, -2):
                subject = (round(x), round(y))
            else:
                canvas.paste(blurred, (round(x)-34, round(y)-34))
        return canvas, subject

    def focus_shot(self, p):
        plate, target = self.focus_plate()
        canvas = plate.copy()
        draw = ImageDraw.Draw(canvas)
        # Let the viewer notice the change, then look for the matching mirror
        # unaided. Only the answer at the end marks the physical segment.
        focus = ease(.18, .42, p)
        answer = ease(.68, .85, p)
        mirror = self.mirror(canvas, (321, 318), 50, light=answer, label=False)
        x, y = target
        canvas.paste(self.spot_in_focus(focus), (x-34, y-34))
        if answer:
            ring(draw, target, 21, tint("#20343e", AMBER, answer), width=3)
            self.text(draw, x+28, y, "B3", 26, family=BOLD, anchor="lm", color=tint("#20343e", AMBER, answer))
            self.text(draw, *mirror, "B3", 29, family=BOLD, anchor="mm", color=tint(ORANGE, INK, answer))
        return canvas

    def sky(self, p, *, ending):
        canvas = Image.new("RGB", (W, H), INK)
        draw = ImageDraw.Draw(canvas)
        # Preserve the edges of the field at the opening and closing holds. A slow push
        # near the end of the opening takes the eye toward the actual lower-right spot.
        zoom = 0 if ending else ease(.49, .98, p)
        source = tuple(mix(a, b, zoom) for a, b in zip((0, 72, 1240, 832), (220, 155, 1224, 770)))
        box = (375, 0, 1280, 555)
        self.plate(canvas, "mosaic", source, box)
        self.brand(draw, light=True)
        self.text(draw, 61, 139, self.copy_for("ウェッブ宇宙望遠鏡", "Webb Space Telescope"),
                  21, color="#c3cfd0", family=BOLD)
        if self.identifying_segments and ending:
            lines = self.copy_for(("ひとつの点に、", "一枚の鏡。"), ("One spot,", "one mirror."))
        elif self.identifying_segments:
            lines = self.copy_for(("どの鏡が", "映した光？"), ("Which mirror", "made this spot?"))
        elif ending:
            lines = self.copy_for(("見ていた星は、", "ひとつ。"), ("One star,", "all along."))
        else:
            lines = self.copy_for(("星は、", "いくつ？"), ("How many", "stars?"))
        self.heading(draw, 59, 206, lines, light=True, size=57, width=301)
        draw.line((62, 421, 124, 421), fill=ORANGE, width=3)
        self.text(draw, 62, 459, self.copy_for("最初の観測画像", "First alignment mosaic"),
                  21, color=PAPER, family=BOLD)
        self.text(draw, 62, 498, "NASA   /   2022.02.11", 19, color="#bfccce", family=LATIN)
        if ending:
            # Brief marks identify the eighteen images on the original plate. They never
            # move a point on the sky or imply an observed path between the two dates.
            # Give the lower-right B3 enough time alone to recognize it again. When
            # the narration widens to the entire field, pick up the nearby spots first.
            from_b3 = sorted(MOSAIC_SPOTS, key=lambda point: math.dist(point, B3_BEFORE))
            for i, (x, y) in enumerate(from_b3):
                start = .035 if i == 0 else .45 + (i-1)*.015
                strength = ease(start, start+.09, p) * (1-ease(.82, .98, p))
                if strength > .01:
                    pos = project((x*1240/1024, y*840/694), source, box)
                    radius = mix(16, 11, ease(.45, .65, p)) if i == 0 else 11
                    ring(draw, pos, radius, tint("#171819", AMBER, strength*.89), width=2)
        return canvas

    def mirror_shot(self, p):
        canvas = self.paper(self.copy_for("主鏡の模式図", "Primary mirror diagram")).copy()
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 75, 149, self.copy_for("ウェッブの主鏡", "Webb’s primary mirror"), 28, family=SERIF)
        self.text(draw, 63, 195, "18", 152, family=LATIN)
        self.text(draw, 242, 258, self.copy_for("枚", "segments"), 40, family=SERIF)
        self.text(draw, 77, 390, self.copy_for("どれも、同じ星を見る。", "Each sees the same star."), 42,
                  family=SERIF, max_width=466)
        self.mirror(canvas, (846, 299), 51, light=ease(.68, .91, p), sweep=mix(420, 1110, ease(.06, .78, p)))
        return canvas

    @lru_cache(maxsize=1)
    def tilt_plate(self):
        canvas = self.paper(self.copy_for("鏡と像を見分ける模式図", "Mirror identification diagram")).copy()
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 76, 91, self.copy_for("一枚の鏡", "One mirror segment"), 43, family=SERIF)
        self.text(draw, 658, 91, self.copy_for("同じ星の像", "Images of one star"), 43, family=SERIF)
        draw.rectangle((656, 160, 1217, 513), fill="#20343e")
        # An illustrative field, including one moving image in the lower right. Its
        # placement and displacement must not be read as a measured observation.
        for x, y in ((736, 216), (853, 228), (930, 197), (1041, 245), (1161, 210),
                     (777, 289), (875, 266), (974, 294), (1103, 319), (717, 365),
                     (813, 386), (897, 334), (936, 407), (1014, 364), (731, 463),
                     (861, 458), (1036, 476)):
            self.draw_spot(draw, x, y)
        return canvas

    @staticmethod
    def draw_spot(draw, x, y):
        draw.ellipse((x-7, y-7, x+7, y+7), fill="#41545a")
        draw.ellipse((x-4, y-4, x+4, y+4), fill="#f5f1e5")

    @staticmethod
    @lru_cache(maxsize=1)
    def facet_reflection():
        yy, xx = np.mgrid[0:270, 0:450]
        across = xx+.55*yy
        glint = np.exp(-((across-245)/59)**2) + .30*np.exp(-((across-368)/18)**2)
        gold, light = np.array([217, 177, 111]), np.array([254, 236, 180])
        return Image.fromarray((gold + np.minimum(glint, 1)[:, :, None]*(light-gold)).astype("uint8"))

    def tilt_shot(self, p):
        canvas = self.tilt_plate().copy()
        draw = ImageDraw.Draw(canvas)
        move = ease(.22, .59, p)
        # A perspective sketch of a single facet. Keep the centre in place, so
        # the change in slope reads as a tilt rather than a piece sliding out.
        cx, cy, radius = 314, 331, 153
        corners = [(radius*math.cos(i*math.pi/3), radius*math.sin(i*math.pi/3)) for i in range(6)]
        def face_at(angle):
            return [(cx + x+.24*y, cy + .11*x + math.sin(angle)*y) for x, y in corners]
        rest, face = face_at(.81), face_at(mix(.81, .46, move))
        if move:
            # Leave a thin outline of the previous inclination in the paper.
            draw.line([*rest, rest[0]], fill=tint(PAPER, "#afaa99", move), width=2)
        depth = 10
        for i in (0, 1, 2):
            (x1, y1), (x2, y2) = face[i:i+2]
            draw.polygon([(x1,y1), (x2,y2), (x2,y2+depth), (x1,y1+depth)], fill="#977342")
        mask = Image.new("L", (360, 270))
        ImageDraw.Draw(mask).polygon([(x-134,y-196) for x,y in face], fill=255)
        shift = round(70*(1-move))
        reflection = self.facet_reflection().crop((shift, 0, shift+360, 270))
        canvas.paste(reflection, (134, 196), mask)
        draw.line([*face,face[0]], fill="#9b7546", width=3)
        draw.line(face[3:6], fill="#fff4cd", width=3)
        self.text(draw, cx, cy, "B3", 37, family=LATIN, anchor="mm", color="#4b4130")
        # Keep all star images equally bright until the audience has had a chance
        # to notice which one shifts. Then trace just its small displacement.
        x0, y0 = 1070, 421
        x, y = mix(x0, 1135, move), mix(y0, 393, move)
        found = ease(.65, .81, p)
        if found:
            color = tint("#20343e", AMBER, found)
            ring(draw, (x0,y0), 6, color, width=2)
            trace(draw, [(x0+8, y0-3), (x-20, y+8)], found, color, width=2)
            ring(draw, (x,y), 17, color, width=2)
            self.text(draw, x+24, y-1, "B3", 23, family=BOLD, anchor="lm", color=color)
        self.draw_spot(draw, x, y)
        return canvas

    @lru_cache(maxsize=1)
    def identification_plate(self):
        canvas = self.paper(self.copy_for("最初のモザイク", "First alignment mosaic")).copy()
        self.plate(canvas, "mosaic", SEARCH_SOURCE, SEARCH_BOX)
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 57, 533, "NASA", 15, family=BOLD, color=MUTED)
        lines = (self.copy_for(("光のそばの", "小さな文字"), ("A label", "beside the spot")) if self.identifying_segments
                 else self.copy_for(("この鏡の光は、", "どこに？"), ("Which spot", "belongs to B3?")))
        self.heading(draw, 802, 98, lines, size=44, width=419)
        return canvas

    def identify(self, p):
        canvas = self.identification_plate().copy()
        draw = ImageDraw.Draw(canvas)
        target = project((B3_BEFORE[0]*1240/1024, B3_BEFORE[1]*840/694), SEARCH_SOURCE, SEARCH_BOX)
        # Leave time to search the unmarked photo before the editorial circle appears.
        reveal = ease(.17, .40, p)
        if reveal:
            ring(draw, target, mix(29, 19, reveal), tint("#151719", AMBER, reveal), width=3)
        guide = ease(.36, .61, p)
        trace(draw, [(target[0]+19,target[1]), (748,target[1]), (791,369), (819,369)], guide, ORANGE)
        loupe = ease(.49, .68, p)
        if loupe:
            # NASA's own B3 annotation is legible in this enlarged, registered detail.
            crop = self.b3_detail
            if loupe < 1:
                crop = Image.blend(Image.new("RGB", crop.size, PAPER), crop, loupe)
            canvas.paste(crop, (819, 252))
            self.text(draw, 819, 494, self.copy_for("右下の点を拡大", "Detail of the lower-right spot"),
                      19, family=BOLD, color=tint(PAPER, MUTED, loupe), max_width=394)
        return canvas

    @lru_cache(maxsize=1)
    def comparison_plate(self):
        canvas = self.paper(self.copy_for("模式図と観測画像", "Mirror diagram and observation")).copy()
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 75, 81, self.copy_for("鏡の並び", "The mirror layout"), 38, family=SERIF, max_width=530)
        self.text(draw, 693, 81, self.copy_for("星の像の並び", "The pattern of starlight"),
                  38, family=SERIF, max_width=527)
        self.plate(canvas, "aligned", ARRAY_SOURCE, ARRAY_BOX)
        self.text(draw, 694, 537, "NASA/STScI/J. DePasquale   /   2022.02.18", 16, family=LATIN, color=MUTED)
        return canvas

    def map_shot(self, p):
        canvas = self.comparison_plate().copy()
        draw = ImageDraw.Draw(canvas)
        selected = self.mirror(canvas, (304, 329), 39, light=1)
        target = project(B3_AFTER, ARRAY_SOURCE, ARRAY_BOX)
        # The leader runs through the margin above the plate and enters it from above the
        # actual B3 spot. The audience can follow the correspondence without hiding its neighbors.
        path = [(selected[0]+38, selected[1]), (493, selected[1]), (569, 134),
                (target[0], 134), (target[0], target[1]-22)]
        trace(draw, path, ease(.16, .64, p), ORANGE, width=3)
        reveal = ease(.55, .73, p)
        if reveal:
            ring(draw, target, mix(29, 23, reveal), tint("#605149", AMBER, reveal), width=3)
            draw.line(((target[0]+23, target[1]), (1142, target[1])), fill=tint("#695940", AMBER, reveal), width=2)
            self.text(draw, 1151, target[1], "B3", 31, anchor="lm", family=BOLD, color=tint(PAPER, INK, reveal))
        return canvas
