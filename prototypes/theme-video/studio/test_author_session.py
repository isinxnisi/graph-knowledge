"""Opt-in real Codex protocol check using loopback fixtures and synthetic authentication."""
import base64
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import random
import subprocess
import struct
import tempfile
from threading import Thread
import unittest
import zlib

import direct_runtime as runtime


def function(name, arguments):
    return {"type": "function_call", "namespace": "collaboration", "name": name,
            "arguments": json.dumps(arguments), "status": "completed"}


def script(code):
    return {"type": "custom_tool_call", "namespace": "functions", "name": "exec", "input": code}


def message(text):
    return {"type": "message", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": text, "annotations": []}]}


def fixture_png():
    def chunk(kind, value):
        return struct.pack(">I", len(value)) + kind + value + struct.pack(">I", zlib.crc32(kind + value))
    width, height = 768, 512
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    random_bytes = random.Random(1234)
    # An ordinary asset exceeds argv and text-output limits. It must stay on the tool-to-tool data path.
    rows = b"".join(b"\x00" + random_bytes.randbytes(width * 4) for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def synthetic_account(folder):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    now = datetime.now(timezone.utc)
    payload = {"exp": int(now.timestamp()) + 3600, "sub": "test-user", "email": "fixture@example.test",
               "https://api.openai.com/auth": {"chatgpt_account_id": "offline", "chatgpt_plan_type": "plus"}}
    token = encode({"alg": "none"}) + "." + encode(payload) + ".dGVzdA"
    (folder / "auth.json").write_text(json.dumps({"auth_mode": "chatgpt", "last_refresh": now.isoformat(),
        "tokens": {"id_token": token, "access_token": token, "refresh_token": "fixture", "account_id": "offline"}}))


class FixtureProvider(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/v1/images/generations":
            self.server.image_calls += 1
            raw = json.dumps({"created": 1, "data": [{"generation_id": "fixture",
                             "b64_json": base64.b64encode(fixture_png()).decode()}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        inputs = json.dumps(data["input"], ensure_ascii=False)
        role = "reader" if "Message Type: NEW_TASK" in inputs else "author"
        self.server.models.add((data["model"], data["reasoning"]["effort"]))
        developer = "\n".join(json.dumps(i, ensure_ascii=False) for i in data["input"] if i.get("role") == "developer")
        if self.server.channel_marker in developer:
            self.server.channel_seen.add(role)
        count = self.server.steps[role] = self.server.steps.get(role, 0) + 1
        self.server.trace += [(role, count, str(i.get("output", ""))[:350]) for i in data["input"]
                              if "output" in i.get("type", "")][-1:]

        if role == "reader" and count == 1:
            # The optional collaborator can inspect the real series reference and return one standalone asset.
            item = script('const reference=await tools.view_image({path:"work/reference.png"});'
                          'if(!reference.image_url)throw Error("missing shared visual");'
                          'const art=await tools.image_gen__imagegen({prompt:"fixture artwork",transparent_background:false});'
                          'text((await tools.mcp__film__save_image({image_url:art.image_url})).content);'
                          'text(await tools.exec_command({cmd:"cd work && test ! -e ../private-control && '
                          'test ! -s /init && ! find /run/WSL -type s -print -quit 2>/dev/null | grep -q . && '
                          'test ! -e /mnt/c/Windows/System32 && echo ok > reader-note"}));')
        elif role == "reader":
            item = message("recorded-fixture-observation")
        elif count == 1:
            item = function("spawn_agent", {"task_name": "reader", "fork_turns": "none",
                                            "message": "Inspect the fixture in work. Send your observation."})
        elif "recorded-fixture-observation" in inputs and not self.server.render_attempted:
            self.server.render_attempted = True
            item = script('text((await tools.mcp__film__render({argv:["sh","-ec","test -f reader-note && '
                          'ffprobe -v error -select_streams v -show_entries stream=codec_name project/art-*.png && '
                          'test -z \\"$(ip route)\\" && echo received > received"]})).content);')
        elif self.server.render_attempted or count >= 5:
            item = message("Finished")
        else:
            item = function("wait_agent", {"timeout_ms": 10000})

        item["id"] = role + str(count)
        if item["type"] != "message":
            item["call_id"] = "call_" + item["id"]
        completed = {"id": "response_" + item["id"], "object": "response", "status": "completed", "output": [item],
                     "usage": {"input_tokens": 3, "output_tokens": 2, "total_tokens": 5}}
        events = [
            ("response.created", {"response": {**completed, "status": "in_progress", "output": []}}),
            ("response.output_item.added", {"output_index": 0, "item": item}),
            ("response.output_item.done", {"output_index": 0, "item": item}),
            ("response.completed", {"response": completed}),
        ]
        raw = "".join(f"event: {kind}\ndata: {json.dumps({'type': kind, **v})}\n\n" for kind, v in events).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class AuthorSessionTest(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("PLUNODE_TEST_AUTHOR_SESSION") == "1", "Opt-in real CLI + fixture provider")
    def test_delegate_receives_context_and_returns_a_result_to_the_renderer(self):
        if os.name == "nt":
            subprocess.run([*runtime.linux_command(), "env", "PLUNODE_TEST_AUTHOR_SESSION=1", "PYTHONDONTWRITEBYTECODE=1",
                            "/usr/bin/python3", runtime.linux_path(__file__)], check=True, timeout=80)
            return
        paths = runtime.tool_paths()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            work, control, account = (base / name for name in ("work", "control", "empty-account"))
            for folder in (work, control, account, work / ".home", work / ".tmp"):
                folder.mkdir()
            synthetic_account(account)
            reference = Path(__file__).with_name("assets") / "author-reference" / "brand.png"
            (work / "reference.png").write_bytes(reference.read_bytes())
            (control / "work").symlink_to(work, target_is_directory=True)
            (base / "private-control").write_text("not visible to the author or reader")
            with ThreadingHTTPServer(("127.0.0.1", 0), FixtureProvider) as server:
                server.work, server.steps, server.models, server.channel_seen = work, {}, set(), set()
                server.trace, server.render_attempted = [], False
                server.image_calls = 0
                server.channel_marker = runtime.channel_context().splitlines()[0]
                Thread(target=server.serve_forever, daemon=True).start()
                try:
                    args = runtime.author_command(work, control, paths, "gpt-6-sol", "high")
                    provider = ("model_providers.fixture={name=\"Offline fixture\", "
                                f'base_url="http://127.0.0.1:{server.server_port}/v1", '
                                'wire_api="responses", requires_openai_auth=true, supports_websockets=false, '
                                'request_max_retries=0, stream_max_retries=0}')
                    cmd = [*args[:-1], "-c", 'model_provider="fixture"', "-c", provider, "-"]
                    env = {"HOME": os.environ["HOME"], "USER": os.environ["USER"], "CODEX_HOME": str(account),
                           "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "NO_PROXY": "127.0.0.1",
                           "HTTP_PROXY": "http://127.0.0.1:1", "HTTPS_PROXY": "http://127.0.0.1:1",
                           "OPENAI_BASE_URL": f"http://127.0.0.1:{server.server_port}/v1"}
                    result = subprocess.run(cmd, cwd=control, env=env, input=runtime.author_prompt("protocol fixture"),
                                            capture_output=True, text=True, encoding="utf-8", timeout=60)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(server.models, {("gpt-6-sol", "high")})
                    self.assertEqual(server.channel_seen, {"author", "reader"})
                    self.assertTrue((work / "received").is_file(), server.trace)
                    self.assertEqual(server.image_calls, 1)
                    self.assertEqual([p.read_bytes() for p in (work / "project").glob("art-*.png")], [fixture_png()],
                                     server.trace)
                finally:
                    server.shutdown()


if __name__ == "__main__":
    unittest.main()
