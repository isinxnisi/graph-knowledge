"""Only temporary review files and mocked human packets; never a real acceptance."""
import argparse, copy, importlib.util, json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
workflow=load("film_test_workflow",ROOT/"scripts/collection-workflow.py")
film=load("film_test_dispatch",ROOT/"scripts/collection-film.py")
w=SimpleNamespace(**vars(workflow))
class FilmDispatch(unittest.TestCase):
 def setUp(self):
    self.tmp=tempfile.TemporaryDirectory(prefix="film-dispatch-test-")
    self.directory=Path(self.tmp.name)
    self.args=argparse.Namespace(recipe=ROOT/"datasets/film-collection/issue43/recipe.json",trial=self.directory/"trial",
       output=self.directory/"review",decision_output=self.directory/"decision.json",decision_id="test-only-film",release="test-only-film-release")
    film.review(self.args,w)
 def tearDown(self):self.tmp.cleanup()
 def test_explicit_existing_core_draft(self):
    draft=w.read(self.args.decision_output)
    self.assertEqual(draft["status"],"draft-not-approved")
    self.assertEqual(draft["sourceKind"],film.KIND)
    self.assertIsNone(draft["identityDecision"])
    self.assertEqual({f:len(ids) for f,ids in draft["acceptedRecordIds"].items()},{"entities":3,"claims":2,"sources":2,"citations":2})
    self.assertTrue(all(v is False for v in draft["applyAuthorized"].values()))
    ctx,req,indexed,refs=film.core(w).bundle(self.args.output,w)
    self.assertEqual(ctx["comparisonReceiptCount"],10)
    self.assertIn("lib/domain/contribution.ts",ctx["programSha256"])
    self.assertIn("vocabulary/contribution-roles/reviews.json",ctx["programSha256"])
 def test_draft_cannot_enter_acceptance_and_fake_role_adoption_is_not_inferred(self):
    core=film.core(w)
    args=argparse.Namespace(decision=self.args.decision_output,decision_sha=w.gate.file_hash(self.args.decision_output))
    with self.assertRaisesRegex(ValueError,"Explicit human approval"):core.accept(args,w)
    selected=w.read(self.args.output/"proposed-records.json")["records"]
    with self.assertRaisesRegex(ValueError,"human vocabulary review"):film.validate_decision({},selected,w)
    self.assertFalse((self.directory/"accepted-test-only-film").exists())
 def test_tampering_even_rehashed_does_not_rebind_frozen_candidates(self):
    p=self.args.trial/"review/proposed-records.json"
    body=w.read(p);body["records"]["claims"][0]["contribution"]["roleId"]="SUPERVISION"
    p.write_text(w.dump(body))
    manifest=self.args.trial/"bundle-manifest.json"
    b=w.read(manifest);b["artifacts"]["review/proposed-records.json"]=w.gate.file_hash(p);manifest.write_text(w.dump(b))
    with self.assertRaisesRegex(ValueError,"hash mismatch|deterministic"):film.bundle(self.args.output,w)
if __name__=="__main__":unittest.main()
