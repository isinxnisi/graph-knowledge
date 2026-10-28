"""Bounded saved-film adapter dispatch into the existing human acceptance core."""
from pathlib import Path
import tempfile
from types import SimpleNamespace

KIND = "film-discovery-v1"

def adapter(w, recipe=None):
    saved = recipe is not None and w.read(recipe).get("adapter") == "film-saved-manifest-v1"
    return w.load("film_saved_manifest" if saved else "film_adapter_v1",
                  w.CODE_ROOT / ("scripts/collect-film-manifest.py" if saved else "scripts/collect-film-v1.py"))

def programs(w):
    # Hash the full transitive local validation closure, not a cached top-level pair.
    paths = set(adapter(w).PROGRAMS + adapter(w).CONTRACTS)
    paths.add("scripts/collect-film-manifest.py")
    paths.update(["scripts/collection-themes.py", w.gate.MANGA_GENERATOR, w.gate.MANGA_V2_GENERATOR])
    paths.update(str(p.relative_to(w.CODE_ROOT)) for folder in ["lib/domain", "lib/server", "lib/i18n"]
                 for p in (w.CODE_ROOT / folder).rglob("*.ts"))
    paths.update(["scripts/collection-film.py", "scripts/prepare-film-production-inputs.py", "scripts/collection-evidence.py", "scripts/collection-workflow.py",
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

def add_production_parsers(sub, root):
    cli = sub.add_parser("film-production-review", help="Fresh production backup + all receipts -> fixed film review; no acceptance")
    cli.add_argument("--recipe", type=Path, required=True)
    cli.add_argument("--trial", type=Path, required=True)
    cli.add_argument("--output", type=Path, required=True)
    cli.add_argument("--decision-output", type=Path, required=True)
    cli.add_argument("--decision-id", required=True)
    cli.add_argument("--release", required=True)
    for name in ["film-production-review", "accept-film"]:
        target = cli if name == "film-production-review" else sub.add_parser(name, help="Hash-bound human film decision -> formal receipt and offline plan; no apply")
        target.add_argument("--data-root", type=Path, default=root)
        target.add_argument("--production-backup", type=Path, required=True)
        target.add_argument("--backup-sha", required=True)
        target.add_argument("--public-origin", required=True)
        if name == "accept-film":
            target.add_argument("--decision", type=Path, required=True)
            target.add_argument("--decision-sha", required=True)
            target.add_argument("--worker-home", type=Path, required=True)
            target.add_argument("--manual-lock-token", required=True)

def production_comparison(args, comparison, w):
    public, observed = core(w).evidence_module(w).observe(args, w)
    prior, refs = w.discover_accepted(comparison=True)
    expected = w.index(public)
    for field in w.FIELDS:
        for row in prior[field]:
            w.require(row["id"] not in expected[field] or expected[field][row["id"]] == row,
                      "Production and formal receipt body conflict")
            expected[field][row["id"]] = row
        actual = {row["record"]["id"]: row["record"] for row in comparison["records"][field]}
        w.require(actual == expected[field], "Film comparison differs from current production backup/all formal receipts")
    w.require(comparison["public"]["revision"] == observed["revision"] and
              comparison["public"]["release"] == observed["release"] and
              comparison.get("receiptDataRoot") == str(w.ROOT.resolve()), "Production film comparison binding differs")
    w.require(["supplied-public-backup", args.backup_sha] in [list(ref) for ref in comparison["references"]],
              "Film comparison must bind the supplied production backup")
    return observed, refs

def material(recipe, trial, w):
    a = adapter(w, recipe)
    a.verify(trial, w.CODE_ROOT, recipe)
    review = w.read(trial / "review/review.json")
    saved = w.read(recipe).get("adapter") == "film-saved-manifest-v1"
    if not saved:
        w.require(review["counts"]["ready"] == 2 and review["counts"]["held"] == 10, "Minimum film evidence/holds changed")
    records = w.read(trial / "review/proposed-records.json")["records"]
    w.require((0 < len(records["claims"]) <= w.read(recipe)["maxClaims"] if saved else len(records["claims"]) == 2)
              and all(c["visibility"] == "hidden" for c in records["claims"]), "Hidden film Claim selection differs")
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
    merged, _ = core(w).merge(fixture, {f: [] for f in w.FIELDS}, records, w)
    if saved:
        # Validate the actual merged shape before producing a human decision draft.
        # Never normalize accepted records, relax the schema or connect to a database.
        with tempfile.TemporaryDirectory(prefix="film-manifest-schema-") as tmp:
            source = Path(tmp) / "fixture.json"
            source.write_text(w.dump(merged), encoding="utf-8")
            w.node(["-e", "const fs=require('node:fs');const assert=require('node:assert/strict');"
                    "const {fixtureV4Schema}=require('./lib/domain/fixture.ts');"
                    "const input=JSON.parse(fs.readFileSync(process.argv[1]));"
                    "assert.deepEqual(fixtureV4Schema.parse(input),input);console.log(JSON.stringify({valid:true}));", str(source)])
    if comparison.get("receiptDataRoot"):
        runtime = Path(comparison["receiptDataRoot"])
        expected = {str(p.relative_to(runtime)) for p in (runtime / "datasets/manga-collection").glob("accepted-*/acceptance.json")}
        own = getattr(w, "film_receipt_in_progress", None)
        if own and Path(own["file"]).exists():
            receipt = w.read(Path(own["file"]))
            w.require(receipt.get("sourceReviewKind") == KIND and receipt.get("decisionId") == own["decisionId"] and
                      receipt.get("humanDecisionSha256") == own["decisionSha256"] and
                      receipt.get("acceptedRecordIds") == own["acceptedRecordIds"], "Own film receipt binding changed")
            expected.discard(str(Path(own["file"]).relative_to(runtime)))
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
    if context.get("productionAcceptanceReady"):
        w.require(context["dataRoot"] == str(w.ROOT.resolve()) and context["public"].get("productionBackupSha256"),
                  "Production film review must retain its original data root/backup")
        w.require(all(not Path(r["file"]).is_absolute() and ".." not in Path(r["file"]).parts for r in context["frozenReferences"]),
                  "Formal film references must remain portable inside the data root")
        for snapshot in context["frozenInputSnapshots"]:
            w.require(snapshot["source"]["sha256"] == snapshot["snapshot"]["sha256"], "Archived film evidence changed")
    return context, request, w.index(records), [w.reference(directory / n) for n in sorted(actual)] + context["frozenReferences"]

def validate_decision(decision, selected, w):
    # Runtime recognition is not vocabulary approval. Existing approved catalog/reviews remain authoritative.
    result = w.node(["-e", "const fs=require('node:fs');const {checkRoleVocabulary}=require('./lib/domain/role-vocabulary.ts');const p='vocabulary/contribution-roles/';const c=JSON.parse(fs.readFileSync(p+'catalog.json'));const r=checkRoleVocabulary(c,JSON.parse(fs.readFileSync(p+'baseline-v1.json')),JSON.parse(fs.readFileSync(p+'reviews.json')));console.log(JSON.stringify({...r,ids:c.entries.map(e=>e.id)}));"])
    w.require(not result["errors"] and all(c["contribution"]["roleId"] in result["ids"] for c in selected["claims"]), "Film Roles still require fixed human vocabulary review")
    mappings = sorted(c["id"] for c in selected["claims"] if c["contribution"]["roleId"] in ["SCRIPT_WRITING","PRODUCING"])
    if mappings:
        applied = decision.get("roleMappingDecision")
        w.require(isinstance(applied, dict) and applied.get("statement") and applied.get("claimIds") == mappings,
                  "Explicit human judgment of existing Role application and null film scope required")
    identity = decision.get("identityDecision")
    w.require(isinstance(identity, dict) and identity.get("statement") and
              identity.get("entityIds") == sorted(e["id"] for e in selected["entities"]),
              "Explicit human decision promoting or mapping provisional film identities required")

def review(args, w):
    a = adapter(w, args.recipe)
    args.recipe, args.trial = args.recipe.resolve(), args.trial.resolve()
    if getattr(args, "production_backup", None):
        for path in [args.trial, args.output, args.decision_output]:
            w.require(path.resolve().is_relative_to(w.ROOT.resolve()), "Production film outputs must remain in the receipt data root")
    a.run(args.trial, w.CODE_ROOT, args.recipe)
    records, comparison = material(args.recipe, args.trial, w)
    context = {"sourceKind": KIND, "evidenceDirectory": w.reference(args.trial / "bundle-manifest.json")["file"].rsplit("/",1)[0], "recipe": w.reference(args.recipe)["file"],
               "public": {"release": comparison["public"]["release"], "revision": comparison["public"]["revision"], "references": []},
               "acceptedReferences": [], "programSha256": programs(w),
               "frozenReferences": [w.reference(args.recipe), w.reference(args.trial / "bundle-manifest.json"),
                                    w.reference(a.safe(w.CODE_ROOT, w.read(args.recipe)["inputs"]["comparison"]["file"]))],
               "comparisonReceiptCount": comparison["receiptCount"],
               "formalAcceptance": False, "identityStatus": "provisional-candidates-not-production-ids",
               "filmAdapter": w.read(args.recipe)["adapter"]}
    if getattr(args, "production_backup", None):
        observed, prior_refs = production_comparison(args, comparison, w)
        # Receipt consumers deliberately reject absolute references. Archive input bytes
        # in the data root while continuing to execute programs only from CODE_ROOT.
        archive = args.output.resolve().parent / "frozen-inputs"
        w.require(archive != args.trial and not archive.is_relative_to(args.trial), "Frozen inputs must stay outside the immutable trial")
        refs = a.inventory(w.CODE_ROOT, args.recipe)[2]
        program_paths = set(a.PROGRAMS + a.CONTRACTS)
        sources = [w.CODE_ROOT / r["file"] for r in refs if r["file"] not in program_paths]
        sources.append(args.production_backup.resolve())
        snapshots = []
        for i, source in enumerate(sources):
            target = archive / (str(i).zfill(3) + "-" + source.name)
            content = source.read_bytes()
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                w.require(target.read_bytes() == content, "Frozen production input changed")
            else:
                with target.open("xb") as file:
                    file.write(content)
            snapshots.append({"source": w.reference(source), "snapshot": w.reference(target)})
        context.update(dataRoot=str(w.ROOT.resolve()), evidenceDirectory=str(args.trial),
                       public=observed, acceptedReferences=prior_refs,
                       productionAcceptanceReady=True, frozenInputSnapshots=snapshots)
        context["frozenReferences"] = [w.reference(args.trial / "bundle-manifest.json")] + [r["snapshot"] for r in snapshots]
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


def execute(args, w):
    if args.command == "film-production-review":
        # Read-only comparison. Programs are from CODE_ROOT, receipts only from data ROOT.
        return review(args, w)
    a = core(w)
    args.acceptances = w.ROOT / "datasets/manga-collection"
    args.releases = w.ROOT / "datasets/public-kg/releases"
    args.continuation = args.continuation_sha = None
    w.require(w.gate.file_hash(args.decision) == args.decision_sha, "Human film decision hash differs")
    decision = w.read(args.decision)
    w.require(decision.get("sourceKind") == KIND, "Film human decision required")
    guarded = SimpleNamespace(**vars(w))
    guarded.film_receipt_in_progress = {
        "file": str(args.acceptances / ("accepted-" + a.slug(decision["decisionId"], w)) / "acceptance.json"),
        "decisionId": decision["decisionId"], "decisionSha256": args.decision_sha,
        "acceptedRecordIds": decision["acceptedRecordIds"]}
    context, _, _, _ = bundle(a.checked_reference(decision["review"], w).parent, guarded)
    w.require(context.get("productionAcceptanceReady") is True, "Historical beta comparison cannot authorize production acceptance")
    evidence = a.evidence_module(w)
    with evidence.worker_guard(args, w):
        for path in args.acceptances.glob("accepted-*/acceptance.json"):
            receipt = w.read(path)
            if receipt.get("decisionId") == decision["decisionId"]:
                continue
            w.require(not any(set(receipt["acceptedRecordIds"][f]) & set(decision["acceptedRecordIds"][f]) for f in w.FIELDS),
                      "Selected UUID is owned by another formal receipt; do not reaccept")
        return a.execute(args, guarded)
