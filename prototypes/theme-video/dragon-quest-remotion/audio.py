"""Build the Japanese voice, original Foley, and frame-aligned captions."""

import argparse
import json
from pathlib import Path
import subprocess
import sys

import numpy as np


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "goddard-remotion"))
from audio import RATE, envelope, noise, seconds, speak, srt_time
from channel_sound import opening_notes


def effect(kind, rng):
    lengths = {"knock": .23, "step": .20, "paper": .17, "miss": .28,
               "key": .56, "latch": .46, "open": 2.60}
    length = lengths[kind]
    t = seconds(length)
    air = noise(rng, t, 1150) - .45 * noise(rng, t, 365)
    if kind in {"knock", "step", "miss"}:
        levels = {"knock": (.037, 148, .027), "step": (.028, 196, .016), "miss": (.033, 230, .017)}
        bass, hz, grain = levels[kind]
        signal = bass * np.sin(2 * np.pi * (hz * t - 112 * t**2)) + grain * air
        return signal * envelope(t, length, .011, .10) * np.exp(-t * 22)
    if kind == "key":
        tinkle = .021 * np.sin(2 * np.pi * 891 * t) + .008 * np.sin(2 * np.pi * 1337 * t)
        return (tinkle + .013 * air) * envelope(t, length, .015, .27) * np.exp(-t * 7)
    if kind == "paper":
        return .020 * air * envelope(t, length, .025, .125)
    if kind == "latch":
        tick = np.sin(2 * np.pi * 316 * t) * np.exp(-t * 26)
        second = np.where(t >= .14, np.sin(2 * np.pi * 478 * (t - .14)) * np.exp(-(t - .14) * 30), 0)
        return (.057 * tick + .040 * second + .013 * air) * envelope(t, length, .017, .30)
    low = noise(rng, t, 62) + .27 * noise(rng, t, 205)
    return (.009 * low + .0032 * air) * envelope(t, length, .64, 1.12)


def cue_text(subtitles):
    return "\n\n".join(f"{i}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}"
                       for i, c in enumerate(subtitles, 1)) + "\n"


def build(script, engine):
    fps = script["fps"]
    scenes = script["scenes"]
    duration_frames = round(scenes[-1]["end"] * fps)
    duration = duration_frames / fps
    mix = np.zeros(round(duration * RATE), np.float32)
    rng = np.random.default_rng(19860527)
    timings, subtitles = [], []

    def place(at, samples):
        offset = round(at * RATE)
        end = min(len(mix), offset + len(samples))
        mix[offset:end] += samples[:end - offset]

    for offset, note in opening_notes(RATE):
        place(offset / RATE, note)
    # Very quiet filtered room tone prevents dead air between breaths.
    t = seconds(duration)
    place(0., .0014 * noise(rng, t, 143) * envelope(t, duration, .55, 1.8))
    for index, scene in enumerate(scenes):
        start = scene["start"]
        end = scenes[index + 1]["start"] if index + 1 < len(scenes) else duration
        cues = []
        lines = scene.get("lines", [])
        for i, line in enumerate(lines):
            at = start + line["at"]
            next_at = start + lines[i + 1]["at"] if i + 1 < len(lines) else end
            samples = speak(engine, line)
            spoken_end = at + len(samples) / RATE
            if spoken_end > next_at - .09:
                raise ValueError(f"{scene['id']}: {line['text']} runs to {spoken_end:.2f}s; next cue {next_at:.2f}s")
            place(at, samples)
            cue = {"start": round(at, 3), "end": round(min(spoken_end + .22, next_at - .08), 3),
                   "text": line["text"]}
            cues.append(cue)
            subtitles.append(cue)
            print(f"{scene['id']:7} {at:5.2f}–{spoken_end:5.2f} {line['text'].replace(chr(10), ' ')}", flush=True)
        for foley in scene.get("sounds", []):
            place(start + foley["at"], effect(foley["kind"], rng) * foley.get("gain", 1))
        timings.append({"id": scene["id"], "start": start, "end": end, "cues": cues})

    if np.abs(mix).max() >= 1:
        raise ValueError("Audio mix clips")
    public = HERE / "public"
    public.mkdir(exist_ok=True)
    audio = public / "sound.mp3"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "s16le",
                    "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", "-c:a", "libmp3lame",
                    "-b:a", "160k", str(audio)], input=np.round(mix * 32767).astype("<i2").tobytes(), check=True)
    timing = {"fps": fps, "durationFrames": duration_frames, "scenes": timings}
    (public / "timing.json").write_text(json.dumps(timing, ensure_ascii=False, indent=2) + "\n",
                                        encoding="utf-8", newline="\n")
    (HERE / "dragon-quest.ja.srt").write_text(cue_text(subtitles), encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="http://127.0.0.1:13769")
    args = parser.parse_args()
    script = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    build(script, args.engine.rstrip("/"))


if __name__ == "__main__":
    main()
