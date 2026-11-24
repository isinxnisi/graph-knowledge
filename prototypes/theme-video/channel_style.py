"""Screen composition and typography shared by Plunode's landscape episodes."""
from functools import lru_cache

from PIL import ImageDraw, ImageFont


STYLE = "plunode-walkman-1"
W, H, FOOT = 1280, 720, 562
PAPER, INK, BLUE, ORANGE = "#f5f1e7", "#172936", "#235c85", "#d57532"
SANS, BOLD, SERIF, LATIN = "YuGothM.ttc", "YuGothB.ttc", "yumindb.ttf", "georgia.ttf"


class ChannelFrame:
    def __init__(self, fonts, lang):
        self.fonts = fonts
        self.lang = lang

    @lru_cache(maxsize=128)
    def font(self, family, size):
        if self.lang == "en":
            family = {SANS: "segoeui.ttf", BOLD: "segoeuib.ttf", SERIF: LATIN}.get(family, family)
        return ImageFont.truetype(str(self.fonts / family), size)

    def text(self, draw, x, y, value, size, *, family=SANS, color=INK, anchor="lt", max_width=None):
        font = self.font(family, size)
        if max_width is not None and font.getlength(value) > max_width:
            size = max(1, int(size * max_width / font.getlength(value)))
            font = self.font(family, size)
        draw.text((x, y), value, font=font, fill=color, anchor=anchor)

    def brand(self, draw, light=False):
        draw.line((55, 32, 74, 22), fill=ORANGE, width=3)
        for x, y in ((55, 32), (74, 22)):
            draw.ellipse((x-4, y-4, x+4, y+4), fill=ORANGE)
        self.text(draw, 88, 17, "Plunode", 27, family=LATIN, color=PAPER if light else INK)

    def evidence_label(self, draw, value, *, light=False):
        self.text(draw, 1218, 24, value, 19, anchor="rt", family=BOLD, color="#cfdbdd" if light else BLUE)

    def credits_header(self, draw, title):
        self.brand(draw, light=True)
        self.text(draw, 66, 99, title, 52, family=SERIF, color=PAPER)
        draw.line((68, 178, 1207, 178), fill="#78868a", width=1)

    def caption_rail(self, draw):
        draw.rectangle((0, FOOT, W, H), fill=INK)

    def caption_breaks(self, caption, *, wrap_japanese=False):
        if "\n" in caption or (self.lang == "ja" and not wrap_japanese):
            return caption
        font = self.font(BOLD, 39)
        if font.getlength(caption) <= 1174:
            return caption
        if self.lang == "ja":
            candidates = range(1, len(caption))
            fitting = [i for i in candidates if caption[i] not in "、。！？）」』っッゃゅょャュョー"
                       and max(font.getlength(caption[:i]), font.getlength(caption[i:])) <= 1174]
            if not fitting:
                return caption
            pauses = [i for i in fitting if caption[i-1] in "、。！？"]
            cut = min(pauses or fitting, key=lambda i: abs(font.getlength(caption[:i]) - font.getlength(caption[i:])))
            return caption[:cut] + "\n" + caption[cut:]
        words = caption.split()
        if len(words) < 2:
            return caption
        breaks = [(" ".join(words[:i]), " ".join(words[i:])) for i in range(1, len(words))]
        first, second = min(breaks, key=lambda pair: max(font.getlength(s) for s in pair))
        return first + "\n" + second

    def subtitle(self, image, caption):
        draw = ImageDraw.Draw(image)
        lines = caption.splitlines()
        if self.lang == "ja":
            size = min(39, 1174 // max(len(line) for line in lines))
        else:
            widest = max(self.font(BOLD, 39).getlength(line) for line in lines)
            size = min(39, int(39 * 1174 / widest))
        for i, line in enumerate(lines):
            y = 639 + (i-(len(lines)-1)/2)*55
            self.text(draw, W//2, y, line, max(1, size), anchor="mm", color="#fdfbf5", family=BOLD)
