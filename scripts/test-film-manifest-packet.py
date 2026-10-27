#!/usr/bin/env python3
"""Validate/plan the unsigned film manifest against an isolated backup. Never calls accept/apply."""
import argparse,hashlib,importlib.util,json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--recipe",type=Path,required=True);ap.add_argument("--trial",type=Path,required=True)
    ap.add_argument("--review",type=Path,required=True);ap.add_argument("--decision",type=Path,required=True)
    ap.add_argument("--backup",type=Path,required=True);ap.add_argument("--output",type=Path,required=True)
    ap.add_argument("--data-root",type=Path,default=ROOT)
    args=ap.parse_args();out=args.output.resolve()
    assert out.is_relative_to((ROOT/".local").resolve()) and not out.exists(),"New private plan directory required"
    out.mkdir(parents=True);w=load("film_packet_workflow",ROOT/"scripts/collection-workflow.py")
    f=load("film_packet_dispatch",ROOT/"scripts/collection-film.py")
    a=load("film_packet_core",ROOT/"scripts/collection-acceptance.py")
    from types import SimpleNamespace
    ns=SimpleNamespace(**vars(w))
    ns.ROOT=args.data_root.resolve()
    ctx,req,indexed,refs=f.bundle(args.review,ns)
    d=w.read(args.decision);assert d["status"]=="draft-not-approved"
    try:a.accept(SimpleNamespace(decision=args.decision,decision_sha=w.gate.file_hash(args.decision)),ns)
    except ValueError as e:assert "Explicit human approval" in str(e)
    else:raise AssertionError("An unsigned packet must never be accepted")
    material,comparison=f.material(args.recipe,args.trial,ns)
    source=w.read(args.backup)["payload"]
    if ctx.get("productionAcceptanceReady"):
        assert w.gate.file_hash(args.backup)==ctx["public"]["productionBackupSha256"]
    assert source["release"]==comparison["public"]["release"]
    known={**source["fixture"]}
    # The saved published artifact already contains every compared formal receipt.
    for field in w.FIELDS:
        assert {r["id"]:r for r in known[field]}=={r["record"]["id"]:r["record"] for r in comparison["records"][field]}
    fixture,reused=a.merge(known,{field:[] for field in w.FIELDS},material,ns)
    temp=out/"fixture.json";temp.write_text(w.dump(fixture))
    normalized=w.node(["-e","const fs=require('node:fs');const {fixtureV4Schema}=require('./lib/domain/fixture.ts');const f=fixtureV4Schema.parse(JSON.parse(fs.readFileSync(process.argv[1])));console.log(JSON.stringify({data:JSON.stringify(f,null,2)+'\\n'}));",str(temp)])["data"]
    (out/"data.json").write_text(normalized)
    manifest=w.read(ROOT/("datasets/public-kg/releases/"+source["release"]+"/manifest.json")) if (ROOT/("datasets/public-kg/releases/"+source["release"]+"/manifest.json")).exists() else w.read(Path(comparison["receiptDataRoot"])/("datasets/public-kg/releases/"+source["release"]+"/manifest.json"))
    manifest.update(release="isolated-unaccepted-film-manifest",baseRelease=source["release"],dataSha256=w.gate.file_hash(out/"data.json"),reason="ISOLATED UNACCEPTED technical plan only")
    before_ids={c["id"] for c in known["claims"]}
    manifest["claimOrigins"] += [{"claimId":c["id"],"dataset":"isolated-unaccepted","sourceClaimId":c["id"]} for c in material["claims"]]
    (out/"manifest.json").write_text(w.dump(manifest))
    validated=w.node(["scripts/public-kg.ts","validate",str(out)])
    plan=w.node(["scripts/publication-backup-plan.ts",str(args.backup),str(out),source["revision"]])
    assert not plan["updated"]
    assert not before_ids & {c["id"] for c in material["claims"]}
    original={c["id"]:c for c in known["claims"]}
    current={c["id"]:c for c in fixture["claims"]}
    assert all(current[i]==v for i,v in original.items())
    formal_receipts=list((Path(comparison["receiptDataRoot"])/"datasets/manga-collection").glob("accepted-*/acceptance.json"))
    result={"authority":"isolated-unsigned-manifest-plan-not-acceptance","claimCount":len(material["claims"]),
        "recordCounts":{field:len(material[field]) for field in w.FIELDS},"validation":validated,
        "planCounts":{"added":len(plan["added"]),"updated":len(plan["updated"]),"relationshipsAdded":plan["relationshipsAdded"]},
        "draftRejectedByAcceptanceCore":True,"allPublishedClaimsUnchanged":True,"publishedFilmClaimsReaccepted":0,
        "formalReceiptCount":len(formal_receipts),"newFormalReceipts":0,"databaseConnections":0,"publicApply":False,
        "productionBackupBound":bool(ctx.get("productionAcceptanceReady")),
        "limits":(["A fresh validated production export and all receipts supply identities. The merged candidate remains isolated and unsigned.",
                    "No live DB/VPS apply plan was executed; explicit fixed human decisions and revalidation remain required."]
                  if ctx.get("productionAcceptanceReady") else
                  ["An isolated projection supplies graph identities; this is not a current production DB backup/live VPS plan.",
                   "The review still requires a current authoritative backup and explicit human decisions before formal acceptance."])}
    (out/"result.json").write_text(w.dump(result))
    print(w.dump(result))
if __name__=="__main__":main()
