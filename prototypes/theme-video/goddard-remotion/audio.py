"""Render the Goddard pilot's local Japanese narration, foley, and timed captions."""
import argparse
import io
import json
from pathlib import Path
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import wave

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from channel_sound import opening_notes

RATE = 48_000
DURATION = 71
SPEAKER = 13


def post(engine, route, params, body):
    req = Request(
        f"{engine}/{route}?{urlencode(params)}",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(req, timeout=80) as response:
        return response.read()


def speak(engine, line):
    query = json.loads(post(engine, "audio_query", {"speaker": SPEAKER, "text": line["reading"]}, b""))
    query.update(
        outputSamplingRate=RATE, outputStereo=False, speedScale=line["speed"],
        prePhonemeLength=0.04, postPhonemeLength=0.06, intonationScale=1.02,
    )
    data = post(engine, "synthesis", {"speaker": SPEAKER}, json.dumps(query).encode())
    with wave.open(io.BytesIO(data), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
            raise ValueError("Unexpected VOICEVOX WAV format")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768
    active = np.flatnonzero(np.abs(samples) > 0.003)
    if not len(active):
        raise ValueError(f"No audible synthesis for {line['text']}")
    trimmed = samples[max(0, active[0] - 480):active[-1] + 1 + 1920].copy()
    trimmed[:240] *= np.linspace(0, 1, 240)
    trimmed[-480:] *= np.linspace(1, 0, 480)
    gain = min(0.72 / np.abs(trimmed).max(), 0.126 / np.sqrt(np.mean(trimmed**2)))
    return trimmed * gain


def seconds(length):
    return np.arange(round(length * RATE)) / RATE


def envelope(t, duration, attack, release):
    return np.minimum(t / attack, 1) * np.clip((duration - t) / release, 0, 1)


def noise(rng, t, hz):
    # A fixed seed makes the foley rebuildable. Interpolation from a low sample
    # rate gives the sound a soft, bandwidth-limited texture.
    points = rng.standard_normal(int(t[-1] * hz) + 2)
    return np.interp(t * hz, np.arange(len(points)), points)


def effects(place):
    rng = np.random.default_rng(1926)
    for offset, note in opening_notes(RATE):
        place(offset / RATE, 0.78 * note)

    t = seconds(41.4)
    wind = 0.0028 * (0.62 + 0.38 * np.sin(t * 0.76)**2) * noise(rng, t, 175)
    place(0, wind * envelope(t, 41.4, 0.75, 1.5))

    t = seconds(6.4)
    ignition = 0.027 * noise(rng, t, 410) * np.exp(-t * 5)
    idle = 0.010 * noise(rng, t, 125) * envelope(t, 6.4, 0.30, 0.35)
    place(24.8, ignition * np.minimum(t / 0.035, 1) + idle)

    t = seconds(2.5)
    engine = 0.016 * noise(rng, t, 145) + 0.009 * np.sin(2 * np.pi * (94 * t - 13 * t**2))
    place(31.2, engine * (1 - t / 3) * envelope(t, 2.5, 0.12, 0.22))

    t = seconds(0.44)
    thump = 0.061 * np.sin(2 * np.pi * (88 * t - 38 * t**2)) + 0.033 * noise(rng, t, 530)
    place(33.7, thump * np.minimum(t / 0.017, 1) * np.exp(-t * 16))

    t = seconds(0.56)
    paper = 0.038 * (noise(rng, t, 1620) - 0.6 * noise(rng, t, 345))
    place(42.2, paper * envelope(t, 0.56, 0.12, 0.32))


def srt_time(sec):
    minutes, rem = divmod(round(sec * 1000), 60_000)
    hours, minutes = divmod(minutes, 60)
    whole, millis = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{whole:02},{millis:03}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, help="Project directory with a public media folder")
    parser.add_argument("--engine", default="http://127.0.0.1:13769")
    args = parser.parse_args()
    public = args.output / "public"
    public.mkdir(parents=True, exist_ok=True)
    mix = np.zeros(DURATION * RATE, dtype=np.float32)

    def place(start, samples):
        offset = round(start * RATE)
        mix[offset:offset + len(samples)] += samples

    script = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    captions = []
    for index, line in enumerate(script):
        start = line["start"]
        voice = speak(args.engine.rstrip("/"), line)
        voice_end = start + len(voice) / RATE
        next_starts = script[index + 1]["start"] if index + 1 < len(script) else DURATION
        if voice_end > next_starts - 0.10:
            raise ValueError(f"Speech at {start:.2f}s runs into the next cue: {voice_end:.2f}s")
        place(start, voice)
        end = min(voice_end + 0.22, next_starts - 0.06)
        captions.append({"start": start, "end": round(end, 3), "text": line["text"]})
        print(f"{start:05.2f} - {voice_end:05.2f}  {line['text']}", flush=True)

    effects(place)
    if np.max(np.abs(mix)) >= 1:
        raise ValueError("Mix clips")
    with wave.open(str(public / "sound.wav"), "wb") as wav:
        wav.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        wav.writeframes(np.round(mix * 32767).astype("<i2").tobytes())
    (public / "captions.json").write_text(
        json.dumps(captions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    subtitles = [
        f"{index}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n{cue['text']}"
        for index, cue in enumerate(captions, 1)
    ]
    (args.output / "goddard.ja.srt").write_text("\n\n".join(subtitles) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
