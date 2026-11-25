"""Plunode's own illustrated example of a wipe between two stationary pictures."""
from functools import lru_cache


ASSET = "wipe-demo"
DESCRIPTION = ("画面に「ワイプのしくみ・自作の例」「画面の端を見て。」。土の道の傍らに小鳥が止まった道標。"
               "左端から濃紺の星空が現れ、境目が中央でひと呼吸止まる。左の星空と右の道が同時に見え、"
               "最後に星空が横長の枠いっぱいに広がる。最初の実演で星空が現れ始めると、紙を払うような短い音。")
PANEL = (108, 144, 1172, 507)
REVEAL_START = 0.12


@lru_cache(maxsize=1)
def _landscapes():
    from PIL import Image, ImageDraw

    width, height = PANEL[2] - PANEL[0], PANEL[3] - PANEL[1]
    road = Image.new("RGB", (width * 2, height * 2), "#f4e5cf")
    draw = ImageDraw.Draw(road)

    # Draw at twice the delivery size to retain the rounded ink edges of the bird and sign.
    def polygon(points, fill):
        draw.polygon([(2 * x, 2 * y) for x, y in points], fill=fill)

    def oval(box, fill):
        draw.ellipse(tuple(2 * n for n in box), fill=fill)

    def line(points, color, weight):
        draw.line([(2 * x, 2 * y) for x, y in points], fill=color, width=2 * weight, joint="curve")

    oval((203, 47, 249, 93), "#e4a56d")
    polygon([(0, 159), (88, 145), (174, 151), (263, 127), (334, 119), (430, 138),
             (526, 121), (638, 137), (727, 125), (826, 109), (914, 114), (width, 145),
             (width, height), (0, height)], "#bdc9be")
    polygon([(0, 169), (134, 157), (266, 169), (382, 152), (532, 163), (688, 148),
             (838, 154), (width, 137), (width, height), (0, height)], "#e7d4ab")
    polygon([(495, 156), (526, 156), (574, 172), (565, 187), (522, 206), (507, 221),
             (531, 242), (626, 279), (852, height), (130, height), (368, 276), (435, 243),
             (444, 222), (476, 203), (535, 183), (540, 174)], "#c6996f")
    for x, y in [(142, 214), (372, 182), (890, 256), (712, 206), (75, 313), (959, 179)]:
        line([(x-3, y-5), (x, y), (x+5, y-9)], "#a89f77", 2)
    ink = "#243946"
    polygon([(770, 161), (778, 161), (782, 280), (772, 280)], ink)
    polygon([(737, 146), (806, 142), (825, 153), (809, 170), (739, 175)], ink)
    polygon([(741, 150), (804, 146), (818, 154), (807, 166), (742, 171)], "#d98a4f")
    line([(774, 144), (774, 136), (784, 133)], ink, 2)
    polygon([(785, 130), (808, 116), (802, 132), (791, 137)], ink)
    oval((765, 118, 795, 138), ink)
    oval((763, 111, 781, 130), ink)
    polygon([(763, 117), (756, 120), (764, 122)], "#b66b37")
    oval((768, 116, 770, 118), "#f5f1e7")

    sky = Image.new("RGB", road.size, "#20374a")
    draw = ImageDraw.Draw(sky)
    for x, y, radius in [(48, 125, 2), (117, 71, 3), (187, 266, 3), (223, 130, 2),
                         (284, 192, 2), (320, 63, 2), (397, 214, 3), (438, 109, 2),
                         (602, 74, 3), (675, 222, 2), (733, 176, 3), (853, 76, 2),
                         (934, 189, 3), (988, 69, 2), (1025, 281, 3), (530, 282, 2)]:
        oval((x-radius, y-radius, x+radius, y+radius), "#d6e0d9")
    for x, y, radius, color in [(137, 185, 12, "#f4e6cd"), (501, 124, 22, "#eeab68"),
                                (815, 236, 15, "#efdbc2"), (997, 122, 9, "#e0e6de")]:
        polygon([(x, y-radius), (x+3, y-3), (x+radius, y), (x+3, y+3),
                 (x, y+radius), (x-3, y+3), (x-radius, y), (x-3, y-3)], color)
    return tuple(img.resize((width, height), Image.Resampling.LANCZOS) for img in (road, sky))


@lru_cache(maxsize=2)
def _plates(lang):
    # Import drawing dependencies only for rendering. The editor also imports the description.
    from media import _style
    from channel_style import H, PAPER, SERIF, W
    from PIL import Image, ImageDraw

    style = _style(lang)
    board = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(board)
    style.brand(draw)
    style.evidence_label(draw, "ワイプのしくみ・自作の例" if lang == "ja" else "Wipe technique · original illustration")
    style.text(draw, W // 2, 72, "画面の端を見て。" if lang == "ja" else "Watch the edge.", 46,
               family=SERIF, anchor="mt")
    style.caption_rail(draw)
    plates = []
    for landscape in _landscapes():
        plate = board.copy()
        plate.paste(landscape, PANEL[:2])
        plates.append(plate)
    return plates


def _ease(position, start, end):
    t = max(0.0, min(1.0, (position - start) / (end - start)))
    return t * t * (3 - 2 * t)


def render(lang, position):
    """Reveal the second illustration beneath a moving edge, pausing halfway for comparison."""
    road, sky = _plates(lang)
    left, top, right, bottom = PANEL
    fraction = 0.52 * _ease(position, REVEAL_START, 0.47) + 0.48 * _ease(position, 0.56, 0.88)
    edge = left + round((right-left) * fraction)
    if edge == right:
        return sky.copy()
    image = road.copy()
    if edge > left:
        box = (left, top, edge, bottom)
        image.paste(sky.crop(box), (left, top))
    return image


def mix_paper_swish(samples, rate):
    """Mix a quiet, original paper sound into the first 0.22 seconds of this slice."""
    import numpy as np

    length = min(len(samples), round(rate * 0.22))
    if length < 3:
        return
    # Two smoothing windows leave the mid-frequency rustle, without a sharp hiss or bass hit.
    grain = np.random.default_rng(291).standard_normal(length + 48)
    narrow, broad = np.hanning(9), np.hanning(49)
    sound = (np.convolve(grain, narrow / narrow.sum(), "same")
             - np.convolve(grain, broad / broad.sum(), "same"))[24:24+length]
    sound *= np.sin(np.linspace(0, np.pi, length)) ** 1.5
    sound *= 735 / np.max(np.abs(sound))
    voice = samples[:length].astype(np.int32)
    samples[:length] = np.clip(voice + np.rint(sound), -32768, 32767).astype("<i2")
