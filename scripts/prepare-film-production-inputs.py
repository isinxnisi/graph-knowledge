"""Fresh authoritative backup + all formal receipts -> frozen film comparison/recipe.
Read-only production metadata; no receipt, registration, Worker or publication mutation.
"""
import argparse, gzip, importlib.util, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
def prepare(args):
    w = load("film_inputs_workflow", ROOT / "scripts/collection-workflow.py")
    w.ROOT = args.data_root.resolve()
    evidence = load("film_inputs_observer", ROOT / "scripts/collection-evidence.py")
    public, before = evidence.observe(args, w)
    freeze = load("film_inputs_freeze", ROOT / "scripts/freeze-film-comparison.py")
    value = freeze.freeze(args.production_backup.resolve(), w.ROOT)
    value["receiptDataRoot"] = str(w.ROOT)
    value["observation"] = "validated-supplied-production-backup-plus-live-revision-and-all-formal-receipts"
    output = args.output.resolve()
    w.require(output.is_relative_to(ROOT) and not output.exists(), "New output inside this reviewed checkout required")
    recipe = w.read(ROOT / "datasets/film-collection/issue43/recipe.json")
    comparison = output / "comparison.json.gz"
    output.mkdir(parents=True)
    comparison.write_bytes(gzip.compress(w.dump(value).encode(), mtime=0))
    recipe["inputs"]["comparison"] = {"file": str(comparison.relative_to(ROOT)), "sha256": w.gate.file_hash(comparison)}
    recipe_file = output / "recipe.json"
    w.gate.create(recipe_file, recipe)
    film = load("film_inputs_check", ROOT / "scripts/collection-film.py")
    film.production_comparison(args, value, w)
    _, after = evidence.observe(args, w)
    w.require(before == after, "Production changed while preparing film comparison")
    return {"recipe": str(recipe_file), "recipeSha256": w.gate.file_hash(recipe_file),
            "public": before, "receiptCount": value["receiptCount"], "formalAcceptance": False, "publicApply": False}
if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ["data-root", "production-backup", "output"]: p.add_argument("--" + name, type=Path, required=True)
    for name in ["backup-sha", "public-origin"]: p.add_argument("--" + name, required=True)
    print(json.dumps(prepare(p.parse_args()), ensure_ascii=False))
