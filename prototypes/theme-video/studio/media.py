"""Render a local edition from the selected plan, measured speech and cited boards."""

from functools import lru_cache
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from setup_media import media_home


ASSETS = Path(__file__).resolve().parent / "assets"
WEBB = json.loads((ASSETS / "webb.json").read_text(encoding="utf-8"))
RATE, FPS, W, H = 24000, 24, 1280, 720
INK, PAPER, MUTED, ACCENT = "#14232D", "#F6F3EB", "#577078", "#BC592C"
ENGINE = "http://127.0.0.1:13769"
_engine_lock = threading.Lock()
_voice_lock = threading.Lock()


def _request(base, path, params=None, data=None, timeout=60):
    url = base + path + ("?" + urlencode(params) if params else "")
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=timeout) as response:
        return response.read()


def _voicevox_speaker(base):
    speakers = json.loads(_request(base, "/speakers", timeout=3))
    for speaker in speakers:
        if speaker["name"] == "青山龍星":
            for style in speaker["styles"]:
                if style["name"] == "ノーマル":
                    return style["id"]
    raise RuntimeError("VOICEVOXに青山龍星のノーマル音声がありません。")


def _voicevox():
    explicit = os.environ.get("PLUNODE_VOICEVOX_URL")
    base = (explicit or ENGINE).rstrip("/")
    with _engine_lock:
        try:
            return base, _voicevox_speaker(base), json.loads(_request(base, "/version", timeout=3))
        except OSError as err:
            if explicit:
                raise RuntimeError("設定されたVOICEVOX Engineに接続できません。") from err
        root = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/VOICEVOX/vv-engine"
        executable = Path(os.environ.get("PLUNODE_VOICEVOX_EXE", root / "run.exe"))
        if not executable.is_file():
            raise RuntimeError("VOICEVOXをインストールするか、起動中のEngineをPLUNODE_VOICEVOX_URLで指定してください。")
        proc = subprocess.Popen([str(executable), "--host", "127.0.0.1", "--port", str(urlsplit(ENGINE).port),
                                 "--cpu_num_threads", "3", "--disable_mutable_api"],
                                cwd=executable.parent, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        for _ in range(75):
            try:
                return base, _voicevox_speaker(base), json.loads(_request(base, "/version", timeout=3))
            except OSError:
                if proc.poll() is not None:
                    break
                time.sleep(0.8)
        raise RuntimeError("VOICEVOX Engineの起動を確認できませんでした。")


@lru_cache(maxsize=1)
def _kokoro():
    folder = media_home()
    packages = folder / "python"
    if not (packages / "kokoro_onnx").is_dir() or not (folder / "voices-v1.0.bin").is_file():
        raise RuntimeError("英語音声の準備が必要です。studio/setup_media.py を実行してください。")
    sys.path.insert(0, str(packages))
    espeak = packages / "espeakng_loader/espeak-ng.dll"
    if espeak.is_file():
        os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", str(espeak))
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    options = ort.SessionOptions()
    options.intra_op_num_threads = 3
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(folder / "kokoro-v1.0.int8.onnx"), sess_options=options,
                                   providers=["CPUExecutionProvider"])
    return Kokoro.from_session(session, str(folder / "voices-v1.0.bin"))


def _read_pcm(data):
    with wave.open(io.BytesIO(data), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
            raise ValueError("音声形式が24 kHz mono PCMではありません。")
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")


def _save_wav(path, pcm):
    with wave.open(str(path), "wb") as out:
        out.setparams((1, 2, RATE, 0, "NONE", ""))
        out.writeframes(np.asarray(pcm, dtype="<i2").tobytes())


def _speech(text, lang, voice, engine):
    key = hashlib.sha256(json.dumps([3, voice, text], ensure_ascii=False).encode()).hexdigest()
    cache = media_home() / "speech-cache" / key[:2]
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / (key + ".wav")
    if target.is_file():
        return _read_pcm(target.read_bytes())
    if lang == "ja":
        base, speaker, _ = engine
        spoken = re.sub(r"HD\s*84[,]?406", "エイチディー、はちまんよんせんよんひゃくろく", text, flags=re.I)
        spoken = re.sub(r"NIRCam", "ニアカム", spoken, flags=re.I)
        params = {"speaker": speaker}
        query = json.loads(_request(base, "/audio_query", {**params, "text": spoken}, b""))
        query.update(outputSamplingRate=RATE, outputStereo=False, speedScale=1.02,
                     prePhonemeLength=0.05, postPhonemeLength=0.08)
        data = _request(base, "/synthesis", params, json.dumps(query).encode())
        signal = _read_pcm(data).astype(np.float32) / 32768
    else:
        spoken = re.sub(r"HD\s*84[,]?406", "H D eighty-four four oh six", text, flags=re.I)
        spoken = re.sub(r"NIRCam", "near cam", spoken, flags=re.I)
        with _voice_lock:
            signal, rate = _kokoro().create(spoken, voice="af_heart", speed=0.98, lang="en-us")
        if rate != RATE:
            raise ValueError("Kokoroの出力サンプルレートが異なります。")
    signal = np.asarray(signal, dtype=np.float32)
    active = np.flatnonzero(np.abs(signal) > 0.003)
    if not len(active) or not np.isfinite(signal).all():
        raise ValueError("音声合成結果を確認できません。")
    signal = signal[max(0, active[0]-1200):active[-1]+2160].copy()
    fade = min(120, len(signal)//2)
    if fade:
        signal[:fade] *= np.linspace(0, 1, fade)
        signal[-fade:] *= np.linspace(1, 0, fade)
    gain = min(0.80 / np.abs(signal).max(), 0.115 / np.sqrt(np.mean(signal**2)))
    pcm = np.round(signal * gain * 32767).astype("<i2")
    with tempfile.NamedTemporaryFile(dir=cache, suffix=".wav", delete=False) as f:
        tmp = Path(f.name)
    try:
        _save_wav(tmp, pcm)
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)
    return pcm


@lru_cache(maxsize=100)
def _font(size, family):
    root = Path(os.environ.get("PLUNODE_STUDIO_FONTS", Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"))
    names = {"ja": "YuGothM.ttc", "ja-bold": "YuGothB.ttc", "ja-title": "yumindb.ttf",
             "en": "segoeui.ttf", "en-bold": "segoeuib.ttf", "en-title": "georgia.ttf"}
    return ImageFont.truetype(str(root / names[family]), size)


def _lines(text, font, width):
    # Keep Latin words together and break between Japanese characters. Avoid leading punctuation.
    tokens = re.findall(r"[A-Za-z0-9À-ÿ]+(?:[’'\-][A-Za-z0-9À-ÿ]+)*|\s+|.", str(text))
    lines, current = [], ""
    for token in tokens:
        if current and font.getlength(current + token) > width and token not in "。、「」！？.,!?":
            lines.append(current.rstrip())
            current = token.lstrip()
        else:
            current += token
    if current.strip():
        lines.append(current.strip())
    return lines


def _block(draw, text, lang, box, *, family="", size=45, color=INK, center=False):
    x, y, width, height = box
    target = lang + ("-" + family if family else "")
    for actual in range(size, 13, -1):
        font = _font(actual, target)
        lines = _lines(text, font, width)
        line_height = math.ceil(actual * 1.32)
        if len(lines) * line_height <= height and all(font.getlength(s) <= width+10 for s in lines):
            break
    top = y + (height - len(lines) * line_height) / 2 if center else y
    for i, line in enumerate(lines):
        draw.text((x + width/2 if center else x, top + i*line_height), line,
                  font=font, fill=color, anchor="mt" if center else "lt")


def _phrases(text, lang):
    text = " ".join(text.split())
    # A subtitle covers the exact audio synthesized for it. Preserve the sentence when it fits.
    if lang == "ja":
        parts = re.findall(r"[^。！？]+[。！？]*|[。！？]+", text)
    else:
        parts = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9“"])', text)
    result = []
    for phrase in parts:
        phrase = phrase.strip()
        limit = 48 if lang == "ja" else 106
        while len(phrase) > limit:
            # Divide long sentences into balanced clauses so terms such as "mirror segment"
            # don't leave one word to be voiced and captioned on its own.
            target = len(phrase) / math.ceil(len(phrase) / limit)
            longest = min(limit, len(phrase) - limit // 4)
            positions = range(limit // 4, longest + 1)
            punctuation = [i for i in positions if phrase[i-1] in "、，,;:—"]
            words = [i for i in positions if phrase[i-1].isspace()]
            cut = min(punctuation or words or [round(target)], key=lambda i: abs(i - target))
            result.append(phrase[:cut].strip())
            phrase = phrase[cut:].strip()
        if phrase:
            result.append(phrase)
    return result


def _paste_fit(canvas, image, box):
    x, y, width, height = box
    area = image.copy()
    area.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas.paste(area, (x+(width-area.width)//2, y+(height-area.height)//2))


@lru_cache(maxsize=3)
def _image(name):
    with Image.open(ASSETS / (name+".jpg")) as im:
        return im.convert("RGB")


def _board(plan, scene, lang, used, labeled=False):
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)
    is_ja = lang == "ja"
    def label(x, y, text, size=20, ink=MUTED):
        d.text((x, y), text, font=_font(size, lang), fill=ink, anchor="lt")

    label(43, 25, "Plunode", 25, INK)
    d.line((43, 68, 1237, 68), fill="#BAC4BE", width=1)
    heading = scene[lang]["heading"]
    kind = scene["asset"]
    if kind in ("mosaic", "aligned", "comparison") and plan.get("themeId") != WEBB["themeId"]:
        raise ValueError("別テーマではWebbの画像を使用できません。資料または専用の図版を選んでください。")
    if kind == "comparison":
        _block(d, heading, lang, (42, 85, 1190, 80), family="title", size=43)
        for key, x in (("mosaic", 44), ("aligned", 656)):
            d.rectangle((x, 168, x+580, 535), fill="#080A0C")
            _paste_fit(canvas, _image("mosaic-labels" if key=="mosaic" else "aligned"), (x+5, 173, 570, 357))
            label(x, 551, WEBB[key]["date"] + "    " + WEBB[key]["credit"], 17)
            used.add(key)
    elif kind in ("mosaic", "aligned"):
        used.add(kind)
        label(45, 115, "観測画像" if is_ja else "Observation", 21, ACCENT)
        _block(d, heading, lang, (43, 177, 350, 251), family="title", size=56)
        d.line((46, 460, 135, 460), fill=ACCENT, width=3)
        label(46, 483, WEBB[kind]["date"] + (" 公表" if is_ja else "   Released"), 19)
        label(46, 529, WEBB[kind]["credit"], 19, INK)
        d.rectangle((422, 90, 1237, 562), fill="#07090B")
        _paste_fit(canvas, _image("mosaic-labels" if kind == "mosaic" and labeled else kind), (433, 97, 793, 458))
    elif kind == "source":
        by_id = {row["id"]: row for row in plan["sources"]}
        sources = [by_id[k] for k in scene["sourceIds"] if k in by_id]
        if not sources:
            raise ValueError("資料の場面に根拠がありません。")
        label(46, 120, "資料を読む" if is_ja else "Reading the source", 23, ACCENT)
        _block(d, heading, lang, (44, 177, 635, 350), family="title", size=65)
        d.line((733, 138, 733, 497), fill="#AABBB6", width=2)
        for i, source in enumerate(sources[:2]):
            top = 153 + i * 176
            label(775, top, urlsplit(source["url"]).hostname or "Plunode", 21)
            name = source["title"]
            # Primary-source titles keep their original spelling, including Japanese in English editions.
            face = "ja" if re.search(r"[ぁ-ヿ一-鿿]", name) else "en"
            _block(d, name, face, (774, top+43, 435, 112), size=28)
    else:
        raise ValueError("未対応の図版です。必要な写真や図を確認してください。")
    d.rectangle((0, 591, W, H), fill=INK)
    return canvas


def _credit(plan, lang, used, voice):
    im = Image.new("RGB", (W,H), INK)
    d = ImageDraw.Draw(im)
    title = "資料と制作" if lang == "ja" else "Sources and credits"
    _block(d, title, lang, (58, 48, 1150, 98), family="title", size=64, color=PAPER)
    d.line((60, 152, 1215, 152), fill="#587078", width=1)
    rows = []
    for key in ("mosaic", "aligned"):
        if key in used:
            rows.append((WEBB[key]["date"], WEBB[key]["credit"]))
    source_ids = {sid for s in plan["scenes"] for sid in s["sourceIds"]}
    sources = [s for s in plan["sources"] if s["id"] in source_ids]
    # For Webb, image captions carry attribution. The edition's metadata keeps all original URLs.
    rows.extend(((urlsplit(s["url"]).hostname or "Plunode"), s["title"]) for s in sources[:3])
    rows.append(("ナレーション" if lang == "ja" else "Narration", voice))
    step = min(95, 493//len(rows))
    for i, (name, val) in enumerate(rows):
        y = 183 + i*step
        _block(d, name, lang, (58,y,262,step-5), size=23, color="#F0A77E")
        face = "ja" if re.search(r"[ぁ-ヿ一-鿿]", val) else "en"
        _block(d, val, face, (342,y,862,step-6), size=30, color=PAPER)
    return im


def _stamp(frame):
    ms = round(frame*1000/FPS)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def render_edition(plan, lang, out_dir, progress=lambda message: None):
    """Write video.mp4, subtitles.srt, timings.json and media.json when an edition is complete."""
    if lang not in ("ja", "en") or not plan.get("scenes"):
        raise ValueError("場面を持つ日英の企画が必要です。")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    engine = _voicevox() if lang == "ja" else None
    voice = f"VOICEVOX:青山龍星（ノーマル） {engine[2]}" if engine else "Kokoro-82M v1.0 / af_heart"
    timing, subtitles, used = [], [], set()
    with tempfile.TemporaryDirectory(prefix="studio-edition-") as tmp:
        work = Path(tmp)
        slides, pcm, frame = [], [], 0
        seen_mosaic = False

        def add(board, frames, speech=None):
            nonlocal frame
            name = f"board{len(slides):03}.png"
            board.save(work / name, compress_level=2)
            slides.append((name, frames))
            count = frames * (RATE//FPS)
            if speech is None:
                pcm.append(np.zeros(count, dtype="<i2"))
            else:
                pcm.append(np.pad(speech, (0, count-len(speech))))
            frame += frames

        for index, scene in enumerate(plan["scenes"]):
            progress(f"{'日本語' if lang=='ja' else '英語'}の音声・図版 {index+1}/{len(plan['scenes'])}")
            start = frame
            board = _board(plan, scene, lang, used, seen_mosaic)
            seen_mosaic |= scene["asset"] == "mosaic"
            add(board, 16 if index == 0 else 5)
            phrases = _phrases(scene[lang]["narration"], lang)
            if not phrases:
                raise ValueError("読み上げる文がありません。")
            for text in phrases:
                speech = _speech(text, lang, voice, engine)
                count = math.ceil(len(speech)/(RATE//FPS))
                slide = board.copy()
                _block(ImageDraw.Draw(slide), text, lang, (38,608,1204,99), family="bold",
                       size=37, center=True, color=PAPER)
                subtitles.append(f"{len(subtitles)+1}\n{_stamp(frame)} --> {_stamp(frame+count)}\n{text}\n")
                add(slide, count, speech)
                add(board, 5)
            add(board, 16 if scene["asset"] == "comparison" else 9)
            timing.append({"id":scene["id"], "start":start/FPS, "end":frame/FPS})
        add(_credit(plan, lang, used, voice), 5*FPS)
        _save_wav(work / "mix.wav", np.concatenate(pcm))
        lines = ["ffconcat version 1.0"]
        for name, count in slides:
            lines.extend([f"file '{name}'", f"option framerate {FPS}", f"duration {count/FPS:.9f}"])
        lines.extend([f"file '{slides[-1][0]}'", f"option framerate {FPS}"])
        (work/"boards.ffconcat").write_text("\n".join(lines)+"\n", encoding="ascii")
        progress(f"{'日本語' if lang=='ja' else '英語'}の映像を書き出し中")
        subprocess.run(["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0",
                        "-i","boards.ffconcat","-i","mix.wav","-map","0:v","-map","1:a","-t",f"{frame/FPS:.9f}",
                        "-vf",f"fps={FPS},format=yuv420p","-c:v","libx264","-threads","3","-preset","veryfast",
                        "-crf","18","-c:a","aac","-ar","48000","-b:a","128k","-movflags","+faststart",
                        "-metadata","title="+plan["titles"][lang],"-metadata:s:a:0",
                        "language="+("jpn" if lang=="ja" else "eng"),"video.mp4"],cwd=work,check=True,timeout=900)
        (work/"subtitles.srt").write_text("\n".join(subtitles),encoding="utf-8",newline="\n")
        (work/"timings.json").write_text(json.dumps(timing,ensure_ascii=False,indent=2),encoding="utf-8")
        meta = {"voice":voice, "fps":FPS, "duration":frame/FPS, "themeId":plan.get("themeId"),
                "sources":plan["sources"], "images":{key:WEBB[key] for key in sorted(used)}}
        (work/"media.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
        for name in ("timings.json","subtitles.srt","media.json","video.mp4"):
            # Temp and application data may live on different volumes. Publish complete files atomically.
            with tempfile.NamedTemporaryFile(dir=out_dir, delete=False) as current:
                pending = Path(current.name)
                with (work/name).open("rb") as inp:
                    shutil.copyfileobj(inp, current)
            try:
                pending.replace(out_dir/name)
            finally:
                pending.unlink(missing_ok=True)
    return meta
