"""Offline research projection; never an import or acceptance artifact."""
from pathlib import Path
import hashlib
import json
import uuid

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "film-discovery-pilot-20261026"
def uid(key):
    return str(uuid.UUID(bytes=hashlib.sha256(("issue40-research:" + key).encode()).digest()[:16], version=4))

def build():
    data = json.loads((PRIOR / "CANDIDATES.json").read_text())
    reviews = {s["id"]: s for s in json.loads((PRIOR / "source_reviews.json").read_text())}
    films = {"Q104137", "Q184255", "Q76479"}
    selected = [c for c in data["candidates"] if c["object"] in films and c["state"] == "checked-source-candidate" and c["research_role"] in ("DIRECTING", "CAST")]
    # One source-qualified Leone credit is retained; WD parallel statements are not independent credits.
    unique = {}
    for c in sorted(selected, key=lambda c: c["id"]):
        unique.setdefault((c["subject"], c["object"], c["research_role"]), c)
    selected = list(unique.values())
    ids = {q for c in selected for q in (c["subject"], c["object"])}
    entities = [{"id": uid(e["id"]), "qid": e["id"], "kind": e["kind"], "name": e["labels"].get("en", e["labels"]["ja"])["value"], "description": None} for e in data["entities"] if e["id"] in ids]
    claims = []
    sources = {}
    for c in selected:
        citations = []
        for cite in c["citations"]:
            if cite["stance"] != "support":
                continue
            source = reviews[cite["source_id"]]
            assert c["subject"] in source["supports"][c["provenance"]["property"]]
            sources[source["id"]] = {**source, "runtimeId": uid("source:" + source["id"])}
            term = cite["original_role_heading"]
            citations.append({"id": uid(c["id"] + source["id"]), "sourceId": source["id"], "locator": cite["locator"], "roleEvidence": {"originalText": term, "language": source["language"]} if term else None, "evidenceLimit": "credit heading only; personal credit checked in prior notes; no full source transcript"})
        assert citations
        claims.append({"id": uid(c["id"]), "candidateId": c["id"], "subjectId": uid(c["subject"]), "objectId": uid(c["object"]), "predicate": "CONTRIBUTED_TO", "polarity": "affirmed", "contribution": {"roleId": "DIRECTING" if c["research_role"] == "DIRECTING" else "ACTING", "scope": None}, "period": {"from": None, "to": None}, "sourceCount": len(citations), "organizationParticipation": None, "eventParticipation": None, "citations": citations, "scopeNote": c["scope"], "wikidataStatement": c["provenance"]["statement_id"], "formalAcceptance": False})
    return {"schema": "issue40-isolated-fixture-v1", "notAnImport": True, "formalAcceptance": False, "published": False, "basis": "461cd1ca614e5bebefd8181eecb0e89661d4a616", "inputs": {name: hashlib.sha256((PRIOR / name).read_bytes()).hexdigest() for name in ["CANDIDATES.json", "source_reviews.json"]}, "entities": entities, "claims": claims, "sources": list(sources.values()), "droppedParallelStatements": len(selected) != len([c for c in data["candidates"] if c["object"] in films and c["state"] == "checked-source-candidate" and c["research_role"] in ("DIRECTING", "CAST")])}

if __name__ == "__main__":
    import sys
    serialized = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    target = HERE / "fixture.json"
    if "--check" in sys.argv:
        assert target.read_text() == serialized, "Fixture changed"
        print("Offline fixture and saved input hashes verified")
    else:
        target.write_text(serialized)
