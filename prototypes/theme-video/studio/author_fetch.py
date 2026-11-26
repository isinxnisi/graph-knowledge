"""Retrieve a public visual reference into the current author workspace."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import uuid


def source_id(url):
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="公開画像・PDF・短い映像を調査用に取得。HTMLなら画像や映像へのリンク一覧。")
    parser.add_argument("url")
    args = parser.parse_args()
    if not 0 < len(args.url) <= 8192:
        parser.error("公開資料のHTTPS URLを指定してください。")
    work = Path(__file__).resolve().parent
    base = ".source-" + source_id(args.url)
    result = work / (base + ".result")
    if result.is_file():
        item = json.loads(result.read_bytes())
        if "file" in item and (work / item["file"]).is_file():
            print(json.dumps(item, ensure_ascii=False))
            return
        result.unlink()
    pending = work / (base + "-" + uuid.uuid4().hex + ".tmp")
    pending.write_text(json.dumps({"url": args.url}), encoding="utf-8")
    pending.replace(work / (base + ".request"))
    until = time.monotonic() + 150
    while not result.is_file():
        if time.monotonic() >= until:
            parser.exit(1, "制作室から調査用の資料を受け取れませんでした。\n")
        time.sleep(.2)
    data = json.loads(result.read_bytes())
    if "error" in data:
        parser.exit(1, data["error"] + "\n")
    print(json.dumps(data, ensure_ascii=False))


if __name__ == "__main__":
    main()
