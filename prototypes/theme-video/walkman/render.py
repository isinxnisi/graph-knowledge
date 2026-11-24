"""Render the Walkman paper animatic from the recorded narration and four drawings."""

import argparse
from functools import lru_cache
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
W, H, FOOT = 1280, 720, 562
FPS, RATE = 24, 24000
PAPER, INK, BLUE, ORANGE = "#f5f1e7", "#172936", "#235c85", "#d57532"
SANS, BOLD, SERIF, LATIN = "YuGothM.ttc", "YuGothB.ttc", "yumindb.ttf", "georgia.ttf"


class Boards:
    def __init__(self, art, fonts):
        self.fonts = fonts
        self.drawings = {
            key: Image.open(art / (key + ".png")).convert("RGBA")
            for key in ("listen", "lift", "conversation", "tape")
        }
        self.photo = Image.open(ROOT / "figures/first-walkman-1979.jpg").convert("RGB")

    @lru_cache(maxsize=64)
    def font(self, family, size):
        return ImageFont.truetype(str(self.fonts / family), size)

    def text(self, draw, x, y, value, size, *, family=SANS, color=INK, anchor="lt"):
        draw.text((x, y), value, font=self.font(family, size), fill=color, anchor=anchor)

    def brand(self, draw, light=False):
        color = PAPER if light else INK
        draw.line((55, 32, 74, 22), fill=ORANGE, width=3)
        for x, y in ((55, 32), (74, 22)):
            draw.ellipse((x-4, y-4, x+4, y+4), fill=ORANGE)
        self.text(draw, 88, 17, "Plunode", 27, family=LATIN, color=color)

    def art(self, canvas, key, box, crop=None):
        source = self.drawings[key]
        if crop:
            scale = source.width / 1000
            source = source.crop(tuple(round(n * scale) for n in crop))
        layer = ImageOps.contain(source, box[2:], Image.Resampling.LANCZOS)
        canvas.paste(layer, (box[0] + (box[2]-layer.width)//2,
                             box[1] + (box[3]-layer.height)//2), layer)

    @lru_cache(maxsize=32)
    def board(self, shot):
        canvas = Image.new("RGB", (W, H), PAPER)
        d = ImageDraw.Draw(canvas)
        if shot == "credits":
            canvas.paste(INK, (0, 0, W, H))
            self.brand(d, light=True)
            self.text(d, 66, 99, "出典と制作", 52, family=SERIF, color=PAPER)
            d.line((68, 178, 1207, 178), fill="#78868a", width=1)
            entries = [
                ("資料", "盛田昭夫「ウォークマン考」", "『文藝春秋』1981年4月号 ／ 文春オンライン再掲"),
                ("製品・テーマ", "ソニー「商品のあゆみ」／ Plunode 公開第17版", "「ウォークマンは、どうやって音楽を外へ連れ出したのか」"),
                ("展示写真", "First Walkman 1979  ·  Yoshikazu TAKADA", "CC BY 2.0  ·  flickr.com/photos/34530295@N06/31011124386  ·  トリミング"),
                ("音声・図", "VOICEVOX:青山龍星", "模式図・冒頭の説明用の音  Plunode"),
            ]
            for i, (label, title, detail) in enumerate(entries):
                y = 211 + 107*i
                self.text(d, 70, y+4, label, 20, color="#f0ab72", family=BOLD)
                self.text(d, 240, y, title, 30, color=PAPER)
                self.text(d, 240, y+42, detail, 19, color="#c5cecc")
            self.text(d, 240, 655, "creativecommons.org/licenses/by/2.0/", 17, color="#c5cecc")
            return canvas
        if shot == "product":
            canvas.paste(INK, (0, 0, W, FOOT))
            photo = ImageOps.fit(self.photo, (812, FOOT), centering=(.53, .50),
                                 method=Image.Resampling.LANCZOS)
            canvas.paste(photo, (468, 0))
            self.brand(d, light=True)
            self.text(d, 60, 118, "1979", 88, family=LATIN, color="#eda870")
            self.text(d, 58, 249, "初代", 51, family=SERIF, color=PAPER)
            self.text(d, 54, 322, "ウォークマン", 62, family=SERIF, color=PAPER)
            self.text(d, 63, 465, "SONY   /   TPS-L2", 23, family=BOLD, color="#cfdbdd")
            d.rectangle((866, 519, 1280, FOOT), fill=INK)
            self.text(d, 1073, 541, "2016年の展示　撮影  Yoshikazu TAKADA", 16,
                      color=PAPER, anchor="mm")
        elif shot in ("tape", "pianist"):
            canvas.paste("#e5e6df", (0, 0, W, FOOT))
            self.brand(d)
            self.text(d, 1218, 24, "回想をもとにした図", 19, anchor="rt", family=BOLD, color=BLUE)
            self.text(d, 62, 130, "車の中で", 61, family=SERIF)
            self.text(d, 65, 227, "盛田昭夫と", 31)
            self.text(d, 65, 274, "友人・庄司薫", 31)
            self.art(canvas, "tape", (385, 75, 835, 461))
            if shot == "pianist":
                self.text(d, 802, 185, "ピアノ  中村紘子", 35, anchor="mm", family=SERIF)
        elif shot == "memoir":
            self.brand(d)
            self.text(d, 68, 130, "開発中の記憶", 64, family=SERIF)
            d.line((69, 242, 480, 242), fill=ORANGE, width=3)
            self.text(d, 70, 286, "盛田昭夫", 46, family=SERIF)
            self.text(d, 71, 362, "「ウォークマン考」", 27)
            self.text(d, 72, 409, "1981年、『文藝春秋』に寄稿", 22, color=BLUE)
            self.art(canvas, "listen", (650, 105, 510, 414), crop=(399, 284, 602, 481))
            self.text(d, 1218, 24, "しくみの図", 19, anchor="rt", family=BOLD, color=BLUE)
        elif shot == "switch":
            self.brand(d)
            self.text(d, 68, 129, "本体のマイクへ", 54, family=SERIF)
            self.text(d, 71, 241, "HOT LINE", 39, family=LATIN, color=BLUE)
            self.text(d, 71, 309, "ボタンを押すと、", 26)
            self.text(d, 71, 355, "まわりの声を拾う。", 26)
            self.art(canvas, "conversation", (595, 77, 585, 461), crop=(383, 265, 623, 470))
            self.text(d, 1218, 24, "しくみの図", 19, anchor="rt", family=BOLD, color=BLUE)
        else:
            titles = {"opening":"同じ曲を、ふたりで。", "question":"隣の声は、どう届く？",
                      "pair":"ひとつの本体に、二組。", "home":"もう一組、つないでみる。",
                      "car":"すぐ隣にいる、ふたり。", "ear":"すぐ隣にいる、ふたり。",
                      "voice":"声が届く道", "ending":"初代ウォークマンのホットライン"}
            key = {"ear":"lift", "voice":"conversation", "ending":"conversation"}.get(shot, "listen")
            self.brand(d)
            label = "しくみの図"
            if shot == "opening":
                label = "しくみの図・説明用の音"
            elif shot in ("car", "ear", "home"):
                label = "回想をもとにした模式図"
            self.text(d, 1218, 24, label, 19, anchor="rt", family=BOLD, color=BLUE)
            self.text(d, 640, 78, titles[shot], 47, anchor="mt", family=SERIF)
            self.art(canvas, key, (139, 124, 1002, 437))
        d.rectangle((0, FOOT, W, H), fill=INK)
        return canvas

    def sound_to_listener(self, img, progress):
        # Follow the right-hand cable in conversation.svg from its plug to the ear.
        curves = [
            ((517,316),(523,308),(528,297),(536,294)),
            ((536,294),(545,291),(555,299),(566,317)),
            ((566,317),(587,351),(616,394),(674,394)),
            ((674,394),(721,394),(760,382),(782,332)),
            ((782,332),(801,289),(818,241),(809,199)),
        ]
        points = []
        for p0, p1, p2, p3 in (np.array(c) for c in curves):
            for t in np.linspace(0, 1, 31):
                x,y = (1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t*t*p2 + t**3*p3
                points.append((round(203+x*.874),round(124+y*.874)))
        length = np.cumsum([0]+[math.dist(a,b) for a,b in zip(points,points[1:])])
        end = min(len(points),max(2,1+int(np.searchsorted(length,length[-1]*progress))))
        draw = ImageDraw.Draw(img)
        draw.line(points[:end],fill="#b95622",width=4)
        x,y = points[end-1]
        draw.ellipse((x-5,y-5,x+5,y+5),fill=ORANGE)
        if progress == 1:
            draw.ellipse((886,250,935,309),outline="#ad542c",width=3)

    def frame(self, shot, caption, progress=None):
        img = self.board(shot)
        if progress is not None:
            img = img.copy()
            self.sound_to_listener(img, progress)
        if not caption:
            return img
        img = img.copy()
        draw = ImageDraw.Draw(img)
        lines = caption.splitlines()
        widest = max(len(line) for line in lines)
        size = min(39, 1174 // widest)
        for i, line in enumerate(lines):
            y = 639 + (i-(len(lines)-1)/2)*55
            self.text(draw, W//2, y, line, size, anchor="mm", color="#fdfbf5", family=BOLD)
        return img


def timestamp(frame):
    ms = round(frame*1000/FPS)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def render(art, fonts, work):
    edit = json.loads((ROOT / "edit.json").read_text(encoding="utf-8"))
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(ROOT/"narration.flac"),
                                   "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-"])
    voice = np.frombuffer(raw, dtype="<i2").astype(np.float32)/32768
    assert sum(cue["samples"] for cue in edit) == len(voice)
    work.mkdir(parents=True, exist_ok=True)
    scenes, subtitles, voices = [], [], []
    frame = 0

    def add(shot, count, caption="", progress=None):
        nonlocal frame
        if count > 0:
            scenes.append((shot, count, caption, progress))
            frame += count

    add("opening", 26)
    offset = 0
    for n, cue in enumerate(edit, 1):
        shot, count = cue["shot"], cue["samples"]
        voices.append((frame*(RATE//FPS), voice[offset:offset+count]))
        offset += count
        start = frame
        spoken_frames = math.ceil(count*FPS/RATE)
        if shot == "voice":
            # Keep the microphone in view, then carry its signal to the listener.
            add(shot, 12, cue["caption"])
            for step in range(1,17):
                add(shot, 3, cue["caption"], step/16)
            add(shot, spoken_frames-60, cue["caption"], 1)
        else:
            add(shot, spoken_frames, cue["caption"], 1 if shot == "ending" else None)
        subtitles.append(f"{n}\n{timestamp(start)} --> {timestamp(frame)}\n{cue['caption']}\n")
        # Show the hand reaching the ear before the narrator explains the discomfort.
        add("ear" if shot == "car" else shot, round(cue["after"]*FPS),
            progress=1 if shot in ("ending","voice") else None)
    add("credits", 7*FPS)
    audio = np.zeros(frame*(RATE//FPS), dtype=np.float32)
    for start, samples in voices:
        audio[start:start+len(samples)] += samples
    # A newly composed, short identification sound for the opening diagram.
    for start, hz in [(0.08, 349.23), (.34, 440), (.64, 392), (1.03, 523.25)]:
        t = np.arange(round(.49*RATE))/RATE
        env = np.minimum(t/.018, 1)*np.exp(-t*8)*np.minimum((.49-t)/.04, 1)
        tone = .12*env*(np.sin(2*np.pi*hz*t)+.22*np.sin(4*np.pi*hz*t))
        p = round(start*RATE)
        audio[p:p+len(tone)] += tone
    audio *= 1.6  # Raise the quiet narration master while retaining headroom for AAC.
    assert abs(audio).max() < 1, "Clipping in master"
    wav = work/"mix.wav"
    with wave.open(str(wav), "wb") as out:
        out.setparams((1, 2, RATE, 0, "NONE", ""))
        out.writeframes((audio*32767).astype("<i2").tobytes())
    (ROOT/"walkman.ja.srt").write_text("\n".join(subtitles), encoding="utf-8", newline="\n")

    boards = Boards(art, fonts)
    # Encode a 24 fps still sequence without writing thousands of identical frames.
    inputs = ["ffconcat version 1.0"]
    for i,(shot,count,caption,progress) in enumerate(scenes):
        file = f"board{i:02}.png"
        boards.frame(shot, caption, progress).save(work/file, compress_level=2)
        inputs.extend([f"file '{file}'", f"option framerate {FPS}", f"duration {count/FPS:.9f}"])
    inputs.extend([f"file '{file}'", f"option framerate {FPS}"])
    (work/"boards.ffconcat").write_text("\n".join(inputs)+"\n", encoding="ascii")
    subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",
                    str(work/"boards.ffconcat"),"-i",str(wav),"-map","0:v","-map","1:a",
                    "-vf",f"fps={FPS},format=yuv420p","-t",f"{frame/FPS:.9f}",
                    "-c:v","libx264","-preset","medium","-crf","18","-c:a","aac",
                    "-ar","48000","-b:a","128k","-movflags","+faststart",
                    "-metadata","title=初代ウォークマンには、隣の声を聴くボタンがあった",
                    str(ROOT/"walkman-pilot.mp4")],check=True)
    print(f"{frame} frames, {frame/FPS:.3f} seconds")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--art", type=Path, required=True, help="PNG renders of the four SVGs")
    parser.add_argument("--fonts", type=Path, required=True, help="Windows fonts directory")
    parser.add_argument("--work", type=Path, required=True, help="Temporary boards and mix")
    args = parser.parse_args()
    render(args.art, args.fonts, args.work)
