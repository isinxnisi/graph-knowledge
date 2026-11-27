"""Studio-owned YouTube OAuth configuration and per-channel encrypted credentials."""
import base64
import ctypes
import hashlib
import os
import re
import secrets
import sqlite3
import threading
import time
from urllib.parse import urlencode, urlsplit
from ctypes import wintypes

from youtube_wire import MANAGE, PRIVACY, READ, UPLOAD


class WindowsSecrets:
    """DPAPI current-user binding. Never store a plaintext fallback."""
    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    def _convert(self, value, protect):
        if os.name != "nt":
            raise ValueError("Google認証情報の保存にはWindows制作室のユーザー保護領域が必要です。")
        buf = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
        source, result = self.Blob(len(value), buf), self.Blob()
        crypt = ctypes.windll.crypt32
        function = crypt.CryptProtectData if protect else crypt.CryptUnprotectData
        ok = function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result))
        if not ok:
            raise ValueError("Windowsの保護データを読み書きできません。制作室の実行ユーザーを確認してください。")
        try:
            return ctypes.string_at(result.data, result.size)
        finally:
            ctypes.windll.kernel32.LocalFree(ctypes.cast(result.data, ctypes.c_void_p))

    def seal(self, text):
        return self._convert(text.encode(), True)

    def open(self, blob):
        return self._convert(blob, False).decode()


SCHEMA = """
CREATE TABLE IF NOT EXISTS youtube_settings(
 id INTEGER PRIMARY KEY CHECK(id=1), client_id TEXT, client_secret BLOB, privacy TEXT NOT NULL DEFAULT 'unlisted');
INSERT OR IGNORE INTO youtube_settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS youtube_accounts(
 lang TEXT PRIMARY KEY, channel_id TEXT NOT NULL UNIQUE, title TEXT, handle TEXT, intermediate INTEGER,
 refresh BLOB NOT NULL, scopes TEXT NOT NULL, checked REAL NOT NULL);
CREATE TABLE IF NOT EXISTS youtube_states(
 digest TEXT PRIMARY KEY, lang TEXT NOT NULL, actor TEXT NOT NULL, verifier BLOB NOT NULL,
 scopes TEXT NOT NULL, expires REAL NOT NULL);
"""


def language(value):
    if value not in ("ja", "en"):
        raise ValueError("日本語または英語の言語枠を選んでください。")
    return value


def channel_view(row):
    if not row:
        return None
    return {"id": row["channel_id"], "title": row["title"], "handle": row["handle"],
            "manage": MANAGE in row["scopes"].split(), "intermediate": (
                bool(row["intermediate"]) if row["intermediate"] is not None else None)}


class ChannelAccounts:
    def __init__(self, ledger, origin, api, vault):
        parsed = urlsplit(origin)
        if (parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password
                or not parsed.netloc or not (parsed.scheme == "https" or (
                    parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost", "::1")))):
            raise ValueError("固定のHTTPS制作室URLまたはlocalhostを設定してください。")
        self.origin = origin
        self.redirect = origin + "/api/youtube/oauth/callback"
        self.ledger, self.api, self.vault = ledger, api, vault
        self._access = {}
        self._lock = threading.Lock()
        with ledger.db() as db:
            db.executescript(SCHEMA)

    def settings(self):
        with self.ledger.db() as db:
            config = db.execute("SELECT * FROM youtube_settings").fetchone()
            channels = {row["lang"]: channel_view(row) for row in db.execute("SELECT * FROM youtube_accounts")}
        return {"configured": bool(config["client_id"]), "redirectUri": self.redirect, "defaultPrivacy": config["privacy"],
                "channels": {"ja": channels.get("ja"), "en": channels.get("en")}}

    def configure(self, data):
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if "clientId" in data or "clientSecret" in data:
                cid, secret = data.get("clientId"), data.get("clientSecret")
                if (not isinstance(cid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com", cid)
                        or not isinstance(secret, str) or not 1 <= len(secret) <= 500):
                    raise ValueError("Google CloudのWebクライアントIDとシークレットを両方入力してください。")
                existing = db.execute("SELECT client_id FROM youtube_settings").fetchone()[0]
                if cid != existing and db.execute("SELECT 1 FROM youtube_accounts LIMIT 1").fetchone():
                    raise ValueError("OAuthクライアント変更前に、現在のチャンネル接続を解除してください。")
                db.execute("UPDATE youtube_settings SET client_id=?,client_secret=?", (cid, self.vault.seal(secret)))
                db.execute("DELETE FROM youtube_states")
            if "defaultPrivacy" in data:
                if data["defaultPrivacy"] not in PRIVACY:
                    raise ValueError("既定の公開範囲を選択してください。")
                db.execute("UPDATE youtube_settings SET privacy=?", (data["defaultPrivacy"],))
            for lang, enabled in data.get("intermediate", {}).items():
                if type(enabled) is not bool:
                    raise ValueError("機能資格の値を確認してください。")
                db.execute("UPDATE youtube_accounts SET intermediate=? WHERE lang=?", (enabled, language(lang)))
        return self.settings()

    def connect(self, lang, data=None, actor=""):
        language(lang)
        state = secrets.token_urlsafe(40)
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            client = db.execute("SELECT client_id FROM youtube_settings").fetchone()[0]
            if not client:
                raise ValueError("Google CloudのWeb OAuthクライアントを先に設定してください。")
            row = db.execute("SELECT scopes FROM youtube_accounts WHERE lang=?", (lang,)).fetchone()
            manage = (data or {}).get("manage") is True or (row and MANAGE in row["scopes"].split())
            scopes = " ".join((UPLOAD, READ, MANAGE) if manage else (UPLOAD, READ))
            db.execute("DELETE FROM youtube_states WHERE expires < ? OR (lang=? AND actor=?)", (time.time(), lang, actor))
            db.execute("INSERT INTO youtube_states VALUES(?,?,?,?,?,?)", (
                hashlib.sha256(state.encode()).hexdigest(), lang, actor, self.vault.seal(verifier), scopes, time.time() + 600))
        params = dict(client_id=client, redirect_uri=self.redirect, response_type="code", scope=scopes,
                      access_type="offline", prompt="consent select_account", state=state,
                      code_challenge=challenge, code_challenge_method="S256")
        return {"url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}

    def callback(self, state, code, actor=""):
        digest = hashlib.sha256(state.encode()).hexdigest()
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM youtube_states WHERE digest=? AND actor=? AND expires>?",
                             (digest, actor, time.time())).fetchone()
            if not row:
                raise ValueError("期限切れまたは開始したユーザーと異なるGoogle接続です。制作室から再接続してください。")
            db.execute("DELETE FROM youtube_states WHERE digest=?", (digest,))
            config = db.execute("SELECT * FROM youtube_settings").fetchone()
        if not code or len(code) > 4096:
            raise ValueError("Googleで同意されませんでした。制作室に戻り、必要なときに再接続できます。")
        grant = self.api.token(dict(code=code, grant_type="authorization_code", redirect_uri=self.redirect,
                                    client_id=config["client_id"], client_secret=self.vault.open(config["client_secret"]),
                                    code_verifier=self.vault.open(row["verifier"])))
        granted = set(grant.get("scope", "").split())
        if not grant.get("refresh_token") or not set(row["scopes"].split()) <= granted:
            raise ValueError("接続に必要な権限または継続利用の同意を取得できませんでした。もう一度接続してください。")
        channel = self.api.channel(grant["access_token"])
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT client_id FROM youtube_settings").fetchone()[0] != config["client_id"]:
                raise ValueError("OAuth設定が更新されました。接続をやり直してください。")
            same = db.execute("SELECT channel_id FROM youtube_accounts WHERE lang=?", (row["lang"],)).fetchone()
            if same and same["channel_id"] != channel["id"]:
                raise ValueError("接続中のチャンネルと異なります。元のチャンネルで再接続してください。")
            try:
                db.execute("""INSERT INTO youtube_accounts VALUES(?,?,?,?,?,?,?,?)
                           ON CONFLICT(lang) DO UPDATE SET title=excluded.title,handle=excluded.handle,
                           refresh=excluded.refresh,scopes=excluded.scopes,checked=excluded.checked,
                           intermediate=coalesce(excluded.intermediate,youtube_accounts.intermediate)""",
                           (row["lang"],channel["id"],channel["title"],channel["handle"],channel["intermediate"],
                            self.vault.seal(grant["refresh_token"]), " ".join(sorted(granted)), time.time()))
            except sqlite3.IntegrityError:
                raise ValueError("もう一方の言語と同じチャンネルです。対応する別のチャンネルを選び直してください。") from None
        with self._lock:
            self._access.pop(row["lang"], None)
        return {"lang": row["lang"], "channel": self.settings()["channels"][row["lang"]]}

    def credential(self, lang, expected, *, manage=False, cached=False):
        with self.ledger.db() as db:
            row = db.execute("""SELECT a.*,s.client_id,s.client_secret FROM youtube_accounts a
                             CROSS JOIN youtube_settings s WHERE a.lang=? AND a.channel_id=?""", (lang, expected)).fetchone()
        if not row:
            raise ValueError("指定した言語と投稿先を確認できません。元のチャンネルを再接続してください。")
        if manage and MANAGE not in row["scopes"].split():
            raise ValueError("この操作には動画管理の追加権限が必要です。対象チャンネルを管理権限付きで再接続してください。")
        if cached:
            with self._lock:
                saved = self._access.get(lang)
                if saved and saved[0] == expected and saved[1] > time.monotonic():
                    return saved[2]
        response = self.api.token(dict(grant_type="refresh_token", client_id=row["client_id"],
                                      client_secret=self.vault.open(row["client_secret"]), refresh_token=self.vault.open(row["refresh"])))
        access = response["access_token"]
        info = self.api.channel(access)
        if info["id"] != expected:
            raise ValueError("認証されたチャンネルが投稿先と一致しません。対象チャンネルを選び直してください。")
        with self.ledger.db() as db:
            db.execute("UPDATE youtube_accounts SET title=?,handle=?,checked=? WHERE lang=? AND channel_id=?",
                       (info["title"], info["handle"], time.time(), lang, expected))
        lifetime = min(600, max(0,int(response.get("expires_in",3600))-60))
        with self._lock:
            self._access[lang] = (expected,time.monotonic()+lifetime,access)
        return access

    def disconnect(self, lang):
        language(lang)
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM youtube_jobs WHERE lang=? AND lease_until>? LIMIT 1", (lang,time.time())).fetchone():
                raise ValueError("YouTube送信を処理中です。処理が区切れてから接続を解除してください。")
            row = db.execute("SELECT refresh FROM youtube_accounts WHERE lang=?", (lang,)).fetchone()
            if row:
                # Revocation happens before deleting the only credential needed to retry it.
                self.api.revoke(self.vault.open(row["refresh"]))
            db.execute("DELETE FROM youtube_accounts WHERE lang=?", (lang,))
            db.execute("DELETE FROM youtube_states WHERE lang=?", (lang,))
            db.execute("UPDATE youtube_jobs SET checked_at=NULL,privacy=NULL,embeddable=NULL WHERE lang=?", (lang,))
        with self._lock:
            self._access.pop(lang,None)
        return self.settings()
