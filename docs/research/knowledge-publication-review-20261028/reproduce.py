#!/usr/bin/env python3
"""Small isolated probes for the design review. No network, DB, approval or deployed-state writes."""
import argparse, collections, copy, hashlib, io, json, os, re, subprocess, tarfile, tempfile, time
from pathlib import Path
BASE="129c1eb411cece336cce02996c520f8f21b12f0a"
OLD="973c7b0c599f79905a029b28b524f4924e169376"
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def read(p): return json.loads(p.read_text())
def wire(x): return json.dumps(x,ensure_ascii=False,indent=2)+"\n"
def canonical(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)
def digest(x): return hashlib.sha256(canonical(x).encode()).hexdigest()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args): return subprocess.check_output(["git","-C",str(ROOT),*args])
def snapshot(ref,target):
    target.mkdir()
    data=git("archive",ref,"lib","vocabulary","package.json")
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for member in archive:
            dest=target/member.name
            assert dest.resolve().is_relative_to(target.resolve())
            if member.isdir():dest.mkdir(parents=True,exist_ok=True)
            else:
                assert member.isfile()
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(archive.extractfile(member).read())
def extend_ids(root,ids):
    p=root/"lib/domain/contribution.ts"
    body=p.read_text()
    body,n=re.subn(r'export const CONTRIBUTION_ROLE_IDS = .*? as const;', 'export const CONTRIBUTION_ROLE_IDS = '+json.dumps(ids)+' as const;',body,count=1)
    assert n==1;p.write_text(body)
def coverage():
    folder=ROOT/"docs/research/film-discovery-pilot-20261026"
    candidates=read(folder/"CANDIDATES.json");prior=read(ROOT/"docs/research/film-release-20261027/ASTRA_RESEARCH_COVERAGE.json")
    records=candidates["candidates"]; all_ids={r["id"] for r in records}
    assert len(records)==len(all_ids)==124
    adopted={r["researchCandidateId"]:r for r in prior["records"] if r["formalClaimId"]}
    assert len(adopted)==2
    published=read(ROOT/"docs/research/film-release-20261027/publication-completed/root-status.json")
    # Completion provenance is separate from the historical pre-publication coverage ledger.
    assert published["phase"]=="completed"
    def lane(c):
        if c["id"] in adopted:return "already-published"
        if c["state"]!="checked-source-candidate":return c["state"]
        r=c["research_role"] or c["relation"]
        if r in ("DIRECTING","CAST"):return "A-known-role-evidence-review"
        if r in ("SCREENWRITING","PRODUCING"):return "B-existing-role-mapping-review"
        if r in ("MUSIC","CINEMATOGRAPHY"):return "C-new-role-semantic-review"
        return "D-new-relation-structure-review"
    groups=collections.defaultdict(list)
    for c in records:groups[lane(c)].append(c)
    assert {k:len(v) for k,v in groups.items()}=={"already-published":2,
        "A-known-role-evidence-review":37,"B-existing-role-mapping-review":26,"C-new-role-semantic-review":12,
        "D-new-relation-structure-review":4,"structured-only-candidate":37,"held":6}
    mapped={r["researchQid"]:r["formalUuid"] for r in prior["entities"] if r["formalUuid"]}
    assert len(mapped)==3 and len(candidates["entities"])==97
    plan=[]; summaries={}; batches=[]
    for name, rows in sorted(groups.items()):
        endpoint={c[k] for c in rows for k in ("subject","object")}
        summaries[name]={"records":len(rows),"endpointCandidates":len(endpoint),"unmappedEndpoints":len(endpoint-set(mapped)),
            "noTranscribedRoleHeading":sum(not any(x.get("original_role_heading") for x in c["citations"]) for c in rows)}
        for c in rows:
            plan.append({"researchCandidateId":c["id"],"researchState":c["state"],"researchRoleOrRelation":c["research_role"] or c["relation"],
                "lane":name,"subjectQid":c["subject"],"objectQid":c["object"],"sourceIds":[x["source_id"] for x in c["citations"]],
                "hasTranscribedRoleHeading":any(x.get("original_role_heading") for x in c["citations"]),
                "formalClaimId":adopted.get(c["id"],{}).get("formalClaimId"),
                "newAcceptanceAuthorized":False})
        if name.startswith(("A-","B-","C-","D-")):
            ordered=sorted(rows,key=lambda c:c["id"])
            for i in range(0,len(ordered),20):
                subset=ordered[i:i+20]; endpoints=sorted({c[k] for c in subset for k in ("subject","object")})
                sources=sorted({x["source_id"] for c in subset for x in c["citations"]})
                batches.append({"id":name[:1]+str(i//20+1),"authority":"review-planning-only-not-acceptance",
                    "candidateIds":[c["id"] for c in subset],"endpointQids":endpoints,"sourceIds":sources,
                    "alreadyMappedEntities":{q:mapped[q] for q in endpoints if q in mapped}})
    ids=[x for b in batches for x in b["candidateIds"]]
    assert len(ids)==len(set(ids))==79
    entities=[{"researchQid":e["id"],"kind":e["kind"],"formalUuid":mapped.get(e["id"]),
               "usedByCandidateIds":[c["id"] for c in records if e["id"] in (c["subject"],c["object"])]} for e in candidates["entities"]]
    assert len([e for e in entities if e["formalUuid"] is None])==94
    assert len({e["researchQid"] for e in entities})==97
    return {"authority":"derived-review-coverage-not-new-formal-acceptance","sourceCandidateSha256":sha(folder/"CANDIDATES.json"),
        "historicalCoverageSha256":sha(ROOT/"docs/research/film-release-20261027/ASTRA_RESEARCH_COVERAGE.json"),
        "publishedRevision":published["publishedRevision"],"groups":summaries,"reviewBatches":batches,
        "records":sorted(plan,key=lambda x:x["researchCandidateId"]),"entities":entities,
        "limits":["Research heading/person correspondence is not a verbatim per-person credit excerpt.",
          "Lanes are future review work, not semantic acceptance or role mappings.",
          "79 checked pending + 37 structured-only + 6 held + 2 published = 124; 94 unmapped + 3 mapped = 97.",
          "Historical coverage.productionPublished=false is preserved as historical; this derived view cites completion evidence."]}
def binding_probe():
    def envelope(rows,roles):
        return {"format":"isolated-semantic-binding-proposal/0","records":rows,"requiredRoleDefinitionHashes":roles,
                "approvalPurpose":"proposal-only-no-approval","identityDecisions":[],"unselectedIds":["held-1"]}
    first={"id":"synthetic-1","subject":"synthetic-person","object":"synthetic-work","role":"ACTING","scope":None,"period":None,
           "source":"synthetic-source","citation":{"locator":"synthetic credit","bytesSha256":"a"*64}}
    second={**first,"id":"synthetic-2","role":"DIRECTING"}
    packet=envelope([first,second],{"ACTING":"b"*64,"DIRECTING":"c"*64}); h=digest(packet)
    changed=copy.deepcopy(packet);changed["records"][0]["citation"]["locator"]="changed";assert digest(changed)!=h
    changed=copy.deepcopy(packet);changed["records"]=changed["records"][:1];assert digest(changed)!=h
    changed=copy.deepcopy(packet);changed["requiredRoleDefinitionHashes"]["ACTING"]="d"*64;assert digest(changed)!=h
    changed=copy.deepcopy(packet);changed["identityDecisions"]=[{"from":"synthetic-person","to":"another-person"}];assert digest(changed)!=h
    # Technical attestations are separate and must be recomputed, never inferred from a semantic digest.
    proof={"semanticDigest":h,"base":"b0","receiptSet":"r0","executor":"e0","passed":True}
    def usable(p,state): return p["passed"] and all(p[k]==state[k] for k in ("base","receiptSet","executor"))
    assert usable(proof,proof)
    for key in ("base","receiptSet","executor"):
        assert not usable(proof,{**proof,key:"changed"})
    samples=[]
    for n in (79,1000):
        durations=[]
        for _ in range(5):
            start=time.perf_counter()
            rows=[{**first,"id":"synthetic-"+str(i),"subject":"synthetic-person-"+str(i%97),"role":("ACTING","DIRECTING")[i%2]} for i in range(n)]
            packets=[envelope(rows[i:i+20],{"ACTING":"b"*64,"DIRECTING":"c"*64}) for i in range(0,n,20)]
            hashes=[digest(p) for p in packets]
            assert sum(len(p["records"]) for p in packets)==n and len(set(hashes))==len(hashes)
            durations.append((time.perf_counter()-start)*1000)
        samples.append({"syntheticRecords":n,"packetSize":20,"packets":len(packets),"milliseconds":durations})
    return {"authority":"synthetic-binding-and-bookkeeping-only","checks":{"evidenceEditInvalidates":True,
        "selectionShrinkInvalidates":True,"roleDefinitionEditInvalidates":True,"identityEditInvalidates":True,
        "baseReceiptExecutorChangeRequiresNewTechnicalProof":True},
        "samples":samples,"limits":["Not a human review benchmark, database load test, publication throughput test or formal approval schema.",
          "A stable semantic digest alone never authorizes acceptance/apply; identity/conflicts and fresh signed live plan remain mandatory."]}
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--artifact",type=Path,required=True,help="Saved published release directory; read-only")
    ap.add_argument("--dependencies",type=Path,required=True,help="Existing node_modules directory; read-only")
    ap.add_argument("--node",type=Path,required=True)
    ap.add_argument("--output",type=Path,default=HERE/"results")
    args=ap.parse_args(); output=args.output.resolve()
    assert output.is_relative_to(HERE.resolve()),"Output must stay in this isolated review directory"
    assert args.artifact.resolve().is_dir() and args.dependencies.resolve().is_dir()
    output.mkdir(exist_ok=True)
    before={p.name:sha(p) for p in args.artifact.glob("*.json")}
    with tempfile.TemporaryDirectory(prefix=".probe-",dir=HERE) as temporary:
        tmp=Path(temporary);(tmp/"node_modules").symlink_to(args.dependencies.resolve(),target_is_directory=True)
        for ref,name in [(OLD,"old"),(BASE,"current"),(OLD,"extended"),(BASE,"generated")]:snapshot(ref,tmp/name)
        catalog=read(tmp/"current/vocabulary/contribution-roles/catalog.json")
        ids=[x["id"] for x in catalog["entries"]]
        assert len(ids)==10
        extend_ids(tmp/"extended",ids)
        extend_ids(tmp/"generated",ids+["PILOT_SYNTHETIC_ROLE"])
        labels=tmp/"generated/lib/i18n/contribution.ts";body=labels.read_text()
        for language,synthetic in [("ja","合成試験Role"),("en","Synthetic test role")]:
            match=re.search(r'const '+language+r'(?:\: typeof ja)? = \{\s*roles: \{([^}]+)\}',body)
            assert match
            existing_labels=dict(re.findall(r'(\w+): "([^"]*)"',match[1]))
            values={x["id"]:x["translations"].get(language,{}).get("label",existing_labels[x["id"]]) for x in catalog["entries"]}
            values["PILOT_SYNTHETIC_ROLE"]=synthetic
            pattern=r'(const '+language+r'(?:\: typeof ja)? = \{\s*)roles: \{[^}]+\}'
            body,n=re.subn(pattern,lambda m:m[1]+"roles: "+json.dumps(values,ensure_ascii=False),body,count=1)
            assert n==1
        labels.write_text(body)
        hashes=tmp/"python-hashes.json";hashes.write_text(wire({"canonicalDataSha256":digest(read(args.artifact/"data.json"))}))
        probe=tmp/"runtime-probe.ts";probe.write_text((HERE/"runtime-probe.ts").read_text())
        env={**os.environ,"TSX_DISABLE_CACHE":"1"}
        cmd=[str(args.node),"--import",str(args.dependencies/"tsx/dist/loader.mjs"),str(probe),str(tmp/"current"),
             str(tmp/"old"),str(tmp/"extended"),str(tmp/"generated"),str(args.artifact.resolve()),str(hashes)]
        result=subprocess.run(cmd,cwd=tmp,capture_output=True,text=True,env=env,timeout=60)
        if result.returncode: raise RuntimeError(result.stderr[:6000])
        runtime=json.loads(result.stdout)
    assert before=={p.name:sha(p) for p in args.artifact.glob("*.json")},"Input artifact changed"
    summary={"sourceCommit":BASE,"oldWorkerSourceCommit":OLD,"node":subprocess.check_output([str(args.node),"--version"],text=True).strip(),
       "inputArtifactFiles":before,"runtime":runtime,"binding":binding_probe(),
       "noDatabaseOrNetworkCalls":True,"noFormalAcceptanceOrDeployment":True}
    (output/"probes.json").write_text(wire(summary))
    (output/"coverage-plan.json").write_text(wire(coverage()))
    print(wire({"written":["probes.json","coverage-plan.json"],"sourceCommit":BASE,"oldWorkerSchemaRejected":not runtime["oldFixedWorkerSchema"]["accepted"],
               "allAssertionsPassed":True,"newFormalAcceptances":0}))
if __name__=="__main__":main()
