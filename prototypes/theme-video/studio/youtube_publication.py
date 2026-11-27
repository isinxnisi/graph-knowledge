"""Durable YouTube publication, separate from film generation and site placement."""
import base64
from datetime import datetime, timezone
import hashlib
import json
import logging
import re
import sqlite3
import subprocess
import threading
import time
import uuid
from urllib.parse import quote

from author_files import plain_path, read_text
from case_library import require_active
from youtube_account import ChannelAccounts, WindowsSecrets, language
from youtube_wire import MANAGE, PRIVACY, RemoteError, YouTubeAPI

DAY = 86400
CHUNK = 4 * 1024 * 1024
STORED_LIMIT = 28 * DAY
SCHEMA = """
CREATE TABLE IF NOT EXISTS youtube_drafts(
 case_id TEXT, run_id TEXT, lang TEXT, metadata TEXT NOT NULL, PRIMARY KEY(case_id,run_id,lang));
CREATE TABLE IF NOT EXISTS youtube_jobs(
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL, run_id TEXT NOT NULL, lang TEXT NOT NULL,
 channel_id TEXT NOT NULL, source TEXT NOT NULL, variant TEXT NOT NULL DEFAULT 'original',
 file_sha TEXT, size INTEGER, mtime INTEGER,
 metadata TEXT NOT NULL, status TEXT NOT NULL, video_id TEXT UNIQUE, privacy TEXT, embeddable INTEGER,
 session BLOB, offset INTEGER NOT NULL DEFAULT 0, final_attempt INTEGER NOT NULL DEFAULT 0,
 checked_at REAL, updated REAL NOT NULL, due REAL, lease TEXT, lease_until REAL DEFAULT 0,
 action_kind TEXT, action_data BLOB, captions TEXT, thumbnail TEXT, error TEXT, failures INTEGER NOT NULL DEFAULT 0,
 request_key TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS youtube_jobs_due ON youtube_jobs(due);
CREATE INDEX IF NOT EXISTS youtube_jobs_case ON youtube_jobs(case_id,lang);
"""


def iso(stamp):
    return datetime.fromtimestamp(stamp, timezone.utc).isoformat() if stamp else None


def public_job(row, details=True):
    fresh = bool(row["checked_at"] and row["checked_at"] >= time.time() - DAY)
    view = dict(id=row["id"], caseId=row["case_id"], runId=row["run_id"], lang=row["lang"], source=row["source"],
                status=row["status"], mediaVariant=row["variant"], channelId=row["channel_id"], videoId=row["video_id"], privacy=row["privacy"],
                embeddable=bool(row["embeddable"]) if row["embeddable"] is not None else None,
                canEmbed=bool(fresh and row["status"] == "ready" and row["embeddable"] and row["privacy"] in ("public","unlisted")),
                checkedAt=iso(row["checked_at"]), updated=iso(row["updated"]), action=row["action_kind"], error=row["error"])
    view["canCancel"] = not row["video_id"] and not row["final_attempt"] and row["status"] in ("queued","uploading","attention")
    if details:
        view.update(metadata=json.loads(row["metadata"]), receivedBytes=row["offset"], size=row["size"],
                    captions=row["captions"], thumbnail=row["thumbnail"])
    return view


def metadata(raw, lang):
    if not isinstance(raw, dict):
        raise ValueError("投稿情報を入力してください。")
    title, description, tags = raw.get("title"), raw.get("description"), raw.get("tags", [])
    if not isinstance(title, str) or not title.strip() or len(title) > 100 or any(c in title for c in "<>"):
        raise ValueError("タイトルは1〜100文字、山括弧なしで入力してください。")
    if not isinstance(description, str) or len(description.encode()) > 5000 or any(c in description for c in "<>"):
        raise ValueError("説明はUTF-8で5,000バイト以内、山括弧なしで入力してください。")
    if (not isinstance(tags, list) or any(not isinstance(t,str) or not t.strip() for t in tags)
            or len(",".join(('"' + t + '"' if ' ' in t else t) for t in tags)) > 500):
        raise ValueError("タグは区切りと空白を含む語の引用符を合わせて500文字以内にしてください。")
    if raw.get("privacy") not in PRIVACY or not re.fullmatch(r"[1-9][0-9]{0,2}", str(raw.get("categoryId", ""))):
        raise ValueError("公開範囲とYouTubeカテゴリ番号を確認してください。")
    if raw.get("audioLanguage", lang) != lang or raw.get("defaultLanguage",lang) not in ("ja","en"):
        raise ValueError("映像の言語と投稿情報の言語を確認してください。")
    values = dict(title=title, description=description, tags=tags, categoryId=str(raw["categoryId"]),
                  defaultLanguage=raw.get("defaultLanguage", lang), audioLanguage=lang, privacy=raw["privacy"])
    for key in ("madeForKids","containsSyntheticMedia","paidPromotion","embeddable","notifySubscribers"):
        if type(raw.get(key)) is not bool:
            raise ValueError("視聴者・内容の申告・埋め込み・通知の設定を確認してください。")
        values[key] = raw[key]
    return values


def media_signature(path):
    digest = hashlib.sha256()
    before = path.stat()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    after = path.stat()
    if not after.st_size or (after.st_size, after.st_mtime_ns) != (before.st_size, before.st_mtime_ns):
        raise ValueError("動画ファイルの保存が完了してから投稿してください。")
    return digest.hexdigest(), after.st_size, after.st_mtime_ns


def video_id(value):
    if not isinstance(value, str) or not re.fullmatch("[A-Za-z0-9_-]{11}", value):
        raise ValueError("YouTubeの11文字の動画IDを指定してください。")
    return value


def check_video(resource, expected_id, channel, lang, *, confirm_language=True):
    if not resource or resource.get("id") != expected_id:
        raise ValueError("接続したチャンネルからこの動画を確認できません。動画IDとチャンネルを確認してください。")
    snippet = resource.get("snippet", {})
    if snippet.get("channelId") != channel:
        raise ValueError("動画のチャンネルが指定の投稿先と一致しません。")
    # The language of the title/description can differ from the soundtrack.
    audio_lang = snippet.get("defaultAudioLanguage")
    if (audio_lang and audio_lang.split("-")[0] != lang) or (not audio_lang and not confirm_language):
        raise ValueError("YouTubeの動画言語が不一致または未登録です。対象言語の実映像を確認してください。")


def remote_state(resource):
    status = resource.get("status", {})
    processing = resource.get("processingDetails", {}).get("processingStatus")
    uploaded = status.get("uploadStatus")
    if uploaded in ("failed", "rejected", "deleted") or processing in ("failed","terminated"):
        state = "rejected"
    elif uploaded == "processed" or processing == "succeeded":
        state = "ready"
    else:
        state = "processing"
    age = resource.get("contentDetails", {}).get("contentRating", {}).get("ytRating")
    return dict(status=state, privacy=status.get("privacyStatus") if status.get("privacyStatus") in PRIVACY else None,
                embeddable=bool(status.get("embeddable") and age != "ytAgeRestricted"), checked_at=time.time(),
                error="YouTubeで動画の処理または公開が拒否されました。YouTube Studioで詳細を確認してください。" if state == "rejected" else None)


class YouTubePublication(ChannelAccounts):
    def __init__(self, ledger, origin, *, api=None, vault=None):
        super().__init__(ledger, origin, api or YouTubeAPI(), vault or WindowsSecrets())
        self.wake = threading.Event()
        self._verified_files = {}
        with self.ledger.db() as db:
            db.executescript(SCHEMA)
            if "variant" not in {r["name"] for r in db.execute("PRAGMA table_info(youtube_jobs)")}:
                db.execute("ALTER TABLE youtube_jobs ADD COLUMN variant TEXT NOT NULL DEFAULT 'original'")

    def case(self, case_id):
        with self.ledger.db() as db:
            return {"items": [public_job(r) for r in db.execute(
                "SELECT * FROM youtube_jobs WHERE case_id=? ORDER BY updated DESC,rowid DESC", (case_id,))]}

    def summary(self):
        columns = """id,case_id,run_id,lang,source,variant,status,channel_id,video_id,privacy,embeddable,
                     checked_at,updated,action_kind,error,final_attempt"""
        with self.ledger.db() as db:
            return {"items": [public_job(r, False) for r in db.execute(
                f"SELECT {columns} FROM youtube_jobs ORDER BY updated DESC,rowid DESC")]}

    def _medium(self, case_id, run, lang, name):
        path = self.ledger.media(case_id, run, language(lang), name)
        return plain_path(self.ledger.folder, path)

    @staticmethod
    def _edition(db, case_id, run, lang):
        require_active(db, case_id)
        row = db.execute("""SELECT c.title,c.snapshot,r.plan,r.editions FROM cases c JOIN runs r ON r.case_id=c.id
                         WHERE c.id=? AND r.id=?""", (case_id,run)).fetchone()
        if not row or language(lang) not in json.loads(row["editions"]):
            raise ValueError("案件の完成した言語版を選んでください。")
        return row

    def draft(self, case_id, run, lang):
        with self.ledger.db() as db:
            row = self._edition(db,case_id,run,lang)
            saved = db.execute("SELECT metadata FROM youtube_drafts WHERE case_id=? AND run_id=? AND lang=?",
                               (case_id,run,lang)).fetchone()
            if saved:
                return json.loads(saved["metadata"])
            privacy = db.execute("SELECT privacy FROM youtube_settings").fetchone()[0]
        plan, snap = json.loads(row["plan"] or "{}"), json.loads(row["snapshot"])
        edition = json.loads(row["editions"])[lang]
        prefix = "/en/t/" if lang == "en" else "/t/"
        title = plan.get("titles", {}).get(lang) or row["title"]
        description = [title, f"https://plunode.net{prefix}{quote(snap['themeId'],safe='')}?krev={int(snap['revision'])}"]
        for source in plan.get("sources", []):
            if isinstance(source,dict) and isinstance(source.get("url"), str):
                description.append(str(source.get("title") or "") + "\n" + source["url"])
        credits = edition.get("voiceCredit") or edition.get("voice")
        if not credits:
            folder = self.ledger.folder / "cases" / case_id / run / lang
            try:
                media_info = json.loads(read_text(self.ledger.folder,folder / "media.json",2_000_000))
                if isinstance(media_info,dict):
                    credits = media_info.get("voice")
            except (OSError,ValueError):
                pass
        if isinstance(credits, str) and credits.strip():
            description.append(("音声　" if lang == "ja" else "Voice: ") + credits)
        return dict(title=title,description="\n\n".join(description),
                    tags=[],categoryId="27",defaultLanguage=lang,audioLanguage=lang,privacy=privacy,madeForKids=None,
                    containsSyntheticMedia=False,paidPromotion=False,embeddable=True,notifySubscribers=False)

    def save_draft(self, case_id, run, lang, data):
        value = data.get("metadata", data)
        if not isinstance(value, dict) or len(json.dumps(value).encode()) > 128 * 1024:
            raise ValueError("下書きの内容を確認してください。")
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            self._edition(db,case_id,run,lang)
            db.execute("INSERT OR REPLACE INTO youtube_drafts VALUES(?,?,?,?)", (case_id,run,lang,json.dumps(value)))
        return value

    @staticmethod
    def _target(db, lang, channel):
        row = db.execute("SELECT * FROM youtube_accounts WHERE lang=? AND channel_id=?", (lang,channel)).fetchone()
        if not row:
            raise ValueError("接続した言語別チャンネルを確認して投稿先を選んでください。")
        return row

    def submit(self, case_id, run, lang, data):
        values = metadata(data.get("metadata"), lang)
        channel = data.get("channelId")
        variant = data.get("mediaVariant", "original")
        if variant not in ("original","captioned"):
            raise ValueError("投稿用に試写した映像を選択してください。")
        movie = self._medium(case_id,run,lang,"captioned.mp4" if variant == "captioned" else "video.mp4")
        # Studio generations before publication support stored scene timings only.
        # Phone verification depends on the actual file duration, including its closing frame.
        with self.ledger.db() as db:
            known_basic = self._target(db,lang,channel)["intermediate"] == 0
        duration = None
        if known_basic:
            try:
                result = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(movie)],
                                        capture_output=True,check=True,timeout=20,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
                duration = float(result.stdout)
            except (OSError,ValueError,subprocess.SubprocessError):
                raise ValueError("投稿する動画の長さを確認できませんでした。MP4とffprobeを確認してください。") from None
        sha, size, mtime = media_signature(movie)
        if size > 256 * 1024**3:
            raise ValueError("YouTubeの動画サイズ上限を超えています。")
        key = "upload:" + str(channel) + ":" + sha
        if data.get("repost") is True:
            nonce = data.get("requestId")
            if not isinstance(nonce,str) or not re.fullmatch("[A-Za-z0-9_-]{16,80}", nonce):
                raise ValueError("再投稿を確認してからやり直してください。")
            key += ":" + nonce
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            self._edition(db,case_id,run,lang)
            channel_info = self._target(db,lang,channel)
            if channel_info["intermediate"] == 0 and (duration is None or duration > 900):
                raise ValueError("15分を超える動画にはYouTubeチャンネルの中級者向け機能が必要です。")
            existing = db.execute("SELECT * FROM youtube_jobs WHERE request_key=?", (key,)).fetchone()
            if not existing and not data.get("repost"):
                existing = db.execute("""SELECT * FROM youtube_jobs WHERE source='existing' AND case_id=? AND
                                      run_id=? AND lang=? AND channel_id=? AND variant=? AND status<>'missing' LIMIT 1""",
                                      (case_id,run,lang,channel,variant)).fetchone()
            if existing:
                return public_job(existing)
            job = uuid.uuid4().hex
            now = time.time()
            db.execute("""INSERT INTO youtube_jobs(id,case_id,run_id,lang,channel_id,source,variant,file_sha,size,mtime,metadata,
                       status,updated,due,request_key) VALUES(?,?,?,?,?,'upload',?,?,?,?,?,'queued',?,?,?)""",
                       (job,case_id,run,lang,channel,variant,sha,size,mtime,json.dumps(values),now,now,key))
            result = public_job(db.execute("SELECT * FROM youtube_jobs WHERE id=?", (job,)).fetchone())
        self.wake.set()
        return result

    def register(self, case_id, run, lang, data):
        ident, channel = video_id(data.get("videoId")), data.get("channelId")
        access = self.credential(language(lang),channel)
        resource = self.api.video(access,ident)
        check_video(resource,ident,channel,lang,confirm_language=data.get("confirmLanguage") is True)
        facts = remote_state(resource)
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            self._edition(db,case_id,run,lang)
            self._target(db,lang,channel)
            row = db.execute("SELECT * FROM youtube_jobs WHERE video_id=?", (ident,)).fetchone()
            if row:
                if (row["case_id"],row["run_id"],row["lang"],row["channel_id"]) == (case_id,run,lang,channel):
                    return public_job(row)
                raise ValueError("この動画IDは別の制作版に登録されています。")
            if db.execute("""SELECT 1 FROM youtube_jobs WHERE case_id=? AND run_id=? AND lang=? AND channel_id=?
                          AND status='uncertain'""", (case_id,run,lang,channel)).fetchone():
                raise ValueError("この版に送信結果不明の投稿があります。その投稿の「動画IDを照合」で登録してください。")
            job = uuid.uuid4().hex
            now = time.time()
            db.execute("""INSERT INTO youtube_jobs(id,case_id,run_id,lang,channel_id,source,metadata,status,video_id,
                       privacy,embeddable,checked_at,updated,due,error,request_key) VALUES(?,?,?,?,?,'existing','{}',?,?,?,?,?,?,?,?,?)""",
                       (job,case_id,run,lang,channel,facts["status"],ident,facts["privacy"],facts["embeddable"],now,now,
                        now + (30 if facts["status"] == "processing" else DAY),facts["error"],"existing:"+ident))
            return public_job(db.execute("SELECT * FROM youtube_jobs WHERE id=?", (job,)).fetchone())

    def action(self, job_id, action, data):
        now = time.time()
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM youtube_jobs WHERE id=?", (job_id,)).fetchone()
            if not row:
                raise KeyError(job_id)
            require_active(db, row["case_id"])
            if row["lease_until"] > now:
                raise ValueError("現在の送信または照合の完了後に操作してください。")
            if action == "cancel":
                if not public_job(row)["canCancel"]:
                    raise ValueError("最終送信の可能性があるため、先にYouTubeで動画を照合してください。")
                db.execute("""UPDATE youtube_jobs SET status='failed',session=NULL,offset=0,due=NULL,action_kind=NULL,
                           action_data=NULL,updated=?,error='運営者が送信を中断しました。再試行できます。' WHERE id=?""", (now,job_id))
                return public_job(db.execute("SELECT * FROM youtube_jobs WHERE id=?", (job_id,)).fetchone())
            account = self._target(db,row["lang"],row["channel_id"])
            payload = {}
            if action == "retry":
                if row["action_kind"]:
                    db.execute("UPDATE youtube_jobs SET due=?,failures=0,error=NULL WHERE id=?", (now,job_id))
                elif row["status"] in ("uncertain","missing","rejected"):
                    raise ValueError("YouTube Studioで対象の動画を確認し、動画IDの照合または状態の再取得を選んでください。")
                else:
                    state = "processing" if row["video_id"] else ("uploading" if row["session"] else "queued")
                    db.execute("UPDATE youtube_jobs SET status=?,due=?,error=NULL,failures=0 WHERE id=?", (state,now,job_id))
            elif action in ("sync","privacy","captions","thumbnail","reconcile"):
                if row["action_kind"]:
                    raise ValueError("前の操作の処理または再試行が完了してから選んでください。")
                if action == "reconcile":
                    if row["status"] != "uncertain" or row["video_id"]:
                        raise ValueError("送信結果が不明な動画を選んでください。")
                    payload = {"videoId": video_id(data.get("videoId")), "confirmLanguage": data.get("confirmLanguage") is True}
                elif not row["video_id"]:
                    raise ValueError("アップロード結果が確定してから操作してください。")
                if action in ("privacy","captions") and MANAGE not in account["scopes"].split():
                    raise ValueError("Googleで対象チャンネルを管理権限付きで再接続してください。")
                if action == "privacy":
                    if data.get("privacy") not in PRIVACY:
                        raise ValueError("公開範囲を選んでください。")
                    payload["privacy"] = data["privacy"]
                if action in ("captions","thumbnail") and row["status"] != "ready":
                    raise ValueError("YouTube側で映像の処理が完了してから追加できます。")
                if action == "thumbnail":
                    if account["intermediate"] == 0:
                        raise ValueError("カスタムサムネイルは中級者向け機能です。YouTubeで電話認証してください。")
                    mime, raw = thumbnail_data(data)
                    payload = {"contentType": mime, "imageBase64": base64.b64encode(raw).decode()}
                if action == "captions":
                    path = self._medium(row["case_id"],row["run_id"],row["lang"],"subtitles.srt")
                    if not 0 < path.stat().st_size <= 8_000_000:
                        raise ValueError("この版の字幕ファイルのサイズを確認してください。")
                    payload["sha"] = media_signature(path)[0]
                db.execute("UPDATE youtube_jobs SET action_kind=?,action_data=?,due=?,error=NULL,failures=0 WHERE id=?",
                           (action,json.dumps(payload),now,job_id))
            else:
                raise ValueError("YouTubeの操作を選んでください。")
            result = public_job(db.execute("SELECT * FROM youtube_jobs WHERE id=?", (job_id,)).fetchone())
        self.wake.set()
        return result

    def _update(self, row, *, release=True, **fields):
        if release:
            fields.update(lease=None, lease_until=0)
        fields["updated"] = time.time()
        assignments = ",".join(k + "=?" for k in fields)
        with self.ledger.db() as db:
            cursor = db.execute(f"UPDATE youtube_jobs SET {assignments} WHERE id=? AND lease=?",
                                (*fields.values(),row["id"],row["lease"]))
            if not cursor.rowcount:
                raise ValueError("処理の担当が切り替わりました。送信状態を再確認してください。")

    def _next(self):
        now = time.time()
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""UPDATE youtube_jobs SET privacy=NULL,embeddable=NULL,checked_at=NULL
                       WHERE checked_at IS NOT NULL AND checked_at<?""", (now - STORED_LIMIT,))
            db.execute("UPDATE youtube_accounts SET title=NULL,handle=NULL WHERE checked<? AND title IS NOT NULL",
                       (now - STORED_LIMIT,))
            row = db.execute("""SELECT j.id FROM youtube_jobs j WHERE j.due<=? AND j.lease_until<=?
                             AND EXISTS(SELECT 1 FROM youtube_accounts a WHERE a.lang=j.lang AND a.channel_id=j.channel_id)
                             ORDER BY j.due,j.rowid LIMIT 1""", (now, now)).fetchone()
            if not row:
                return None
            db.execute("UPDATE youtube_jobs SET lease=?,lease_until=? WHERE id=?", (uuid.uuid4().hex, now + 600,row["id"]))
            return db.execute("SELECT * FROM youtube_jobs WHERE id=?", (row["id"],)).fetchone()

    def work_once(self):
        row = self._next()
        if not row:
            return False
        try:
            token = self.credential(row["lang"],row["channel_id"], manage=row["action_kind"] in ("privacy","captions"),
                                    cached=bool(row["session"] and not row["action_kind"]))
            if row["action_kind"] or row["video_id"]:
                self._lookup(row, token)
            else:
                self._upload(row, token)
        except RemoteError as exc:
            failures = row["failures"] + 1
            reconnect = exc.status == 401 or exc.reason == "invalid_grant"
            if reconnect:
                with self._lock:
                    self._access.pop(row["lang"],None)
            if exc.transient and failures < 7:
                self._update(row,error=str(exc),failures=failures,due=time.time() + min(3600,2**failures * 3))
            else:
                self._problem(row,str(exc), reconnect=reconnect)
        except (ValueError, KeyError, OSError, sqlite3.IntegrityError) as exc:
            self._problem(row,str(exc) if isinstance(exc,ValueError) else "保存データ・投稿先・対象ファイルを確認して再試行してください。")
        return True

    def _problem(self, row, message, *, reconnect=False):
        if row["action_kind"]:
            # Re-open an action with fresh inputs after correcting the operator-visible problem.
            self._update(row,action_kind=None,action_data=None,error=message,due=None)
        elif row["video_id"]:
            self._update(row,error=message,due=time.time()+DAY if row["status"] == "ready" else None)
        elif row["final_attempt"] and not reconnect:
            self._uncertain(row)
        else:
            self._update(row,status="attention" if row["session"] or row["final_attempt"] else "failed",
                         error=message,due=None)

    def _upload(self, row, token):
        name = "captioned.mp4" if row["variant"] == "captioned" else "video.mp4"
        path = self._medium(row["case_id"],row["run_id"],row["lang"],name)
        size = row["size"]
        stat = path.stat()
        identity = (stat.st_dev,stat.st_ino,stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns)
        if self._verified_files.get(row["id"]) != identity:
            digest,current_size,mtime = media_signature(path)
            if digest != row["file_sha"] or current_size != size:
                raise ValueError("試写したMP4が変更されました。この送信を続けられません。新しい完成版を選んでください。")
            self._verified_files[row["id"]] = identity
            if mtime != row["mtime"]:
                self._update(row,release=False,mtime=mtime)
        if not row["session"]:
            url = self.api.initiate(token,json.loads(row["metadata"]),size)
            self._update(row,session=self.vault.seal(url),status="uploading",offset=0,due=time.time(),failures=0,error=None)
            return
        url = self.vault.open(row["session"])
        try:
            offset, result = self.api.transfer(token,url,size)
        except RemoteError as exc:
            if exc.status not in (404,410):
                raise
            if row["final_attempt"]:
                self._uncertain(row)
            else:
                # No final PUT could have left the process. The expired partial session cannot publish a video.
                self._update(row,session=None,offset=0,status="queued",due=time.time(),error=None)
            return
        if result is None:
            with path.open("rb") as stream:
                stream.seek(offset)
                data = stream.read(min(CHUNK,size - offset))
            if not data:
                self._uncertain(row)
                return
            # Commit this flag BEFORE sending the final byte. A lost final answer must never create a second upload.
            if offset + len(data) == size:
                self._update(row,release=False,final_attempt=1)
            offset, result = self.api.transfer(token,url,size,offset=offset,chunk=data)
        if result is None:
            self._update(row,offset=offset, due=time.time(), failures=0, error=None)
            return
        ident = result.get("id")
        if not isinstance(ident,str) or not re.fullmatch("[A-Za-z0-9_-]{11}",ident) or result.get("snippet", {}).get("channelId") != row["channel_id"]:
            self._uncertain(row)
            return
        self._update(row,video_id=video_id(ident),offset=size,session=None,status="processing",due=time.time(),
                     failures=0,error=None)
        self._verified_files.pop(row["id"],None)

    def _uncertain(self, row):
        self._update(row,status="uncertain",due=None,error="最終送信の結果を確認できません。YouTube Studioの投稿済み一覧で映像を確認し、動画IDを照合してください。")

    def _lookup(self, row, token):
        action = row["action_kind"]
        payload = json.loads(row["action_data"] or "{}")
        ident = payload["videoId"] if action == "reconcile" else row["video_id"]
        resource = self.api.video(token,ident)
        if not resource and action != "reconcile":
            self._update(row,status="missing",checked_at=time.time(),due=None,privacy=None,embeddable=None,
                         action_kind=None,action_data=None,error="YouTubeから動画を取得できません。ID・チャンネル・削除の有無を確認してください。")
            return
        check_video(resource,ident,row["channel_id"],row["lang"],
                    confirm_language=action != "reconcile" or payload.get("confirmLanguage") is True)
        updates = {}
        if action == "privacy" and resource["status"].get("privacyStatus") != payload["privacy"]:
            self.api.change_privacy(token,resource,payload["privacy"])
            resource = self.api.video(token,ident)
            check_video(resource,ident,row["channel_id"],row["lang"])
            if resource["status"].get("privacyStatus") != payload["privacy"]:
                raise ValueError("YouTubeで公開範囲の変更を確認できません。状態を再取得してください。")
        if action == "captions":
            path = self._medium(row["case_id"],row["run_id"],row["lang"],"subtitles.srt")
            if path.stat().st_size > 8_000_000:
                raise ValueError("選択された字幕ファイルのサイズが変わりました。登録し直してください。")
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() != payload["sha"]:
                raise ValueError("字幕ファイルが更新されました。現在の字幕を確認して登録し直してください。")
            self.api.captions(token,ident,row["lang"],data)
            updates["captions"] = "done"
        if action == "thumbnail":
            mime, image = thumbnail_data(payload)
            self.api.thumbnail(token,ident,mime,image)
            updates["thumbnail"] = "done"
        facts = remote_state(resource)
        self._update(row,**updates,**facts,video_id=ident,session=None,action_kind=None,action_data=None,
                     failures=0,due=time.time()+(30 if facts["status"] == "processing" else DAY))

    def run_worker(self):
        while True:
            try:
                worked = self.work_once()
            except Exception:
                # Network/provider exceptions may include bearer credentials or the resumable URL.
                logging.error("YouTube投稿ワーカーの処理を再開します。")
                worked = False
            if not worked:
                self.wake.wait(timeout=10)
                self.wake.clear()


def thumbnail_data(data):
    text = data.get("imageBase64")
    if not isinstance(text,str) or len(text) > 4 * ((50_000_000 + 2) // 3):
        raise ValueError("50MB以内のJPEGまたはPNGを選んでください。")
    try:
        raw = base64.b64decode(text,validate=True)
    except ValueError:
        raise ValueError("サムネイルの画像データを確認してください。") from None
    mime = data.get("contentType")
    valid = (mime == "image/png" and raw.startswith(b"\x89PNG\r\n\x1a\n")) or (mime == "image/jpeg" and raw.startswith(b"\xff\xd8\xff"))
    if not valid or len(raw) > 50_000_000:
        raise ValueError("50MB以内のJPEGまたはPNGを選んでください。")
    return mime,raw
