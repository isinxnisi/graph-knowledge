"""Isolated real film acceptance/validation/offline plan; synthetic approvals stay in temp roots."""
import argparse, copy, gzip, importlib.util, json, shutil, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
class FilmProduction(unittest.TestCase):
 def setUp(self):
    self.tmp = tempfile.TemporaryDirectory(prefix="ISOLATED-film-acceptance-")
    self.addCleanup(self.tmp.cleanup)
    self.code = Path(self.tmp.name) / "code"; self.code.mkdir()
    for folder in ["scripts", "lib", "vocabulary", "neo4j"]:
        shutil.copytree(ROOT / folder, self.code / folder, ignore=shutil.ignore_patterns("__pycache__"))
    for file in ["package.json", "package-lock.json", "tsconfig.json", "docs/research/film-beta-issue43/role-review-drafts.json"]:
        p = self.code / file; p.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ROOT / file, p)
    (self.code / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    recipe = json.loads((ROOT / "datasets/film-collection/issue43/recipe.json").read_text())
    for row in recipe["inputs"].values():
        p = self.code / row["file"]; p.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ROOT / row["file"], p)
    supplements = json.loads((ROOT / recipe["inputs"]["supplements"]["file"]).read_text())
    for credit in supplements["credits"]:
        file = credit["excerpt"]["file"]; p = self.code / file; p.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ROOT / file, p)
    self.w = load("isolated_film_workflow", self.code / "scripts/collection-workflow.py")
    w = self.w
    self.home = Path(self.tmp.name) / "worker"; self.root = self.home / "runtime"
    self.home.mkdir()
    self.fixture = w.read(ROOT / "datasets/public-kg/releases/20261011-001/data.json")
    self.fixture["schemaVersion"] = 4
    self.base = "isolated-film-base"
    base = self.root / "datasets/public-kg/releases" / self.base
    w.gate.save(base / "data.json", self.fixture)
    manifest = w.read(ROOT / "datasets/public-kg/releases/20261011-001/manifest.json")
    manifest.update(release=self.base, baseRelease=None, dataSha256=w.gate.file_hash(base / "data.json"))
    w.gate.save(base / "manifest.json", manifest)
    self.backup = self.home / "ISOLATED-backup.json"
    w.node(["-e", "const fs=require('node:fs'),{randomUUID}=require('node:crypto');"
      "const {fixtureV4Schema}=require('./lib/domain/fixture.ts');"
      "const {publicGraph,publicGraphDigest}=require('./lib/server/public-graph.ts');"
      "const {sha256,stableJson}=require('./lib/server/public-dataset.ts');"
      "const {validatePublicBackup}=require('./lib/server/public-backup.ts');"
      "const dir=process.argv[1],f=fixtureV4Schema.parse(JSON.parse(fs.readFileSync(dir+'/data.json'))),m=JSON.parse(fs.readFileSync(dir+'/manifest.json'));"
      "fs.writeFileSync(dir+'/data.json',JSON.stringify(f,null,2)+'\\n');m.dataSha256=sha256(fs.readFileSync(dir+'/data.json','utf8'));fs.writeFileSync(dir+'/manifest.json',JSON.stringify(m));"
      "const g=publicGraph(f,m.withdrawals);const payload={version:1,dataset:'public-kg',savedAt:'2026-10-20T00:00:00Z',"
      "release:m.release,revision:'ISOLATED-film-revision',graphDigest:publicGraphDigest(g),fixture:f,withdrawals:m.withdrawals??[],"
      "receipts:[{id:m.release,digest:sha256(stableJson(m)),dataSha256:m.dataSha256,reason:'ISOLATED TEST ONLY',appliedAt:'2026-10-20T00:00:00Z'}],"
      "externalNodeIds:Object.fromEntries(Object.entries(g.nodes).filter(([k,v])=>v.label==='ExternalIdentifier').map(([k])=>[k,randomUUID()]))};"
      "const b=validatePublicBackup({payload,checksum:sha256(stableJson(payload))});fs.writeFileSync(process.argv[2],JSON.stringify(b));console.log(JSON.stringify({valid:true}));",
      str(base), str(self.backup)])
    self.fixture = w.read(base / "data.json")
    comparison = {"schemaVersion":1,"authority":"frozen-offline-comparison-not-live-production",
      "public":{"release":self.base,"revision":"ISOLATED-film-revision","savedAt":"2026-10-20T00:00:00Z"},
      "receiptDataRoot":str(self.root),"receiptCount":0,
      "references":[["supplied-public-backup",w.gate.file_hash(self.backup)]],
      "records":{f:[{"record":r,"state":"published","provenance":"ISOLATED-test-backup"} for r in self.fixture[f]] for f in w.FIELDS}}
    comp = self.code / ".local/film/comparison.json.gz"; comp.parent.mkdir(parents=True)
    comp.write_bytes(gzip.compress(w.dump(comparison).encode()))
    recipe["inputs"]["comparison"]={"file":str(comp.relative_to(self.code)),"sha256":w.gate.file_hash(comp)}
    self.recipe=self.code / ".local/film/recipe.json";w.gate.save(self.recipe,recipe)
    self.review=self.root / "datasets/film-collection/ISOLATED/review"
    self.decision=self.root / "datasets/film-collection/ISOLATED/decision.json"
    # The test-only vocabulary approval is created in the disposable code copy.
    w.node(["-e", "const fs=require('node:fs');const {prepareFilmRoleDecision,registerFilmRoles}=require('./lib/domain/film-role-registration.ts');"
      "const p='vocabulary/contribution-roles/',read=f=>JSON.parse(fs.readFileSync(f));"
      "const c=read(p+'catalog.json'),b=read(p+'baseline-v1.json'),r=read(p+'reviews.json'),d=read(p+'film-pending.json'),t=read('docs/research/film-beta-issue43/role-review-drafts.json');"
      "const a={...prepareFilmRoleDecision(c,r,d,t),status:'approved',humanDecision:{actorType:'human',reviewer:'ISOLATED TEST ONLY',decidedAt:'2026-10-26T00:00:00Z',statement:'Synthetic test only'}};"
      "const n=registerFilmRoles(a,c,b,r,d,t);fs.writeFileSync(p+'catalog.json',JSON.stringify(n.catalog));fs.writeFileSync(p+'reviews.json',JSON.stringify(n.reviews));console.log(JSON.stringify({isolated:true}));"])
    w.gate.save(self.home / "config.json",{"home":str(self.home),"codeCommit":"ISOLATED","workerId":"ISOLATED"})
    w.gate.save(self.home / "state.json",{"executionControl":{}})
    self.metadata={"url":"https://example.test/api/dataset","httpStatus":200,"dataset":"public-kg","revision":"ISOLATED-film-revision"}
    real_load=w.load
    def modules(name,path):
        module=real_load(name,path)
        if Path(path).name=="collection-evidence.py": module.live_metadata=lambda origin,worker:copy.deepcopy(self.metadata)
        return module
    self.addCleanup(patch.stopall)
    patch.object(w,"load",side_effect=modules).start()
    real_run=subprocess.run
    def run(argv,*args,**kwargs):
        if len(argv)>2 and str(argv[1]).endswith("autopilot.py") and argv[2]=="assert-held":
            return subprocess.CompletedProcess(argv,0)
        return real_run(argv,*args,**kwargs)
    patch.object(subprocess,"run",side_effect=run).start()
 def options(self):
    return ["--data-root",str(self.root),"--production-backup",str(self.backup),"--backup-sha",self.w.gate.file_hash(self.backup),"--public-origin","https://example.test"]
 def prepare(self):
    return self.w.execute(self.w.parser().parse_args(["film-production-review",*self.options(),"--recipe",str(self.recipe),
      "--trial",str(self.root/"datasets/film-collection/ISOLATED/trial"),"--output",str(self.review),
      "--decision-output",str(self.decision),"--decision-id","isolated-film","--release","isolated-film-next"]))
 def approve(self):
    d=self.w.read(self.decision);d["status"]="approved"
    d["humanDecision"]={"actorType":"human","reviewer":"ISOLATED TEST ONLY","decidedAt":"2026-10-26T00:00:00+00:00","statement":"Synthetic private test; never a real acceptance"}
    d["identityDecision"]={"statement":"ISOLATED explicit promotion","entityIds":sorted(d["acceptedRecordIds"]["entities"])}
    self.w.gate.save(self.decision,d)
 def accept(self):
    return self.w.execute(self.w.parser().parse_args(["accept-film",*self.options(),"--decision",str(self.decision),
      "--decision-sha",self.w.gate.file_hash(self.decision),"--worker-home",str(self.home),"--manual-lock-token","ISOLATED"]))
 def test_two_claim_formal_receipt_release_validate_plan_repeat(self):
    self.prepare();self.approve();first=self.accept()
    self.assertEqual(first["acceptedCounts"],{"entities":3,"claims":2,"sources":2,"citations":2})
    self.assertEqual(first["planObservation"],"validated-production-backup-offline")
    self.assertFalse(first["publicApply"]);self.assertFalse(first["plan"]["updated"])
    self.assertFalse(first["liveVpsPlanPerformed"])
    receipt=Path(first["acceptance"]);before=receipt.read_bytes()
    second=self.accept();self.assertTrue(second["acceptanceReused"]);self.assertEqual(before,receipt.read_bytes())
    fixture=self.w.read(Path(first["releaseDirectory"])/"data.json")
    for field in self.w.FIELDS:
        actual={r["id"]:r for r in fixture[field]}
        for row in self.fixture[field]:self.assertEqual(actual[row["id"]],row)
    self.assertEqual(self.w.read(receipt)["sourceReviewKind"],"film-discovery-v1")
    self.assertTrue(all(not Path(r["file"]).is_absolute() for r in self.w.read(receipt)["referenceArtifacts"]))
    previous=self.w.ROOT
    try:
        self.w.ROOT=self.root
        additions,_=self.w.accepted_additions(Path(first["releaseDirectory"]),[receipt])
        self.assertEqual(len(additions["claims"]),2)
        module=load("film_receipt_inventory",self.code/"scripts/collection-inventory.py")
        inventory=module.Inventory(self.w,[("isolated",self.root)],self.fixture,{})
        inventory.formal_receipts()
        self.assertEqual(inventory.issues,[])
        self.assertEqual(len(inventory.accepted["claims"]),2)
    finally:self.w.ROOT=previous
 def test_draft_changed_live_revision_and_worker_pause_refuse(self):
    self.prepare()
    with self.assertRaisesRegex(ValueError,"Explicit human approval"): self.accept()
    self.approve();self.metadata["revision"]="changed"
    with self.assertRaisesRegex(ValueError,"Production revision differs"): self.accept()
    self.metadata["revision"]="ISOLATED-film-revision"
    self.w.gate.save(self.home/"state.json",{"executionControl":{"pauseMode":"pause-new"}})
    with self.assertRaisesRegex(ValueError,"paused"):self.accept()
    self.assertFalse(list((self.root/"datasets/manga-collection").glob("accepted-*/acceptance.json")))
if __name__=="__main__":unittest.main()
