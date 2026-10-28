"""Only temporary review files and mocked human packets; never a real acceptance."""
import argparse, copy, gzip, importlib.util, json, shutil, tempfile, unittest
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
    # The historical Issue43 comparison contains ten receipts. Never point this test
    # at the mutable installed Worker after an eleventh receipt has been accepted.
    self.code=self.directory/"code";self.code.mkdir()
    for name in ["scripts","lib","vocabulary"]:
        shutil.copytree(ROOT/name,self.code/name)
    for name in ["package.json","package-lock.json"]:
        shutil.copyfile(ROOT/name,self.code/name)
    (self.code/"node_modules").symlink_to((ROOT/"node_modules").resolve(),target_is_directory=True)
    recipe=json.loads((ROOT/"datasets/film-collection/issue43/recipe.json").read_text())
    for ref in recipe["inputs"].values():
        target=self.code/ref["file"];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/ref["file"],target)
    supplements=film.adapter(w).load(self.code/recipe["inputs"]["supplements"]["file"])
    for credit in supplements["credits"]:
        ref=credit["excerpt"];target=self.code/ref["file"];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/ref["file"],target)
    comp=self.code/recipe["inputs"]["comparison"]["file"]
    comparison=film.adapter(w).load(comp);old=Path(comparison["receiptDataRoot"]);frozen=self.directory/"frozen-receipts"
    refs=[]
    for name,expected in comparison["references"]:
        if name=="supplied-public-backup":
            refs.append([name,expected]);continue
        source=Path(name) if Path(name).is_absolute() else old/name
        self.assertEqual(w.gate.file_hash(source),expected)
        local_name=("test-external/"+expected+"/"+source.name) if Path(name).is_absolute() else name
        target=frozen/local_name
        self.assertTrue(target.resolve().is_relative_to(frozen.resolve()))
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
        refs.append([local_name,expected])
    comparison["references"]=refs
    comparison["receiptDataRoot"]=str(frozen)
    comp.write_bytes(gzip.compress(w.dump(comparison).encode(),mtime=0))
    recipe["inputs"]["comparison"]["sha256"]=w.gate.file_hash(comp)
    recipe_path=self.code/"datasets/film-collection/issue43/recipe.json";recipe_path.parent.mkdir(parents=True,exist_ok=True);recipe_path.write_text(w.dump(recipe))
    self.w=SimpleNamespace(**vars(workflow));self.w.CODE_ROOT=self.code
    self.args=argparse.Namespace(recipe=recipe_path,trial=self.directory/"trial",
       output=self.directory/"review",decision_output=self.directory/"decision.json",decision_id="test-only-film",release="test-only-film-release")
    film.review(self.args,self.w)
 def tearDown(self):self.tmp.cleanup()
 def test_explicit_existing_core_draft(self):
    draft=w.read(self.args.decision_output)
    self.assertEqual(draft["status"],"draft-not-approved")
    self.assertEqual(draft["sourceKind"],film.KIND)
    self.assertIsNone(draft["identityDecision"])
    self.assertEqual({f:len(ids) for f,ids in draft["acceptedRecordIds"].items()},{"entities":3,"claims":2,"sources":2,"citations":2})
    self.assertTrue(all(v is False for v in draft["applyAuthorized"].values()))
    ctx,req,indexed,refs=film.core(self.w).bundle(self.args.output,self.w)
    self.assertEqual(ctx["comparisonReceiptCount"],10)
    self.assertIn("lib/domain/contribution.ts",ctx["programSha256"])
    self.assertIn("vocabulary/contribution-roles/reviews.json",ctx["programSha256"])
 def test_role_adoption_does_not_replace_claim_or_identity_approval(self):
    core=film.core(w)
    args=argparse.Namespace(decision=self.args.decision_output,decision_sha=w.gate.file_hash(self.args.decision_output))
    with self.assertRaisesRegex(ValueError,"Explicit human approval"):core.accept(args,w)
    selected=w.read(self.args.output/"proposed-records.json")["records"]
    with self.assertRaisesRegex(ValueError,"Explicit human decision promoting or mapping"):film.validate_decision({},selected,w)
    self.assertFalse((self.directory/"accepted-test-only-film").exists())
 def test_tampering_even_rehashed_does_not_rebind_frozen_candidates(self):
    p=self.args.trial/"review/proposed-records.json"
    body=w.read(p);body["records"]["claims"][0]["contribution"]["roleId"]="SUPERVISION"
    p.write_text(w.dump(body))
    manifest=self.args.trial/"bundle-manifest.json"
    b=w.read(manifest);b["artifacts"]["review/proposed-records.json"]=w.gate.file_hash(p);manifest.write_text(w.dump(b))
    with self.assertRaisesRegex(ValueError,"hash mismatch|deterministic"):film.bundle(self.args.output,self.w)
if __name__=="__main__":unittest.main()
