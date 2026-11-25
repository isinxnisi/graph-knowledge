"""Render the Japanese opening about Baird's dummy and the witness on the stairs."""
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "studio"))
from media import FPS, RATE, _save_wav, _speech, _style, _voice
from speech_reading import apply_readings
from channel_sound import opening_notes
from channel_style import BLUE, BOLD, FOOT, H, INK, ORANGE, PAPER, SERIF, W


# English Heritage records the change from a dummy to Taynton on 2 October
# 1925. The clothing and the descent of the stairs come from his recollection.
# A pause can show the next illustration before the next sentence begins.
LINES = [
    ("dummy", "テレビの実験で、じっと相手をしてくれたのは、腹話術の人形でした。", 4, "dummy"),
    ("dummy", "その顔の明暗まで、画面に映ったのです。", 8, "stairs"),
    ("stairs", "今度は人を呼びに、ベアードは階段を駆け下りました。", 4, "stairs"),
    ("stairs", "その日、顔を映してもらった青年は、ベアードの格好まで覚えていました。", 9, "slippers"),
    ("slippers", "だぶだぶのズボンに、素足でつっかけた室内履き。", 18, "slippers"),
]
READINGS = [{"text": "室内履き", "kana": "シツナイバキ"}]


def make_board(frame, shot):
    canvas = Image.new("RGB", (W, H), PAPER)
    with Image.open(ROOT / ("dummy.png" if shot == "dummy" else "stairs.png")) as art:
        picture = art.convert("RGB")
    if shot == "slippers":
        # The witness recalled the bare ankles in slippers. Keep both ankles
        # and the steps, so this closer view still belongs to the previous shot.
        picture = picture.crop((276, 230, 1506, 1024))
    panel_width = 843
    canvas.paste(ImageOps.fit(picture, (panel_width, FOOT), method=Image.Resampling.LANCZOS),
                 (W - panel_width, 0))
    draw = ImageDraw.Draw(canvas)
    frame.brand(draw)
    frame.text(draw, 61, 124, "1925年、ロンドン", 23, family=BOLD, color=BLUE)
    headings = {"dummy": ("テレビの", "実験相手"), "stairs": ("人を呼びに、", "階下へ。"),
                "slippers": ("青年が語った", "その足元。")}
    for y, line in zip((193, 281), headings[shot]):
        frame.text(draw, 58, y, line, 63, family=SERIF, max_width=349)
    draw.line((63, 402, 136, 402), fill=ORANGE, width=3)
    frame.text(draw, 62, 440, "史料に基づく演出図", 21, family=BOLD, color=BLUE)
    frame.text(draw, 62, 478, "回想　W. テイントン", 19)
    if shot == "slippers":
        frame.text(draw, 61, 522, "声　VOICEVOX：青山龍星", 16, color=INK)
    frame.caption_rail(draw)
    return canvas


def render():
    frame = _style("ja")
    boards = {shot: make_board(frame, shot) for shot in ("dummy", "stairs", "slippers")}
    voice, engine = _voice("ja")
    print(voice)
    timeline = [("dummy", "", 26)]
    voices = []
    position = 26
    samples_per_frame = RATE // FPS
    for shot, caption, pause, next_shot in LINES:
        audio = _speech(apply_readings(caption, READINGS), "ja", voice, engine)
        frames = math.ceil(len(audio) / samples_per_frame)
        print(f"{position/FPS:6.3f}–{(position+frames)/FPS:6.3f}  {caption}")
        voices.append((position * samples_per_frame, audio))
        timeline.extend([(shot, caption, frames), (next_shot, "", pause)])
        position += frames + pause

    master = np.zeros(position * samples_per_frame, dtype=np.float32)
    for offset, samples in voices:
        master[offset:offset+len(samples)] = samples.astype(np.float32) / 32768
    for offset, tone in opening_notes(RATE):
        master[offset:offset+len(tone)] += 1.6 * tone
    if np.abs(master).max() >= 1:
        raise ValueError("The opening sound and voice clip when mixed.")

    with tempfile.TemporaryDirectory(prefix="plunode-baird-") as name:
        work = Path(name)
        manifest = ["ffconcat version 1.0"]
        for i, (shot, caption, frames) in enumerate(timeline):
            image = boards[shot].copy()
            if caption:
                frame.subtitle(image, frame.caption_breaks(caption, wrap_japanese=True))
            file = f"shot-{i:02}.png"
            image.save(work / file, compress_level=2)
            manifest.extend([f"file '{file}'", f"option framerate {FPS}", f"duration {frames/FPS:.9f}"])
        manifest.extend([f"file '{file}'", f"option framerate {FPS}"])
        (work / "shots.ffconcat").write_text("\n".join(manifest)+"\n", encoding="ascii")
        _save_wav(work / "mix.wav", np.round(master * 32767).astype("<i2"))
        with tempfile.NamedTemporaryFile(suffix=".mp4", dir=ROOT, delete=False) as temp:
            output = Path(temp.name)
        try:
            subprocess.run([
                "ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "shots.ffconcat",
                "-i", "mix.wav", "-map", "0:v", "-map", "1:a", "-vf", f"fps={FPS},format=yuv420p",
                "-t", f"{position/FPS:.9f}", "-c:v", "libx264", "-crf", "18", "-c:a", "aac",
                "-ar", "48000", "-b:a", "128k", "-movflags", "+faststart", "-metadata:s:a:0", "language=jpn",
                "-metadata", "title=テレビの実験相手", str(output),
            ], cwd=work, check=True)
            os.replace(output, ROOT / "opening.ja.mp4")
        finally:
            output.unlink(missing_ok=True)
    print(f"{position} frames, {position/FPS:.3f} s")


if __name__ == "__main__":
    render()
