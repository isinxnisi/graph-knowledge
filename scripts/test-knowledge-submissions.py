"""Test only fresh named DBs inside the existing issue75 PostgreSQL container.
Retain a dump and verify a separate restore; never migrate a preview/member DB.
"""
import json
import os
from pathlib import Path
import subprocess
import uuid
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = "plunode-issue75-postgres"


def docker(*args, **kwargs):
    return subprocess.run(["docker", *args], check=True, timeout=60, **kwargs)


def fingerprints(database):
    names = docker("exec", CONTAINER, "psql", "-U", "theme75", "-d", database, "-At", "-c", "SELECT tablename FROM pg_tables WHERE schemaname='knowledge75' ORDER BY tablename", capture_output=True, text=True).stdout.splitlines()
    result = {}
    for name in names:
        assert name.replace("_", "").isalnum()
        sql = f'SELECT count(*),md5(coalesce(string_agg(row_to_json(t)::text, chr(10) ORDER BY row_to_json(t)::text),\'\')) FROM knowledge75."{name}" t'
        result[name] = docker("exec", CONTAINER, "psql", "-U", "theme75", "-d", database, "-At", "-c", sql, capture_output=True, text=True).stdout.strip()
    return result


def main():
    details = json.loads(docker("inspect", CONTAINER, capture_output=True, text=True).stdout)[0]
    assert details["Config"]["Labels"].get("plunode.scope") == "issue75"
    config = json.loads((ROOT / ".local/issue75/runtime.json").read_text())
    tag = uuid.uuid4().hex[:16]
    database = "plunode_knowledge75_test_u5_" + tag
    restored = database + "_restore"
    output = ROOT / ".local/u5-submissions" / tag
    output.mkdir(parents=True, mode=0o700)
    created = []
    env = dict(os.environ, KNOWLEDGE_TEST_DATABASE_URL="postgresql://theme75:" + quote(config["password"], safe="") + "@127.0.0.1:55475/" + database)
    env["PATH"] = str(ROOT / ".local/issue75") + ":" + env.get("PATH", "")
    node = str(ROOT / ".local/issue75/node")
    try:
        for name in [database, restored]:
            docker("exec", CONTAINER, "createdb", "-U", "theme75", name)
            created.append(name)
        subprocess.run([node, "node_modules/vitest/vitest.mjs", "run", "tests/knowledge-submissions.test.ts", "--maxWorkers", "1", "--reporter", "dot"], cwd=ROOT, env=env, check=True, timeout=180)
        before = fingerprints(database)
        dump = output / "submission-test.dump"
        with dump.open("xb") as file:
            docker("exec", CONTAINER, "pg_dump", "-U", "theme75", "-d", database, "--format=custom", "--no-owner", "--no-acl", stdout=file)
        dump.chmod(0o600)
        with dump.open("rb") as file:
            docker("exec", "-i", CONTAINER, "pg_restore", "-U", "theme75", "-d", restored, "--no-owner", "--no-acl", "--exit-on-error", stdin=file)
        assert before == fingerprints(restored), "Restored table fingerprints differ"
        env["KNOWLEDGE_TEST_DATABASE_URL"] = env["KNOWLEDGE_TEST_DATABASE_URL"].rsplit("/", 1)[0] + "/" + restored
        code = "import {Pool} from 'pg';import {migrateKnowledgeSubmissions} from './lib/server/knowledge-submissions.ts'; const p=new Pool({connectionString:process.env.KNOWLEDGE_TEST_DATABASE_URL});try{if((await migrateKnowledgeSubmissions(p)).applied)throw Error('Migration reapplied');}finally{await p.end();}"
        subprocess.run([node, "--import", "tsx", "--input-type=module", "-e", code], cwd=ROOT, env=env, check=True, timeout=60)
        assert before == fingerprints(restored), "Reapplication changed restored data"
        (output / "result.json").write_text(json.dumps({"tests": 11, "tables": len(before), "restored": True, "reappliedUnchanged": True, "fingerprints": before}, indent=2))
        print(json.dumps({"result": "ok", "tables": len(before), "backup": str(output)}))
    finally:
        for name in reversed(created):
            assert name.startswith("plunode_knowledge75_test_u5_") and name.replace("_", "").isalnum()
            docker("exec", CONTAINER, "dropdb", "-U", "theme75", name)


if __name__ == "__main__":
    main()
