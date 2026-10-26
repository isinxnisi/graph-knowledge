"""Bounded saved-film adapter dispatch into the existing human acceptance core."""
from pathlib import Path
from types import SimpleNamespace

KIND = "film-discovery-v1"

def adapter(w):
    return w.load("film_adapter_v1", w.CODE_ROOT / "scripts/collect-film-v1.py")

def programs(w):
    # Hash the full transitive local validation closure, not a cached top-level pair.
    paths = set(adapter(w).PROGRAMS + adapter(w).CONTRACTS)
    paths.update(["scripts/collection-themes.py", w.gate.MANGA_GENERATOR, w.gate.MANGA_V2_GENERATOR])
    paths.update(str(p.relative_to(w.CODE_ROOT)) for folder in ["lib/domain", "lib/server", "lib/i18n"]
                 for p in (w.CODE_ROOT / folder).rglob("*.ts"))
    paths.update(["scripts/collection-film.py", "scripts/collection-workflow.py",
                  "scripts/collection-acceptance.py", "scripts/refresh-film-comparison.py", "scripts/film-beta.ts",
                  "scripts/start-local-previews.py", "scripts/check-vocabulary.ts", "scripts/public-kg.ts", "scripts/publication-backup-plan.ts", "vocabulary/contribution-roles/film-pending.json"])
    return {p: w.gate.file_hash(w.CODE_ROOT / p) for p in sorted(paths)}

def core(w):
    return w.load("film_acceptance_core", w.CODE_ROOT / "scripts/collection-acceptance.py")

def add_parser(sub):
    cli = sub.add_parser("film-review", help=__doc__)
    cli.add_argument("--recipe", type=Path, required=True)
    cli.add_argument("--trial", type=Path, required=True)
    cli.add_argument("--output", type=Path, required=True)
    cli.add_argument("--decision-output", type=Path, required=True)
    cli.add_argument("--decision-id", required=True)
    cli.add_argument("--release", required=True)

def material(recipe, trial, w):
    a = adapter(w)
    a.verify(trial, w.CODE_ROOT, recipe)
    review = w.read(trial / "review/review.json")
    w.require(review["counts"]["ready"] == 2 and review["counts"]["held"] == 10, "Minimum film evidence/holds changed")
    records = w.read(trial / "review/proposed-records.json")["records"]
    w.require(len(records["claims"]) == 2 and all(c["visibility"] == "hidden" for c in records["claims"]), "Exactly two hidden film Claims required")
    recipe_data = w.read(recipe)
    comparison_ref = recipe_data["inputs"]["comparison"]
    comparison = a.load(a.safe(w.CODE_ROOT, comparison_ref["file"]))
    # Identity matching is explicit. A null-scope match is a hold, never an automatic merge.
    known = comparison["records"]
    for e in records["entities"]:
        aliases = {w.manga.norm(n) for n in [e["name"], *e["aliases"]]}
        collisions = [r["record"]["id"] for r in known["entities"] if r["record"]["kind"] == e["kind"] and r["record"]["id"] != e["id"] and
                      aliases & {w.manga.norm(n) for n in [r["record"]["name"], *r["record"]["aliases"]]}]
        w.require(not collisions, "Film Entity name identity needs human mapping: " + e["id"])
    fixture = {"schemaVersion": 4, **{f: [r["record"] for r in known[f]] for f in w.FIELDS}}
    # Existing core validates UUID, external identifier, semantic duplicates and evidence closure.
    core(w).merge(fixture, {f: [] for f in w.FIELDS}, records, w)
    if comparison.get("receiptDataRoot"):
        runtime = Path(comparison["receiptDataRoot"])
        expected = {str(p.relative_to(runtime)) for p in (runtime / "datasets/manga-collection").glob("accepted-*/acceptance.json")}
        observed = {r[0] for r in comparison["references"] if r[0].endswith("/acceptance.json")}
        w.require(expected == observed, "Formal receipt inventory changed; refresh film comparison")
        for file, sha in comparison["references"]:
            if file == "supplied-public-backup": continue
            path = Path(file) if Path(file).is_absolute() else runtime / file
            w.require(w.gate.file_hash(path) == sha, "Formal comparison evidence changed: " + file)
    return records, comparison

def bundle(directory, w):
    manifest = w.read(directory / "review-manifest.json")
    w.require(manifest["sourceKind"] == KIND and manifest["authority"] == "pending-human-review-only", "Not a film review")
    actual = w.gate.inventory(directory)
    w.require(actual == {**manifest["artifacts"], "review-manifest.json": w.gate.file_hash(directory / "review-manifest.json")}, "Film review inventory changed")
    context, request = w.read(directory / "context.json"), w.read(directory / "decision-request.json")
    w.require(w.digest(context) == manifest["inputSha256"] and context["programSha256"] == programs(w), "Film program/schema/vocabulary binding changed")
    for r in context["frozenReferences"]:
        core(w).checked_reference(r, w)
    records, comparison = material((w.CODE_ROOT / context["recipe"]).resolve(), (w.ROOT / context["evidenceDirectory"]).resolve(), w)
    w.require(w.read(directory / "proposed-records.json")["records"] == records, "Film reviewed body changed")
    w.require(context["public"]["release"] == comparison["public"]["release"] and context["public"]["revision"] == comparison["public"]["revision"], "Film public comparison differs")
    w.require(request["status"] == "pending-human-decision" and request["groups"]["normal"]["recordIds"] == {f: [r["id"] for r in records[f]] for f in w.FIELDS}, "Film reviewed ID selection changed")
    return context, request, w.index(records), [w.reference(directory / n) for n in sorted(actual)] + context["frozenReferences"]

def validate_decision(decision, selected, w):
    # Runtime recognition is not vocabulary approval. Existing approved catalog/reviews remain authoritative.
    result = w.node(["-e", "const fs=require('node:fs');const {checkRoleVocabulary}=require('./lib/domain/role-vocabulary.ts');const p='vocabulary/contribution-roles/';const c=JSON.parse(fs.readFileSync(p+'catalog.json'));const r=checkRoleVocabulary(c,JSON.parse(fs.readFileSync(p+'baseline-v1.json')),JSON.parse(fs.readFileSync(p+'reviews.json')));console.log(JSON.stringify({...r,ids:c.entries.map(e=>e.id)}));"])
    w.require(not result["errors"] and all(c["contribution"]["roleId"] in result["ids"] for c in selected["claims"]), "Film Roles still require fixed human vocabulary review")
    identity = decision.get("identityDecision")
    w.require(isinstance(identity, dict) and identity.get("statement") and
              identity.get("entityIds") == sorted(e["id"] for e in selected["entities"]),
              "Explicit human decision promoting or mapping provisional film identities required")

def review(args, w):
    a = adapter(w)
    args.recipe, args.trial = args.recipe.resolve(), args.trial.resolve()
    a.run(args.trial, w.CODE_ROOT, args.recipe)
    records, comparison = material(args.recipe, args.trial, w)
    context = {"sourceKind": KIND, "evidenceDirectory": w.reference(args.trial / "bundle-manifest.json")["file"].rsplit("/",1)[0], "recipe": w.reference(args.recipe)["file"],
               "public": {"release": comparison["public"]["release"], "revision": comparison["public"]["revision"], "references": []},
               "acceptedReferences": [], "programSha256": programs(w),
               "frozenReferences": [w.reference(args.recipe), w.reference(args.trial / "bundle-manifest.json"),
                                    w.reference(a.safe(w.CODE_ROOT, w.read(args.recipe)["inputs"]["comparison"]["file"]))],
               "comparisonReceiptCount": comparison["receiptCount"],
               "formalAcceptance": False, "identityStatus": "provisional-candidates-not-production-ids"}
    ids = {f: [r["id"] for r in records[f]] for f in w.FIELDS}
    request = {"status": "pending-human-decision", "groups": {"normal": {"recordIds": ids}},
               "heldClaimIds": [], "heldEntityIds": [], "adoptionBlockers": ["fixed-role-human-review", "fixed-record-human-acceptance", "provisional-identity-decision", "fresh-authoritative-public-backup-and-all-receipts-at-acceptance"]}
    files = {"context.json": w.dump(context), "decision-request.json": w.dump(request),
             "proposed-records.json": w.dump({"records": records}),
             "review.json": w.dump({"recordConflicts": [], "claims": [], "entities": [], "inheritedHolds": []})}
    files["review-manifest.json"] = w.dump({"schemaVersion": 1, "sourceKind": KIND, "authority": "pending-human-review-only",
        "inputSha256": w.digest(context), "artifacts": {n: w.gate.digest(v.encode()) for n,v in files.items()}})
    c = core(w)
    c.protect_inputs([args.output, args.decision_output], args.trial, context, w)
    c.immutable_directory(args.output, files, w)
    result = c.template(SimpleNamespace(review=args.output, group="normal", claim_id=[], decision_id=args.decision_id,
        release=args.release, output=args.decision_output), w)
    return {"reviewDirectory": str(args.output), **result, "counts": {f: len(records[f]) for f in w.FIELDS},
            "receiptCount": comparison["receiptCount"], "publicApply": False}
