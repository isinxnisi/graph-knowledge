"""Read-only: reconcile delivered public release, live metadata and all formal receipts.
This is a fixed released-fixture observation, not a fresh database backup.
Formal acceptance must obtain an authoritative fresh backup again.
"""
import argparse, gzip, hashlib, importlib.util, json, subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def need(v, msg):
    if not v: raise ValueError(msg)
def metadata():
    with urlopen(Request("https://plunode.net/api/dataset", headers={"User-Agent":"Mozilla/5.0","Accept":"application/json"}),timeout=20) as r:
        need(r.status == 200, "Public metadata unavailable"); return json.load(r)
def refresh(base_backup, runtime, delivery):
    before = metadata()
    original = load("film_freeze", ROOT/"scripts/freeze-film-comparison.py").freeze(base_backup, runtime)
    job = json.loads(delivery.read_text()); result = job["publicationResult"]
    need(result["publishedRevision"] == before["revision"] and result["release"] == job["request"]["release"], "Delivered revision is no longer current")
    release = runtime/"datasets/public-kg/releases"/result["release"]
    manifest, fixture = [json.loads((release/f).read_text()) for f in ["manifest.json","data.json"]]
    need(sha(release/"data.json") == manifest["dataSha256"], "Released fixture hash differs")
    subprocess.run(["node","--import","tsx","scripts/public-kg.ts","validate",str(release)],cwd=ROOT,check=True,capture_output=True)
    refs = {delivery: sha(delivery), **{release/f:sha(release/f) for f in ["manifest.json","data.json"]}}
    for field in original["records"]:
        merged = {r["record"]["id"]:r for r in original["records"][field]}
        for row in fixture[field]:
            previous = merged.get(row["id"])
            need(not previous or previous["record"] == row, "Released UUID content changed; explicit reconciliation required: "+row["id"])
            merged[row["id"]] = {"record":row,"state":"withdrawn" if field=="claims" and row["visibility"]=="hidden" else "published","provenance":"verified-delivered-release"}
        original["records"][field] = sorted(merged.values(),key=lambda r:r["record"]["id"])
    original["public"] = {"release":result["release"],"revision":before["revision"],"savedAt":datetime.now(timezone.utc).isoformat()}
    original["receiptDataRoot"] = str(runtime.resolve())
    original["observation"] = "live-revision-plus-verified-delivered-fixture-and-formal-receipts-not-live-db-backup"
    original["liveMetadata"] = before
    original["references"] += [[str(p),v] for p,v in refs.items()]
    need(all(sha(p)==v for p,v in refs.items()) and metadata()==before, "Public revision or delivered inputs changed")
    return original
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for a in ["base-backup","runtime","delivery","output"]:p.add_argument("--"+a,type=Path,required=True)
    a=p.parse_args(); value=refresh(a.base_backup,a.runtime,a.delivery)
    with a.output.open("xb") as f:f.write(gzip.compress((json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode(),mtime=0))
    print(json.dumps({"public":value["public"],"receiptCount":value["receiptCount"],"counts":{f:len(v) for f,v in value["records"].items()},"sha256":sha(a.output)}))
