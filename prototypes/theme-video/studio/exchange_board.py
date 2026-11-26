"""Two illustrated hands exchange labelled paper slips in Plunode's own diagram."""
from functools import lru_cache
import math


ASSET = "exchange"
LEFT, RIGHT = 297, 983
REST_Y = 292


def _outline(start, curves):
    """Sample the curves of the paper-cut hand once, while drawing the stationary art."""
    points = [start]
    for control1, control2, end in curves:
        x, y = points[-1]
        for i in range(1, 13):
            t = i / 12
            s = 1 - t
            points.append((s**3*x + 3*s*s*t*control1[0] + 3*s*t*t*control2[0] + t**3*end[0],
                           s**3*y + 3*s*s*t*control1[1] + 3*s*t*t*control2[1] + t**3*end[1]))
    return points


def _hands(width, height):
    from PIL import Image, ImageDraw
    from channel_style import BLUE, INK, ORANGE

    layer = Image.new("RGBA", (width * 2, height * 2))
    draw = ImageDraw.Draw(layer)
    palm = _outline((118, 426), [
        ((175, 417), (179, 392), (224, 382)),
        ((244, 378), (252, 365), (269, 347)),
        ((286, 330), (301, 337), (293, 354)),
        ((287, 368), (282, 374), (278, 381)),
        ((319, 379), (377, 369), (411, 363)),
        ((444, 355), (451, 373), (424, 385)),
        ((404, 395), (381, 402), (363, 409)),
        ((387, 401), (409, 392), (429, 385)),
        ((449, 378), (449, 393), (436, 401)),
        ((405, 418), (381, 433), (350, 445)),
        ((315, 461), (282, 470), (236, 468)),
        ((191, 464), (178, 467), (141, 480)),
    ])
    for right_side in (False, True):
        def coords(points):
            return [(round((width-x if right_side else x)*2), round(y*2)) for x, y in points]

        def shape(points, fill):
            scaled = coords(points)
            draw.polygon(scaled, fill=fill)
            draw.line([*scaled, scaled[0]], fill=INK, width=5, joint="curve")

        shape(palm, "#eed7af" if right_side else "#ebc398")
        for start, controls in [
            ((270, 392), [((279, 399), (293, 400), (307, 397))]),
            ((377, 416), [((390, 411), (401, 405), (415, 399))]),
        ]:
            draw.line(coords(_outline(start, controls)), fill="#a1795e", width=3)
        shape([(-4, 435), (127, 405), (153, 483), (-4, 527)], BLUE if not right_side else "#30424c")
        shape([(124, 406), (146, 401), (170, 476), (150, 483)], "#f9eede")
        button = coords([(132, 456)])[0]
        draw.ellipse((button[0]-7, button[1]-7, button[0]+7, button[1]+7), fill=ORANGE)
    return layer.resize((width, height), Image.Resampling.LANCZOS)


def _label(draw, value, lang, center, width, height, *, family, size):
    from media import _lines, _style
    from channel_style import INK

    style = _style(lang)
    for pt in range(size, 12, -1):
        font = style.font(family, pt)
        lines = _lines(value, font, width)
        # Even an unbroken name must fit on its own slip.
        wrapped = []
        for line in lines:
            segment = ""
            for char in line:
                if segment and font.getlength(segment + char) > width:
                    wrapped.append(segment)
                    segment = ""
                segment += char
            if segment:
                wrapped.append(segment)
        leading = math.ceil(pt * 1.24)
        if len(wrapped) * leading <= height:
            break
    cx, cy = center
    for i, line in enumerate(wrapped):
        draw.text((cx, round(cy + (i-(len(wrapped)-1)/2)*leading)), line,
                  fill=INK, font=font, anchor="mm")


@lru_cache(maxsize=6)
def _stage(lang, left, right):
    from PIL import Image, ImageDraw
    from media import _style
    from channel_style import BOLD, FOOT, H, PAPER, W

    board = Image.new("RGB", (W, H), PAPER)
    hands = _hands(W, FOOT)
    board.paste(hands, (0, 0), hands)
    draw = ImageDraw.Draw(board)
    style = _style(lang)
    style.brand(draw)
    style.evidence_label(draw, "しくみの図" if lang == "ja" else "Illustrated explanation")
    _label(draw, left, lang, (LEFT, 509), 390, 74, family=BOLD, size=31)
    _label(draw, right, lang, (RIGHT, 509), 390, 74, family=BOLD, size=31)
    style.caption_rail(draw)
    return board


@lru_cache(maxsize=16)
def _slip(lang, label, outward):
    from PIL import Image, ImageDraw
    from channel_style import INK, SERIF

    w, h = 402, 114
    slip = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(slip)
    def folded(points, fill):
        pts = [(x if outward else w-1-x, y) for x, y in points]
        draw.polygon(pts, fill=fill)
        draw.line([*pts, pts[0]], fill=INK, width=2, joint="curve")
    folded([(14, 39), (46, 19), (288, 22), (361, 6), (386, 77), (346, 104), (29, 97)],
           "#b86736" if outward else "#4e8093")
    folded([(11, 23), (301, 18), (361, 6), (381, 76), (326, 90), (26, 92)],
           "#f5cf9c" if outward else "#c4dfe1")
    folded([(301, 18), (361, 6), (350, 29)], "#fff0cc" if outward else "#e8f4ef")
    _label(draw, label, lang, (193 if outward else 208, 57), 308, 58, family=SERIF, size=36)
    return slip


def _travel(position, start, finish):
    t = min(1.0, max(0.0, (position-start) / (finish-start)))
    return t*t*(3-2*t)


def render(lang, exchange, position):
    from PIL import Image

    board = _stage(lang, exchange["left"][lang], exchange["right"][lang]).copy()
    for field, outward, start, finish in [("toRight", True, .14, .65), ("toLeft", False, .27, .78)]:
        t = _travel(position, start, finish)
        arc = math.sin(math.pi*t)
        x = LEFT + (RIGHT-LEFT)*(t if outward else 1-t)
        y = REST_Y + (-130 if outward else 32)*arc
        slip = _slip(lang, exchange[field][lang], outward)
        if 0 < t < 1:
            slip = slip.rotate((5 if outward else -4)*arc, Image.Resampling.BICUBIC, expand=True)
        board.paste(slip, (round(x-slip.width/2), round(y-slip.height/2)), slip)
    return board
