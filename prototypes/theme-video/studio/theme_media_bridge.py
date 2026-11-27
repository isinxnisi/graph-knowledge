"""Operate theme-media placement on the configured Plunode site, never from author workspaces."""
import json
import os
from pathlib import Path

ORIGINS = {"beta": "https://graph-beta.isinxnisi.com", "production": "https://plunode.net"}
API = "/api/site-operations/theme-media"


class ThemePlacement:
    def __init__(self, ledger):
        self.ledger = ledger
        self.config = Path(ledger.folder) / "theme-media.json"
        with self.ledger.db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS video_placements (
                environment TEXT NOT NULL, theme_id TEXT NOT NULL, revision INTEGER NOT NULL, video_id TEXT NOT NULL,
                slot_id TEXT NOT NULL, lang TEXT NOT NULL, PRIMARY KEY(environment, theme_id, revision, slot_id, lang)
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS video_placements_id ON video_placements(video_id)")

    def token(self, environment):
        if environment not in ORIGINS:
            raise ValueError("掲載先の環境を選んでください。")
        token = os.environ.get("PLUNODE_THEME_MEDIA_TOKEN_" + environment.upper())
        if token:
            return token
        if self.config.is_file():
            return json.loads(self.config.read_bytes()).get(environment)
        return None

    def settings(self):
        return {"environments": [{"id": env, "origin": origin, "configured": bool(self.token(env))}
                                 for env, origin in ORIGINS.items()]}

    def call(self, env, *, query=None, command=None):
        token = self.token(env)
        if not token:
            raise ValueError("掲載先の接続設定が必要です。制作室の管理手順を確認してください。")
        import requests

        headers = {"Authorization": "Bearer " + token, "X-Plunode-Media-Environment": env,
                   "Accept": "application/json"}
        try:
            with requests.request("POST" if command is not None else "GET", ORIGINS[env] + API,
                                  headers=headers, params=query, json=command, timeout=(8, 25),
                                  allow_redirects=False, stream=True) as response:
                code = response.status_code
                if code in (401,403) or 300 <= code < 400:
                    raise ValueError("掲載先に接続できません。環境と掲載権限を確認してください。")
                body = bytearray()
                for chunk in response.iter_content(chunk_size=65_536):
                    body.extend(chunk)
                    if len(body) > 2_000_000:
                        break
        except (requests.RequestException, OSError) as exc:
            raise RuntimeError("掲載先と通信できません。もう一度表示して現在の状態を確認してください。") from exc
        try:
            if len(body) > 2_000_000:
                raise ValueError("oversized response")
            value = json.loads(body)
            if not isinstance(value, dict):
                raise ValueError("unexpected response")
        except (ValueError, UnicodeError):
            raise RuntimeError("掲載先の応答を読み取れません。もう一度表示して現在の状態を確認してください。") from None
        if code == 409:
            raise ValueError(value.get("error") or "掲載内容が更新されました。読み直してから保存してください。")
        if 400 <= code < 500:
            raise ValueError(value.get("error") or "掲載先の公開版と動画の状態を確認してください。")
        if code >= 500:
            raise RuntimeError("掲載先が応答できません。保存結果は再表示して確認してください。")
        return value

    def remember(self, env, theme, revision, slots):
        # Update the local index only from the version read back from the site.
        rows = [(env, theme, revision, edition["videoId"], slot["id"], lang)
                for slot in slots if slot["kind"] == "video"
                for lang, edition in slot["editions"].items()]
        with self.ledger.db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM video_placements WHERE environment=? AND theme_id=? AND revision=?",
                       (env, theme, revision))
            db.executemany("INSERT INTO video_placements VALUES (?,?,?,?,?,?)", rows)

    def search(self, env, text):
        return self.call(env, query={"q": text})

    def read(self, env, theme, revision):
        result = self.call(env, query={"themeId": theme, "revision": revision})
        self.remember(env, theme, int(result["revision"]), result["slots"])
        return result

    def change(self, env, command):
        if command.get("action") not in ("save", "preview"):
            raise ValueError("掲載操作を選んでください。")
        result = self.call(env, command=command)
        if command["action"] == "save":
            return self.read(env, command["themeId"], command["revision"])
        return result

    def summary(self):
        with self.ledger.db() as db:
            exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='youtube_jobs'").fetchone()
            if not exists:
                return []
            return [dict(row) for row in db.execute("""SELECT DISTINCT j.case_id AS caseId, p.video_id AS videoId,
                p.environment, p.theme_id AS themeId, p.revision, p.lang, p.slot_id AS slotId
                FROM video_placements p JOIN youtube_jobs j ON j.video_id=p.video_id
                ORDER BY p.environment,p.theme_id,p.revision,p.lang""")]
