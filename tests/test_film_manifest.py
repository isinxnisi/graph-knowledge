"""Saved manifest boundaries and the existing acceptance core; no production data writes."""
import copy,importlib.util,json,shutil,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1]
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
a=load("manifest_under_test",ROOT/"scripts/collect-film-manifest.py")
class FilmManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="film-manifest-test-");self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        for name in set((*a.PROGRAMS,*a.CONTRACTS)):
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,p)
        self.paths={}
        originals={"candidates":"docs/research/film-discovery-pilot-20261026/CANDIDATES.json",
            "sourceReviews":"docs/research/film-discovery-pilot-20261026/source_reviews.json",
            "coverage":"docs/research/film-release-20261027/ASTRA_RESEARCH_COVERAGE.json",
            "evidence":"docs/research/film-worker-pilot-20261028/minimal-credit-notes.json"}
        for key,name in originals.items():
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,p);self.paths[key]=p
        self.paths["comparison"]=self.root/"comparison.json"
        self.paths["comparison"].write_text(a.dump({"authority":"frozen-offline-comparison-not-live-production",
            "public":{"release":"isolated","revision":"isolated"},"receiptCount":0,"references":[],
            "records":{f:[] for f in a.FIELDS}}))
        plan=a.load(ROOT/"docs/research/knowledge-publication-review-20261028/results/coverage-plan.json")
        self.recipe=self.root/"manifest.json"
        ids=[r["researchCandidateId"] for r in plan["records"] if r["lane"].startswith(("A-","B-"))]
        pub=[r["researchCandidateId"] for r in plan["records"] if r["lane"]=="already-published"]
        self.spec={"schemaVersion":1,"adapter":a.ADAPTER,"recordedAt":"2026-10-28T00:00:00Z","candidateIds":ids,
            "heldCandidateIds":[],"deferredCandidateIds":[r["researchCandidateId"] for r in plan["records"] if r["researchCandidateId"] not in set(ids+pub)],
            "publishedCandidateIds":pub,"maxClaims":63,"inputs":{k:{"file":str(p.relative_to(self.root)),"sha256":a.sha(p)} for k,p in self.paths.items()}}
        self.write()
        rows=a.inspect(self.root,self.recipe,check_selection=False)[3]
        self.spec["heldCandidateIds"]=[r["candidateId"] for r in rows if r["status"]!="ready-for-human-review"];self.write()
    def write(self):self.recipe.write_text(a.dump(self.spec))
    def test_all_selected_held_deferred_and_published_conserved(self):
        result=a.inspect(self.root,self.recipe);rows,records,mapping=result[3:]
        self.assertEqual(len(rows),63);self.assertEqual(len(mapping),97);self.assertEqual(len(records["claims"]),34)
        self.assertEqual(sum(r["status"]=="identity-judgment" for r in rows),1)
        self.assertFalse(set(self.spec["publishedCandidateIds"]) & {r["candidateId"] for r in rows})
        first=a.build(self.root,self.recipe);self.assertEqual(first,a.build(self.root,self.recipe))
        out=self.root/"bundle";a.run(out,self.root,self.recipe);a.verify(out,self.root,self.recipe)
        draft=a.load(out/"review/decision-draft.json");self.assertEqual(draft["status"],"draft-not-approved")
    def test_no_silent_selection_reduction_or_published_reacceptance(self):
        removed=self.spec["candidateIds"].pop();self.write()
        with self.assertRaisesRegex(ValueError,"coverage differs"):a.build(self.root,self.recipe)
        self.spec["candidateIds"].append(removed);self.spec["publishedCandidateIds"].pop();self.write()
        with self.assertRaisesRegex(ValueError,"coverage differs"):a.build(self.root,self.recipe)
    def test_held_collection_cannot_be_silently_removed(self):
        self.spec["heldCandidateIds"].pop();self.write()
        with self.assertRaisesRegex(ValueError,"held/ready"):a.build(self.root,self.recipe)
    def test_changed_evidence_bytes_and_rehashed_wrong_person_are_rejected(self):
        p=self.paths["evidence"];x=a.load(p);x["credits"][0]["personText"]="Another person";p.write_text(a.dump(x))
        with self.assertRaisesRegex(ValueError,"input hash changed"):a.build(self.root,self.recipe)
        self.spec["inputs"]["evidence"]["sha256"]=a.sha(p);self.write()
        with self.assertRaisesRegex(ValueError,"person identity differs"):a.build(self.root,self.recipe)
    def test_altered_output_does_not_become_a_review_by_rehashing(self):
        out=self.root/"bundle";a.run(out,self.root,self.recipe)
        p=out/"review/proposed-records.json";x=a.load(p);x["records"]["claims"][0]["contribution"]["roleId"]="UNKNOWN_ROLE";p.write_text(a.dump(x))
        with self.assertRaisesRegex(ValueError,"deterministic frozen"):a.verify(out,self.root,self.recipe)
    def test_existing_acceptance_core_requires_explicit_mapping_judgment(self):
        w=load("manifest_workflow_test",ROOT/"scripts/collection-workflow.py")
        f=load("manifest_dispatch_test",ROOT/"scripts/collection-film.py")
        ns=SimpleNamespace(**vars(w));records=a.inspect(self.root,self.recipe)[4]
        with self.assertRaisesRegex(ValueError,"existing Role application"):f.validate_decision({},records,ns)
        mapping={"statement":"ISOLATED TEST ONLY","claimIds":sorted(c["id"] for c in records["claims"]
            if c["contribution"]["roleId"] in ["SCRIPT_WRITING","PRODUCING"])}
        with self.assertRaisesRegex(ValueError,"promoting or mapping"):f.validate_decision({"roleMappingDecision":mapping},records,ns)
    def test_non_utc_timestamp_rejected_before_a_draft(self):
        self.spec["recordedAt"]="2026-10-28T09:00:00+09:00";self.write()
        with self.assertRaisesRegex(ValueError,"UTC Z"):a.build(self.root,self.recipe)
    def test_maximum_and_arbitrary_role_expansion_rejected(self):
        self.spec["maxClaims"]=12;self.write()
        with self.assertRaisesRegex(ValueError,"bounded selection"):a.build(self.root,self.recipe)
if __name__=="__main__":unittest.main()
