"""No network/DB/Worker; every mutation is inside a fresh temporary copy."""
import copy
import gzip
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result
film = module("film_trial", "scripts/collect-film-v1.py")
freeze = module("film_comparison", "scripts/freeze-film-comparison.py")

class FilmCollection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_temp = tempfile.TemporaryDirectory(prefix="film-input-tests-")
        cls.base = Path(cls.base_temp.name)
        recipe, _, refs = film.inventory(ROOT, ROOT / "datasets/film-collection/v1/recipe.json")
        for ref in refs:
            target = cls.base / ref["file"]; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / ref["file"], target)
    @classmethod
    def tearDownClass(cls): cls.base_temp.cleanup()
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="film-case-"); self.root = Path(self.temp.name) / "root"
        shutil.copytree(self.base, self.root)
        self.recipe = self.root / "datasets/film-collection/v1/recipe.json"
        self.output = Path(self.temp.name) / "bundle"
    def tearDown(self): self.temp.cleanup()
    def change(self, name, action):
        recipe = film.load(self.recipe); path = self.root / recipe["inputs"][name]["file"]
        data = film.load(path); action(data)
        content = film.dump(data).encode()
        path.write_bytes(gzip.compress(content, mtime=0) if path.suffix == ".gz" else content)
        recipe["inputs"][name]["sha256"] = film.sha(path); self.recipe.write_text(film.dump(recipe))
    def files(self): return film.build(self.root, self.recipe)
    def json(self, files, name): return json.loads(files[name])
    def target_claim(self):
        return next(c for c in self.json(self.files(), "candidate/data.json")["claims"] if c["contribution"]["roleId"] == "ACTING" and c["objectId"] == film.uid("entity:Q104137") and c["subjectId"] == film.uid("entity:Q43203"))
    def test_minimum_closed_records_and_unapproved_decision(self):
        files = self.files(); review = self.json(files, "review/review.json"); proposed = self.json(files, "review/proposed-records.json")["records"]
        self.assertEqual(review["counts"], {"candidates": 12, "ready": 2, "held": 10})
        self.assertEqual({f: len(v) for f, v in proposed.items()}, {"entities": 3, "claims": 2, "sources": 2, "citations": 2})
        self.assertTrue(self.json(files, "preflight.json")["minimumEvidenceReady"])
        self.assertTrue(all(c["visibility"] == "hidden" and c["contribution"]["scope"] is None and c["period"] == {"from": None, "to": None} for c in proposed["claims"]))
        self.assertEqual({c["roleEvidence"]["originalText"] for c in proposed["citations"]}, {"CAST", "Dir"})
        self.assertEqual(self.json(files, "review/decision-draft.json")["status"], "draft-not-approved")
    def test_replay_is_byte_identical_and_uses_new_provisional_ids(self):
        film.run(self.output, self.root, self.recipe)
        first = {str(p.relative_to(self.output)): p.read_bytes() for p in self.output.rglob("*") if p.is_file()}
        film.run(self.output, self.root, self.recipe)
        self.assertEqual(first, {str(p.relative_to(self.output)): p.read_bytes() for p in self.output.rglob("*") if p.is_file()})
        prior = film.load(self.root / film.load(self.recipe)["inputs"]["priorFixture"]["file"])
        self.assertFalse({x["id"] for x in prior["claims"]} & {x["id"] for x in self.json(self.files(), "candidate/data.json")["claims"]})
    def test_changed_frozen_input_is_rejected(self):
        ref = film.load(self.recipe)["inputs"]["candidates"]["file"]
        with (self.root / ref).open("a") as stream: stream.write(" ")
        with self.assertRaisesRegex(ValueError, "Frozen input changed"): self.files()
    def test_changed_excerpt_is_rejected(self):
        p = self.root / "datasets/film-collection/v1/evidence/unforgiven-credit.txt"; p.write_text(p.read_text() + "Archive\n")
        with self.assertRaisesRegex(ValueError, "excerpt changed"): self.files()
    def test_unknown_and_wrong_role_terms_rejected(self):
        for role, term in [("SUPERVISION", "Dir"), ("DIRECTING", "CAST"), ("ACTING", "Voice")]:
            with self.subTest(role=role, term=term):
                original = self.recipe.read_text(); supplement_path = self.root / film.load(self.recipe)["inputs"]["supplements"]["file"]; saved = supplement_path.read_text()
                self.change("supplements", lambda s: s["credits"][0].update(proposedRole=role, originalRoleText=term))
                with self.assertRaises(ValueError): self.files()
                self.recipe.write_text(original); supplement_path.write_text(saved)
    def test_person_and_work_mismatch_rejected(self):
        self.change("supplements", lambda s: s["credits"][0].update(personText="Another person"))
        with self.assertRaisesRegex(ValueError, "identity/text"): self.files()
    def test_cut_is_held_without_inventing_scope(self):
        self.change("candidates", lambda d: next(c for c in d["candidates"] if c["id"] == "candidate:Q104137$3D0CF582-4DF0-445D-9EB3-221A8DC7E84F")["scope"].update(cut="specific-cut"))
        preflight = self.json(self.files(), "preflight.json")
        self.assertFalse(preflight["minimumEvidenceReady"]); self.assertEqual(len(preflight["readyClaims"]), 1)
    def test_missing_supplement_is_a_hold(self):
        self.change("supplements", lambda s: s["credits"].pop(0))
        self.assertFalse(self.json(self.files(), "preflight.json")["minimumEvidenceReady"])
    def test_same_role_null_scope_overlap_held_in_both_comparison_states(self):
        claim = self.target_claim()
        for state in ["published", "formally-accepted-unapplied"]:
            with self.subTest(state=state):
                original = self.recipe.read_text(); path = self.root / film.load(self.recipe)["inputs"]["comparison"]["file"]; saved = path.read_bytes()
                self.change("comparison", lambda d: d["records"]["claims"].append({"record": claim, "state": state, "provenance": "isolated-control"}))
                self.assertFalse(self.json(self.files(), "preflight.json")["minimumEvidenceReady"])
                self.recipe.write_text(original); path.write_bytes(saved)
    def test_other_role_is_not_merged_and_withdrawal_is_not_reaccepted(self):
        claim = self.target_claim(); claim["id"] = film.uid("other-role"); claim["contribution"]["roleId"] = "DIRECTING"
        self.change("comparison", lambda d: d["records"]["claims"].append({"record": claim, "state": "published", "provenance": "isolated-control"}))
        self.assertTrue(self.json(self.files(), "preflight.json")["minimumEvidenceReady"])
        claim = self.target_claim(); claim["id"] = film.uid("withdrawn")
        self.change("comparison", lambda d: d["records"]["claims"].append({"record": claim, "state": "withdrawn", "provenance": "isolated-control"}))
        self.assertFalse(self.json(self.files(), "preflight.json")["minimumEvidenceReady"])
    def test_ambiguous_entity_external_id_is_rejected(self):
        ent = self.json(self.files(), "candidate/data.json")["entities"][0]
        def change(d):
            d["records"]["entities"] += [{"record": ent, "state": "published"}, {"record": {**ent, "id": film.uid("ambiguous")}, "state": "formally-accepted-unapplied"}]
        self.change("comparison", change)
        with self.assertRaisesRegex(ValueError, "Ambiguous external"): self.files()
    def test_existing_entity_and_source_ids_are_reused_without_overwrite(self):
        data = self.json(self.files(), "candidate/data.json"); ent = copy.deepcopy(data["entities"][0]); source = copy.deepcopy(data["sources"][0])
        ent["id"] = film.uid("existing-entity"); source["id"] = film.uid("existing-source"); source["note"] = "Prior immutable source note"
        self.change("comparison", lambda d: (d["records"]["entities"].append({"record": ent, "state": "published"}), d["records"]["sources"].append({"record": source, "state": "published"})))
        result = self.json(self.files(), "candidate/data.json")
        self.assertIn(ent, result["entities"]); self.assertIn(source, result["sources"])
    def test_scope_and_all_transitive_role_hashes_are_bound(self):
        film.run(self.output, self.root, self.recipe)
        before = film.load(self.output / "preflight.json")["bindingSha256"]
        p = self.root / "lib/domain/contribution.ts"; p.write_text(p.read_text() + "\n")
        with self.assertRaisesRegex(ValueError, "input changed"): film.verify(self.output, self.root, self.recipe)
        self.assertNotEqual(before, self.json(self.files(), "preflight.json")["bindingSha256"])
    def test_rehashed_output_and_forged_approval_still_rejected(self):
        film.run(self.output, self.root, self.recipe)
        p = self.output / "review/decision-draft.json"; value = film.load(p); value["status"] = "approved"; value["reviewer"] = "forged"; p.write_text(film.dump(value))
        m = self.output / "bundle-manifest.json"; value = film.load(m); value["artifacts"]["review/decision-draft.json"] = film.sha(p); m.write_text(film.dump(value))
        with self.assertRaises(ValueError): film.verify(self.output, self.root, self.recipe)
    def test_duplicate_source_and_provider_role_mismatch_rejected(self):
        self.change("candidates", lambda d: next(c for c in d["candidates"] if c["id"] == "candidate:Q104137$3D0CF582-4DF0-445D-9EB3-221A8DC7E84F")["provenance"].update(property="P57"))
        with self.assertRaisesRegex(ValueError, "statement/Role"): self.files()
    def test_extra_artifact_and_input_path_escape_rejected(self):
        film.run(self.output, self.root, self.recipe); (self.output / "unexpected.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "inventory/hash"): film.verify(self.output, self.root, self.recipe)
        with self.assertRaisesRegex(ValueError, "Unsafe"): film.safe(self.root, "../another-root")

if __name__ == "__main__": unittest.main()
