"""Bounded HTTPS requests to Google's OAuth and YouTube endpoints."""
import json
import re
import socket
import uuid
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

API = "https://www.googleapis.com/youtube/v3/"
MEDIA = "https://www.googleapis.com/upload/youtube/v3/"
TOKEN = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/"
UPLOAD = SCOPES + "youtube.upload"
READ = SCOPES + "youtube.readonly"
MANAGE = SCOPES + "youtube.force-ssl"
PRIVACY = ("private", "unlisted", "public")


class RemoteError(ValueError):
    def __init__(self, status, reason=""):
        self.status = status
        self.reason = reason
        if status == 401 or reason == "invalid_grant":
            message = "Googleの認証期限が切れました。対象チャンネルを再接続してください。"
        elif status in (429, 500, 502, 503, 504, 0):
            message = "YouTubeとの通信が完了しませんでした。受信位置・処理結果を再確認します。"
        elif reason in ("quotaExceeded", "dailyLimitExceeded", "uploadLimitExceeded"):
            message = "YouTubeの利用上限に達しました。上限が回復してから再試行してください。"
        elif status == 403:
            message = "Googleがこの操作を許可しませんでした。チャンネルの機能資格と接続権限を確認してください。"
        else:
            message = "Googleが要求を受理しませんでした。投稿設定または接続を確認してください。"
        super().__init__(message + (f" ({status} {reason})" if reason else f" ({status})"))

    @property
    def transient(self):
        return self.status in (0, 408, 429, 500, 502, 503, 504)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def checked_session(url):
    if not isinstance(url, str):
        raise ValueError("アップロードの再開先を確認できません。")
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.netloc not in ("www.googleapis.com", "youtube.googleapis.com")
            or parts.path != "/upload/youtube/v3/videos" or not parts.query or parts.fragment):
        raise ValueError("Googleが返したアップロード再開先を確認できません。")
    return url


class YouTubeAPI:
    def __init__(self):
        self.http = build_opener(NoRedirect())

    def request(self, method, url, *, token=None, body=None, headers=None, allowed=(200,)):
        request_headers = dict(headers or {})
        if token:
            request_headers["Authorization"] = "Bearer " + token
        if isinstance(body, dict):
            request_headers["Content-Type"] = "application/json; charset=utf-8"
            body = json.dumps(body, ensure_ascii=False).encode()
        try:
            try:
                response = self.http.open(Request(url, method=method, data=body, headers=request_headers), timeout=30)
            except HTTPError as exc:
                response = exc
            with response:
                status = response.status
                headers = response.headers
                raw = response.read(1024 * 1024 + 1)
        except (HTTPException, OSError, URLError, socket.timeout):
            raise RemoteError(0) from None
        if len(raw) > 1024 * 1024:
            raise RemoteError(502)
        try:
            value = json.loads(raw) if raw else {}
        except (UnicodeError, ValueError):
            value = {}
        if status not in allowed:
            error = value.get("error") if isinstance(value, dict) else None
            reason = error if isinstance(error, str) else None
            if isinstance(error, dict) and error.get("errors"):
                reason = error["errors"][0].get("reason")
            reason = reason if isinstance(reason, str) and re.fullmatch("[A-Za-z_]{1,48}", reason) else ""
            raise RemoteError(status, reason)
        return status, headers, value

    def token(self, form):
        return self.request("POST", TOKEN, body=urlencode(form).encode(),
                            headers={"Content-Type": "application/x-www-form-urlencoded"})[2]

    def revoke(self, refresh):
        self.request("POST", "https://oauth2.googleapis.com/revoke", body=urlencode({"token": refresh}).encode(),
                     headers={"Content-Type": "application/x-www-form-urlencoded"}, allowed=(200, 400))

    def listing(self, token, resource, **params):
        return self.request("GET", API + resource + "?" + urlencode(params), token=token)[2].get("items", [])

    def channel(self, token):
        items = self.listing(token, "channels", part="id,snippet,status", mine="true")
        if len(items) != 1 or not re.fullmatch(r"UC[\w-]{22}", str(items[0].get("id", "")), re.ASCII):
            raise ValueError("投稿先が1チャンネルに特定できません。Googleでチャンネルを選び直してください。")
        row = items[0]
        eligibility = row.get("status", {}).get("longUploadsStatus")
        return dict(id=row["id"], title=row["snippet"]["title"], handle=row["snippet"].get("customUrl", ""),
                    intermediate={"allowed": True, "disallowed": False, "eligible": False}.get(eligibility))

    def video(self, token, video):
        items = self.listing(token, "videos", id=video, part="snippet,status,processingDetails,contentDetails")
        return next((item for item in items if item.get("id") == video), None)

    def initiate(self, token, meta, size):
        snippet = dict(title=meta["title"], description=meta["description"], tags=meta["tags"],
                       categoryId=meta["categoryId"], defaultLanguage=meta["defaultLanguage"])
        status = dict(privacyStatus=meta["privacy"], selfDeclaredMadeForKids=meta["madeForKids"],
                      embeddable=meta["embeddable"], containsSyntheticMedia=meta["containsSyntheticMedia"])
        body = dict(snippet=snippet, status=status,
                    paidProductPlacementDetails={"hasPaidProductPlacement": meta["paidPromotion"]})
        params = dict(uploadType="resumable", part="snippet,status,paidProductPlacementDetails",
                      notifySubscribers=str(meta["notifySubscribers"]).lower())
        _, headers, _ = self.request("POST", MEDIA + "videos?" + urlencode(params), token=token, body=body,
                                     headers={"X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)},
                                     allowed=(200, 201))
        return checked_session(headers.get("Location"))

    def transfer(self, token, session, size, *, offset=None, chunk=b""):
        region = f"bytes */{size}" if offset is None else f"bytes {offset}-{offset + len(chunk) - 1}/{size}"
        code, headers, result = self.request("PUT", checked_session(session), token=token, body=chunk,
                                             headers={"Content-Type": "video/mp4", "Content-Range": region},
                                             allowed=(200, 201, 308))
        if code != 308:
            return None, result
        region = headers.get("Range")
        if not region:
            return 0, None
        match = re.fullmatch(r"bytes=0-(\d+)", region)
        if not match or int(match[1]) >= size:
            raise ValueError("YouTubeの受信範囲を確認できません。動画IDを確認してください。")
        return int(match[1]) + 1, None

    def change_privacy(self, token, resource, privacy):
        # Updating the status part replaces writable fields it contains.
        mutable = ("embeddable", "license", "publicStatsViewable", "selfDeclaredMadeForKids", "containsSyntheticMedia")
        status = {k: resource["status"][k] for k in mutable if k in resource["status"]}
        status["privacyStatus"] = privacy
        self.request("PUT", API + "videos?part=status", token=token, body={"id": resource["id"], "status": status})

    def thumbnail(self, token, video, mime, data):
        self.request("POST", MEDIA + "thumbnails/set?" + urlencode({"videoId": video, "uploadType": "media"}),
                     token=token, body=data, headers={"Content-Type": mime})

    def captions(self, token, video, lang, data):
        # A stable channel-owned track name reconciles an interrupted final response.
        name = "Plunode " + lang
        tracks = self.listing(token, "captions", part="snippet", videoId=video)
        track = next((t for t in tracks if t["snippet"].get("language") == lang and t["snippet"].get("name") == name), None)
        metadata = {"snippet": {"videoId": video, "language": lang, "name": name, "isDraft": False}}
        if track:
            metadata = {"id": track["id"], "snippet": {"name": name, "isDraft": False}}
        boundary = uuid.uuid4().hex
        marker = ("--" + boundary).encode()
        body = b"\r\n".join([marker, b"Content-Type: application/json; charset=UTF-8", b"",
                             json.dumps(metadata).encode(), marker, b"Content-Type: application/octet-stream", b"",
                             data, marker + b"--", b""])
        self.request("PUT" if track else "POST", MEDIA + "captions?part=snippet&uploadType=multipart",
                     token=token, body=body, headers={"Content-Type": "multipart/related; boundary=" + boundary},
                     allowed=(200, 201))
