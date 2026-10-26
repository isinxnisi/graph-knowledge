"""Read-only offline observation for film review; never acceptance or public apply."""
import argparse
import copy
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

FIELDS = ("entities", "claims", "sources", "citations")
def digest_bytes(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(v): return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
def need(ok, message):
    if not ok: raise ValueError(message)

def freeze(backup, runtime):
    data = json.loads(backup.read_text())
    need(data["checksum"] == hashlib.sha256(canonical(data["payload"]).encode()).hexdigest(), "Backup checksum mismatch")
    rows = {f: {} for f in FIELDS}
    readset = {backup.resolve(): digest_bytes(backup)}
    refs = [{"file": "supplied-public-backup", "sha256": digest_bytes(backup)}]
    for field in FIELDS:
        for row in data["payload"]["fixture"][field]:
            rows[field][row["id"]] = {"record": row, "state": "published" if field != "claims" or row["visibility"] == "published" else "withdrawn", "provenance": "supplied-public-backup"}
    receipts = sorted((runtime / "datasets/manga-collection").glob("accepted-*/acceptance.json"))
    need(receipts, "Formal receipts must be explicitly supplied")
    for path in receipts:
        receipt = json.loads(path.read_text())
        need(receipt["status"] == "accepted-for-release-preparation-only" and receipt["reviewer"] and receipt["recordedAt"], "Not a formal receipt")
        ref_name = str(path.relative_to(runtime))
        readset[path.resolve()] = digest_bytes(path)
        refs.append({"file": ref_name, "sha256": digest_bytes(path)})
        bodies = []
        for ref in receipt["referenceArtifacts"]:
            source = (runtime / ref["file"]).resolve()
            need(source.is_relative_to(runtime.resolve()), "Receipt reference escapes runtime")
            need(source.is_file() and digest_bytes(source) == ref["sha256"], "Missing/changed receipt evidence: " + ref["file"])
            readset[source] = ref["sha256"]
            refs.append(ref)
            if source.suffix == ".json":
                body = json.loads(source.read_text())
                if isinstance(body, dict) and isinstance(body.get("records"), dict): bodies.append(body["records"])
        for field in FIELDS:
            for ident in receipt["acceptedRecordIds"][field]:
                options = [copy.deepcopy(r) for b in bodies for r in b.get(field, []) if r["id"] == ident]
                if field == "claims":
                    scope = next((s for s in receipt["scopeByClaim"] if s["id"] == ident), None)
                    options = [r for r in options if scope and all(r.get(k) == v for k, v in scope.items())]
                need(options, "Accepted ID not covered by hashed reviewed body: " + ident)
                for r in options:
                    for key, id_key in [("sourceEditorialChanges", "sourceId"), ("citationEditorialChanges", "citationId")]:
                        for change in receipt.get(key, []):
                            if change[id_key] == ident:
                                need(r["note"] == change["beforeNote"], "Editorial origin mismatch")
                                r["note"] = change["afterNote"]
                    if field == "claims": r["visibility"] = "published"
                need(all(canonical(r) == canonical(options[0]) for r in options), "Ambiguous accepted body")
                # Public/withdrawn observation takes precedence; receipt state never overwrites it.
                if ident not in rows[field]:
                    rows[field][ident] = {"record": options[0], "state": "formally-accepted-unapplied", "provenance": ref_name}
    need(receipts == sorted((runtime / "datasets/manga-collection").glob("accepted-*/acceptance.json")), "Formal receipt set changed during observation")
    need(all(digest_bytes(p) == expected for p, expected in readset.items()), "Comparison input changed during observation")
    return {"schemaVersion": 1, "authority": "frozen-offline-comparison-not-live-production", "public": {k: data["payload"][k] for k in ("release", "revision", "savedAt")}, "receiptCount": len(receipts), "references": sorted({(r["file"], r["sha256"]) for r in refs}), "records": {f: sorted(rows[f].values(), key=lambda x: x["record"]["id"]) for f in FIELDS}}

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--backup", type=Path, required=True)
    p.add_argument("--runtime", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    # The existing validator checks the schema, checksum and graph/history fingerprint.
    subprocess.run(["node", "--import", "tsx", "-e", "const fs=require('node:fs');const {validatePublicBackup}=require('./lib/server/public-backup.ts');validatePublicBackup(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));", str(args.backup.resolve())], cwd=Path(__file__).resolve().parents[1], check=True)
    value = freeze(args.backup, args.runtime)
    body = gzip.compress((json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode(), mtime=0)
    if args.output.exists(): need(args.output.read_bytes() == body, "Refusing to replace frozen comparison")
    else:
        with args.output.open("xb") as file: file.write(body)
    print(json.dumps({"receiptCount": value["receiptCount"], "counts": {f: len(r) for f, r in value["records"].items()}, "sha256": digest_bytes(args.output)}))
