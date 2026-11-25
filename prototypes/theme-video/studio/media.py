"""Render a local edition from the selected plan, measured speech and cited boards."""

from functools import lru_cache
from itertools import groupby
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
from PIL import Image, ImageDraw

from setup_media import media_home
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from channel_style import BLUE, BOLD, ChannelFrame, FOOT, H, INK, PAPER, SANS, SERIF, STYLE, W
from speech_reading import apply_readings, protected_breaks, validate_readings


ASSETS = Path(__file__).resolve().parent / "assets"
WEBB = json.loads((ASSETS / "webb.json").read_text(encoding="utf-8"))
RATE, FPS = 24000, 24
ENGINE = "http://127.0.0.1:13769"
_engine_lock = threading.Lock()
_synthesis_locks = {"ja": threading.Lock(), "en": threading.Lock()}


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


def _save_wav(path_or_stream, pcm):
    target = str(path_or_stream) if isinstance(path_or_stream, Path) else path_or_stream
    with wave.open(target, "wb") as out:
        out.setparams((1, 2, RATE, 0, "NONE", ""))
        out.writeframes(np.asarray(pcm, dtype="<i2").tobytes())


def _speech(text, lang, voice, engine):
    if lang == "ja":
        spoken = re.sub(r"HD\s*84[,]?406", "エイチディー、はちまんよんせんよんひゃくろく", text, flags=re.I)
        spoken = re.sub(r"NIRCam", "ニアカム", spoken, flags=re.I)
    else:
        spoken = re.sub(r"HD\s*84[,]?406", "H D eighty-four four oh six", text, flags=re.I)
        spoken = re.sub(r"NIRCam", "near cam", spoken, flags=re.I)
    key = hashlib.sha256(json.dumps([3, voice, spoken], ensure_ascii=False).encode()).hexdigest()
    cache = media_home() / "speech-cache" / key[:2]
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / (key + ".wav")
    if target.is_file():
        return _read_pcm(target.read_bytes())
    # Preview and background rendering may request the same newly edited phrase simultaneously.
    with _synthesis_locks[lang]:
        if target.is_file():
            return _read_pcm(target.read_bytes())
        return _synthesize_phrase(spoken, lang, engine, target)


def _synthesize_phrase(spoken, lang, engine, target):
    if lang == "ja":
        base, speaker, _ = engine
        params = {"speaker": speaker}
        query = json.loads(_request(base, "/audio_query", {**params, "text": spoken}, b""))
        query.update(outputSamplingRate=RATE, outputStereo=False, speedScale=1.02,
                     prePhonemeLength=0.05, postPhonemeLength=0.08)
        data = _request(base, "/synthesis", params, json.dumps(query).encode())
        signal = _read_pcm(data).astype(np.float32) / 32768
    else:
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
    with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".wav", delete=False) as f:
        tmp = Path(f.name)
    try:
        _save_wav(tmp, pcm)
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)
    return pcm


@lru_cache(maxsize=2)
def _style(lang):
    root = Path(os.environ.get("PLUNODE_STUDIO_FONTS", Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"))
    return ChannelFrame(root, lang)


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


def _block(draw, text, lang, box, *, family=SANS, size=45, color=INK, center=False):
    x, y, width, height = box
    style = _style(lang)
    for actual in range(size, 13, -1):
        font = style.font(family, actual)
        lines = _lines(text, font, width)
        line_height = math.ceil(actual * 1.32)
        if len(lines) * line_height <= height and all(font.getlength(s) <= width+10 for s in lines):
            break
    top = y + (height - len(lines) * line_height) / 2 if center else y
    for i, line in enumerate(lines):
        draw.text((x + width/2 if center else x, top + i*line_height), line,
                  font=font, fill=color, anchor="mt" if center else "lt")


def _phrases(text, lang, readings=()):
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
            blocked = protected_breaks(phrase, readings)
            positions = [i for i in range(limit // 4, longest + 1) if i not in blocked]
            punctuation = [i for i in positions if phrase[i-1] in "、，,;:—"]
            words = [i for i in positions if phrase[i-1].isspace()]
            midpoint = round(target)
            candidates = punctuation or words or ([midpoint] if midpoint not in blocked else positions)
            if not candidates:
                candidates = [i for i in range(1, len(phrase)) if i not in blocked]
            if not candidates:
                break
            cut = min(candidates, key=lambda i: abs(i - target))
            result.append(phrase[:cut].strip())
            phrase = phrase[cut:].strip()
        if phrase:
            result.append(phrase)
    return result


def _utterances(line, lang):
    caption = line["narration"]
    readings = validate_readings(caption, line.get("readings")) if lang == "ja" else []
    return [(phrase, apply_readings(phrase, readings)) for phrase in _phrases(caption, lang, readings)]


def _voice(lang):
    if lang == "ja":
        engine = _voicevox()
        return f"VOICEVOX:青山龍星（ノーマル） {engine[2]}", engine
    return "Kokoro-82M v1.0 / af_heart", None


def preview_reading(narration, readings=None):
    """Return a WAV for the edited Japanese scene with the same measured phrases as its movie."""
    phrases = _utterances({"narration": narration, "readings": readings}, "ja")
    voice, engine = _voice("ja")
    pieces = []
    for _, spoken in phrases:
        speech = _speech(spoken, "ja", voice, engine)
        frame_size = RATE // FPS
        padded_length = math.ceil(len(speech) / frame_size) * frame_size
        pieces.append(np.pad(speech, (0, padded_length - len(speech))))
        pieces.append(np.zeros(5 * frame_size, dtype="<i2"))
    wav = io.BytesIO()
    _save_wav(wav, np.concatenate(pieces))
    return wav.getvalue()


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
    style = _style(lang)
    is_ja = lang == "ja"
    heading = scene[lang]["heading"]
    kind = scene["asset"]
    if kind in ("mosaic", "aligned", "comparison") and plan.get("themeId") != WEBB["themeId"]:
        raise ValueError("別テーマではWebbの画像を使用できません。資料または専用の図版を選んでください。")
    if kind == "comparison":
        style.brand(d)
        style.evidence_label(d, "二枚の観測画像" if is_ja else "Two observation images")
        style.text(d, W//2, 75, heading, 47, anchor="mt", family=SERIF, max_width=1144)
        labels = ({"mosaic": "最初のモザイク", "aligned": "鏡片の向きを変えた後"} if is_ja else
                  {"mosaic": "The first mosaic", "aligned": "After tilting the mirrors"})
        for key, x in (("mosaic", 44), ("aligned", 656)):
            style.text(d, x, 143, labels[key], 23, color=BLUE, family=BOLD)
            d.rectangle((x, 178, x+580, 519), fill="#080a0c")
            _paste_fit(canvas, _image("mosaic-labels" if key=="mosaic" else "aligned"), (x, 178, 580, 341))
            style.text(d, x, 526, WEBB[key]["date"] + "    " + WEBB[key]["credit"], 17, max_width=580)
            used.add(key)
    elif kind in ("mosaic", "aligned"):
        used.add(kind)
        canvas.paste(INK, (0, 0, W, FOOT))
        style.brand(d, light=True)
        style.evidence_label(d, "観測画像" if is_ja else "Observation image", light=True)
        style.text(d, 60, 132, WEBB[kind]["date"], 43, family=SERIF, color="#eda870")
        _block(d, heading, lang, (58, 230, 368, 221), family=SERIF, size=61, color=PAPER)
        style.text(d, 62, 490, "NASA 公表資料" if is_ja else "Released by NASA", 20, color="#cfdbdd", family=BOLD)
        d.rectangle((468, 64, W, 518), fill="#080a0c")
        _paste_fit(canvas, _image("mosaic-labels" if kind == "mosaic" and labeled else kind), (468, 64, W-468, 454))
        style.text(d, 1218, 531, WEBB[kind]["credit"], 17, anchor="rt", color=PAPER)
    elif kind == "source":
        by_id = {row["id"]: row for row in plan["sources"]}
        sources = [by_id[k] for k in scene["sourceIds"] if k in by_id]
        if not sources:
            raise ValueError("資料の場面に根拠がありません。")
        style.brand(d)
        style.evidence_label(d, "出典資料" if is_ja else "Source material")
        if heading:
            _block(d, heading, lang, (94, 64, 1092, 110), family=SERIF, size=32, center=True)
        single = len(sources) == 1
        columns = [(162, 956)] if single else [(70, 528), (682, 528)]
        top = 184 if heading else 128
        for source, (x, width) in zip(sources, columns):
            name = source["title"]
            # Primary-source titles keep their original spelling, including Japanese in English editions.
            face = "ja" if re.search(r"[ぁ-ヿ一-鿿]", name) else "en"
            size = 52 if single else 40
            line_width = _style(face).font(SERIF, size).getlength(name)
            if width < line_width <= width * 1.15:
                # Keep a nearly fitting title together instead of stranding its last word or kanji.
                size = int(size * width / line_width)
            _block(d, name, face, (x, top, width, 178), family=SERIF, size=size, center=True)
            style.text(d, x + width//2, top + 207, urlsplit(source["url"]).hostname or "Plunode", 23,
                       anchor="mt", family=BOLD, color=BLUE, max_width=width)
    else:
        raise ValueError("未対応の図版です。必要な写真や図を確認してください。")
    style.caption_rail(d)
    return canvas


def _credit(plan, lang, used, voice):
    im = Image.new("RGB", (W,H), INK)
    d = ImageDraw.Draw(im)
    title = "出典と制作" if lang == "ja" else "Sources and credits"
    _style(lang).credits_header(d, title)
    rows = []
    for key in ("mosaic", "aligned"):
        if key in used:
            rows.append((WEBB[key]["date"], WEBB[key]["credit"]))
    source_ids = {sid for s in plan["scenes"] for sid in s["sourceIds"]}
    sources = [s for s in plan["sources"] if s["id"] in source_ids]
    # For Webb, image captions carry attribution. The edition's metadata keeps all original URLs.
    rows.extend(((urlsplit(s["url"]).hostname or "Plunode"), s["title"]) for s in sources[:3])
    rows.append(("ナレーション" if lang == "ja" else "Narration", voice))
    step = min(107, 478//len(rows))
    for i, (name, val) in enumerate(rows):
        y = 211 + i*step
        _block(d, name, lang, (70,y+4,196,step-8), family=BOLD, size=20, color="#f0ab72")
        face = "ja" if re.search(r"[ぁ-ヿ一-鿿]", val) else "en"
        _block(d, val, face, (289,y,908,step-6), size=30, color=PAPER)
    return im


def _stamp(frame):
    ms = round(frame*1000/FPS)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def _scene_cues(scene, lang, voice, engine, first):
    shot = scene["asset"]
    lead = 26 if first else 5
    if shot in ("webb-identify", "webb-map", "webb-return", "webb-layout", "webb-focus"):
        lead = 20  # Let the viewer find the mark before explaining it.
    timing = (scene.get("visualTiming") or {}) if lang == "ja" else {}
    if timing.get("beforeVoice") is not None:
        lead = round(timing["beforeVoice"] * FPS)
    cues = [(lead, "", None)]
    for text, spoken in _utterances(scene[lang], lang):
        if text.startswith(("……", "…")):
            # A leading ellipsis is a look or a breath before the next line. TTS drops it.
            frames, _, _ = cues[-1]
            cues[-1] = (frames + FPS, "", None)
        speech = _speech(spoken, lang, voice, engine)
        cues.append((math.ceil(len(speech) / (RATE // FPS)), text, speech))
        cues.append((5, "", None))
    if len(cues) == 1:
        raise ValueError("読み上げる文がありません。")
    hold = 16 if shot == "comparison" else 9
    if shot.startswith("webb-"):
        hold = 26 if shot == "webb-return" else 18
    if scene[lang]["narration"].rstrip().endswith(("?", "？")):
        hold = round(1.6 * FPS)
    tail = cues[-1][0] + hold
    if timing.get("afterVoice") is not None:
        tail = round(timing["afterVoice"] * FPS)
    cues[-1] = (tail, "", None)
    return [cue for cue in cues if cue[0] > 0]


def _timed_scenes(scenes, lang, voice, engine, progress):
    """Keep the camera moving across adjacent narration scenes on the same board."""
    ordered = enumerate(scenes)
    for shot, group in groupby(ordered, key=lambda item: item[1]["asset"]):
        prepared = []
        for index, scene in group:
            progress(f"{'日本語' if lang == 'ja' else '英語'}の音声・図版 {index+1}/{len(scenes)}")
            cues = _scene_cues(scene, lang, voice, engine, index == 0)
            prepared.append((scene, cues, sum(frames for frames, _, _ in cues)))
        duration = sum(length for _, _, length in prepared)
        offset = 0
        for scene, cues, length in prepared:
            yield scene, cues, offset, duration
            offset += length


def render_edition(plan, lang, out_dir, progress=lambda message: None):
    """Write video.mp4, subtitles.srt, timings.json and media.json when an edition is complete."""
    if lang not in ("ja", "en") or not plan.get("scenes"):
        raise ValueError("場面を持つ日英の企画が必要です。")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    voice, engine = _voice(lang)
    timing, subtitles, used = [], [], set()
    with tempfile.TemporaryDirectory(prefix="studio-edition-") as tmp:
        work = Path(tmp)
        slides, pcm, frame = [], [], 0
        seen_mosaic = False
        motion_boards = None
        style = _style(lang)

        def save_board(board, frames):
            name = f"board{len(slides):03}.png"
            board.save(work / name, compress_level=2)
            slides.append((name, frames))

        for scene, cues, shot_offset, duration in _timed_scenes(plan["scenes"], lang, voice, engine, progress):
            start = frame
            shot = scene["asset"]
            animated = shot.startswith("webb-")
            if animated:
                if shot_offset == 0:
                    voice_starts_at = None
                    if (lang == "ja" and (scene.get("visualTiming") or {}).get("beforeVoice")
                            and cues[0][2] is None):
                        voice_starts_at = cues[0][0] / max(1, duration - 1)
                if plan.get("themeId") != WEBB["themeId"]:
                    raise ValueError("ウェッブの演出素材は対応するテーマで使用してください。")
                if motion_boards is None:
                    from webb.boards import Boards
                    motion_boards = Boards(lang=lang, identifying_segments=any(
                        s["asset"] == "webb-tilt" for s in plan["scenes"]))
                if shot not in ("webb-mirror", "webb-tilt", "webb-focus"):
                    used.add("aligned" if shot in ("webb-array", "webb-layout", "webb-map") else "mosaic")
            else:
                board = _board(plan, scene, lang, used, seen_mosaic)
                seen_mosaic |= shot == "mosaic"
            for frames, text, speech in cues:
                samples = frames * (RATE // FPS)
                pcm.append(np.zeros(samples, dtype="<i2") if speech is None else
                           np.pad(speech, (0, samples - len(speech))))
                caption_band = None
                if text:
                    subtitles.append(f"{len(subtitles)+1}\n{_stamp(frame)} --> {_stamp(frame+frames)}\n{text}\n")
                    caption = Image.new("RGB", (W, H), INK)
                    style.subtitle(caption, style.caption_breaks(text, wrap_japanese=True))
                    caption_band = caption.crop((0, FOOT, W, H))
                # The original array photograph stays still, including during long authored holds.
                # Other Webb boards animate at twelve poses per second on the 24 fps voice clock.
                step = 2 if animated and shot != "webb-array" else frames
                for offset in range(0, frames, step):
                    if animated:
                        position = (shot_offset + frame - start + offset) / max(1, duration - 1)
                        board = motion_boards.frame(shot.removeprefix("webb-"), position,
                                                    voice_starts_at=voice_starts_at)
                    slide = board
                    if caption_band is not None:
                        slide = board.copy()
                        slide.paste(caption_band, (0, FOOT))
                    save_board(slide, min(step, frames - offset))
                frame += frames
            timing.append({"id":scene["id"], "start":start/FPS, "end":frame/FPS})
        save_board(_credit(plan, lang, used, voice), 7 * FPS)
        pcm.append(np.zeros(7 * RATE, dtype="<i2"))
        frame += 7 * FPS
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
        meta = {"voice":voice, "fps":FPS, "duration":frame/FPS, "themeId":plan.get("themeId"), "visualStyle":STYLE,
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
