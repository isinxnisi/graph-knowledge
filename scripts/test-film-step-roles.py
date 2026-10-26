"""Run proposed Roles only in a disposable source copy + loopback Neo4j.
No credentials/config are read from .env; no catalog approval is fabricated.
"""
from pathlib import Path
import os
import secrets
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
if not NODE:
    raise SystemExit("Node 24 required on PATH")
if int(subprocess.check_output([NODE, "-p", "process.versions.node.split(\".\")[0]"], text=True)) < 24:
    raise SystemExit("Node 24 required on PATH")
subprocess.run([sys.executable, str(ROOT / "docs/research/film-step-roles-issue40/build_fixture.py"), "--check"], check=True)
name = "graph-issue40-" + secrets.token_hex(6)
password = secrets.token_hex(24)
started = False
with tempfile.TemporaryDirectory(prefix="graph-issue40-") as temporary:
    sandbox = Path(temporary)
    for directory in ["lib", "tests"]:
        shutil.copytree(ROOT / directory, sandbox / directory)
    (sandbox / "node_modules").symlink_to((ROOT / "node_modules").resolve(), target_is_directory=True)
    shutil.copy(ROOT / "package.json", sandbox / "package.json")
    # This overlay never edits the checkout, official enum, or vocabulary approvals.
    role = sandbox / "lib/domain/contribution.ts"
    role.write_text(role.read_text().replace('"ORIGINAL_STORY"] as const', '"ORIGINAL_STORY", "DIRECTING", "ACTING"] as const'))
    labels = sandbox / "lib/i18n/contribution.ts"
    labels.write_text(labels.read_text().replace('roles: {', 'roles: { DIRECTING: "Directing (proposal)", ACTING: "Acting (proposal)",'))
    shutil.copy(ROOT / "docs/research/film-step-roles-issue40/fixture.json", sandbox / "film-fixture.json")
    try:
        subprocess.run(["docker", "run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::7687", "-e", "NEO4J_AUTH=neo4j/" + password, "-e", "NEO4J_server_memory_heap_initial__size=256m", "-e", "NEO4J_server_memory_heap_max__size=512m", "-e", "NEO4J_server_memory_pagecache_size=128m", "neo4j:5.26.31-community"], check=True, stdout=subprocess.DEVNULL)
        started = True
        address = subprocess.check_output(["docker", "port", name, "7687/tcp"], text=True).strip()
        assert address.startswith("127.0.0.1:") and "\n" not in address
        env = {k: v for k, v in os.environ.items() if not k.startswith(("NEO4J_", "GRAPH_", "FILM_"))}
        env.update(FILM_ISOLATED_TEST=name, FILM_ISOLATED_PORT=address.split(":")[1], GRAPH_DATASET="public-kg", NEO4J_URI="bolt://" + address, NEO4J_USER="neo4j", NEO4J_PASSWORD=password, NEO4J_DATABASE="neo4j", NEO4J_READ_TIMEOUT_MS="10000")
        # Driver connectivity retries are in the test; Docker exposes only loopback.
        result = subprocess.run([NODE, str(sandbox / "node_modules/vitest/vitest.mjs"), "run", "tests/film-step-roles.integration.test.ts", "--no-file-parallelism"], cwd=sandbox, env=env)
        if result.returncode:
            raise SystemExit(result.returncode)
        target = ROOT / "test-results/film-step-roles.json"
        target.parent.mkdir(exist_ok=True)
        shutil.copy(sandbox / "film-results.json", target)
        print("Isolated result:", target)
    finally:
        if started:
            subprocess.run(["docker", "stop", "--timeout", "5", name], check=True, stdout=subprocess.DEVNULL)
