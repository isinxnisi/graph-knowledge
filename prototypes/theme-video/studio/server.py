"""Start the local Plunode video desk on http://127.0.0.1:3269/."""
import argparse
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sys
import threading
from urllib.parse import parse_qs, urlsplit

from access import CloudflareAccess
from ledger import Ledger, ROOT, required
from theme_media_bridge import PlacementProblem, ThemePlacement
from publication_captions import PublicationCaptions


@contextmanager
def exclusive(folder):
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / "studio.lock").open("a+b") as handle:
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise SystemExit("この保存先を使う動画制作画面が既に起動しています。") from error
        yield


def run_worker(ledger, *, video_only=False):
    from editor import generate_ideas, generate_plan
    def render(plan, lang, folder, progress):
        from media import render_edition
        return render_edition(plan, lang, folder, progress=progress)

    while True:
        made_video = ledger.process_next(generate_plan, render)
        made_ideas = not video_only and ledger.work_ideas(generate_ideas)
        if not (made_video or made_ideas):
            ledger.wake.wait(timeout=2)
            ledger.wake.clear()


class Handler(BaseHTTPRequestHandler):
    server_version = "PlunodeStudio/1"

    def respond(self, status, content, mime="application/json; charset=utf-8"):
        if not isinstance(content, bytes):
            content = json.dumps(content, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                         "img-src 'self' data: https://graph-beta.isinxnisi.com https://plunode.net; media-src 'self' blob:; "
                         "frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; form-action 'self'; "
                         "base-uri 'none'; object-src 'none'")
        super().end_headers()

    def origin_ok(self):
        port = self.server.server_port
        hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        requested = self.headers.get_all("Host", [])
        if len(requested) != 1:
            return False
        host = requested[0].lower()
        if host in hosts:
            origin = self.headers.get("Origin")
            return origin is None or origin in {f"http://{local}" for local in hosts}
        access = self.server.access
        return access is not None and host == access.host and access.allows(self.headers, self.command)

    def oauth_actor(self):
        access = self.server.access
        host = self.headers.get("Host", "").lower()
        if access:
            if host == access.host:
                actor = access.identity(self.headers, self.command)
                if actor:
                    return actor
            raise ValueError("YouTubeのGoogle接続は外部用の制作室を開いて操作してください。")
        if host == f"127.0.0.1:{self.server.server_port}":
            return "local"
        raise ValueError("YouTubeの接続先URLを確認してください。")

    def log_request(self, code="-", size="-"):
        if urlsplit(self.path).path == "/api/youtube/oauth/callback":
            self.log_message('"%s /api/youtube/oauth/callback" %s %s', self.command, code, size)
        else:
            super().log_request(code, size)

    def youtube_return(self, query):
        if self.command != "GET":
            return self.respond(405, {"error": "Googleの接続操作をやり直してください。"})
        actor = self.oauth_actor()
        status = "connected"
        try:
            if query.get("error"):
                try:
                    self.server.youtube.callback(query.get("state", [""])[0], "", actor=actor)
                except ValueError:
                    pass
                status = "cancelled"
            else:
                self.server.youtube.callback(query.get("state", [""])[0], query.get("code", [""])[0], actor=actor)
        except (ValueError, RuntimeError):
            status = "failed"
        self.send_response(303)
        self.send_header("Location", "/?youtube=" + status + "#publishing")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def file(self, path):
        size = path.stat().st_size
        mime = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png",
                ".srt": "application/x-subrip; charset=utf-8"}[path.suffix]
        start, end, partial = 0, size - 1, self.headers.get("Range")
        if partial:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", partial.strip())
            if match and any(match.groups()):
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(end, int(last)) if last else end
                else:
                    start = max(0, size - int(last))
            else:
                start = size
            if start > end or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if self.command == "HEAD":
            return
        with path.open("rb") as clip:
            clip.seek(start)
            remaining = end - start + 1
            while remaining:
                chunk = clip.read(min(remaining, 128 * 1024))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def handle_route(self):
        if not self.origin_ok():
            self.respond(403, {"error": "この接続は認証されていません。"})
            return
        url = urlsplit(self.path)
        path = url.path
        ledger = self.server.ledger
        if self.command in ("GET", "HEAD"):
            if path == "/samples/baird-opening.ja.mp4":
                return self.file(ROOT.parent / "baird" / "opening.ja.mp4")
            if path == "/samples/goddard.ja.mp4":
                return self.file(ROOT.parent / "goddard-remotion" / "goddard.ja.mp4")
            if path == "/samples/paper-fish.ja.mp4":
                return self.file(ROOT / "assets" / "paper-fish.ja.mp4")
            static = {"/": ("index.html", "text/html"), "/studio.css": ("studio.css", "text/css"),
                      "/ideas.js": ("ideas.js", "text/javascript"),
                      "/library.js": ("library.js", "text/javascript"),
                      "/publishing.js": ("publishing.js", "text/javascript"),
                      "/studio.js": ("studio.js", "text/javascript")}
            if path in static:
                name, mime = static[path]
                self.respond(200, (ROOT / "static" / name).read_bytes(), mime + "; charset=utf-8")
                return
            query = parse_qs(url.query)
            if path == "/api/youtube/oauth/callback":
                return self.youtube_return(query)
            if path == "/api/youtube/settings":
                return self.respond(200, self.server.youtube.settings())
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/(ja|en)/upload-captions", path)
            if match:
                return self.respond(200, self.server.publication_captions.item(*match.groups()))
            if path == "/api/publication/status":
                return self.respond(200, {"youtube": self.server.youtube.summary()["items"],
                                          "placements": self.server.placements.summary()})
            if path == "/api/placement/settings":
                return self.respond(200, self.server.placements.settings())
            if path == "/api/placement/themes":
                return self.respond(200, self.server.placements.search(query.get("environment", [""])[0],
                                                                     query.get("q", [""])[0][:200]))
            if path == "/api/placement/theme":
                return self.respond(200, self.server.placements.read(query.get("environment", [""])[0],
                                        query.get("themeId", [""])[0], int(query.get("revision", ["0"])[0])))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/youtube", path)
            if match:
                return self.respond(200, self.server.youtube.case(match[1]))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/(ja|en)/youtube", path)
            if match:
                return self.respond(200, self.server.youtube.draft(*match.groups()))
            if path == "/api/models":
                from editor import list_models
                return self.respond(200, {"items": list_models(), "authorItems": list_models(author=True)})
            if path == "/api/health":
                return self.respond(200, {"service": "plunode-video-studio", "data": str(ledger.folder)})
            if path == "/api/themes":
                from editor import search_themes
                q = parse_qs(url.query).get("q", [""])[0]
                if len(q) > 200:
                    raise ValueError("検索語は200字以内で入力してください。")
                return self.respond(200, {"items": search_themes(q)})
            if path == "/api/cases":
                trashed = parse_qs(url.query).get("trash") == ["1"]
                return self.respond(200, {"items": ledger.list_cases(trashed=trashed)})
            match = re.fullmatch(r"/api/cases/([\w-]+)/preview", path)
            if match:
                movie = ledger.case_preview(match[1])
                return self.respond(200, movie) if movie else self.respond(404, {"error": "試写できる完成映像がありません。"})
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/(ja|en)/thumbnail", path)
            if match:
                thumbnail = ledger.edition_thumbnail(*match.groups())
                return self.file(thumbnail) if thumbnail else self.respond(404, {"error": "試写画像はありません。"})
            match = re.fullmatch(r"/api/cases/([\w-]+)/thumbnail", path)
            if match:
                thumbnail = ledger.case_thumbnail(match[1])
                return self.file(thumbnail) if thumbnail else self.respond(404, {"error": "試写画像はありません。"})
            if path == "/api/ideas":
                theme = parse_qs(url.query).get("themeId", [None])[0]
                return self.respond(200, ledger.list_ideas(theme))
            match = re.fullmatch(r"/api/cases/([\w-]+)", path)
            if match:
                return self.respond(200, ledger.case(match[1]))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/cut", path)
            if match:
                return self.respond(200, ledger.cut_index(*match.groups()))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/commissions/(ja|en)/(draft|film)", path)
            if match:
                return self.respond(200, ledger.author_commission(*match.groups()))
            match = re.fullmatch(r"/media/([a-f0-9]{32})/([a-f0-9]{32})/cut-previews/([a-f0-9]{64}\.mp4)", path)
            if match:
                return self.file(ledger.cut_media(*match.groups()))
            match = re.fullmatch(r"/media/([\w-]+)/([\w-]+)/(ja|en)/(video\.mp4|subtitles\.srt|contact-sheet\.png|storyboard\.jpg|captioned\.mp4)", path)
            if match:
                return self.file(ledger.media(*match.groups()))
        else:
            if self.headers.get_content_type() != "application/json":
                return self.respond(415, {"error": "JSON形式で送信してください。"})
            size = int(self.headers.get("Content-Length", "0"))
            limit = 131072 if re.fullmatch(r"/api/cases/[a-f0-9]{32}/runs", path) else 32768
            if re.fullmatch(r"/api/youtube/jobs/[a-f0-9-]+/thumbnail", path):
                limit = 67_000_000
            elif path == "/api/placement/theme":
                limit = 131072
            if not 0 < size <= limit:
                return self.respond(413, {"error": "送信するデータの大きさを確認してください。"})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError("操作の内容を読み取れません。")
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/library", path)
            if match:
                return self.respond(200, ledger.update_case_library(match[1], data))
            if path == "/api/youtube/settings":
                return self.respond(200, self.server.youtube.configure(data))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/(ja|en)/upload-captions", path)
            if match:
                return self.respond(202, self.server.publication_captions.submit(*match.groups()))
            match = re.fullmatch(r"/api/youtube/channels/(ja|en)/(connect|disconnect)", path)
            if match:
                lang, action = match.groups()
                if action == "connect":
                    return self.respond(200, self.server.youtube.connect(lang, data, actor=self.oauth_actor()))
                return self.respond(200, self.server.youtube.disconnect(lang))
            match = re.fullmatch(r"/api/youtube/jobs/([a-f0-9-]+)/(retry|sync|privacy|captions|thumbnail|reconcile|cancel)", path)
            if match:
                return self.respond(200, self.server.youtube.action(*match.groups(), data))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/(ja|en)/youtube/(draft|submit|register)", path)
            if match:
                case_id, run, lang, action = match.groups()
                operation = {"draft": self.server.youtube.save_draft, "submit": self.server.youtube.submit,
                             "register": self.server.youtube.register}[action]
                return self.respond(200, operation(case_id, run, lang, data))
            if path == "/api/placement/theme":
                env = required(data, "environment", 30)
                command = {key: value for key, value in data.items() if key != "environment"}
                return self.respond(200, self.server.placements.change(env, command))
            if path == "/api/reading-preview":
                from media import preview_reading
                with self.server.preview_slot:
                    audio = preview_reading(required(data, "narration", 800), data.get("readings", []))
                return self.respond(200, audio, "audio/wav")
            if path == "/api/cases":
                from editor import get_snapshot, list_models
                return self.respond(201, ledger.submit(path, data, get_snapshot, list_models,
                                                       author_models_fn=lambda: list_models(author=True)))
            if path == "/api/ideas/generate":
                from editor import get_snapshot, list_models
                return self.respond(202, ledger.submit_ideas(data, get_snapshot, list_models))
            match = re.fullmatch(r"/api/cases/([a-f0-9]{32})/runs/([a-f0-9]{32})/cut/excerpts", path)
            if match:
                with self.server.preview_slot:
                    excerpt = ledger.cut_excerpt(*match.groups(), data)
                return self.respond(200, excerpt)
            match = re.fullmatch(r"/api/ideas/([\w-]+)/status", path)
            if match:
                ledger.set_idea_status(match[1], required(data, "status", 20))
                return self.respond(200, {"ok": True})
            match = re.fullmatch(r"/api/cases/([\w-]+)/(runs|shorts|adopt|rework|resume|pause|alternative)", path)
            if match:
                cid, action = match.groups()
                if action == "shorts":
                    from editor import list_models
                    return self.respond(201, ledger.submit_short(cid, data, lambda: list_models(author=True)))
                if action == "runs":
                    from editor import get_snapshot, list_models
                    return self.respond(201, ledger.submit(path, data, get_snapshot, list_models, cid,
                                                           author_models_fn=lambda: list_models(author=True)))
                if action == "alternative":
                    return self.respond(200, ledger.start_alternative(cid, required(data, "runId"), required(data, "fingerprint", 64)))
                if action in ("adopt", "rework"):
                    ledger.review(cid, data, "adopted" if action == "adopt" else "rework")
                elif action == "resume":
                    ledger.resume(cid, required(data, "runId"), data.get("materialLeads"))
                else:
                    ledger.pause(cid, required(data, "runId"))
                return self.respond(200, {"ok": True})
        self.respond(404, {"error": "見つかりません。"})

    def dispatch(self):
        try:
            self.handle_route()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except (KeyError, FileNotFoundError):
            self.respond(404, {"error": "指定した案件またはファイルが見つかりません。"})
        except PlacementProblem as error:
            self.respond(503, {"error": str(error), "code": error.code})
        except (ValueError, UnicodeError) as error:
            self.respond(400, {"error": str(error)[:600]})
        except (RuntimeError, OSError) as error:
            self.respond(503, {"error": str(error)[:600]})
        except Exception as error:
            print(type(error).__name__, str(error)[:300], file=sys.stderr, flush=True)
            self.respond(500, {"error": "制作画面でエラーが発生しました。実行ログを確認してください。"})

    do_GET = do_HEAD = do_POST = dispatch


def default_folder():
    if os.name == "nt":
        return Path(os.environ["LOCALAPPDATA"]) / "Plunode" / "video-studio"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "plunode/video-studio"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3269)
    parser.add_argument("--data", type=Path, default=default_folder())
    args = parser.parse_args()
    from youtube_publication import YouTubePublication
    access = CloudflareAccess.load(args.data)
    with exclusive(args.data), ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.access = access
        server.ledger = Ledger(args.data)
        server.youtube = YouTubePublication(server.ledger, origin=access.origin if access else
                                            f"http://127.0.0.1:{server.server_port}")
        server.placements = ThemePlacement(server.ledger)
        server.publication_captions = PublicationCaptions(server.ledger)
        threading.Thread(target=server.publication_captions.run_worker, daemon=True).start()
        server.preview_slot = threading.Lock()
        threading.Thread(target=server.youtube.run_worker, daemon=True).start()
        threading.Thread(target=run_worker, args=(server.ledger,), daemon=True).start()
        threading.Thread(target=run_worker, args=(server.ledger,), kwargs={"video_only": True}, daemon=True).start()
        print(f"http://127.0.0.1:{server.server_port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
