"""Offer the studio's local voices to a running author without exposing the host service."""
from contextlib import contextmanager
import json
from pathlib import Path
import re
import tempfile
import threading

from author_files import read_text
from author_say import speech_id
import media


@contextmanager
def voice_service(workspace):
    stop = threading.Event()
    voices = {}

    def serve():
        while not stop.wait(.18):
            for pending in workspace.glob(".speech-*.json"):
                if stop.is_set():
                    return
                match = re.fullmatch(r"\.speech-([0-9a-f]{64})\.json", pending.name)
                if not match:
                    continue
                try:
                    data = json.loads(read_text(workspace, pending, 32000))
                    lang, reading = data["lang"], data["reading"]
                    if (lang not in ("ja", "en") or not isinstance(reading, str) or not 0 < len(reading) <= 4000
                            or speech_id(lang, reading) != match[1]):
                        raise ValueError("音声依頼の内容を確認してください。")
                    if lang not in voices:
                        voices[lang] = media._voice(lang)
                    pcm = media._speech(reading, lang, *voices[lang])
                    with tempfile.NamedTemporaryFile(dir=workspace, delete=False) as scratch:
                        temp = Path(scratch.name)
                        media._save_wav(scratch, pcm)
                    temp.replace(pending.with_suffix(".wav"))
                except (KeyError, TypeError, ValueError, RuntimeError, OSError) as exc:
                    # The argument is text only. No command, host URL or caller-supplied output path is run.
                    with tempfile.NamedTemporaryFile(dir=workspace, delete=False) as scratch:
                        scratch.write(("音声を準備できませんでした。" + str(exc)[:200]).encode())
                        temp = Path(scratch.name)
                    temp.replace(pending.with_suffix(".error"))
                pending.unlink(missing_ok=True)

    worker = threading.Thread(target=serve, daemon=True)
    worker.start()
    try:
        yield
    finally:
        stop.set()
        worker.join()
