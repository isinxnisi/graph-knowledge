"""Commission one author and import that author's playable work into the studio ledger."""
from copy import deepcopy
import hashlib
import io
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

from PIL import Image

from author_files import copy_project, plain_path, read_text
from author_voice import voice_service
from editor import _save_json, _selected_model
from writer_feedback import request_digest


MODE = "codex-film-v1"
ROOT = Path(__file__).resolve().parent
STAMP = r"(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})"


def _seconds(parts):
    hour, minute, second, fraction = map(int, parts)
    return hour * 3600 + minute * 60 + second + fraction / 1000


def captions(text, duration, lang):
    timings, lines = [], []
    for number, block in enumerate(re.split(r"\n[ \t]*\n", text.replace("\r\n", "\n").strip()), 1):
        if not block.strip():
            continue
        parts = block.splitlines()
        if parts[0].strip().isdigit():
            parts.pop(0)
        stamp = re.fullmatch(STAMP + r"\s+-->\s+" + STAMP + r"(?:\s+.*)?", parts[0].strip()) if parts else None
        if not stamp or len(parts) < 2:
            raise ValueError(f"字幕{number}のSRT時刻または本文を確認してください。")
        begin, end = _seconds(stamp.groups()[:4]), _seconds(stamp.groups()[4:])
        if not 0 <= begin < min(end, duration) or end > duration + .15 or (timings and begin < timings[-1]["start"]):
            raise ValueError(f"字幕{number}の時刻が映像の再生範囲・字幕順と合いません。")
        sid = f"{lang}-cue-{number}"
        timings.append({"id": sid, "start": begin, "end": min(end, duration)})
        lines.append({"id": sid, lang: {"heading": "", "narration": "\n".join(parts[1:]).strip()}})
    return timings, lines


def movie_duration(movie):
    check = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file", "-f", "mov",
                            "-show_entries", "stream=codec_type,codec_name,width,height,duration:format=duration",
                            "-of", "json", str(movie)], capture_output=True, timeout=90,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if check.returncode:
        raise ValueError("納品されたvideo.mp4を開けません。")
    info = json.loads(check.stdout)
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    try:
        duration = float(video.get("duration", info["format"]["duration"]))
    except (TypeError, KeyError, ValueError) as exc:
        raise ValueError("映像の長さを確認できません。") from exc
    if (not math.isfinite(duration) or duration <= 0 or video.get("codec_name") != "h264"
            or not video.get("width") or not video.get("height")):
        raise ValueError("ブラウザで再生できるH.264のMP4を納品してください。")
    return duration


def _contact_sheet(movie, duration, target):
    frames = []
    for at in (0, duration * .48, max(0, duration * .90 - .15)):
        result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{at:.6f}",
                                 "-protocol_whitelist", "file", "-f", "mov", "-i", str(movie),
                                 "-map", "0:v:0", "-frames:v", "1", "-vf",
                                 "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2",
                                 "-c:v", "png", "-f", "image2pipe", "-"], capture_output=True, timeout=90,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode or not result.stdout:
            if not frames:
                raise ValueError("納品された映像から画面を再生できませんでした。")
            continue
        with Image.open(io.BytesIO(result.stdout)) as frame:
            frames.append(frame.convert("RGB"))
    sheet = Image.new("RGB", (320 * len(frames), 180))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (320 * i, 0))
    sheet.save(target)


def _sources(work, snapshot):
    file = work / "output" / "sources.json"
    if not file.exists():
        return []
    rows = json.loads(read_text(work, file, 1_000_000))
    if not isinstance(rows, list):
        raise ValueError("sources.jsonは使用した資料の配列で保存してください。")
    known = {s["id"]: s for s in snapshot["sources"]}
    result = {}
    for row in rows:
        if isinstance(row, str) and row in known:
            source = known[row]
        else:
            if isinstance(row, str):
                row = {"url": row}
            if not isinstance(row, dict):
                raise ValueError("出典にはテーマの資料IDまたは公開URLを記してください。")
            url = row.get("url", "")
            if not isinstance(url, str) or len(url) > 8192:
                raise ValueError("出典URLを確認してください。")
            parts = urlsplit(url)
            if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
                raise ValueError("出典には公開URLを記してください。")
            existing = next((s for s in known.values() if s.get("url") == url), None)
            source = existing or {"id": "author-" + hashlib.sha256(url.encode()).hexdigest()[:16],
                                  "url": url, "title": str(row.get("title") or url)[:500]}
        result[source["id"]] = source
    return list(result.values())


def _parent_material(work, parent_folder, parent_plan, lang, *, japanese_master=False):
    if not parent_folder or not parent_plan:
        return
    ref = work / "previous"
    own_project = work / "project"
    parent_folder = Path(parent_folder)
    # Prefer the edited language's source if present, fall back to the Japanese master.
    for origin in (["ja"] if japanese_master else dict.fromkeys((lang, "ja"))):
        movie = parent_folder / origin / "video.mp4"
        if movie.exists():
            ref.mkdir(exist_ok=True)
            if not (ref / f"{origin}.mp4").exists():
                shutil.copyfile(plain_path(parent_folder, movie), ref / f"{origin}.mp4")
            srt = movie.with_name("subtitles.srt")
            if srt.is_file() and not (ref / f"{origin}.srt").exists():
                shutil.copyfile(plain_path(parent_folder, srt), ref / f"{origin}.srt")
        project = parent_folder / "author" / origin / "project"
        if project.is_dir() and not own_project.exists():
            copy_project(parent_folder, project, own_project)
    ref.mkdir(exist_ok=True)
    _save_json(ref / "edition.json", {"titles": parent_plan.get("titles", {}),
               "drafts": parent_plan.get("authorDraft", {}), "sources": parent_plan.get("sources", []),
               "scenes": parent_plan.get("scenes", [])})


def produce(snapshot, brief, model_selection, run_folder, lang, *, draft, plan, parent_folder, parent_plan, progress):
    from author_brief import write_brief
    from author_source import source_service
    from direct_runtime import author_prompt, channel_context, run_author

    if lang not in ("ja", "en"):
        raise ValueError("納品する言語を確認してください。")
    folder = Path(run_folder)
    author = folder / "author"
    author.mkdir(exist_ok=True)
    plain_path(folder, author, directory=True)
    work = author / lang
    model, effort = _selected_model(model_selection, author=True)
    saved = work.parent / (lang + ("-draft.json" if draft else "-delivery.json"))
    approved = (plan or {}).get("authorDraft", {}).get(lang)
    key = request_digest([snapshot, brief, model, effort, draft, lang, approved, str(parent_folder or "")])
    mark = json.loads(saved.read_bytes()) if saved.exists() else {}
    local_plan = deepcopy(plan or (parent_plan if lang == "en" else None) or {})
    if not local_plan.get("productionMode") == MODE:
        local_plan = {"titles": {}, "scenes": [], "sources": []}
    local_plan.update(productionMode=MODE, themeId=snapshot["themeId"])
    fresh = not work.exists()
    if fresh:
        # Expose a complete commission at once. A stopped parent copy leaves the
        # previous edition intact and never masks a missing input on retry.
        with tempfile.TemporaryDirectory(dir=author, prefix=".starting-") as temporary:
            incoming = Path(temporary) / "work"
            write_brief(incoming, snapshot, brief, language=lang, previous_japanese=snapshot.get("previousJapanese"))
            _parent_material(incoming, parent_folder, parent_plan, lang, japanese_master=parent_folder == folder)
            (incoming / "project").mkdir(exist_ok=True)
            (incoming / "output").mkdir()
            shutil.copyfile(ROOT / "author_say.py", incoming / "say.py")
            shutil.copyfile(ROOT / "author_fetch.py", incoming / "fetch_reference.py")
            incoming.rename(work)
    plain_path(folder, work, directory=True)
    output = work / "output"
    if mark.get("key") != key or not mark.get("authorFinished"):
        if not fresh:
            # Preserve the film project; restore the studio's editorial inputs
            # independently of anything an earlier author edited or removed.
            write_brief(work, snapshot, brief, language=lang, previous_japanese=snapshot.get("previousJapanese"))
        # Both languages may have been drafted before a master movie existed.
        # Give the English author the delivered Japanese edit and its actual
        # source files as soon as that master becomes available.
        if (lang == "en" and parent_folder == folder and not draft and (folder / "ja/video.mp4").is_file()
                and not (work / "previous/ja.mp4").is_file() and not (work / "japanese-master").exists()):
            with tempfile.TemporaryDirectory(dir=author, prefix=".master-") as temporary:
                master = Path(temporary) / "edition"
                master.mkdir()
                _parent_material(master, folder, parent_plan, lang, japanese_master=True)
                master.rename(work / "japanese-master")
        if approved:
            with tempfile.NamedTemporaryFile(dir=work, delete=False) as f:
                f.write(approved.encode("utf-8"))
            Path(f.name).replace(work / "approved-draft.md")
        prompt = (f"「{snapshot['title']}」から、Plunodeの一本をお願いします。"
                  "今回の依頼はBRIEF.mdにあります。作り方はお任せします。\n\n"
                  "再編集できるソース・自分の素材はproject/に残してください。"
                  "previous/があれば元の版、japanese-master/があれば完成した日本語版と編集ソース、"
                  "approved-draft.mdがあれば運営者が確認した台本です。")
        if draft:
            prompt += "今回は台本確認まで。自由な書式でoutput/draft.mdと、この言語の題名output/title.txtをUTF-8で保存してください。"
        else:
            prompt += ("今回は完成映像まで。output/video.mp4（H.264、音声を含める場合はAAC）、output/subtitles.srt"
                       "（語りがなければ空で可）、output/title.txtを納品してください。"
                       "出典一覧を残すにはoutput/sources.jsonに使った資料IDまたは公開URLを配列で記せます。")
        if mark.get("key") == key and mark.get("problem"):
            prompt += "\n前回の納品で読み取れなかった点です。作業中のファイルを開いて仕上げてください。\n" + mark["problem"]
        progress("テーマと番組見本を渡し、" + ("台本を依頼中" if draft else "一本の映像を制作中"))
        phase = "draft" if draft else "film"
        _save_json(author / f"{lang}-{phase}-commission.json",
                   {"identity": channel_context(),
                    "brief": read_text(work, work / "BRIEF.md", 128_000), "prompt": author_prompt(prompt),
                    "request": json.loads(read_text(work, work / "inputs/request.json", 4_000_000)),
                    "model": model, "effort": effort})
        with voice_service(work), source_service(work):
            usage = run_author(work, prompt, model, effort, progress)
        mark = {"key": key, "authorFinished": True, "usage": usage}
        _save_json(saved, mark)
    try:
        plain_path(work, output, directory=True)
        title_file = output / "title.txt"
        title = read_text(work, title_file, 16384).strip() if title_file.exists() else ""
        title = title or local_plan.get("titles", {}).get(lang) or snapshot["title"]
        local_plan.setdefault("titles", {})[lang] = title
        local_plan.setdefault("scenes", [])
        local_plan.setdefault("sources", [])
        if draft:
            script = read_text(work, output / "draft.md", 1_000_000).strip()
            if not script:
                raise ValueError("output/draft.mdに確認用の台本を保存してください。")
            local_plan.setdefault("authorDraft", {})[lang] = script
        else:
            movie = plain_path(work, output / "video.mp4")
            duration = movie_duration(movie)
            text = read_text(work, output / "subtitles.srt", 8_000_000)
            timings, lines = captions(text, duration, lang)
            try:
                sources = _sources(work, snapshot)
            except (ValueError, UnicodeError):
                sources = []
                local_plan.setdefault("sourceNotes", {})[lang] = "作者の出典一覧を取り込めませんでした。原記録は制作フォルダにあります。"
            local_plan["scenes"] = [s for s in local_plan["scenes"] if lang not in s] + lines
            local_plan["sources"] = list({s["id"]: s for s in [*local_plan["sources"], *sources]}.values())
            edition = folder / lang
            edition.mkdir(exist_ok=True)
            progress("完成した映像・字幕を制作室へ取り込み中")
            with tempfile.TemporaryDirectory(dir=edition, prefix=".delivery-") as scratch:
                stage = Path(scratch)
                shutil.copyfile(movie, stage / "video.mp4")
                _contact_sheet(stage / "video.mp4", duration, stage / "contact-sheet.png")
                (stage / "subtitles.srt").write_text(text, encoding="utf-8", newline="\n")
                _save_json(stage / "timings.json", timings)
                for name in ("timings.json", "subtitles.srt", "contact-sheet.png", "video.mp4"):
                    (stage / name).replace(edition / name)
    except (ValueError, FileNotFoundError) as exc:
        issue = f"納品物 {exc.filename and Path(exc.filename).name or ''} がありません。" if isinstance(exc, FileNotFoundError) else str(exc)
        _save_json(saved, {**mark, "authorFinished": False, "problem": issue[:1000]})
        raise ValueError("制作途中のファイルを保存しました。" + issue + " 再開すると同じ作業場所で仕上げます。") from exc
    local_plan["model"] = {"requested": model, "effort": effort, "usage": mark.get("usage") or {}}
    return local_plan
