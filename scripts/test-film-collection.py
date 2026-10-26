"""Disposable source overlay + DB + real browser for the film adapter's own output."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
def need(ok, message):
    if not ok: raise ValueError(message)
def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0)); return sock.getsockname()[1]
def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    node = shutil.which("node"); need(node, "Node 24 required on PATH")
    need(int(subprocess.check_output([node, "-p", "process.versions.node.split('.')[0]"], text=True)) >= 24, "Node 24 required")
    bundle = args.bundle.resolve()
    subprocess.run([sys.executable, "scripts/collect-film-v1.py", "verify", "--output", str(bundle)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    output = ROOT / "test-results/film41"; output.mkdir(parents=True, exist_ok=True)
    subprocess.run([node, "--import", "tsx", "scripts/film41-runtime.ts", "ordinary", str(bundle), str(output / "ordinary.json")], cwd=ROOT, check=True)
    name = "graph-film41-" + secrets.token_hex(6); password = secrets.token_hex(24)
    started = False; web = None
    with tempfile.TemporaryDirectory(prefix="plunode-film41-") as temp:
        sandbox = Path(temp)
        for directory in ["app", "components", "lib", "public", "neo4j", "data", "fixtures"]:
            shutil.copytree(ROOT / directory, sandbox / directory)
        for filename in ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "proxy.ts", "postcss.config.mjs"]:
            if (ROOT / filename).exists(): shutil.copy(ROOT / filename, sandbox / filename)
        (sandbox / "scripts").mkdir(); shutil.copy(ROOT / "scripts/film41-runtime.ts", sandbox / "scripts/film41-runtime.ts")
        (sandbox / "tests/film41").mkdir(parents=True); shutil.copy(ROOT / "tests/film41/film-collection.spec.ts", sandbox / "tests/film41/film-collection.spec.ts")
        shutil.copy(ROOT / "playwright.film41.config.ts", sandbox / "playwright.film41.config.ts")
        (sandbox / "node_modules").symlink_to((ROOT / "node_modules").resolve(), target_is_directory=True)
        proposal = json.loads((ROOT / "docs/research/film-step-roles-issue40/role-proposals.json").read_text())
        need(proposal["status"] == "proposal-not-approved" and proposal["reviewer"] is None, "No fabricated semantic approval")
        role = sandbox / "lib/domain/contribution.ts"; text = role.read_text()
        needle = '"ORIGINAL_STORY"] as const'; need(text.count(needle) == 1, "Role overlay no longer matches")
        role.write_text(text.replace(needle, '"ORIGINAL_STORY", "DIRECTING", "ACTING"] as const'))
        labels = sandbox / "lib/i18n/contribution.ts"; text = labels.read_text()
        text = text.replace('roles: {', 'roles: { DIRECTING: "監督（提案）", ACTING: "出演（演技・提案）",')
        labels.write_text(text)
        layout = sandbox / "app/layout.tsx"; layout.write_text(layout.read_text().replace('<FocusModality />', '<FocusModality /><p style={{position:"fixed",top:0,right:0,zIndex:99999,background:"#ffe8aa",padding:4,fontSize:11}}>隔離実験：未採用Role・未受入映画候補</p>'))
        env = {k: v for k, v in os.environ.items() if not k.startswith(("NEO4J_", "GRAPH_", "MEMBER_", "COMMUNITY_", "PUBLIC_PROFILES_", "AI_LAB_", "FILM41_", "BETTER_AUTH_", "GOOGLE_"))}
        env.update(GRAPH_DATASET="public-kg", NEXT_TELEMETRY_DISABLED="1", NEO4J_USER="neo4j", NEO4J_PASSWORD=password, NEO4J_DATABASE="neo4j", NEO4J_READ_TIMEOUT_MS="15000", FILM41_CONTAINER=name, COMMUNITY_ENABLED="0", PUBLIC_PROFILES_ENABLED="0", AI_LAB_ENABLED="0")
        try:
            result = subprocess.run(["docker", "run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::7687", "-e", "NEO4J_AUTH=neo4j/" + password, "-e", "NEO4J_server_memory_heap_initial__size=256m", "-e", "NEO4J_server_memory_heap_max__size=512m", "-e", "NEO4J_server_memory_pagecache_size=128m", "neo4j:5.26.31-community"], stdout=subprocess.DEVNULL)
            need(result.returncode == 0, "Cannot create disposable DB")
            started = True
            address = subprocess.check_output(["docker", "port", name, "7687/tcp"], text=True).strip()
            need(address.startswith("127.0.0.1:") and "\n" not in address, "DB must bind only loopback")
            db_port = address.split(":")[1]; env.update(NEO4J_URI="bolt://" + address, FILM41_DB_PORT=db_port)
            # Extend the local port allowlist only in this disposable app source copy.
            target = sandbox / "lib/domain/dataset.ts"; text = target.read_text(); need('["7694", "7695"]' in text, "Port guard overlay no longer matches")
            target.write_text(text.replace('["7694", "7695"]', '["7694", "7695", "' + db_port + '"]'))
            subprocess.run([node, "--import", "tsx", "scripts/film41-runtime.ts", "seed", str(bundle), str(output / "runtime.json")], cwd=sandbox, env=env, check=True)
            if not args.no_browser:
                web_port = port(); env.update(FILM41_WEB_PORT=str(web_port), FILM41_BASE_URL="http://127.0.0.1:" + str(web_port), FILM41_RUNTIME=str(output / "runtime.json"), FILM41_RESULTS=str(output))
                with (output / "web.log").open("w") as log:
                    web = subprocess.Popen([node, "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", str(web_port)], cwd=sandbox, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                    ready = False
                    for _ in range(120):
                        need(web.poll() is None, "Isolated Next server exited; see test-results/film41/web.log")
                        try:
                            with urllib.request.urlopen(env["FILM41_BASE_URL"] + "/api/dataset", timeout=3) as response:
                                value = json.load(response); need(value["revision"] == "film41-isolated-r1", "Refuse a server with another dataset")
                                ready = True; break
                        except (TimeoutError, OSError): time.sleep(1)
                    need(ready, "Isolated Web readiness timed out")
                    result = subprocess.run([node, "node_modules/@playwright/test/cli.js", "test", "--config=playwright.film41.config.ts"], cwd=sandbox, env=env)
                    need(result.returncode == 0, "Film browser E2E failed; preserved test-results/film41 artifacts")
            print(json.dumps({"isolatedValidation": True, "browser": not args.no_browser, "productionWrites": 0, "resultDirectory": str(output)}))
        finally:
            if web is not None:
                import signal
                if web.poll() is None:
                    os.killpg(web.pid, signal.SIGTERM)
                    try: web.wait(timeout=15)
                    except subprocess.TimeoutExpired: os.killpg(web.pid, signal.SIGKILL); web.wait()
            if started: subprocess.run(["docker", "stop", "--timeout", "5", name], check=True, stdout=subprocess.DEVNULL)
if __name__ == "__main__": run()
