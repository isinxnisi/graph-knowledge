"""Deliver bounded public media to an isolated author without sharing a host session."""
from contextlib import contextmanager
import json
from pathlib import Path
import re
import subprocess
import sys
import threading

from author_brief import _store
from author_fetch import source_id
from author_files import read_text
from source_transport import MAX_FILE, MEDIA, MIB, source_url


MAX_REQUESTS = 24
TOTAL_BYTES = 64 * MIB
SLOTS = threading.BoundedSemaphore(2)


def download(url, capacity):
    # A separate, isolated stdlib interpreter puts a wall-clock deadline on DNS,
    # TCP/TLS, redirects and the whole response, even if the server trickles bytes.
    worker = Path(__file__).resolve().with_name("source_transport.py")
    try:
        result = subprocess.run([sys.executable, "-I", "-B", str(worker)],
                                input=json.dumps({"url": url, "capacity": capacity}).encode(), capture_output=True,
                                cwd=worker.parent, timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as exc:
        raise ValueError("掲載元が制限時間内に応答しませんでした。") from exc
    if result.returncode:
        raise ValueError(result.stderr.decode("utf-8", errors="replace")[:250] or "公開資料を取得できませんでした。")
    header, separator, data = result.stdout.partition(b"\n")
    meta = json.loads(header)
    if (not separator or meta["mime"] not in MEDIA or meta["extension"] != MEDIA[meta["mime"]][0]
            or len(data) > capacity):
        raise ValueError("取得した資料の形式かサイズを確認できません。")
    return meta, data


@contextmanager
def source_service(workspace):
    stop = threading.Event()

    def serve():
        size = attempts = 0
        while not stop.wait(.18):
            for pending in workspace.glob(".source-*.request"):
                if stop.is_set():
                    return
                match = re.fullmatch(r"\.source-([0-9a-f]{64})\.request", pending.name)
                if not match:
                    continue
                try:
                    request = json.loads(read_text(workspace, pending, 24000))
                    if not isinstance(request, dict) or set(request) != {"url"}:
                        raise ValueError("資料の公開URLだけを指定してください。")
                    raw = request["url"]
                    url = source_url(raw)
                    if source_id(raw) != match[1]:
                        raise ValueError("資料の依頼を照合できません。")
                    if attempts >= MAX_REQUESTS or size >= TOTAL_BYTES:
                        raise ValueError("この制作で一度に取得できる資料の上限に達しました。")
                    attempts += 1
                    if not SLOTS.acquire(timeout=2):
                        raise ValueError("別の資料を取得中です。少し待ってから再度お試しください。")
                    try:
                        meta, data = download(url, min(MAX_FILE, TOTAL_BYTES - size))
                    finally:
                        SLOTS.release()
                    name = "source-" + match[1] + "." + meta["extension"]
                    _store(workspace / name, data)
                    size += len(data)
                    reply = {"file": name, "requestedUrl": raw, "url": meta["url"], "mime": meta["mime"],
                             "bytes": len(data)}
                except (KeyError, TypeError, ValueError, OSError) as exc:
                    reply = {"error": "資料を取得できませんでした。" + str(exc)[:250]}
                try:
                    pending.unlink(missing_ok=True)
                    _store(pending.with_suffix(".result"), json.dumps(reply, ensure_ascii=False).encode())
                except OSError:
                    if stop.is_set() or not workspace.is_dir():
                        return

    worker = threading.Thread(target=serve, daemon=True)
    worker.start()
    try:
        yield
    finally:
        stop.set()
        worker.join()
