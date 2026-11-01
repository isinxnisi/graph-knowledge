"""Read-only design experiment. No app imports, network, services, or database writes.

This checks manually specified semantics and revision policies on synthetic records.
It is not a production test, extraction model, recall benchmark, or timing benchmark.
Run: python3 verify_fixture.py
"""
import copy
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
fixture = json.loads((HERE / "fixture.json").read_text())
records = copy.deepcopy(fixture["records"])
checks = []

def check(name, condition, observed):
    checks.append({"check": name, "pass": bool(condition), "observed": observed})
    if not condition:
        raise AssertionError(name)

def exact(concept, mappings):
    return sorted(r["id"] for r in records if mappings.get(r["id"]) == concept)

def lexical(term):
    return sorted(r["id"] for r in records if term in r["text"])

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

original_hash = digest(records)
mapping = {r["id"]: r["concept"] for r in records}
check("same label has separate meanings; accepted contextual synonym joins", exact("film_directing", mapping) == fixture["expected"]["film_directing"], exact("film_directing", mapping))
check("unknown relation remains lexically findable", lexical("復刊") == fixture["expected"]["raw_reprint_hits"], lexical("復刊"))
check("unknown relation is not silently in exact normalized results", exact("reprint_proposal", mapping) == [], exact("reprint_proposal", mapping))
check("invitation is not participation", exact("participated_in", mapping) == fixture["expected"]["participated_in"], exact("participated_in", mapping))

# A deliberately bad word-only mapping is repaired at assignment level.
bad_mapping = dict(mapping, s4="film_directing")
before = exact("film_directing", bad_mapping)
mapping_revision_2 = dict(bad_mapping, s4="sports_coaching")
after = exact("film_directing", mapping_revision_2)
check("repair removes false positive without rewriting original evidence", before == ["s3", "s4", "s5"] and after == ["s3", "s5"] and digest(records) == original_hash, {"before":before,"after":after,"original_unchanged":digest(records)==original_hash})

# Relabeling a concept affects labels, not assignment identity.
concept_labels = {"film_directing":"映画監督", "sports_coaching":"スポーツの監督"}
concept_labels["film_directing"] = "映画の監督担当"
check("label edit keeps exact query identity", exact("film_directing", mapping_revision_2) == ["s3", "s5"], exact("film_directing", mapping_revision_2))

# Merge a reviewed synonym while retaining per-assertion provenance.
before_merge = dict(mapping_revision_2, s5="film_directing_alias_concept")
merged = {k:("film_directing" if v=="film_directing_alias_concept" else v) for k,v in before_merge.items()}
check("reviewed concept merge preserves statement identities", exact("film_directing", merged) == ["s3", "s5"] and len(records)==11, exact("film_directing", merged))

# A Capsule references a saved revision; current view uses the new one.
saved_capsule = {"statement":copy.deepcopy(records[1]),"source_revision":1,"private_note":"この復刊のつながりが面白い"}
capsule_hash = digest(saved_capsule)
revision2 = dict(copy.deepcopy(records[1]), **fixture["correction"])
current = {r["id"]:r for r in records}
current["s2"] = revision2
mapping_revision_3 = dict(merged, s2="reprint_proposal")
change_notice = {"statement_id":"s2", "saved_revision":1, "current_revision":2, "kind":"scope_correction"}
check("scope correction preserves shared snapshot and supplies explicit comparison", digest(saved_capsule)==capsule_hash and current["s2"]["scope"]=={"edition":"復刻特装版"} and change_notice["saved_revision"]!=change_notice["current_revision"], {"current_scope":current["s2"]["scope"],"saved_scope":saved_capsule["statement"]["scope"],"notice":change_notice})
check("new mapping makes the same statement available to exact search", exact("reprint_proposal", mapping_revision_3)==["s2"], exact("reprint_proposal", mapping_revision_3))

# Period semantics are retained; qualitative positions have no fake epoch.
qualitative = next(r["time"] for r in records if r["id"]=="s9")
cycle = next(r["time"] for r in records if r["id"]=="s10")
months = [m for m in range(1,13) if m>=cycle["from"] or m<=cycle["to"]]
check("cyclic interval crosses origin without becoming reversed date range", months==[1,2,10,11,12], months)
check("qualitative axis and undated note are not coerced to dates", "at" not in qualitative and "year" not in qualitative and records[-1]["time"] is None, {"qualitative":qualitative,"note_time":records[-1]["time"]})

# Current-shape screen, transcribed from the pinned schema. Not an app execution.
endpoints = {"CONTRIBUTED_TO":("person","work"), "PARTICIPATED_IN":("person","event")}
legacy = sorted(r["id"] for r in records if r["legacy_predicate"] in endpoints and (fixture["entities"][r["subject"]],fixture["entities"].get(r["object"]))==endpoints[r["legacy_predicate"]])
check("pinned model screen identifies preserved current subset", legacy==fixture["expected"]["legacy_representable"], legacy)

result = {"experiment":"synthetic semantic and revision policy checks", "limits":"No AI, browser, real sources, application runtime, load, latency or cost measurement. Four-option comparison is design analysis, not four implemented systems.","fixture_sha256":hashlib.sha256((HERE/"fixture.json").read_bytes()).hexdigest(),"checks_passed":len(checks),"checks":checks,"policy_comparison":{
  "A_predefined_catalog":"Can expose every record after upfront relation/time definitions and renderer work; four relations fit current published model. This is not an upper bound on option A.",
  "B_uniform_assertion":"All 11 preserve text/evidence immediately; eight endpoint relations can draw once identity is checked. Exact concept query includes only reviewed assignments.",
  "C_typed_core_fallback":"Four fit existing typed core; four relations and three episode/note records need fallback and shared discovery. Same coverage as B only after cross-regime contracts.",
  "D_dossier_event":"All 11 can remain source-linked blocks in a theme; cross-theme exact relation results require an extracted assertion index with mapping and correction responsibilities."
}}
(HERE / "verification-results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({"checks_passed":len(checks),"fixture_sha256":result["fixture_sha256"],"legacy_subset":legacy},ensure_ascii=False))
