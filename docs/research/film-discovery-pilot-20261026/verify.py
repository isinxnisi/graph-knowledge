"""Offline regression + provenance checks. No live requests, Worker, DB or app build."""
import gzip, contextlib, hashlib, importlib.util, io, json, unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
def load(name):
 spec=importlib.util.spec_from_file_location(name,HERE/(name+".py"))
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
def read(name):return json.loads(gzip.decompress((HERE/name).read_bytes()) if name.endswith(".gz") else (HERE/name).read_bytes())
ev=load("evaluate")
class ResearchChecks(unittest.TestCase):
 def test_frozen_evidence_hashes(self):
  manifest=read("evidence/manifest.json")
  files={p.name for p in (HERE/"evidence").glob("*") if p.is_file() and p.name!="manifest.json"}
  self.assertEqual(files,{v["file"] for v in manifest["files"]})
  for ref in read("REFERENCE_ASSETS.json")["files"]:
   self.assertEqual(ev.sha(ev.REPO/ref["file"]),ref["sha256"])
  for row in manifest["files"]:
   self.assertEqual(hashlib.sha256((HERE/"evidence"/row["file"]).read_bytes()).hexdigest(),row["sha256"])
 def test_cache_replay_never_fetches(self):
  with patch("urllib.request.urlopen",side_effect=AssertionError("network forbidden")),contextlib.redirect_stdout(io.StringIO()):
   load("acquire").main()
 def test_all_candidates_preserve_actual_statements_and_state(self):
  d=read("CANDIDATES.json");raw=read("evidence/films.json.gz")["data"]["entities"]
  self.assertEqual(len([e for e in d["entities"] if e["study_target"]]),10)
  sources={s["id"]:s for s in read("source_reviews.json")}
  for c in d["candidates"]:
   p=c["provenance"];statement=next(v for v in raw[p["entity"]]["claims"][p["property"]] if v["id"]==p["statement_id"])
   self.assertEqual(statement,p["raw_statement"])
   self.assertFalse(c["published"]);self.assertFalse(c["formal_acceptance"])
   if c["state"]=="checked-source-candidate":
    supporting=[s for s in c["citations"] if s["stance"]=="support"]
    self.assertTrue(supporting)
    target=statement["mainsnak"]["datavalue"]["value"]["id"]
    for s in supporting:
     self.assertEqual(sources[s["source_id"]]["film"],p["entity"])
     self.assertIn(target,sources[s["source_id"]]["supports"][p["property"]])
 def test_hold_and_structured_only_never_leak_into_witness(self):
  allowed={c["id"] for c in ev.CHECKED}
  evaluation=read("EVALUATION.json")
  for q in evaluation["queries"].values():
   paths=q.get("paths",[])+[p for values in q.get("witnesses",{}).values() for p in values]
   for p in paths:
    self.assertEqual(len(p["nodes"]),len(set(p["nodes"])))
    for i,s in enumerate(p["steps"]):
     self.assertIn(s["candidate_id"],allowed);self.assertTrue(s["source_ids"])
     self.assertEqual({s["canonical_subject"],s["canonical_object"]},set(p["nodes"][i:i+2]))
 def test_golden_discovery_results(self):
  q=read("EVALUATION.json")["queries"]
  self.assertEqual(q["same_screenwriter"]["distinct_targets"],["Q104137","Q21500755"])
  self.assertEqual(q["cast_to_director"]["path_count"],1)
  self.assertEqual(q["uniform_cast_or_director"]["path_count"],7)
  self.assertEqual(q["director_and_music"]["distinct_targets"],["Q13417189"])
  self.assertEqual(q["writer_other_film_cast"]["path_count"],7)
 def test_no_automatic_remake_from_shared_novel(self):
  self.assertFalse(any(c["relation"]=="REMAKE_OF" for c in ev.CHECKED))
  self.assertEqual(read("EVALUATION.json")["queries"]["same_novel"]["paths"][0]["nodes"],["Q114819","Q190192","Q60834962"])
 def test_reused_topology_distinguishes_branch_from_bridge(self):
  nodes={q:{} for q in ["film-a","person","film-b","film-c","other"]}
  a,_,groups=ev.bridge.graph(nodes,[("film-a","person"),("film-b","person"),("film-c","person")])
  self.assertEqual(len(groups),2);self.assertEqual([len(x) for x in ev.bridge.reach(a,"film-a")],[1,3,3])
  _,_,next_groups=ev.bridge.graph(nodes,[("film-a","person"),("film-b","person"),("film-c","person"),("other","film-c")])
  self.assertEqual(len(next_groups),1)
 def test_publication_reconciliation_is_not_stale_unpublished_claim(self):
  k=read("KG_RECONCILIATION.json")
  self.assertTrue(k["live_revision_stable"])
  self.assertNotEqual(k["historical_public"]["revision"],k["live_revision_start"]["data"]["revision"])
  self.assertEqual(len(k["formal_receipts"]),10)
  self.assertEqual(k["formal_unique_counts"]["claims"],51)
  self.assertEqual(k["current_checks_of_these_claims"][0]["result"]["status"],200)
  self.assertTrue(all(not v["matches"]["historical-published"] and not v["matches"]["formally-accepted"] for v in k["entity_comparisons"]))
 def test_runtime_proof_has_positive_and_negative_evidence(self):
  p=read("CURRENT_RUNTIME_PROOF.json")
  self.assertEqual(p["passed"],10)
  self.assertEqual(len(p["geometryOnly"]["exact"]["paths"]),23)
  self.assertEqual(len(p["geometryOnly"]["bounded"]["paths"]),12)
  self.assertIn("results",p["geometryOnly"]["bounded"]["scan"]["reasons"])
  self.assertEqual(len(p["syntheticLimitOnRealData"]["result"]["paths"]),0)
  self.assertIn("neighbors",p["syntheticLimitOnRealData"]["result"]["scan"]["reasons"])
  for file,digest in p["inputHashes"].items():self.assertEqual(ev.sha(ev.REPO/file),digest)
 def test_deterministic_offline_rebuild(self):
  files=["CANDIDATES.json","evidence/manifest.json","EVALUATION.json"]
  before={f:(HERE/f).read_bytes() for f in files}
  with patch("urllib.request.urlopen",side_effect=AssertionError("network forbidden")),contextlib.redirect_stdout(io.StringIO()):
   load("build_candidates").main();ev.main()
  for f,b in before.items():self.assertEqual((HERE/f).read_bytes(),b)
if __name__=="__main__":
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(ResearchChecks)
 names=[t.id() for t in suite]
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 if result.wasSuccessful():
  value={"authority":"offline-research-validation","passed":result.testsRun,"tests":names,
    "runtime_checks":read("CURRENT_RUNTIME_PROOF.json")["passed"],
    "outputs_sha256":{f:hashlib.sha256((HERE/f).read_bytes()).hexdigest() for f in ["CANDIDATES.json","EVALUATION.json","CURRENT_RUNTIME_PROOF.json","KG_RECONCILIATION.json","evidence/manifest.json"]},
    "limitations":["No actual database queries or UI rendering tested.","No formal film ingestion, acceptance or publication.","No user study or production performance benchmark."]}
  (HERE/"VALIDATION.json").write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n")
 raise SystemExit(0 if result.wasSuccessful() else 1)
