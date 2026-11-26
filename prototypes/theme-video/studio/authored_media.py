"""Edit original artwork, measured speech, silent action and foley onto one frame clock."""

import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageStat

import media
from authored_art import prepare_art
from channel_style import FOOT, H, INK, PAPER, SERIF, STYLE, W
from film_labels import prepare_lettering, visible_at
from media import FPS, RATE


SAMPLES = RATE // FPS
CREDIT_FRAMES = 5 * FPS
MAX_SOUND_SECONDS = 5
WAVES = ("sine", "triangle", "noise")
SOUND_LIMITS = {"at": (0, 1), "seconds": (.02, MAX_SOUND_SECONDS), "hzFrom": (30, 6000),
                "hzTo": (30, 6000), "attack": (.002, MAX_SOUND_SECONDS),
                "release": (.005, MAX_SOUND_SECONDS), "gain": (0, 1)}
SOUND_GUIDE = """音響では共通の効果音soundに加えて、soundLayersにこの題材用の音を重ねられます。
たとえば車輪が床の継ぎ目を二度またぐなら、継ぎ目を通る二つの時点に、短く下がる低音と細かな擦れを置けます。
waveはsine（丸い音）、triangle（やや硬い音）、noise（息・摩擦）。atはショット内の相対時刻。
secondsは長さ0.02〜5秒。hzFromからhzToへ音高（noiseでは粒の細かさ）が変化します（30〜6000 Hz）。
attackは立ち上がり（0.002秒以上）、releaseは減衰（0.005秒以上）。合計がseconds以内になるようにします。
gainは0〜1。小さい場面音は0.2〜0.5を目安に、語りと動きに合わせて選びます。同時に鳴る層やカットを跨ぐ余韻も作れます。
必要な音が無ければ空配列です。独自音は番組の作った効果音として扱います。"""


def sound_layers_schema():
    fields = {"wave": {"type": "string", "enum": list(WAVES)}}
    fields.update({key: {"type": "number"} for key in SOUND_LIMITS})
    return {"type": "array", "items": {"type": "object", "properties": fields,
            "required": list(fields), "additionalProperties": False}}


def validate_sound_layers(layers):
    if not isinstance(layers, list) or len(layers) > 20:
        raise ValueError("ショットの独自効果音は20層以内で指定してください。")
    normalized = []
    for index, layer in enumerate(layers, 1):
        if (not isinstance(layer, dict) or set(layer) != {"wave", *SOUND_LIMITS}
                or layer.get("wave") not in WAVES):
            raise ValueError(f"効果音{index}に波形、開始位置、秒数、周波数、立ち上がり・減衰、音量を指定してください。")
        tone = {"wave": layer["wave"]}
        for key, (minimum, maximum) in SOUND_LIMITS.items():
            value = layer[key]
            if type(value) not in (float, int) or not minimum <= value <= maximum:
                raise ValueError(f"効果音{index}の{key}は{minimum}〜{maximum}の数値で指定してください。")
            tone[key] = float(value)
        if tone["attack"] + tone["release"] > tone["seconds"] + 1e-9:
            raise ValueError(f"効果音{index}の立ち上がりと減衰の合計が長さを超えています。")
        normalized.append(tone)
    return normalized


def _tone(layer, seed):
    count = round(layer["seconds"] * RATE)
    t = np.arange(count) / RATE
    sweep = (layer["hzTo"] - layer["hzFrom"]) / layer["seconds"]
    cycles = layer["hzFrom"] * t + .5 * sweep * t**2
    if layer["wave"] == "noise":
        knots = np.random.default_rng(seed).uniform(-1, 1, math.ceil(cycles[-1]) + 2)
        waveform = np.interp(cycles, np.arange(len(knots)), knots)
    elif layer["wave"] == "triangle":
        waveform = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * cycles))
    else:
        waveform = np.sin(2 * np.pi * cycles)
    decay = (t[-1] - t) / layer["release"]
    envelope = np.minimum(1, np.minimum(t / layer["attack"], decay))
    return 5200 * layer["gain"] * waveform * envelope**2


def _foley_pcm(signal):
    # Leave headroom for speech even if a director stacks many simultaneous transients.
    return np.rint(6800 * np.tanh(signal / 6800.0)).astype("<i2")


def prepare_scene(scene, lang):
    """Return the same painted scene for the director's stills and the final edition."""
    style = media._style(lang)
    letters = prepare_lettering(scene, lang, style)
    fixed = letters.pop("", None)
    paint = prepare_art(scene["art"], letters)
    heading = scene[lang]["heading"].strip()

    def frame(position):
        position = max(0, min(1, position))
        board = paint(position)
        draw = ImageDraw.Draw(board)
        light_brand = ImageStat.Stat(board.crop((36, 8, 187, 56)).convert("L")).mean[0] < 132
        style.brand(draw, light=light_brand)
        if heading:
            light_heading = ImageStat.Stat(board.crop((80, 62, W - 80, 125)).convert("L")).mean[0] < 132
            style.text(draw, W // 2, 66, heading, 48, anchor="mt", family=SERIF, max_width=W - 150,
                       color=PAPER if light_heading else INK)
        if fixed:
            fixed(board, (0, 0), (0, 0, 1, 0, 1), position, 1)
        return board

    return frame


def _scene_audio(scene, lang, voice, engine):
    if not scene[lang]["narration"].strip():
        frames = round(scene["silentSeconds"] * FPS)
        if frames < 1:
            raise ValueError("無言の場面には絵を見せる秒数が必要です。")
        return np.zeros(frames * SAMPLES, dtype="<i2"), []
    spoken = media._utterances(scene[lang], lang)
    start = round(scene["leadSeconds"] * FPS)
    segments = []
    for index, (caption, reading) in enumerate(spoken):
        if index:
            start += 4  # A breath between phrases of the same narration.
        signal = media._speech(reading, lang, voice, engine)
        end = start + math.ceil(len(signal) / SAMPLES)
        segments.append((start, end, caption, signal))
        start = end
    frames = start + round(scene["tailSeconds"] * FPS)
    track = np.zeros(frames * SAMPLES, dtype="<i2")
    cues = []
    for begin, end, caption, signal in segments:
        track[begin * SAMPLES:begin * SAMPLES + len(signal)] = signal
        cues.append((begin, end, caption))
    return track, cues


def _cue_sound(track, cue, scene_samples):
    kind = cue["kind"]
    if kind == "none" or cue["gain"] == 0:
        return None
    lengths = {"paper": .22, "tap": .20, "chime": .72, "rustle": .51, "wind": 2.3, "whoosh": .61}
    begin = round(cue["at"] * scene_samples)
    count = min(round(lengths[kind] * RATE), len(track) - begin)
    if count < 3:
        return None
    t = np.arange(count) / RATE
    envelope = np.minimum(1, t / .012) * np.clip((count / RATE - t) / .045, 0, 1)
    if kind == "paper":
        source = np.zeros(count, dtype="<i2")
        media.mix_paper_swish(source, RATE)
        signal = source.astype(np.float64) * 2
    elif kind in ("tap", "chime"):
        hz = 164 if kind == "tap" else 698.46
        decay = 28 if kind == "tap" else 6
        signal = 3200 * np.exp(-decay * t) * (np.sin(2 * np.pi * hz * t) + .25 * np.sin(2 * np.pi * 2.01 * hz * t))
    else:
        hz = {"wind": 170, "rustle": 1800, "whoosh": 570}[kind]
        knots = np.random.default_rng(642).standard_normal(math.ceil(count * hz / RATE) + 2)
        noise = np.interp(t * hz, np.arange(len(knots)), knots)
        signal = 1250 * noise * np.sin(np.pi * np.arange(count) / count)**1.3
    mixed = track[begin:begin + count].astype(float) + cue["gain"] * signal * envelope
    track[begin:begin + count] = np.clip(np.rint(mixed), -32768, 32767)
    return begin / RATE


def _write_soundtrack(plan, lang, work, progress):
    scenes = plan["scenes"]
    if any(s[lang]["narration"].strip() for s in scenes):
        voice, engine = media._voice(lang)
    else:
        voice, engine = ("語りなし" if lang == "ja" else "No narration"), None
    cuts, subtitles, first_frame = [], [], 0
    # Carry the decay into the following shot, including a landing sound right on a cut.
    tail = np.zeros(MAX_SOUND_SECONDS * RATE)
    with wave.open(str(work / "mix.wav"), "wb") as wav:
        wav.setparams((1, 2, RATE, 0, "NONE", ""))
        for index, scene in enumerate(scenes):
            progress(f"音声と無言の間を編集　{index + 1}/{len(scenes)}")
            track, cues = _scene_audio(scene, lang, voice, engine)
            duration = len(track) // SAMPLES
            size = len(track)
            sound = np.zeros(size + len(tail))
            sound_start = _cue_sound(sound, scene["sound"], size)
            sound[:len(tail)] += tail
            layers = validate_sound_layers(scene.get("soundLayers", []))
            layer_times = []
            for number, layer in enumerate(layers):
                if not layer["gain"]:
                    continue
                offset = round(layer["at"] * size)
                effect = _tone(layer, 17 + index * 23 + number)
                sound[offset:offset + len(effect)] += effect
                layer_times.append(offset / RATE)
            track = np.clip(track.astype(np.int32) + _foley_pcm(sound[:size]), -32768, 32767).astype("<i2")
            onsets = layer_times + ([] if sound_start is None else [sound_start])
            if index == 0 and (not onsets or min(onsets) >= 1.53):
                media._mix_opening_notes(track, cues[0][0] if cues else duration)
            for begin, end, caption in cues:
                subtitles.append(f"{len(subtitles)+1}\n{media._stamp(first_frame+begin)} --> "
                                 f"{media._stamp(first_frame+end)}\n{caption}\n")
            cuts.append({"start": first_frame, "frames": duration, "cues": cues, "sound": sound_start,
                         "layerTimes": layer_times})
            wav.writeframes(track.tobytes())
            tail = sound[size:].copy()
            first_frame += duration
        wav.writeframes(_foley_pcm(np.pad(tail, (0, CREDIT_FRAMES * SAMPLES - len(tail)))).tobytes())
    (work / "subtitles.srt").write_text("\n".join(subtitles), encoding="utf-8", newline="\n")
    return voice, cuts


def _encode(work, plan, lang, voice, cuts, progress, *, frame_range=None):
    audio_window = []
    if frame_range is not None:
        begin, end = frame_range
        audio_window = ["-ss", f"{begin / FPS:.9f}", "-t", f"{(end - begin) / FPS:.9f}"]
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s:v", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
               *audio_window, "-i", "mix.wav", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-threads", "3",
               "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000",
               "-b:a", "128k", "-movflags", "+faststart", "-metadata", "title=" + plan["titles"][lang],
               "-metadata:s:a:0", "language=" + ("jpn" if lang == "ja" else "eng"), "video.mp4"]
    with (work / "encoder.log").open("w+b") as log:
        proc = subprocess.Popen(command, cwd=work, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            style = media._style(lang)
            for index, (scene, cut) in enumerate(zip(plan["scenes"], cuts)):
                first, stop = 0, cut["frames"]
                if frame_range is not None:
                    first = max(0, frame_range[0] - cut["start"])
                    stop = min(stop, frame_range[1] - cut["start"])
                    if first >= stop:
                        continue
                progress(f"原画から映像を書き出し中　{index + 1}/{len(cuts)}")
                paint = prepare_scene(scene, lang)
                static = all(len(layer["keys"]) < 2 for layer in scene["art"]["layers"])
                windows = [label["track"] for label in scene.get("labels", []) if "track" in label and
                           (label["track"].get("from", 0) > 0 or label["track"].get("until", 1) < 1)] if static else []
                first_position = first / max(1, cut["frames"] - 1)
                visible = [visible_at(track, first_position) for track in windows]
                still = paint(first_position) if static else None
                starts = {max(first, start): text for start, end, text in cut["cues"] if end > first}
                ends = {end for start, end, text in cut["cues"]}
                band = None
                static_pixels = None
                for local in range(first, stop):
                    position = local / max(1, cut["frames"] - 1)
                    if windows:
                        active = [visible_at(track, position) for track in windows]
                        if active != visible:
                            visible = active
                            still = paint(position)
                            static_pixels = None
                    if local and local % (FPS * 5) == 0:
                        progress(f"場面 {index + 1}/{len(cuts)} を描画中　{local // FPS}秒")
                    if local in ends:
                        band = None
                        static_pixels = None
                    if local in starts:
                        rail = Image.new("RGB", (W, H), INK)
                        style.subtitle(rail, style.caption_breaks(starts[local], wrap_japanese=True))
                        band = rail.crop((0, FOOT, W, H))
                        static_pixels = None
                    if static_pixels is None:
                        board = still if static else paint(position)
                        if band is not None:
                            board = board.copy()
                            board.paste(band, (0, FOOT))
                        pixels = board.tobytes()
                        if static:
                            static_pixels = pixels
                    else:
                        pixels = static_pixels
                    proc.stdin.write(pixels)
            if frame_range is None:
                credit = media._credit(plan, lang, set(), voice).tobytes()
                for _ in range(CREDIT_FRAMES):
                    proc.stdin.write(credit)
            proc.stdin.close()
            if proc.wait(timeout=180):
                raise BrokenPipeError()
        except BrokenPipeError as exc:
            log.seek(0)
            detail = log.read()[-1200:].decode(errors="replace")
            raise RuntimeError("原画からの書き出しに失敗しました。" + detail) from exc
        finally:
            if proc.poll() is None:
                proc.kill()
            try:
                proc.stdin.close()
            except BrokenPipeError:
                pass
            proc.wait()


def _capture(work, cuts):
    # Decode the delivered MP4. Sample the actual composited captions and selected moments of motion.
    moments = sorted({cut["start"] + round((cut["frames"] - 1) * fraction)
                      for cut in cuts for fraction in (.08, .52, .93)})
    if len(moments) > 12:
        moments = [moments[round(index * (len(moments) - 1) / 11)] for index in range(12)]
    pick = "+".join(f"eq(n\\,{moment})" for moment in moments)
    tile = f"select={pick},scale=320:180,tile=3x{math.ceil(len(moments) / 3)}:color=white"
    subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", "video.mp4",
                    "-vf", tile, "-frames:v", "1", "contact-sheet.png"], cwd=work, check=True, timeout=180)
    return moments


def render(plan, lang, out_dir, progress):
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".film-", dir=out_dir) as folder:
        work = Path(folder)
        voice, cuts = _write_soundtrack(plan, lang, work, progress)
        _encode(work, plan, lang, voice, cuts, progress)
        progress("完成映像から試写用の画を取り出しています")
        frames = _capture(work, cuts)
        timings = []
        for scene, cut in zip(plan["scenes"], cuts):
            start = cut["start"] / FPS
            timings.append({"id": scene["id"], "start": start, "end": (cut["start"] + cut["frames"]) / FPS,
                            "speech": [{"start": start + a / FPS, "end": start + b / FPS, "text": caption}
                                       for a, b, caption in cut["cues"]],
                            "soundAt": (None if cut["sound"] is None else start + cut["sound"]),
                            "soundLayerTimes": [start + at for at in cut["layerTimes"]]})
        duration = (cuts[-1]["start"] + cuts[-1]["frames"] + CREDIT_FRAMES) / FPS
        meta = {"productionMode": plan["productionMode"], "themeId": plan.get("themeId"), "voice": voice,
                "fps": FPS, "duration": duration, "visualStyle": STYLE, "sources": plan["sources"], "images": {},
                "contactSheetFrames": frames}
        for name, data in (("media.json", meta), ("timings.json", timings)):
            (work / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        progress("試写用の映像・字幕・制作記録を保存中")
        for name in ("subtitles.srt", "media.json", "timings.json", "contact-sheet.png", "video.mp4"):
            (work / name).replace(out_dir / name)
    return meta
