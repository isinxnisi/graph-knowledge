"""film-discovery-v1: offline candidates, read-only review and acceptance preflight.
Independent experimental entry point; no network, approval, acceptance or DB write.
"""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import uuid
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("entities", "claims", "sources", "citations")
SEMANTIC = ("subjectId", "objectId", "predicate", "polarity", "period", "contribution", "organizationParticipation", "eventParticipation")
ROLES = {"DIRECTING": "DIRECTING", "CAST": "ACTING"}
WORKS = {"Q104137", "Q184255", "Q76479"}
PROGRAMS = ("scripts/collect-film-v1.py", "scripts/freeze-film-comparison.py", "scripts/film41-runtime.ts", "package.json", "package-lock.json")
# Bind transitive runtime/semantic dependencies, not only the top-level fixture validator.
CONTRACTS = ("lib/domain/api.ts", "lib/domain/contribution.ts", "lib/domain/evidence.ts", "lib/domain/dates.ts", "lib/domain/fixture.ts", "lib/domain/predicates.ts", "lib/domain/qualifications.ts", "lib/domain/organization-participation.ts", "lib/domain/event-participation.ts", "lib/domain/public-release.ts", "lib/server/public-dataset.ts", "lib/server/mappers.ts", "lib/domain/relation-conditions.ts", "lib/domain/relation-patterns.ts", "lib/server/relation-pattern-execution.ts", "vocabulary/contribution-roles/catalog.json", "vocabulary/contribution-roles/baseline-v1.json", "vocabulary/contribution-roles/reviews.json")
def need(ok, message):
    if not ok: raise ValueError(message)
def dump(value): return json.dumps(value, ensure_ascii=False, indent=2) + "\n"
def digest(value): return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path):
    data = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json.loads(data)
def safe(root, value):
    need(isinstance(value, str) and not Path(value).is_absolute() and ".." not in Path(value).parts, "Unsafe input path")
    result = (root / value).resolve()
    need(result.is_relative_to(root.resolve()), "Input escapes root")
    return result
def url(value):
    parts = urlsplit(value)
    need(parts.scheme in ("https", "http") and parts.netloc and not parts.username and not parts.password, "Invalid source URL")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), parts.query, ""))
def uid(key):
    # New provisional namespace. Never reuse Issue #40's transient graph UUIDs.
    return str(uuid.UUID(bytes=hashlib.sha256(("plunode:film-discovery-v1:provisional:" + key).encode()).digest()[:16], version=4))
def semantic(row): return {k: row.get(k) for k in SEMANTIC}
def inventory(root, recipe_path):
    recipe = load(recipe_path)
    need(set(recipe) == {"schemaVersion", "adapter", "recordedAt", "targets", "minimum", "inputs", "maxClaims"}, "Unexpected recipe fields")
    need(recipe["schemaVersion"] == 1 and recipe["adapter"] == "film-discovery-v1", "Unsupported film adapter")
    need(set(recipe["targets"]) == WORKS and len(recipe["targets"]) == 3, "This pilot is bounded to the existing three works")
    need(2 <= recipe["maxClaims"] <= 12, "Claim bound exceeded")
    need(set(recipe["inputs"]) == {"candidates", "sourceReviews", "priorFixture", "roleProposal", "supplements", "comparison"}, "Input inventory mismatch")
    refs = [{"file": str(recipe_path.resolve().relative_to(root.resolve())), "sha256": sha(recipe_path)}]
    inputs = {}
    for name, ref in recipe["inputs"].items():
        need(set(ref) == {"file", "sha256"}, "Explicit file/hash reference required")
        path = safe(root, ref["file"])
        need(path.is_file() and sha(path) == ref["sha256"], "Frozen input changed: " + ref["file"])
        inputs[name] = load(path)
        refs.append(ref)
    for credit in inputs["supplements"]["credits"]:
        ref = credit["excerpt"]
        path = safe(root, ref["file"])
        need(sha(path) == ref["sha256"], "Credit excerpt changed")
        need(path.read_text() == "\n".join(ref["tokens"]) + "\n", "Excerpt/token mismatch")
        refs.append({"file": ref["file"], "sha256": ref["sha256"]})
    refs += [{"file": p, "sha256": sha(safe(root, p))} for p in (*PROGRAMS, *CONTRACTS)]
    need(inputs["roleProposal"]["status"] == "proposal-not-approved" and inputs["roleProposal"]["reviewer"] is None, "Research must not fabricate a Role approval")
    need({r["id"] for r in inputs["roleProposal"]["entries"]} == {"ACTING", "DIRECTING"}, "Unexpected Role proposal")
    need(inputs["comparison"]["authority"] == "frozen-offline-comparison-not-live-production", "Comparison observation must be explicit")
    return recipe, inputs, sorted(refs, key=lambda r: r["file"])

def build(root=ROOT, recipe_path=None):
    root = root.resolve()
    recipe_path = recipe_path or root / "datasets/film-collection/v1/recipe.json"
    recipe, inputs, refs = inventory(root, recipe_path)
    original, prior = inputs["candidates"], inputs["priorFixture"]
    need(original["not_an_import"] and not original["formal_acceptance"] and not prior["formalAcceptance"], "Research inputs are not accepted data")
    comparison = inputs["comparison"]["records"]
    for f in FIELDS:
        need(len({x["record"]["id"] for x in comparison[f]}) == len(comparison[f]), "Duplicate comparison UUID")
        need(all(x["state"] in ("published", "withdrawn", "formally-accepted-unapplied") for x in comparison[f]), "Unverified comparison state")
    entities_by_qid = {e["id"]: e for e in original["entities"]}
    source_reviews = {s["id"]: s for s in inputs["sourceReviews"]}
    rows = [c for c in original["candidates"] if c["object"] in WORKS and c["relation"] == "CREDIT" and c["state"] == "checked-source-candidate" and c["research_role"] in ROLES]
    # Cross-check the exact finite selection from Issue #40 rather than inventing a new survey.
    selected_ids = {c["candidateId"] for c in prior["claims"]}
    rows = [c for c in rows if c["id"] in selected_ids]
    need(len(rows) == len(selected_ids) == 12 and len(rows) <= recipe["maxClaims"], "Saved pilot selection changed")
    qids = {q for c in rows for q in (c["subject"], c["object"])}
    records = {f: [] for f in FIELDS}
    entity_ids, identities, identity_issues = {}, [], {}
    timestamp = recipe["recordedAt"]
    for qid in sorted(qids):
        entity = entities_by_qid[qid]
        need(entity["kind"] in ("person", "work"), "Invalid credit endpoint kind")
        if qid in WORKS:
            values = [s["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for s in entity["metadata_evidence"]["P31"]]
            need(entity["kind"] == "work" and entity["research_subtype"] == "film" and "Q11424" in values, "Saved provider does not identify a film")
        matches = [r for r in comparison["entities"] if any(e["namespace"] == "wikidata" and e["value"] == qid for e in r["record"]["externalIds"])]
        need(len(matches) <= 1, "Ambiguous external ID ownership")
        if matches:
            existing = matches[0]["record"]
            need(existing["kind"] == entity["kind"], "Identity kind conflict")
            entity_ids[qid] = existing["id"]
            records["entities"].append(copy.deepcopy(existing))
            identities.append({"qid": qid, "id": existing["id"], "state": matches[0]["state"], "action": "reuse-existing-uuid"})
        else:
            ident = uid("entity:" + qid); entity_ids[qid] = ident
            labels = [v["value"] for v in entity["labels"].values()]
            aliases = [a["value"] for group in entity["aliases"].values() for a in group]
            name = entity["labels"].get("ja", entity["labels"].get("en"))["value"]
            records["entities"].append({"id": ident, "kind": entity["kind"], "name": name, "description": None, "aliases": sorted(set(labels + aliases) - {name}), "externalIds": [{"namespace": "wikidata", "value": qid}], "event": None, "createdAt": timestamp, "updatedAt": timestamp})
            identities.append({"qid": qid, "id": ident, "state": "provisional-candidate", "action": "new-draft-uuid-requires-final-identity-check"})
        if entity["kind"] == "person" and not entity["labels"].get("en"):
            identity_issues[qid] = "person-name-unconfirmed"
    supplements = {}
    for c in inputs["supplements"]["credits"]:
        key = (c["personQid"], c["filmQid"], c["proposedRole"])
        need(key not in supplements and c["filmQid"] in WORKS and c["proposedRole"] in ROLES.values(), "Ambiguous/unsupported supplement")
        need(not c["formalAcceptance"] and c["httpStatus"] == 200 and c["language"] == "en", "Invalid factual supplement")
        need(c["personText"] == entities_by_qid[c["personQid"]]["labels"]["en"]["value"], "Person identity/text mismatch")
        need(c["personText"] in c["excerpt"]["tokens"] and c["originalRoleText"] in c["excerpt"]["tokens"], "Credit does not bind person and role")
        need(c["proposedRole"] != "ACTING" or (c["originalRoleText"] in ("CAST", "Cast", "Cast:") and c["characterText"] in c["excerpt"]["tokens"] and c["characterText"] != c["personText"]), "Acting requires an explicit dramatic character and cast term")
        need(url(c["sourceUrl"]) == {"Q104137": "https://catalog.afi.com/Film/67274-UNFORGIVEN", "Q184255": "https://catalog.afi.com/Catalog/moviedetails/54369"}.get(c["filmQid"]), "Supplement work/source identity mismatch")
        need(c["proposedRole"] != "DIRECTING" or c["originalRoleText"] in ("Dir", "Director", "Directed by"), "Unsupported directing term")
        supplements[key] = c
    source_rows, citation_provenance, ledger = {}, {}, []
    known_sources = comparison["sources"]
    for c in sorted(rows, key=lambda r: r["id"]):
        role = ROLES[c["research_role"]]
        need(c["provenance"]["entity"] == c["object"] and c["provenance"]["property"] == {"DIRECTING": "P57", "CAST": "P161"}[c["research_role"]], "Provider statement/Role mismatch")
        need(c["provenance"]["raw_statement"]["mainsnak"]["datavalue"]["value"]["id"] == c["subject"], "Provider subject identity mismatch")
        key = (c["subject"], c["object"], role)
        credit = supplements.get(key)
        claim_id = uid("claim:" + digest([*key, "CONTRIBUTED_TO", "affirmed", None, None]))
        claim = {"id": claim_id, "subjectId": entity_ids[c["subject"]], "objectId": entity_ids[c["object"]], "predicate": "CONTRIBUTED_TO", "polarity": "affirmed", "period": {"from": None, "to": None}, "visibility": "hidden", "createdAt": timestamp, "updatedAt": timestamp, "contribution": {"roleId": role, "scope": None}, "organizationParticipation": None, "eventParticipation": None}
        reasons = []
        if not credit: reasons.append("person-credit-excerpt-not-supplemented-in-this-minimum")
        if c["subject"] in identity_issues: reasons.append(identity_issues[c["subject"]])
        if c["scope"]["cut"] or c["scope"]["territory"] or c["scope"]["language"]: reasons.append("version-specific-scope-not-supported")
        # null scope is unstructured; an identical tuple is only a potential duplicate, never proof of equal scope.
        possible = [r for r in comparison["claims"] if semantic(r["record"]) == semantic(claim)]
        if possible: reasons.append("potential-existing-claim-null-scope-needs-human-comparison")
        records["claims"].append(claim)
        relevant = [x for x in c["citations"] if x["stance"] == "support"]
        for cite in relevant:
            source = source_reviews[cite["source_id"]]
            need(c["subject"] in source["supports"][c["provenance"]["property"]], "Saved source does not support this person/role")
        supports = [credit] if credit else []
        # A held candidate keeps the prior locator and term, without inventing a personal credit excerpt.
        if not credit:
            for cite in relevant:
                source = source_reviews[cite["source_id"]]
                supports.append({"sourceUrl": source["url"], "title": source["title"], "publisher": source["publisher"], "locator": cite["locator"], "language": source["language"], "retrievedAt": source["accessed_on"], "originalRoleText": cite["original_role_heading"], "id": source["id"]})
        citation_ids = []
        for source in supports:
            source_url = url(source["sourceUrl"])
            matches = [r for r in known_sources if r["record"].get("url") and url(r["record"]["url"]) == source_url]
            need(len(matches) <= 1, "Ambiguous Source URL reuse")
            sr = copy.deepcopy(matches[0]["record"]) if matches else {"id": uid("source:" + source_url), "kind": "web", "title": source["title"], "authors": [], "publisher": source["publisher"], "url": source_url, "publishedAt": None, "edition": None, "note": "映画作品クレジットの候補資料。版・地域・言語への適用は未構造化。", "isDemo": False}
            source_rows[sr["id"]] = sr
            cid = uid("citation:" + digest([claim_id, sr["id"], source["locator"]]))
            term = source["originalRoleText"]
            citation = {"id": cid, "claimId": claim_id, "sourceId": sr["id"], "locator": source["locator"], "note": "原語は選択した人物別credit行。資料採録時点の候補記録であり、現在の語彙採用・Claim受入状態は正式catalog／receiptを参照。" if credit else "先行研究の人物・作品・役割対応。人物別原文は未補足。", "accessedAt": source["retrievedAt"].split("T")[0], "stance": "support", "roleEvidence": {"originalText": term, "language": source["language"]} if term else None, "positionEvidence": None, "eventParticipationEvidence": None}
            records["citations"].append(citation); citation_ids.append(cid)
            citation_provenance[cid] = {"supplementId": credit["id"] if credit else None, "excerptSha256": credit["excerpt"]["sha256"] if credit else None, "priorSourceIds": [x["source_id"] for x in relevant]}
        ledger.append({"candidateId": c["id"], "claimId": claim_id, "subjectQid": c["subject"], "workQid": c["object"], "proposedRole": role, "status": "held" if reasons else "ready-for-human-review", "reasons": reasons, "scope": c["scope"], "scopeInterpretation": "null is unstructured, not all cuts/territories/languages", "wikidata": c["provenance"], "priorCitations": c["citations"], "citationIds": citation_ids, "potentialExisting": [{"id": r["record"]["id"], "state": r["state"]} for r in possible]})
    records["sources"] = list(source_rows.values())
    for f in FIELDS: records[f].sort(key=lambda x: x["id"])
    ready = {r["claimId"] for r in ledger if r["status"] == "ready-for-human-review"}
    minimum = {(r["subjectQid"], r["workQid"], r["proposedRole"]) for r in recipe["minimum"]}
    need(minimum == {("Q43203", "Q104137", "ACTING"), ("Q43203", "Q184255", "DIRECTING")}, "Minimum question changed")
    subset = {f: [] for f in FIELDS}
    subset["claims"] = [r for r in records["claims"] if r["id"] in ready]
    cite = [r for r in records["citations"] if r["claimId"] in ready]
    ids = {q for c in subset["claims"] for q in (c["subjectId"], c["objectId"])}
    subset["entities"] = [e for e in records["entities"] if e["id"] in ids]
    subset["sources"] = [s for s in records["sources"] if s["id"] in {x["sourceId"] for x in cite}]
    subset["citations"] = cite
    # Explicit IDs, per-record hashes and all dependencies for a future human decision.
    record_hashes = {f: {r["id"]: digest(r) for r in subset[f]} for f in FIELDS}
    binding = {"adapter": recipe["adapter"], "inputs": refs, "records": record_hashes, "roleStatus": "proposal-not-approved"}
    binding_hash = digest(binding)
    blockers = ["film-role-human-adoption", "claim-human-acceptance", "fresh-public-and-receipt-observation-before-real-acceptance", "provisional-uuid-promotion-or-existing-identity-mapping"]
    review = {"schemaVersion": 1, "kind": "film-discovery-v1-isolated-review", "authority": "pending-human-review-only", "bindingSha256": binding_hash, "counts": {"candidates": len(rows), "ready": len(ready), "held": len(rows) - len(ready)}, "comparison": {k: v for k, v in inputs["comparison"].items() if k != "records"}, "identities": identities, "claims": [{k: v for k, v in r.items() if k not in ("wikidata", "priorCitations")} for r in ledger], "evidenceByClaim": {r["claimId"]: supplements[(r["subjectQid"], r["workQid"], r["proposedRole"])] for r in ledger if r["status"] == "ready-for-human-review"}, "citationProvenance": citation_provenance, "adoptionBlockers": blockers, "formalAcceptance": False, "publicApply": False}
    decision = {"schemaVersion": 1, "kind": "film-review-decision-draft-not-an-acceptance-command", "status": "draft-not-approved", "reviewer": None, "reviewedAt": None, "humanDecision": None, "bindingSha256": binding_hash, "recordSha256": record_hashes, "selectedRecordIds": {f: [r["id"] for r in subset[f]] for f in FIELDS}, "roleProposalSha256": recipe["inputs"]["roleProposal"]["sha256"], "scopeByClaim": [semantic(r) | {"id": r["id"]} for r in subset["claims"]], "dependencies": {f: [r["id"] for r in subset[f]] for f in ("entities", "sources")}, "applyAuthorized": False}
    achieved = minimum <= {(r["subjectQid"], r["workQid"], r["proposedRole"]) for r in ledger if r["status"] == "ready-for-human-review"}
    preflight = {"schemaVersion": 1, "authority": "technical-preflight-not-formal-acceptance", "bindingSha256": binding_hash, "minimumEvidenceReady": achieved, "readyClaims": sorted(ready), "closedDependencies": True, "duplicateComparison": "supplied-frozen-public-plus-receipt-covered-records", "runtimeRoleValidation": "recognized-pending-role-schema; public-release-rejects-unapproved-film-roles", "adoptionBlockers": blockers, "formalAcceptance": False, "publicApply": False}
    markdown = "# 映画候補・判断待ちレビュー\n\n候補12件。人物別原文の補足済み " + str(len(ready)) + "件、保留 " + str(len(rows)-len(ready)) + "件。語彙・Claimとも正式受入前です。\n\n"
    for r in ledger:
        markdown += "- " + r["workQid"] + " ← " + r["subjectQid"] + " / " + r["proposedRole"] + ": " + r["status"] + " / " + r["claimId"] + "\n"
    markdown += "\n## 今回の人物別根拠と判断\n\n"
    for row in ledger:
        if row["status"] != "ready-for-human-review": continue
        credit = supplements[(row["subjectQid"], row["workQid"], row["proposedRole"])]
        work = entities_by_qid[row["workQid"]]["labels"].get("ja", entities_by_qid[row["workQid"]]["labels"]["en"])["value"]
        markdown += "### " + work + " / Clint Eastwood / " + row["proposedRole"] + "\n\n"
        markdown += "判断対象Claim UUID: " + row["claimId"] + "。肯定、人物→作品、scope:null（未構造化）、periodは両端null。\n\n"
        markdown += "[AFIの人物別credit](" + credit["sourceUrl"] + ") / " + credit["locator"] + "。保存した原役割語: " + credit["originalRoleText"] + "。"
        markdown += ("役柄: " + credit["characterText"] + "。" if credit["characterText"] else "") + "\n\n"
        markdown += "同定注記: " + credit["identityNote"] + "\n\n"
        markdown += "抜粋byte・人物／役割対応・取得時刻は review/review.json のevidenceByClaim。Roleの包含境界とnull scopeを含む個別Claimの採否は人間判断が必要。\n\n"
    markdown += "\n最小経路の人物別creditは review/proposed-records.json、固定本文hashと依存は review/decision-draft.json。元Claimはhiddenのまま。preflight.jsonは技術確認で、正式受入・公開の許可ではありません。\n"
    files = {"candidate/data.json": dump({"schemaVersion": 4, **records}), "candidate/manifest.json": dump({"schemaVersion": 1, "adapter": recipe["adapter"], "authority": "unaccepted-candidates-only", "notForCurrentPublicApply": True, "dataSha256": hashlib.sha256(dump({"schemaVersion": 4, **records}).encode()).hexdigest(), "binding": binding}), "ledger.json": dump({"schemaVersion": 1, "adapter": recipe["adapter"], "records": ledger}), "held.json": dump([r for r in ledger if r["status"] == "held"]), "review/proposed-records.json": dump({"schemaVersion": 1, "authority": "unaccepted-proposal-only", "records": subset}), "review/review.json": dump(review), "review/decision-request.json": dump({"authority": "pending-human-review-only", "binding": binding, "bindingSha256": binding_hash}), "review/decision-draft.json": dump(decision), "preflight.json": dump(preflight), "README.md": markdown}
    files["bundle-manifest.json"] = dump({"schemaVersion": 1, "authority": "immutable-isolated-film-review-not-acceptance", "bindingSha256": binding_hash, "inputs": refs, "artifacts": {k: hashlib.sha256(v.encode()).hexdigest() for k, v in files.items()}})
    # Detect changed inputs even if another process edits them during preparation.
    need(inventory(root, recipe_path)[2] == refs, "Inputs changed while preparing review")
    return files

def verify(directory, root=ROOT, recipe_path=None):
    manifest = load(directory / "bundle-manifest.json")
    need(manifest["authority"] == "immutable-isolated-film-review-not-acceptance", "Not a film review bundle")
    actual = {str(p.relative_to(directory)): sha(p) for p in directory.rglob("*") if p.is_file() and p.name != "bundle-manifest.json"}
    need(actual == manifest["artifacts"], "Review artifact inventory/hash mismatch")
    for ref in manifest["inputs"]:
        need(sha(safe(root, ref["file"])) == ref["sha256"], "Review input changed: " + ref["file"])
    draft = load(directory / "review/decision-draft.json")
    need(draft["status"] == "draft-not-approved" and draft["reviewer"] is None and not draft["applyAuthorized"], "No formal decisions may be written by this experiment")
    expected = build(root, recipe_path)
    need({str(p.relative_to(directory)): p.read_text() for p in directory.rglob("*") if p.is_file()} == expected, "Bundle differs from deterministic frozen inputs")
    return load(directory / "preflight.json")

def run(output, root=ROOT, recipe_path=None):
    files = build(root, recipe_path)
    if output.exists():
        need({str(p.relative_to(output)): p.read_text() for p in output.rglob("*") if p.is_file()} == files, "Immutable output differs; choose a new experiment directory")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".film-v1-", dir=output.parent) as tmp:
            staging = Path(tmp) / "bundle"; staging.mkdir()
            for name, text in files.items():
                path = staging / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)
            need(not output.exists(), "Output appeared during preparation")
            staging.rename(output)
    return verify(output, root, recipe_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "verify"])
    parser.add_argument("--recipe", type=Path, default=ROOT / "datasets/film-collection/v1/recipe.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        value = run(args.output.resolve(), ROOT, args.recipe.resolve()) if args.command == "prepare" else verify(args.output.resolve(), ROOT, args.recipe.resolve())
        print(json.dumps(value, ensure_ascii=False, indent=2))
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, str(error) + "\n")
