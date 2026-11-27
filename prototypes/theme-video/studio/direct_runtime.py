"""Run a creative Codex session in a restricted Linux workspace from the Windows desk."""
import base64
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid


DISTRO = "Ubuntu"
KIT_VERSION = "remotion-4.0.547"
EVENT = "plunode.author.started"


def channel_context():
    return Path(__file__).with_name("channel_identity.md").read_text(encoding="utf-8").strip()


def linux_command():
    return ["wsl.exe", "-d", DISTRO, "--exec"] if os.name == "nt" else []


def linux_path(path):
    if os.name != "nt":
        return str(Path(path).resolve())
    result = subprocess.run([*linux_command(), "wslpath", "-u", str(Path(path).resolve())],
                            capture_output=True, text=True, encoding="utf-8", check=True)
    return result.stdout.strip()


def runtime_command(workspace, *args):
    prefix = linux_command()
    if args[0] == "author":
        prefix += ["/usr/bin/env", "PLUNODE_AUTHOR_JOB=" + args[-1]]
    return [*prefix, "/usr/bin/python3", "-I", linux_path(__file__), *args, linux_path(workspace)]


def codex_path():
    codex = (Path.home() / ".local/bin/codex").resolve()
    return codex if codex.is_file() else Path(shutil.which("codex") or "/missing/codex").resolve()


def author_catalog_command():
    return [*linux_command(), "/usr/bin/python3", "-I", linux_path(__file__), "codex"]


def tool_paths():
    home = Path.home()
    codex = codex_path()
    nodes = sorted((home / ".nvm/versions/node").glob("v*/bin/node"),
                   key=lambda p: tuple(int(n) for n in p.parents[1].name[1:].split(".")), reverse=True)
    if not nodes:
        raise RuntimeError("制作環境に Linux 版の Node.js 22 以降が必要です。")
    browsers = sorted((home / ".cache/ms-playwright").glob(
        "chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"),
        key=lambda p: int(p.parents[1].name.rsplit("-", 1)[-1]), reverse=True)
    if not browsers:
        raise RuntimeError("制作環境に Linux 版の Chromium headless shell が必要です。")
    kit = home / ".local/share/plunode-author-tools" / KIT_VERSION
    paths = dict(codex=codex, bwrap=codex.parents[1] / "codex-resources/bwrap", kit=kit,
                 ffmpeg=kit / "node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg",
                 node=nodes[0], chrome=browsers[0])
    return paths


def prepare_tools(paths):
    """One checked-in lockfile, one read-only dependency installation for all productions."""
    import fcntl

    kit = paths["kit"]
    source = Path(__file__).resolve().parents[1] / "goddard-remotion"
    kit.parent.mkdir(parents=True, exist_ok=True)
    with (kit.parent / "install.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not kit.exists():
            with tempfile.TemporaryDirectory(dir=kit.parent) as temporary:
                build = Path(temporary) / "package"
                build.mkdir()
                for name in ("package-lock.json", "package.json"):
                    shutil.copyfile(source / name, build / name)
                env = {**os.environ, "PATH": str(paths["node"].parent) + ":/usr/bin:/bin"}
                subprocess.run([str(paths["node"].parent / "npm"), "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
                               cwd=build, env=env, stdout=sys.stderr, check=True, timeout=600)
                build.rename(kit)
        for name in ("codex", "bwrap", "ffmpeg", "node", "chrome"):
            if not paths[name].is_file():
                raise RuntimeError("制作環境の道具が見つかりません。" + name)
        if (kit / "package-lock.json").read_bytes() != (source / "package-lock.json").read_bytes():
            raise RuntimeError("制作環境の Remotion 依存ファイルが保存版と異なります。")
        libs = kit / "chromium-libs/usr/lib/x86_64-linux-gnu"
        linked = subprocess.run(["ldd", str(paths["chrome"])], capture_output=True, text=True,
                                env={**os.environ, "LD_LIBRARY_PATH": str(libs)})
        missing = [line.split()[0] for line in linked.stdout.splitlines() if "=> not found" in line]
        if linked.returncode or missing:
            raise RuntimeError("制作環境の Chromium ライブラリを確認してください。" + " ".join(missing))


def profile_flags(workspace, host_root, paths):
    # Linux commands may read their executables and runtime libraries. Only the
    # production workspace is writable. In particular, neither home nor /mnt/c
    # as a whole is exposed. The Codex host uses its own authentication separately.
    roots = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc/ld.so.cache", "/etc/fonts",
             "/mnt/c/Windows/Fonts", paths["codex"].parents[1], paths["kit"], paths["node"].parents[1]]
    grants = {":minimal": "read", str(host_root): "read", str(workspace): "write",
              **{str(p): "read" for p in roots if Path(p).exists()}}
    for host_interface in ("/run/WSL", "/init", "/mnt/wsl", "/mnt/wslg"):
        if Path(host_interface).exists():
            grants[host_interface] = "deny"
    filesystem = ", ".join(json.dumps(k) + "=" + json.dumps(v) for k, v in grants.items())
    return ["-c", "permissions.film.filesystem={" + filesystem + "}",
            "-c", "default_permissions=\"film\"", "-c", "permissions.film.network.enabled=false"]


def author_command(workspace, host_root, paths, model, effort):
    ff = str(paths["ffmpeg"].parent)
    shell_path = f"{ff}:{paths['node'].parent}:/usr/bin:/bin"
    environment = {"PATH": shell_path, "LD_LIBRARY_PATH": ff, "NODE_PATH": str(paths["kit"] / "node_modules"),
                   "LANG": "C.UTF-8", "HOME": str(workspace / ".home"), "TMPDIR": str(workspace / ".tmp")}
    env_config = ", ".join(k + "=" + json.dumps(v) for k, v in environment.items())
    mcp = [str(Path(__file__).resolve()), "render-server", str(workspace)]
    command = [str(paths["codex"]), "--no-daemon", "-a", "never", "exec", "--ignore-user-config",
               "--ignore-rules", "--skip-git-repo-check", "--ephemeral", "--json", "-C", str(host_root),
               "--enable", "multi_agent",
               "-m", model, *profile_flags(workspace, host_root, paths),
               "-c", "project_doc_max_bytes=0", "-c", 'web_search="live"',
               "-c", "developer_instructions=" + json.dumps(channel_context(), ensure_ascii=False),
               "-c", 'shell_environment_policy.inherit="none"', "-c", "shell_environment_policy.set={" + env_config + "}",
               "-c", 'mcp_servers.film.command="/usr/bin/python3"',
               "-c", "mcp_servers.film.args=" + json.dumps(["-I", *mcp]),
               "-c", 'mcp_servers.film.enabled_tools=["render","save_image"]',
               "-c", 'mcp_servers.film.tools.render.approval_mode="approve"',
               "-c", 'mcp_servers.film.tools.save_image.approval_mode="approve"',
               "-c", "mcp_servers.film.tool_timeout_sec=3600"]
    for feature in ("plugins", "apps", "hooks", "shell_snapshot"):
        command.extend(["--disable", feature])
    if effort:
        command.extend(["-c", "model_reasoning_effort=" + json.dumps(effort)])
    return [*command, "-"]


def render_command(workspace, paths, args):
    """A private loopback lets Chromium preview a composition, without host sockets or network egress."""
    cmd = [str(paths["bwrap"]), "--unshare-all", "--new-session", "--die-with-parent", "--cap-drop", "ALL",
           "--clearenv", "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
           "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
           "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--dir", "/tmp/home",
           "--ro-bind", "/etc/fonts", "/etc/fonts", "--ro-bind-try", "/etc/ld.so.cache", "/etc/ld.so.cache",
           "--ro-bind-try", "/etc/hosts", "/etc/hosts",
           "--ro-bind-try", "/mnt/c/Windows/Fonts/YuMincho.ttc", "/tmp/home/.fonts/YuMincho.ttc",
           "--ro-bind-try", "/mnt/c/Windows/Fonts/YuGothM.ttc", "/tmp/home/.fonts/YuGothM.ttc",
           "--ro-bind", str(paths["kit"] / "node_modules"), "/node_modules",
           "--ro-bind", str(paths["chrome"].parent), "/opt/chromium",
           "--ro-bind-try", str(paths["kit"] / "chromium-libs/usr/lib/x86_64-linux-gnu"), "/opt/browser-libs",
           "--ro-bind", str(paths["node"].parent / "node"), "/opt/bin/node",
           "--bind", str(workspace), "/work", "--chdir", "/work"]
    ff = "/node_modules/@remotion/compositor-linux-x64-gnu"
    safe_env = {"PATH": "/opt/bin:/node_modules/.bin:" + ff + ":/usr/bin:/bin", "LD_LIBRARY_PATH": ff + ":/opt/browser-libs",
                "NODE_PATH": "/node_modules", "HOME": "/tmp/home", "TMPDIR": "/tmp", "LANG": "C.UTF-8",
                "CHROME": "/opt/chromium/chrome-headless-shell"}
    for key, value in safe_env.items():
        cmd.extend(["--setenv", key, value])
    return [*cmd, "--", *args]


RENDER_TOOL = {
    "name": "render", "description": "Run a rendering or preview command in the current film workspace. "
    "Private localhost for Chromium. Available tools: node, Remotion 4, React, FFmpeg and FFprobe. "
    "Your files are in /work. For Remotion use e.g. remotion render film.tsx MyComposition output/video.mp4 "
    "--browser-executable=/opt/chromium/chrome-headless-shell --concurrency=2. "
    "You can also render stills and inspect them with view_image in the regular workspace.",
    "inputSchema": {"type": "object", "properties": {"argv": {"type": "array", "items": {"type": "string"}}},
                    "required": ["argv"], "additionalProperties": False}}


IMAGE_TOOL = {
    "name": "save_image", "description": "Save the image_url returned by image_gen to this film's project. "
    "Pass the data URL directly inside functions.exec. Returns only the relative path of the PNG.",
    "inputSchema": {"type": "object", "properties": {"image_url": {"type": "string"}},
                    "required": ["image_url"], "additionalProperties": False}}
MAX_IMAGE_BYTES = 24 * 1024 * 1024


def save_image(workspace, paths, arguments):
    prefix = "data:image/png;base64,"
    url = arguments.get("image_url") if isinstance(arguments, dict) else None
    if not isinstance(url, str) or set(arguments) != {"image_url"} or not url.startswith(prefix):
        raise ValueError("画像生成の結果に含まれるPNGのimage_urlを渡してください。")
    if len(url) - len(prefix) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
        raise ValueError("PNGは24MiBまで保存できます。")
    data = base64.b64decode(url[len(prefix):], validate=True)
    if (not data.startswith(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR") or
            not data.endswith(b"\x00\x00\x00\x00IEND\xaeB`\x82")):
        raise ValueError("PNGの形式を確認できません。")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if not (0 < width <= 8192 and 0 < height <= 8192 and width * height <= 32_000_000):
        raise ValueError("PNGの寸法が保存できる範囲を超えています。")
    decode = ["ffmpeg", "-v", "error", "-xerror", "-err_detect", "crccheck+explode", "-f", "image2pipe",
              "-c:v", "png", "-i", "pipe:0", "-frames:v", "1", "-c:v", "png", "-f", "null", "-"]
    result = subprocess.run(render_command(workspace, paths, decode), input=data,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    if result.returncode:
        raise ValueError("PNGの画素を読み取れませんでした。")

    # Keep directory descriptors pinned. Never open an existing asset for writing,
    # including a symlink or hardlink placed by a concurrent author session.
    folder_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    root = os.open(workspace, folder_flags)
    try:
        try:
            os.mkdir("project", mode=0o700, dir_fd=root)
        except FileExistsError:
            pass
        project = os.open("project", folder_flags, dir_fd=root)
    finally:
        os.close(root)
    name = "art-" + hashlib.sha256(data).hexdigest() + ".png"
    temporary = ".image-" + uuid.uuid4().hex
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=project)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(data)
            os.replace(temporary, name, src_dir_fd=project, dst_dir_fd=project)
        finally:
            try:
                os.unlink(temporary, dir_fd=project)
            except FileNotFoundError:
                pass
    finally:
        os.close(project)
    return "project/" + name


def render_server(workspace):
    paths = tool_paths()
    for line in sys.stdin:
        message = json.loads(line)
        if "id" not in message:
            continue
        response = {"jsonrpc": "2.0", "id": message["id"]}
        method = message.get("method")
        if method == "initialize":
            result = {"protocolVersion": message["params"]["protocolVersion"], "capabilities": {"tools": {}},
                      "serverInfo": {"name": "plunode-film", "version": "1"}}
        elif method == "tools/list":
            result = {"tools": [RENDER_TOOL, IMAGE_TOOL]}
        elif method == "ping":
            result = {}
        elif method == "tools/call" and message["params"].get("name") == "save_image":
            try:
                path = save_image(workspace, paths, message["params"].get("arguments"))
                result = {"isError": False, "content": [{"type": "text", "text": path}]}
            except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
                result = {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
        elif method == "tools/call" and message["params"].get("name") == "render":
            args = message["params"].get("arguments", {}).get("argv")
            try:
                if not isinstance(args, list) or not args or not all(isinstance(s, str) and "\0" not in s for s in args):
                    raise ValueError("argvには実行するコマンドと引数を指定してください。")
                with tempfile.TemporaryFile() as log:
                    proc = subprocess.run(render_command(workspace, paths, args), stdin=subprocess.DEVNULL,
                                          stdout=log, stderr=subprocess.STDOUT, timeout=3500)
                    log.seek(max(0, log.tell() - 8000))
                    output = log.read().decode("utf-8", "replace")
                result = {"isError": bool(proc.returncode), "content": [{"type": "text",
                          "text": f"exit {proc.returncode}\n" + output}]}
            except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
                result = {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
        else:
            response["error"] = {"code": -32601, "message": "Method not found"}
            result = None
        if result is not None:
            response["result"] = result
        print(json.dumps(response), flush=True)


def start_author(workspace, model, effort, token):
    if os.getpgrp() != os.getpid():
        os.setsid()
    # Establish the cancellable group before tool preparation or model startup.
    print(json.dumps({"type": EVENT, "pid": os.getpid()}), flush=True)
    paths = tool_paths()
    prepare_tools(paths)
    for name in (".tmp", ".home"):
        (workspace / name).mkdir(exist_ok=True)
    # Do not pass Studio services/keys or WSL interop to processes started by the host.
    env = {k: os.environ[k] for k in ("HOME", "USER", "LOGNAME", "LANG") if k in os.environ}
    env.update(PATH=f"{paths['node'].parent}:/usr/local/bin:/usr/bin:/bin", PLUNODE_AUTHOR_JOB=token)
    # Project configuration is resolved by the privileged CLI host at startup.
    # Start it from a fresh trusted directory outside any author's project tree.
    # Its only child is a read-only link to the actual work, writable at its target.
    control = Path.home() / ".local/state/plunode-author-control"
    control.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="session-", dir=control) as temp:
        host_root = Path(temp)
        (host_root / "work").symlink_to(workspace, target_is_directory=True)
        cmd = author_command(workspace, host_root, paths, model, effort)
        def end_session(_signal, _frame):
            raise SystemExit(130)
        signal.signal(signal.SIGTERM, end_session)
        raise SystemExit(subprocess.run(cmd, cwd=host_root, env=env).returncode)


def stop_author(pid, token):
    try:
        env = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
        if (b"PLUNODE_AUTHOR_JOB=" + token.encode() in env and os.getpgid(pid) == pid):
            os.killpg(pid, signal.SIGTERM)
            time.sleep(.3)
            if Path(f"/proc/{pid}").is_dir() and os.getpgid(pid) == pid:
                current = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
                if b"PLUNODE_AUTHOR_JOB=" + token.encode() in current:
                    os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, FileNotFoundError):
        pass


def author_prompt(prompt):
    return prompt + "\n\n作業場所は work/ です。サブエージェントの利用は任意です。道具の使い方は必要なときに TOOLS.md で引けます。"


def run_author(workspace, prompt, model_id, effort, progress=None):
    workspace = Path(workspace).resolve(strict=True)
    if progress:
        progress("作者の制作環境を準備しています")
    token = uuid.uuid4().hex
    command = runtime_command(workspace, "author", model_id, effort or "", token)
    # A stderr file avoids pipe deadlocks on native tools; only a bounded tail is read on failure.
    with tempfile.TemporaryFile() as errors:
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        lines = queue.Queue()
        def collect():
            try:
                for line in proc.stdout:
                    lines.put(line)
            finally:
                lines.put(None)
        thread = threading.Thread(target=collect, daemon=True)
        thread.start()
        job_pid = None
        usage = None
        delegated = False
        failure = ""
        status = "作者が資料と制作依頼を読んでいます"
        next_progress = 0
        try:
            proc.stdin.write(author_prompt(prompt).encode("utf-8"))
            proc.stdin.close()
            while True:
                if job_pid and progress and time.monotonic() >= next_progress:
                    progress(status)
                    next_progress = time.monotonic() + 4
                try:
                    line = lines.get(timeout=1)
                except queue.Empty:
                    continue
                if line is None:
                    break
                try:
                    event = json.loads(line)
                except (UnicodeError, ValueError):
                    continue
                kind = event.get("type")
                if kind == EVENT:
                    job_pid = int(event["pid"])
                elif kind == "turn.started":
                    status = "作者が原稿・素材・映像を制作しています"
                elif kind == "turn.completed":
                    usage = event.get("usage") or {}
                elif kind in ("error", "turn.failed"):
                    failure = str(event.get("message") or event.get("error", {}).get("message", ""))[:300]
                elif kind in ("item.started", "item.completed"):
                    detail = event.get("item", {})
                    item = detail.get("type")
                    if item == "collab_tool_call" and detail.get("tool") in ("spawn", "spawn_agent"):
                        delegated = True
                    status = {"mcp_tool_call": "作者が映像をレンダリング・確認しています",
                              "web_search": "作者が資料を照合しています",
                              "command_execution": "作者が原稿・素材・映像を制作しています"}.get(item, status)
            code = proc.wait()
            if code or usage is None:
                errors.seek(max(0, errors.tell() - 900))
                detail = failure or errors.read().decode("utf-8", "replace").strip()[-450:]
                raise RuntimeError("自由制作のセッションが完了しませんでした。保存した制作ファイルから再開できます。 " + detail)
            return {**usage, "scope": "parent-only"} if delegated else usage
        finally:
            if proc.poll() is None:
                if job_pid:
                    subprocess.run([*linux_command(), "/usr/bin/python3", "-I", linux_path(__file__), "stop",
                                    str(job_pid), token], timeout=10, capture_output=True)
                proc.kill()
                proc.wait()
            proc.stdout.close()
            if not proc.stdin.closed:
                proc.stdin.close()
            thread.join(timeout=2)


if __name__ == "__main__":
    action, *arguments = sys.argv[1:]
    if action == "codex":
        executable = codex_path()
        os.execv(executable, [str(executable), *arguments])
    elif action == "render-server":
        render_server(Path(arguments[0]).resolve(strict=True))
    elif action == "author":
        model, effort, token, folder = arguments
        start_author(Path(folder).resolve(strict=True), model, effort, token)
    elif action == "stop":
        stop_author(int(arguments[0]), arguments[1])
