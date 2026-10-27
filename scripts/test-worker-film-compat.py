#!/usr/bin/env python3
"""Isolated real Worker workflow probe. Never installs Worker, uses network, accepts or applies."""
import argparse,copy,hashlib,importlib.util,io,json,os,shutil,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
INSTALLED=Path("/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020")
OLD="973c7b0c599f79905a029b28b524f4924e169376"
CANDIDATE="089ee51922d68b03f2e8a9029a3811babfc3dc67"
JOB="issue-49-dot-hara-souten-20261027-r0001-71d22e5d1577c85e"
NODE=Path("/home/isinxnisi/.nvm/versions/node/v24.15.0/bin/node")
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n")
def module(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output",type=Path,default=ROOT/".local/film-worker-compat")
    args=ap.parse_args();home=args.output.resolve()
    assert home.is_relative_to((ROOT/".local").resolve()) and not home.exists(),"New isolated output under this worktree required"
    home.mkdir(parents=True);runtime=home/"runtime";runtime.mkdir()
    original={p:sha(INSTALLED/"runtime"/p) for p in ["lib/domain/contribution.ts","lib/domain/role-vocabulary.ts",
        "lib/i18n/contribution.ts","vocabulary/contribution-roles/catalog.json","vocabulary/contribution-roles/reviews.json"]}
    original["config.json"]=sha(INSTALLED/"config.json")
    receipt_hashes={str(p.relative_to(INSTALLED/"runtime")):sha(p) for p in (INSTALLED/"runtime/datasets/manga-collection").glob("accepted-*/acceptance.json")}
    data=subprocess.check_output(["git","-C",str(ROOT),"archive",CANDIDATE])
    with tarfile.open(fileobj=io.BytesIO(data)) as ar:
        for member in ar:
            target=runtime/member.name;assert target.resolve().is_relative_to(runtime)
            assert member.isdir() or member.isfile()
            if member.isdir():target.mkdir(parents=True,exist_ok=True)
            else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(ar.extractfile(member).read())
    shutil.copytree(INSTALLED/"runtime/datasets",runtime/"datasets",dirs_exist_ok=True)
    # Some historical receipt references are in docs or frozen jobs. Copy data only, no env/credentials.
    shutil.copytree(INSTALLED/"runtime/docs",runtime/"docs",dirs_exist_ok=True)
    shutil.copytree(INSTALLED/"runtime/.local/collection-jobs",runtime/".local/collection-jobs")
    if (INSTALLED/"runtime/.local/acceptance-sequences").exists():
        shutil.copytree(INSTALLED/"runtime/.local/acceptance-sequences",runtime/".local/acceptance-sequences")
    (runtime/"node_modules").symlink_to((INSTALLED/"runtime/node_modules").resolve(),target_is_directory=True)
    env={**os.environ,"PATH":str(NODE.parent)+":/usr/local/bin:/usr/bin:/bin","TSX_DISABLE_CACHE":"1","PYTHONDONTWRITEBYTECODE":"1"}
    def run(argv):
        r=subprocess.run([str(x) for x in argv],cwd=runtime,env=env,capture_output=True,text=True,timeout=150)
        if r.returncode:raise RuntimeError((r.stderr or r.stdout)[-9000:])
        return json.loads(r.stdout)
    release=runtime/"datasets/public-kg/releases/publication-film-initial-20261027"
    run([NODE,"--import","tsx","scripts/public-kg.ts","validate",release])
    backup=home/"ISOLATED-public-backup.json"
    js="""const fs=require('node:fs');const {randomUUID}=require('node:crypto');const {publicGraph,publicGraphDigest}=require('./lib/server/public-graph.ts');const {validatePublicBackup}=require('./lib/server/public-backup.ts');const {sha256,stableJson}=require('./lib/server/public-dataset.ts');
const d=process.argv[1],f=JSON.parse(fs.readFileSync(d+'/data.json')),m=JSON.parse(fs.readFileSync(d+'/manifest.json')),g=publicGraph(f,m.withdrawals??[]);
const payload={version:1,dataset:'public-kg',savedAt:'2026-10-28T00:00:00Z',release:m.release,revision:'ISOLATED-film-cumulative',graphDigest:publicGraphDigest(g),fixture:f,withdrawals:m.withdrawals??[],receipts:[{id:m.release,digest:sha256(stableJson(m)),dataSha256:m.dataSha256,reason:'ISOLATED projection; not production DB backup',appliedAt:'2026-10-28T00:00:00Z'}],externalNodeIds:Object.fromEntries(Object.entries(g.nodes).filter(([k,v])=>v.label==='ExternalIdentifier').map(([k])=>[k,randomUUID()]))};
const b=validatePublicBackup({payload,checksum:sha256(stableJson(payload))});fs.writeFileSync(process.argv[2],JSON.stringify(b));console.log(JSON.stringify({valid:true}));"""
    run([NODE,"--import","tsx","-e",js,release,backup])
    order=json.loads((runtime/".local/collection-jobs"/JOB/"work-order.json").read_text())
    theme=order["theme"]
    cmd=["python3","scripts/collection-workflow.py","--reviews",home/"reviews","collect-review",theme["id"],
        "--revision",str(theme["revision"]),"--definition-sha",order["definitionSha256"],"--public-backup",backup]
    first=run(cmd);second=run(cmd)
    assert first["transportAttemptsAdded"]==second["transportAttemptsAdded"]==0
    assert second["collectionUnchanged"] and second["reviewUnchanged"]
    review=Path(first["reviewDirectory"])
    decision=home/"ISOLATED-decision-draft.json"
    run(["python3","scripts/collection-workflow.py","decision-template","--review",review,"--decision-id","isolated-film-base-manga",
         "--release","isolated-film-base-manga","--output",decision])
    # Use the same core selection/merge and real CLI validators, without an approved decision or receipt.
    w=module("worker_compat_workflow",runtime/"scripts/collection-workflow.py")
    a=module("worker_compat_acceptance",runtime/"scripts/collection-acceptance.py")
    w.ROOT=runtime;w.CODE_ROOT=runtime
    realnode=w.node
    def node(args):
        return run([NODE,"--import","tsx",*args])
    w.node=node
    from types import SimpleNamespace
    ns=SimpleNamespace(**vars(w))
    context,request,indexed,refs=a.bundle(review,ns)
    d=json.loads(decision.read_text());assert d["status"]=="draft-not-approved"
    selected=a.selection(d["acceptedRecordIds"],indexed,ns)
    public,observed=w.public_snapshot(backup)
    prior,receipts,priorrefs,pm=a.prior_accepted(context,ns)
    fixture,reused=a.merge(public,prior,selected,ns)
    out=home/"unaccepted-plan-only";out.mkdir()
    # Existing schema serialization, no gate relaxation or receipt edits.
    source=home/"unaccepted-fixture.json";save(source,fixture)
    normalized=run([NODE,"--import","tsx","-e","const fs=require('node:fs');const {fixtureV4Schema}=require('./lib/domain/fixture.ts');const f=fixtureV4Schema.parse(JSON.parse(fs.readFileSync(process.argv[1])));console.log(JSON.stringify({data:JSON.stringify(f,null,2)+'\\n'}));",source])["data"]
    (out/"data.json").write_text(normalized)
    manifest=json.loads((release/"manifest.json").read_text())
    manifest.update(release="isolated-film-base-manga",baseRelease=observed["release"],dataSha256=sha(out/"data.json"),reason="ISOLATED UNACCEPTED technical plan only")
    oldids={c["id"] for c in public["claims"]}
    manifest["claimOrigins"] += [{"claimId":c["id"],"dataset":"isolated-unaccepted","sourceClaimId":c["id"]} for c in fixture["claims"] if c["id"] not in oldids]
    save(out/"manifest.json",manifest)
    validation=run([NODE,"--import","tsx","scripts/public-kg.ts","validate",out])
    plan_js = """const fs=require('node:fs');const {validatePublicBackup}=require('./lib/server/public-backup.ts');const {loadPublicRelease}=require('./lib/server/public-dataset.ts');const {publicGraph,planPublicGraph}=require('./lib/server/public-graph.ts');const {graphIdentities,mergeIdentities}=require('./lib/server/public-identities.ts');
(async()=>{const b=validatePublicBackup(JSON.parse(fs.readFileSync(process.argv[1]))),r=await loadPublicRelease(process.argv[2]);if(b.payload.revision!==process.argv[3]||b.payload.release!==r.manifest.baseRelease)throw Error('Backup revision/base differs');if(b.payload.receipts.some(x=>x.id===r.manifest.release))throw Error('Used release');const g=publicGraph(r.fixture,r.manifest.withdrawals);mergeIdentities(b.payload.identities??[],graphIdentities(g));const p=planPublicGraph(publicGraph(b.payload.fixture,b.payload.withdrawals),g);if(p.updated.length)throw Error('Existing updates');console.log(JSON.stringify(p));})();"""
    plan=run([NODE,"--import","tsx","-e",plan_js,backup,out,observed["revision"]])
    assert not plan["updated"]
    oldbase=runtime/"datasets/public-kg/releases/20261014-credits-001"
    oldvalidation=run([NODE,"--import","tsx","scripts/public-kg.ts","validate",oldbase])
    # Old source rejection is captured with this exact saved artifact and current dependencies.
    oldmodule=runtime/"lib/domain/contribution.ts";newbytes=oldmodule.read_bytes()
    try:
        oldmodule.write_bytes(subprocess.check_output(["git","-C",str(ROOT),"show",OLD+":lib/domain/contribution.ts"]))
        # role-vocabulary imports the added constant; use fixture parser directly for the negative case.
        negative=run([NODE,"--import","tsx","-e","const fs=require('node:fs');try{require('./lib/domain/fixture.ts').validateFixture(JSON.parse(fs.readFileSync(process.argv[1])));console.log(JSON.stringify({accepted:true}));}catch(e){console.log(JSON.stringify({accepted:false,paths:e.issues?.map(i=>i.path)}));}",release/"data.json"])
        assert negative=={"accepted":False,"paths":[["claims",370,"contribution","roleId"],["claims",536,"contribution","roleId"]]}
    finally:oldmodule.write_bytes(newbytes)
    guard=run([NODE,"--import","tsx","-e","const assert=require('node:assert/strict');const c=require('./lib/domain/contribution.ts');for(const id of c.ADOPTED_CONTRIBUTION_ROLE_IDS){for(const scope of [null,{kind:'publication',isbn13:'9784091860019',volumeLabel:null,editionLabel:null,language:'ja'}])assert(c.contributionSchema.safeParse({roleId:id,scope}).success)}assert(!c.roleIdSchema.safeParse('UNKNOWN_ROLE').success);assert(!c.contributionSchema.safeParse({roleId:'ACTING',scope:{kind:'film-cut',cut:'x'}}).success);console.log(JSON.stringify({oldEightNullAndIsbn:true,unknownRoleRejected:true,unknownScopeRejected:true}));"])
    assert all(sha(INSTALLED/"runtime"/p)==h for p,h in original.items() if p!="config.json")
    assert sha(INSTALLED/"config.json")==original["config.json"]
    assert receipt_hashes=={str(p.relative_to(INSTALLED/"runtime")):sha(p) for p in (INSTALLED/"runtime/datasets/manga-collection").glob("accepted-*/acceptance.json")}
    after={str(p.relative_to(runtime)):sha(p) for p in (runtime/"datasets/manga-collection").glob("accepted-*/acceptance.json")}
    assert after==receipt_hashes,"No test may create a formal receipt"
    film_receipts=[p for p in receipts if json.loads(p.read_text()).get("sourceReviewKind")=="film-discovery-v1"]
    assert len(film_receipts)==1
    assert set(json.loads(film_receipts[0].read_text())["acceptedRecordIds"]["claims"])=={"34b41d23-f4e6-4fc6-aa6f-2905f3c2a890","4c88b8e8-154d-47ad-bf82-f19876ecaebd"}
    preserved={}
    for name,key in [("catalog.json","entries"),("reviews.json",None)]:
        old=json.loads((INSTALLED/"runtime/vocabulary/contribution-roles"/name).read_text())
        new=json.loads((runtime/"vocabulary/contribution-roles"/name).read_text())
        before=old[key] if key else old;after=new[key] if key else new
        assert all(value in after for value in before)
        preserved[name]=True
    result={"authority":"isolated-real-workflow-not-formal-acceptance","candidateCommit":subprocess.check_output(["git","-C",str(ROOT),"rev-parse",CANDIDATE],text=True).strip(),
        "jobId":JOB,"recipeBase":json.loads((runtime/theme["execution"]["inputs"][0]["file"]).read_text())["baseRelease"],
        "comparisonBase":observed["release"],"receiptCount":len(receipts),"savedFilmReceiptIncluded":True,"oldVocabularyAndReviewsPreserved":preserved,"oldSchemaNegative":negative,
        "firstReview":first,"repeatReview":second,"decisionStatus":d["status"],"selectedCounts":{f:len(selected[f]) for f in w.FIELDS},
        "technicalValidation":validation,"plan":plan,"oldBaseValidation":oldvalidation,"guards":guard,
        "newFormalReceipts":0,"publicApply":False,"installedCodeConfigAndReceiptsUnchanged":True,
        "limits":["The backup is an isolated projection of a saved published artifact, not a fresh production DB backup.","Collector replay uses the original completed job and approval with zero network attempts.","No installed Worker tick, formal acceptance, database plan/apply, or production deployment was performed."]}
    save(home/"result.json",result)
    print(json.dumps({"result":str(home/"result.json"),"selectedCounts":result["selectedCounts"],"receiptCount":len(receipts),"passed":True}))
if __name__=="__main__":main()
