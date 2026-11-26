"""Run inside an author workspace: python3 say.py ja 'spoken reading'."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import uuid
import wave


def speech_id(lang, reading):
    return hashlib.sha256(json.dumps([lang, reading], ensure_ascii=False).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="合成したWAVのパスと実測秒数を表示します。")
    parser.add_argument("lang", choices=["ja", "en"])
    parser.add_argument("reading", help="発音させたい一文。日本語は必要な箇所をかなで渡せます。")
    args = parser.parse_args()
    if not 0 < len(args.reading.strip()) <= 4000:
        parser.error("発音する文を1〜4000文字で入力してください。")
    work = Path(__file__).resolve().parent
    key = speech_id(args.lang, args.reading)
    name = ".speech-" + key
    result = work / (name + ".wav")
    if not result.exists():
        (work / (name + ".error")).unlink(missing_ok=True)
        pending = work / (name + "-" + uuid.uuid4().hex + ".tmp")
        pending.write_text(json.dumps({"lang": args.lang, "reading": args.reading}, ensure_ascii=False), encoding="utf-8")
        pending.replace(work / (name + ".json"))
    end = time.monotonic() + 240
    while not result.is_file():
        error = work / (name + ".error")
        if error.is_file():
            parser.exit(1, error.read_text(encoding="utf-8") + "\n")
        if time.monotonic() > end:
            parser.exit(1, "制作室から音声を受け取れませんでした。\n")
        time.sleep(.2)
    with wave.open(str(result), "rb") as audio:
        credit = "VOICEVOX:青山龍星" if args.lang == "ja" else "Kokoro-82M / af_heart"
        print(json.dumps({"wav": result.name, "seconds": audio.getnframes() / audio.getframerate(),
                          "credit": credit}))


if __name__ == "__main__":
    main()
