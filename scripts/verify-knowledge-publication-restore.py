#!/usr/bin/env python3
"""Restore the U2-before backup into a disposable DB and verify additive migration.

Never resets or restores over plunode_theme75. The original dump, existing DBs,
container and volume are retained. Run while the normal Autopilot hold is held.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = "plunode-issue75-postgres"
PREFIX = "plunode_knowledge75_test_u2restore_"
EXPECTED_001 = "efa53919c3529edb48b5ae1ef5ffb10b77716a81773a42af8be404f02fe87e69"

def run(args, *, data=None, env=None):
    value = subprocess.run(args, input=data, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, cwd=ROOT, env=env)
    if value.returncode:
        # The database URL and passwords are deliberately absent from diagnostics.
        raise RuntimeError(f"Command failed ({value.returncode}): {args[0]} {args[1] if len(args)>1 else ''}")
    return value.stdout

def sql(db, statement):
    assert db.startswith(PREFIX) and re.fullmatch(r"[a-z0-9_]+", db)
    return run(["docker", "exec", CONTAINER, "psql", "-X", "-q", "-t", "-A",
                "-v", "ON_ERROR_STOP=1", "-U", "theme75", "-d", db, "-c", statement]).decode().strip()

def ident(value):
    return '"' + value.replace('"', '""') + '"'

def fingerprint(db):
    tables = json.loads(sql(db, "SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('theme75','knowledge75') ORDER BY schemaname,tablename) x"))
    result = {}
    for table in tables:
        name = table["schemaname"] + "." + table["tablename"]
        value = sql(db, "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM " + ident(table["schemaname"]) + "." + ident(table["tablename"]) + " t")
        result[name] = {"rows": len(json.loads(value)), "sha256": hashlib.sha256(value.encode()).hexdigest()}
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, default=ROOT/".local/issue75/u2-before.dump")
    parser.add_argument("--output", type=Path, default=ROOT/"docs/research/issue75-foundation/u2-restore-results.json")
    args = parser.parse_args()
    backup = args.backup.resolve(strict=True)
    assert backup.is_file(), "Backup must be a file"
    runtime = ROOT/".local/issue75/runtime.json"
    assert runtime.exists(), "Existing dedicated runtime configuration is required"
    spec = importlib.util.spec_from_file_location("issue75_preview_restore_config", ROOT/"scripts/issue75-preview.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cfg, env = module.configuration()
    container = json.loads(run(["docker", "inspect", CONTAINER]))[0]
    assert container["Config"]["Labels"].get("plunode.scope") == "issue75", "Container ownership mismatch"
    assert any(m.get("Name") == "plunode-issue75-data" for m in container["Mounts"]), "Volume mismatch"
    assert container["HostConfig"]["PortBindings"].get("5432/tcp") == [{"HostIp":"127.0.0.1","HostPort":"55475"}], "Port binding mismatch"
    migration = ROOT/"migrations/knowledge-foundation/001-records.sql"
    assert hashlib.sha256(migration.read_bytes()).hexdigest() == EXPECTED_001, "Applied migration 001 changed"
    db = PREFIX + str(time.time_ns())
    node = module.NODE if module.NODE.exists() else Path("/tmp/graph-knowledge-node/bin/node")
    assert node.exists(), "Existing Node 24 runtime is required"
    env["KNOWLEDGE_TEST_DATABASE_URL"] = "postgresql://theme75:" + quote(cfg["password"], safe="") + "@127.0.0.1:55475/" + db
    started = datetime.now(timezone.utc).isoformat()
    report = {"schemaVersion":1,"startedAt":started,"backup":str(backup.relative_to(ROOT)) if backup.is_relative_to(ROOT) else str(backup),"backupSha256":hashlib.sha256(backup.read_bytes()).hexdigest(),"database":db,"sourceDatabaseModified":False,"existingDumpRetained":True,"migration001ExpectedSha256":EXPECTED_001}
    run(["docker","exec",CONTAINER,"createdb","-U","theme75",db])
    try:
        run(["docker","exec","-i",CONTAINER,"pg_restore","--no-owner","--no-privileges","--exit-on-error","-U","theme75","-d",db], data=backup.read_bytes())
        before = fingerprint(db)
        assert "theme75.state" in before, "The original Theme workbench state must be restored"
        assert not any(k.startswith("knowledge75.publication_") for k in before), "This must be the pre-U2 dump"
        ledger_001 = sql(db, "SELECT row_to_json(x)::text FROM (SELECT * FROM knowledge75.migrations WHERE name='001-records.sql') x")
        assert json.loads(ledger_001)["checksum"] == EXPECTED_001, "Restored ledger 001 mismatch"
        code = """import {Pool} from 'pg';
import {ensureKnowledgePublicationSchema} from './lib/server/knowledge-publication.ts';
const pool=new Pool({connectionString:process.env.KNOWLEDGE_TEST_DATABASE_URL});
try { const first=await ensureKnowledgePublicationSchema(pool); const second=await ensureKnowledgePublicationSchema(pool); console.log(JSON.stringify({first,second})); } finally {await pool.end();}
"""
        migrated = json.loads(run([str(node),"--import","tsx","--input-type=module","-e",code],env=env))
        assert migrated["first"]["applied"] is True and migrated["second"]["applied"] is False
        after = fingerprint(db)
        for name, old in before.items():
            if name != "knowledge75.migrations":
                assert after.get(name) == old, "Original rows changed: " + name
        assert sql(db, "SELECT row_to_json(x)::text FROM (SELECT * FROM knowledge75.migrations WHERE name='001-records.sql') x") == ledger_001, "Ledger 001 changed"
        expected_new = {"knowledge75.publication_generations", "knowledge75.publication_control", "knowledge75.publication_records", "knowledge75.publication_entities", "knowledge75.publication_seen_changes"}
        assert set(after)-set(before) == expected_new, "Unexpected schema additions"
        assert after["knowledge75.migrations"]["rows"] == before["knowledge75.migrations"]["rows"]+1
        assert sql(db, "SELECT coalesce(active_generation,'none') FROM knowledge75.publication_control WHERE singleton") == "none"
        assert all(after[name]["rows"] == (1 if name.endswith("publication_control") else 0) for name in expected_new)
        report.update({"result":"passed","originalTables":before,"afterMigrationTables":after,"originalRowsUnchanged":True,"theme75StateUnchanged":True,"migration001LedgerUnchanged":True,"migration002":migrated,"newTables":sorted(expected_new)})
    finally:
        # Only the exact database created above can be dropped; never a source DB.
        assert db.startswith(PREFIX) and re.fullmatch(r"[a-z0-9_]+",db)
        run(["docker","exec",CONTAINER,"dropdb","-U","theme75",db])
        report["temporaryDatabaseRemoved"] = True
    report["completedAt"] = datetime.now(timezone.utc).isoformat()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"result":report["result"],"originalTables":len(report["originalTables"]),"originalRowsUnchanged":True,"migration001LedgerUnchanged":True,"migration002AppliedThenRepeated":True,"temporaryDatabaseRemoved":True,"report":str(args.output.relative_to(ROOT)) if args.output.is_relative_to(ROOT) else str(args.output)},ensure_ascii=False))

if __name__ == "__main__":
    main()
