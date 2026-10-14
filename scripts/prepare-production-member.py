#!/usr/bin/env python3
"""既存envを変更せず、Google設定から管理者適用用の候補envを作る。"""
import json
import os
from pathlib import Path
import re
import secrets
import sys

ORIGIN = "https://plunode.net"
CALLBACK = ORIGIN + "/api/auth/callback/google"


def private_text(path):
    path = Path(path)
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise ValueError("入力fileは所有者だけが読める0600にしてください")
    return path.read_text()


def render_candidate(base_file, google_file, image_tag, reuse=None):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}", image_tag):
        raise ValueError("image tagが不正です")
    original = private_text(base_file)
    base = {}
    for line in original.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in base:
            raise ValueError("既存envの形式を確認してください")
        base[key] = value
    web = json.loads(private_text(google_file)).get("web", {})
    client_id, client_secret = web.get("client_id", ""), web.get("client_secret", "")
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.apps\.googleusercontent\.com", client_id) or not re.fullmatch(r"[A-Za-z0-9_-]{8,256}", client_secret):
        raise ValueError("Googleのウェブアプリclient JSONを確認してください")
    if CALLBACK not in web.get("redirect_uris", []):
        raise ValueError("Google側に指定redirect URIを登録してからJSONを取得してください")
    for key, value in [("MEMBER_GOOGLE_CLIENT_ID", client_id), ("MEMBER_GOOGLE_CLIENT_SECRET", client_secret)]:
        if base.get(key) and base[key] != value:
            raise ValueError("既存Google credentialの差替えは別途確認が必要です")
    if base.get("MEMBER_AUTH_PROVIDER") not in [None, "", "google"]:
        raise ValueError("既存providerの変更は別途確認が必要です")
    values = {}
    for key in ["MEMBER_AUTH_SECRET", "MEMBER_POSTGRES_ADMIN_PASSWORD", "MEMBER_POSTGRES_PASSWORD"]:
        value = base.get(key) or (reuse or {}).get(key) or secrets.token_hex(32)
        if not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("既存の会員secretは自動更新せず確認してください")
        values[key] = value
    values.update({"GRAPH_IMAGE_TAG": image_tag, "MEMBER_STORAGE_ENABLED": "1", "MEMBER_AUTH_PROVIDER": "google",
                   "MEMBER_ORIGIN": ORIGIN, "MEMBER_COOKIE_PREFIX": "gk-member-production",
                   "MEMBER_GOOGLE_CLIENT_ID": client_id, "MEMBER_GOOGLE_CLIENT_SECRET": client_secret,
                   "MEMBER_DATABASE_URL": "postgresql://gk_member:" + values["MEMBER_POSTGRES_PASSWORD"] + "@graph-member-postgres:5432/graph_member"})
    for key in ["MEMBER_ORIGIN", "MEMBER_COOKIE_PREFIX", "MEMBER_DATABASE_URL"]:
        if base.get(key) and base[key] != values[key]:
            raise ValueError("既存の会員接続先は自動変更せず確認してください")
    retained = [line for line in original.splitlines() if line.partition("=")[0] not in values]
    result = "\n".join(retained + [key + "=" + value for key, value in values.items()]) + "\n"
    return result


def prepare(base_file, google_file, output_file, image_tag):
    result = render_candidate(base_file, google_file, image_tag)
    # 既存env・候補fileを上書きしない。secretをstdoutへ出さない。
    with os.fdopen(os.open(output_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as out:
        out.write(result)


def check_candidate(base_file, google_file, candidate_file, image_tag):
    # Failed activation retries reuse the candidate secrets; never regenerate PG passwords.
    def values(text):
        result = {}
        for line in text.splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            key, separator, value = line.partition("=")
            if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in result:
                raise ValueError("候補envの形式が不正です")
            result[key] = value
        return result
    actual = values(private_text(candidate_file))
    expected = values(render_candidate(base_file, google_file, image_tag, actual))
    if actual != expected:
        raise ValueError("候補envと既存設定・Google設定が一致しません")


if __name__ == "__main__":
    try:
        if len(sys.argv) == 6 and sys.argv[1] == "--check":
            check_candidate(*sys.argv[2:])
            print("候補envの既存設定・Google設定との一致を確認しました。変更はありません。")
            sys.exit(0)
        if len(sys.argv) != 5:
            raise ValueError("Usage: prepare-production-member.py BASE_ENV GOOGLE_WEB_JSON OUTPUT_ENV IMAGE_TAG")
        prepare(*sys.argv[1:])
        print("候補envを0600で作成しました。稼働設定は変更していません。redirect: " + CALLBACK)
    except (ValueError, OSError, TypeError, AttributeError):
        print("候補envを作成できません。入力形式・0600権限・redirect登録・既存設定との整合・出力先の未作成を確認してください。secretの自動差替えは行いません。", file=sys.stderr)
        sys.exit(1)
