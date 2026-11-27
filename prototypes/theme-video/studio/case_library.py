"""Local case ratings, reversible trash and resumable deletion of case-owned media."""
import io
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile

from PIL import Image, UnidentifiedImageError

from author_files import plain_path


def migrate(db):
    columns = {r["name"] for r in db.execute("PRAGMA table_info(cases)")}
    if "rating" not in columns:
        db.execute("ALTER TABLE cases ADD COLUMN rating INTEGER CHECK (rating BETWEEN 1 AND 5)")
    if "trashed_at" not in columns:
        db.execute("ALTER TABLE cases ADD COLUMN trashed_at TEXT")
    if "purge_state" not in columns:
        db.execute("ALTER TABLE cases ADD COLUMN purge_state TEXT CHECK (purge_state IN ('purging','purged'))")


def state(db, case_id):
    row = db.execute("""SELECT id,rating,trashed_at AS trashedAt,purge_state AS purgeState
                        FROM cases WHERE id=?""", (case_id,)).fetchone()
    if not row:
        raise KeyError(case_id)
    return dict(row)


def require_active(db, case_id):
    item = state(db, case_id)
    if item["purgeState"] == "purged":
        raise KeyError(case_id)
    if item["purgeState"] == "purging":
        raise ValueError("完全削除が進行中です。ゴミ箱で削除の完了を確認してください。")
    if item["trashedAt"]:
        raise ValueError("ゴミ箱の案件では制作・投稿を開始できません。復元してから操作してください。")


def blockers(db, case_id, *, permanent):
    reasons = []
    run = db.execute("""SELECT r.status,(SELECT count(*) FROM runs p WHERE p.case_id=r.case_id
                            AND (p.created,p.rowid)<=(r.created,r.rowid)) number
                        FROM runs r WHERE r.case_id=? AND r.status IN ('queued','running')
                        ORDER BY r.created,r.rowid LIMIT 1""", (case_id,)).fetchone()
    if run:
        state_label = "生成中" if run["status"] == "running" else "待機中"
        reasons.append(f"制作の試行{run['number']}が{state_label}です。完了を待つか、試行を中断してください。")
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publication_captions'").fetchone():
        pending = db.execute("""SELECT lang FROM publication_captions WHERE case_id=?
                                AND status IN ('queued','running') LIMIT 1""", (case_id,)).fetchone()
        if pending:
            lang = "日本語" if pending["lang"] == "ja" else "英語"
            reasons.append(f"{lang}の投稿用字幕入り動画を書き出し中です。投稿画面で完了を確認してください。")
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='youtube_jobs'").fetchone():
        jobs = db.execute("SELECT status,video_id,action_kind FROM youtube_jobs WHERE case_id=?", (case_id,)).fetchall()
        if any(j["status"] not in ("ready", "rejected", "failed", "missing") or j["action_kind"] for j in jobs):
            reasons.append("YouTubeへの送信・結果の照合または設定変更が進行中です。投稿画面で確認してください。")
        if permanent and any(j["video_id"] for j in jobs):
            placements = []
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='video_placements'").fetchone():
                placements = db.execute("""SELECT DISTINCT p.environment,p.theme_id,p.revision FROM video_placements p
                                          JOIN youtube_jobs j ON j.video_id=p.video_id WHERE j.case_id=?""",
                                        (case_id,)).fetchall()
            for p in placements:
                env = {"beta": "β", "production": "正式"}.get(p["environment"], p["environment"])
                reasons.append(f"{env}サイトのテーマ「{p['theme_id']}」第{p['revision']}版に掲載記録があります。掲載管理で確認してください。")
            if not placements and any(j["video_id"] and j["status"] != "missing" for j in jobs):
                # A locally cached listing is positive evidence only. Absence
                # cannot attest to all theme revisions on both remote sites.
                reasons.append("YouTube動画との紐付けがあります。全掲載先で参照がないことを確認できるまで、案件はゴミ箱に保持します。")
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publication_captions'").fetchone():
        if db.execute("SELECT 1 FROM publication_captions WHERE case_id=? AND status IN ('queued','running')", (case_id,)).fetchone():
            reasons.append("投稿用字幕を描画中です。書き出しの完了を確認してください。")
    if permanent:
        children = db.execute("""SELECT coalesce((SELECT json_extract(r.plan,'$.titles.' ||
                                      json_extract(c.snapshot,'$.shortSource.language')) FROM runs r WHERE r.case_id=c.id
                                      AND r.plan IS NOT NULL ORDER BY r.created,r.rowid LIMIT 1),
                                      json_extract(c.snapshot,'$.shortSource.title'),c.title) title
                                 FROM cases c WHERE json_extract(c.snapshot,'$.shortSource.caseId')=?
                                 AND coalesce(c.purge_state,'') <> 'purged' ORDER BY c.rowid""", (case_id,))
        for child in children:
            reasons.append(f"ショート「{child['title']}」が元映像を参照しています。先にショートを確認してください。")
    return reasons


def case_directory(root, case_id):
    if not re.fullmatch("[0-9a-f]{32}", case_id):
        raise KeyError(case_id)
    base = Path(root) / "cases"
    target = base / case_id
    # Check every existing component even when a reparse point points nowhere.
    for candidate in (base, target):
        if os.path.lexists(candidate):
            plain_path(root, candidate, directory=True)
    if target.resolve() != root / "cases" / case_id:
        raise ValueError("案件の保存先が制作室のデータ領域と一致しません。")
    return target


def folder_bytes(folder):
    if not folder.exists():
        return 0

    def fail(error):
        raise error

    def linked(path):
        info = path.lstat()
        return stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    size = 0
    for base, dirs, files in os.walk(folder, onerror=fail):
        base = Path(base)
        dirs[:] = [name for name in dirs if not linked(base / name)]
        for name in files:
            info = (base / name).lstat()
            if stat.S_ISREG(info.st_mode):
                size += info.st_size
    return size


def impact(desk, db, case_id):
    reasons = blockers(db, case_id, permanent=True)
    try:
        size = folder_bytes(case_directory(desk.folder, case_id))
    except (ValueError, OSError):
        size = None
        reasons.append("ローカルの保管場所と容量を確認できません。保存先を確認してください。")
    count = db.execute("SELECT count(*) FROM runs WHERE case_id=?", (case_id,)).fetchone()[0]
    return {"bytes": size, "blockers": reasons, "runCount": count}


def update(desk, case_id, data, now):
    if case_id == desk.reference["id"]:
        raise ValueError("品質見本は閲覧専用です。")
    if not isinstance(data, dict):
        raise ValueError("案件の操作を確認してください。")
    action = data.get("action")
    with desk.db() as db:
        db.execute("BEGIN IMMEDIATE")
        item = state(db, case_id)
        if set(data) == {"rating"}:
            rating = data["rating"]
            if rating is not None and (type(rating) is not int or not 0 <= rating <= 5):
                raise ValueError("評価は1〜5、または未評価を選んでください。")
            require_active(db, case_id)
            db.execute("UPDATE cases SET rating=?,updated=? WHERE id=? AND rating IS NOT ?",
                       (rating or None, now, case_id, rating or None))
        elif action == "purge" and set(data) == {"action", "confirm"} and data["confirm"] is True:
            if not item["trashedAt"]:
                raise ValueError("ゴミ箱に移した案件だけ完全削除できます。")
            if item["purgeState"] == "purged":
                return item
            reasons = blockers(db, case_id, permanent=True)
            if reasons:
                raise ValueError(" ".join(reasons))
            case_directory(desk.folder, case_id)
            db.execute("UPDATE cases SET purge_state='purging' WHERE id=?", (case_id,))
        elif set(data) == {"action"} and action in ("trash", "restore"):
            if item["purgeState"]:
                raise ValueError("完全削除を開始した案件です。ゴミ箱で削除の完了を確認してください。")
            if action == "trash" and not item["trashedAt"]:
                reasons = blockers(db, case_id, permanent=False)
                if reasons:
                    raise ValueError(" ".join(reasons))
                db.execute("UPDATE cases SET trashed_at=?,updated=? WHERE id=?", (now, now, case_id))
            elif action == "restore" and item["trashedAt"]:
                db.execute("UPDATE cases SET trashed_at=NULL,updated=? WHERE id=?", (now, case_id))
        else:
            raise ValueError("案件の操作を確認してください。完全削除には明示的な確認が必要です。")
        if action != "purge":
            return state(db, case_id)
    # The marker commits before touching disk. A restart at any point leaves either
    # a retryable trash entry or a completed receipt, never a partially restored case.
    with desk.db() as db:
        db.execute("BEGIN IMMEDIATE")
        target = case_directory(desk.folder, case_id)
        if target.exists():
            try:
                shutil.rmtree(target)
            except OSError as exc:
                raise ValueError("ローカルファイルの削除が途中で停止しました。使用中のファイルを閉じて完全削除を再開してください。") from exc
        # Retain identities used by saved pitches and remote receipts. Old plans
        # can contain the artwork itself; only the historical title/payoff and
        # language keys are needed by the pitch library after a permanent purge.
        db.execute("""UPDATE runs SET
                      plan=CASE WHEN plan IS NOT NULL THEN json_object('titles',json_extract(plan,'$.titles'),
                          'story',json_object('explanation',json_extract(plan,'$.story.explanation'))) END,
                      editions=(SELECT json_group_object(key,json('{}')) FROM json_each(runs.editions)),
                      previous_japanese=NULL WHERE case_id=?""", (case_id,))
        db.execute("UPDATE cases SET purge_state='purged',updated=? WHERE id=?", (now, case_id))
        return state(db, case_id)


def poster(root, folder, movie, sheet=None):
    output = folder / "library-poster.jpg"
    if output.is_file():
        return plain_path(root, output)
    picture = None
    if sheet and sheet.is_file():
        try:
            with Image.open(plain_path(root, sheet)) as frame:
                # Both retained contact-sheet formats use 320 × 180 cells.
                left = 320 if frame.width >= 640 else 0
                picture = frame.crop((left, 0, min(left + 320, frame.width), min(180, frame.height))).convert("RGB")
        except (UnidentifiedImageError, OSError):
            pass
    if picture is None:
        if not movie.is_file():
            return None
        try:
            frame = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file",
                                    "-f", "mov", "-i", str(movie), "-frames:v", "1", "-vf",
                                    "scale=320:180:force_original_aspect_ratio=decrease", "-c:v", "mjpeg",
                                    "-f", "image2pipe", "-"], capture_output=True, timeout=15,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if frame.returncode or not frame.stdout:
                return None
            with Image.open(io.BytesIO(frame.stdout)) as decoded:
                picture = decoded.convert("RGB")
        except (OSError, subprocess.TimeoutExpired):
            return None
    with tempfile.NamedTemporaryFile(dir=folder, suffix=".jpg", delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        picture.save(temporary_path, "JPEG", quality=82)
        temporary_path.replace(output)
    finally:
        temporary_path.unlink(missing_ok=True)
    return output
