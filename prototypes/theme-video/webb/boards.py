"""Five cuts for the Webb alignment film. Coordinates refer to the NASA plates in studio/assets."""
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
    def __init__(self, lang="ja"):
        if lang not in ("ja", "en"):
            raise ValueError(f"Unknown language: {lang}")
        fonts = Path(os.environ.get("PLUNODE_STUDIO_FONTS", Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"))
        super().__init__(fonts, lang)
        self.images = {}
        for name in ("mosaic", "mosaic-labels", "aligned"):
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

    def mirror(self, canvas, center, radius, light=0, sweep=None):
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
        if light > 0:
            self.text(ImageDraw.Draw(canvas), *selected, "B3", round(radius*.55), family=BOLD,
                      anchor="mm", color=tint(ORANGE, INK, light))
        return selected

    def frame(self, shot, progress):
        p = min(1, max(0, progress))
        if shot in ("sky", "return"):
            return self.sky(p, ending=shot == "return")
        if shot == "mirror":
            return self.mirror_shot(p)
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
        if ending:
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
    def identification_plate(self):
        canvas = self.paper(self.copy_for("最初のモザイク", "First alignment mosaic")).copy()
        self.plate(canvas, "mosaic", SEARCH_SOURCE, SEARCH_BOX)
        draw = ImageDraw.Draw(canvas)
        self.text(draw, 57, 533, "NASA", 15, family=BOLD, color=MUTED)
        self.heading(draw, 802, 98, self.copy_for(("この鏡の光は、", "どこに？"), ("Which spot", "belongs to B3?")),
                     size=44, width=419)
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
