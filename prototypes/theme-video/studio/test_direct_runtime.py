import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import direct_runtime as runtime
from test_author_session import fixture_png


class AuthorRuntimeTest(unittest.TestCase):
    def test_image_import_accepts_only_bounded_png_data(self):
        invalid = [None, {}, {"image_url": "https://example.test/image.png"}, {"image_url": "data:image/png;base64,###"},
                   {"image_url": "data:image/png;base64,aGVsbG8="}, {"path": "output", "image_url": ""}]
        with patch.object(runtime.subprocess, "run") as decoder:
            for arguments in invalid:
                with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                    runtime.save_image(Path("."), {}, arguments)
            with patch.object(runtime, "MAX_IMAGE_BYTES", 4), self.assertRaisesRegex(ValueError, "24MiB"):
                runtime.save_image(Path("."), {}, {"image_url": "data:image/png;base64," + "A" * 12})
            decoder.assert_not_called()

    @unittest.skipUnless(os.name == "posix", "The trusted image receiver runs under Linux")
    def test_image_receiver_replaces_files_atomically_inside_the_pinned_project(self):
        data = fixture_png()
        args = {"image_url": "data:image/png;base64," + base64.b64encode(data).decode()}
        name = "art-" + hashlib.sha256(data).hexdigest() + ".png"
        with tempfile.TemporaryDirectory() as tmp, patch.object(runtime, "render_command", return_value=["true"]):
            root, outside = Path(tmp) / "work", Path(tmp) / "other"
            root.mkdir()
            outside.mkdir()
            (root / "project").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(OSError):
                runtime.save_image(root, {}, args)
            self.assertFalse(list(outside.iterdir()))
            (root / "project").unlink()
            (root / "project").mkdir()
            outside_file = outside / "keep.png"
            outside_file.write_bytes(b"another artwork")
            existing = root / "project" / name
            os.link(outside_file, existing)
            path = runtime.save_image(root, {}, args)
            self.assertEqual(path, "project/" + name)
            self.assertEqual(existing.read_bytes(), data)
            self.assertEqual(outside_file.read_bytes(), b"another artwork")
    def test_one_session_can_use_its_tools_and_return_usage(self):
        code = """import json, pathlib, sys
folder = pathlib.Path(sys.argv[1])
folder.joinpath('request.txt').write_text(sys.stdin.buffer.read().decode(), encoding='utf-8')
for event in [{'type':'item.completed', 'item':{'type':'command_execution'}},
              {'type':'item.completed', 'item':{'type':'mcp_tool_call'}},
              {'type':'turn.completed', 'usage':{'input_tokens':14, 'output_tokens':8}}]:
    print(json.dumps(event))
"""
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            with patch.object(runtime, "runtime_command", return_value=[sys.executable, "-c", code, tmp]) as launch:
                result = runtime.run_author(folder, "BRIEF.mdを開いて制作してください。", "chosen", "ultra")
            launch.assert_called_once()
            self.assertEqual(launch.call_args.args[1:4], ("author", "chosen", "ultra"))
            self.assertEqual(result, {"input_tokens": 14, "output_tokens": 8})
            self.assertEqual((folder / "request.txt").read_text(encoding="utf-8"),
                             runtime.author_prompt("BRIEF.mdを開いて制作してください。"))

    def test_failed_session_reports_failure_and_keeps_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            code = "import json,sys;sys.stdin.buffer.read();print(json.dumps({'type':'turn.failed','error':{'message':'fixture'}}))"
            retained = Path(tmp) / "film.tsx"
            retained.write_text("existing", encoding="utf-8")
            with patch.object(runtime, "runtime_command", return_value=[sys.executable, "-c", code]):
                with self.assertRaisesRegex(RuntimeError, "fixture"):
                    runtime.run_author(Path(tmp), "brief", "chosen", "high")
            self.assertEqual(retained.read_text(), "existing")

    def test_parent_usage_is_marked_when_a_reader_was_consulted(self):
        events = [{"type": "item.started", "item": {"type": "collab_tool_call", "tool": "spawn"}},
                  {"type": "turn.completed", "usage": {"input_tokens": 9}}]
        output = "\n".join(json.dumps(event) for event in events)
        code = "import sys; sys.stdin.buffer.read(); print(sys.argv[1])"
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(runtime, "runtime_command", return_value=[sys.executable, "-c", code, output]):
                usage = runtime.run_author(Path(tmp), "brief", "selected", "high")
            self.assertEqual(usage, {"input_tokens": 9, "scope": "parent-only"})

    def test_permissions_and_model_are_per_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = {"codex": root / "cli/bin/codex", "ffmpeg": root / "kit/bin/ffmpeg",
                     "kit": root / "kit", "node": root / "node/bin/node"}
            with patch.object(Path, "exists", return_value=True):
                args = runtime.author_command(root / "work", root / "bootstrap", paths, "selected-model", "ultra")
            self.assertEqual(args[args.index("-C") + 1], str(root / "bootstrap"))
            self.assertIn("selected-model", args)
            self.assertIn('model_reasoning_effort="ultra"', args)
            self.assertIn("permissions.film.network.enabled=false", args)
            self.assertIn('default_permissions="film"', args)
            self.assertIn('web_search="live"', args)
            self.assertNotIn("danger-full-access", args)
            self.assertNotIn("--output-schema", args)
            self.assertNotIn("shell_tool", args)
            self.assertTrue(any("mcp_servers.film.args" in arg and "render-server" in arg for arg in args))

    @unittest.skipUnless(os.environ.get("PLUNODE_TEST_AUTHOR_RENDER") == "1", "Opt-in Linux rendering kit smoke")
    def test_real_remotion_renders_in_an_isolated_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "case"
            folder.mkdir()
            (Path(tmp) / "unrelated.txt").write_text("outside")
            (folder / "package.json").write_text('{"name":"preview","private":true}')
            (folder / "film.tsx").write_text("""import React from 'react';
import {Composition,registerRoot,AbsoluteFill,useCurrentFrame} from 'remotion';
const Film=()=> <AbsoluteFill style={{background:useCurrentFrame()>4?'#225577':'#993311'}}/>;
registerRoot(()=> <Composition id="Cut" component={Film} durationInFrames={12} fps={24} width={320} height={180}/>);
""")
            commands = [
                ["sh", "-ec", "test ! -e /home/isinxnisi/.codex/auth.json; test ! -e /mnt/c/Windows/System32; "
                 "test ! -e ../unrelated.txt; test ! -e /run/WSL; test -z \"$(ip route)\""],
                ["remotion", "render", "film.tsx", "Cut", "cut.mp4", "--concurrency=1",
                 "--browser-executable=/opt/chromium/chrome-headless-shell"],
                ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,nb_frames", "cut.mp4"],
            ]
            requests = [{"jsonrpc": "2.0", "id": i, "method": "tools/call",
                         "params": {"name": "render", "arguments": {"argv": argv}}} for i, argv in enumerate(commands)]
            result = subprocess.run(runtime.runtime_command(folder, "render-server"), check=True, capture_output=True,
                                    encoding="utf-8", input="".join(json.dumps(r) + "\n" for r in requests), timeout=180)
            replies = [json.loads(line)["result"] for line in result.stdout.splitlines()]
            self.assertEqual(len(replies), 3)
            for reply in replies:
                self.assertFalse(reply["isError"], reply["content"])
            self.assertIn("nb_frames=12", replies[-1]["content"][0]["text"])
            self.assertGreater((folder / "cut.mp4").stat().st_size, 100)
