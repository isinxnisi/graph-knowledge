"""Bounded saved-film candidate manifest. Preparation only; no network or approval."""
import copy, importlib.util, json, tempfile
from datetime import datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("film_saved_helpers", Path(__file__).with_name("collect-film-v1.py"))
base = importlib.util.module_from_spec(spec); spec.loader.exec_module(base)
FIELDS, need, dump, digest, sha, load, safe, uid, url = (getattr(base, k) for k in
    ("FIELDS", "need", "dump", "digest", "sha", "load", "safe", "uid", "url"))
PROGRAMS = (*base.PROGRAMS, "scripts/collect-film-manifest.py")
CONTRACTS = base.CONTRACTS
ADAPTER = "film-saved-manifest-v1"
ROLE_MAP = {"DIRECTING":"DIRECTING", "CAST":"ACTING", "SCREENWRITING":"SCRIPT_WRITING", "PRODUCING":"PRODUCING"}

def inventory(root, recipe_path):
    recipe = load(recipe_path)
    need(set(recipe) == {"schemaVersion","adapter","recordedAt","candidateIds","heldCandidateIds","deferredCandidateIds",
                         "publishedCandidateIds","maxClaims","inputs"}, "Unexpected saved-film manifest fields")
    need(recipe["schemaVersion"] == 1 and recipe["adapter"] == ADAPTER, "Unsupported saved-film manifest")
    need(isinstance(recipe["recordedAt"],str) and recipe["recordedAt"].endswith("Z"),"Manifest timestamp must use the existing UTC Z format")
    datetime.fromisoformat(recipe["recordedAt"].replace("Z","+00:00"))
    need(0 < recipe["maxClaims"] <= 100 and 0 < len(recipe["candidateIds"]) <= recipe["maxClaims"], "Explicit bounded selection required")
    need(set(recipe["inputs"]) == {"candidates","sourceReviews","comparison","coverage","evidence"}, "Explicit saved-film input inventory required")
    refs = [{"file":str(recipe_path.resolve().relative_to(root.resolve())),"sha256":sha(recipe_path)}]
    inputs = {}
    for name, ref in recipe["inputs"].items():
        need(set(ref)=={"file","sha256"} and sha(safe(root,ref["file"]))==ref["sha256"], "Saved-film input hash changed: "+name)
        inputs[name] = load(safe(root,ref["file"])); refs.append(ref)
    for ref in inputs["evidence"].get("references",[]):
        need(sha(safe(root,ref["file"]))==ref["sha256"],"Supplement reference hash changed"); refs.append(ref)
    refs += [{"file":p,"sha256":sha(safe(root,p))} for p in (*PROGRAMS,*CONTRACTS)]
    need(inputs["comparison"]["authority"]=="frozen-offline-comparison-not-live-production","Explicit offline comparison required")
    return recipe,inputs,sorted(refs,key=lambda r:r["file"])

def inspect(root, recipe_path, *, check_selection=True):
    recipe,inputs,refs = inventory(root,recipe_path)
    original=inputs["candidates"]; candidates={c["id"]:c for c in original["candidates"]}
    need(len(candidates)==len(original["candidates"])==124,"Saved all-candidate inventory changed")
    sets=[recipe[k] for k in ["candidateIds","deferredCandidateIds","publishedCandidateIds"]]
    need(all(len(s)==len(set(s)) for s in sets),"Duplicate candidate selection")
    need(len(set().union(*map(set,sets)))==sum(map(len,sets))==len(candidates)
         and set().union(*map(set,sets))==set(candidates),"Candidate selection/deferred/published coverage differs")
    adopted={r["researchCandidateId"] for r in inputs["coverage"]["records"] if r["formalClaimId"]}
    need(set(recipe["publishedCandidateIds"])==adopted and len(adopted)==2,"Published Claim exclusion differs")
    entities={e["id"]:e for e in original["entities"]}; sources={s["id"]:s for s in inputs["sourceReviews"]}
    need(len(entities)==97,"Saved Entity inventory changed")
    known=inputs["comparison"]["records"]
    need(all(len({x["record"]["id"] for x in known[f]})==len(known[f]) for f in FIELDS),"Comparison UUID collision")
    external={}
    for row in known["entities"]:
        for ext in row["record"]["externalIds"]:
            if ext["namespace"]=="wikidata":
                need(ext["value"] not in external,"Ambiguous comparison identity");external[ext["value"]]=row["record"]
    mappings={}; entity_records={}
    for qid,e in entities.items():
        old=external.get(qid); labels=[v["value"] for v in e["labels"].values()]
        aliases=[a["value"] for group in e["aliases"].values() for a in group]
        if old:
            need(old["kind"]==e["kind"],"External identity kind differs")
            row=copy.deepcopy(old); status="reuse-existing-uuid"; collisions=[]
        else:
            name=e["labels"].get("ja",e["labels"].get("en",{})).get("value")
            need(name,"Missing Entity label")
            row={"id":uid("entity:"+qid),"kind":e["kind"],"name":name,"description":None,
                 "aliases":sorted(set(labels+aliases)-{name}),"externalIds":[{"namespace":"wikidata","value":qid}],
                 "event":None,"createdAt":recipe["recordedAt"],"updatedAt":recipe["recordedAt"]}
            norm=lambda s:"".join(s.casefold().split())
            names={norm(n) for n in [name,*row["aliases"]]}
            collisions=[x["record"]["id"] for x in known["entities"] if x["record"]["kind"]==e["kind"]
                        and names & {norm(n) for n in [x["record"]["name"],*x["record"]["aliases"]]}]
            status="identity-judgment" if collisions else "proposed-new-uuid"
        mappings[qid]={"qid":qid,"id":row["id"],"status":status,"existingCandidates":collisions,
                        "requiresHumanIdentityDecision":not bool(old)}
        entity_records[qid]=row
    supplements={e["candidateId"]:e for e in inputs["evidence"].get("credits",[])}
    need(len(supplements)==len(inputs["evidence"].get("credits",[])) and set(supplements)<=set(recipe["candidateIds"]),
         "Supplement outside explicit selection or duplicate")
    rows=[]; all_records={f:[] for f in FIELDS}; proposal={f:[] for f in FIELDS}
    source_records={}; new_entities={}; new_sources={}
    for ident in recipe["candidateIds"]:
        c=candidates[ident]; reasons=[]
        need(c["state"]=="checked-source-candidate" and c["relation"]=="CREDIT" and c["research_role"] in ROLE_MAP,
             "Manifest cannot expand saved checked credits")
        prop=c["provenance"]["property"]; role=ROLE_MAP[c["research_role"]]
        need(prop=={"DIRECTING":"P57","CAST":"P161","SCREENWRITING":"P58","PRODUCING":"P162"}[c["research_role"]]
             and c["provenance"]["entity"]==c["object"]
             and c["provenance"]["raw_statement"]["mainsnak"]["datavalue"]["value"]["id"]==c["subject"],"Saved statement identity differs")
        support=[]
        for cite in c["citations"]:
            if cite["stance"]!="support":continue
            s=sources[cite["source_id"]]
            need(s["film"]==c["object"] and c["subject"] in s["supports"].get(prop,[]),"Saved factual review does not bind credit")
            term=cite.get("original_role_heading") or s.get("role_terms",{}).get(prop)
            support.append({"source":s,"term":term,"locator":cite["locator"],"kind":"saved-factual-person-role-review",
                            "character":None,"identityNote":s["note"]})
        extra=supplements.get(ident)
        if extra:
            need(extra["subjectQid"]==c["subject"] and extra["workQid"]==c["object"] and extra["role"]==role,
                 "Supplement endpoint/role mismatch")
            need(extra["sourceId"] in sources and sources[extra["sourceId"]]["film"]==c["object"]
                 and c["subject"] in sources[extra["sourceId"]]["supports"].get(prop,[]),"Supplement source mismatch")
            need(extra.get("formalAcceptance") is False,"Factual supplement cannot declare formal acceptance")
            need(extra.get("originalRoleText") and extra.get("personText") and extra.get("locator") and extra.get("observedAt"),
                 "Incomplete factual supplement")
            normalize=lambda value:"".join(value.casefold().split())
            matched=normalize(extra["personText"]) in {normalize(value) for value in
                [v["value"] for v in entities[c["subject"]]["labels"].values()] +
                [a["value"] for g in entities[c["subject"]]["aliases"].values() for a in g]}
            need(matched or extra.get("identityNeedsDecision") is True,"Supplement person identity differs")
            if extra.get("identityNeedsDecision"):
                reasons.append("person-name-variant-needs-judgment")
                mappings[c["subject"]]["status"]="identity-judgment"
            support.insert(0,{"source":sources[extra["sourceId"]],"term":extra["originalRoleText"],"locator":extra["locator"],
                "kind":"minimal-factual-supplement","character":extra.get("characterText"),"identityNote":extra["identityNote"]})
        chosen=next((s for s in support if s["term"]),None)
        if not chosen:reasons.append("original-role-term-untranscribed")
        if role=="ACTING" and not (chosen and chosen["character"]):
            reasons.append("dramatic-performance-context-needs-confirmation")
        if any(c["scope"].get(k) for k in ["cut","territory","language"]):reasons.append("structured-film-scope-unsupported")
        if any(k in c["provenance"]["raw_statement"].get("qualifiers",{}) for k in ["P580","P582","P585"]):
            reasons.append("qualified-period-needs-judgment")
        if any(mappings[q]["status"]=="identity-judgment" for q in [c["subject"],c["object"]]):reasons.append("entity-identity-collision")
        claim_id=uid("claim:"+digest([c["subject"],c["object"],role,"CONTRIBUTED_TO","affirmed",None,None]))
        claim={"id":claim_id,"subjectId":mappings[c["subject"]]["id"],"objectId":mappings[c["object"]]["id"],
               "predicate":"CONTRIBUTED_TO","polarity":"affirmed","period":{"from":None,"to":None},"visibility":"hidden",
               "createdAt":recipe["recordedAt"],"updatedAt":recipe["recordedAt"],"contribution":{"roleId":role,"scope":None},
               "organizationParticipation":None,"eventParticipation":None}
        if any(base.semantic(x["record"])==base.semantic(claim) for x in known["claims"]):
            reasons.append("potential-existing-claim-requires-comparison")
        state=("identity-judgment" if any(r in reasons for r in ["entity-identity-collision","person-name-variant-needs-judgment"]) else
               "missing-evidence" if any(r in reasons for r in ["original-role-term-untranscribed","dramatic-performance-context-needs-confirmation"]) else
               "held" if reasons else "ready-for-human-review")
        citations=[]
        if chosen:
            s=chosen["source"]; source_url=url(s["url"])
            matches=[x["record"] for x in known["sources"] if x["record"].get("url") and url(x["record"]["url"])==source_url]
            need(len(matches)<=1,"Ambiguous Source URL")
            sr=copy.deepcopy(matches[0]) if matches else {"id":uid("source:"+source_url),"kind":"web","title":s["title"],
                "authors":[],"publisher":s["publisher"],"url":source_url,"publishedAt":None,"edition":None,
                "note":"保存済み映画資料の人物・作品・原役割対応。適用範囲は未構造化。","isDemo":False}
            source_records[sr["id"]]=sr
            cid=uid("citation:"+digest([claim_id,sr["id"],chosen["locator"]]))
            citations=[{"id":cid,"claimId":claim_id,"sourceId":sr["id"],"locator":chosen["locator"],
                "note":"保存済み照合記録に基づく人物・作品・役割の対応。個人別原文の再構成ではない。"+
                       (" 役柄: "+chosen["character"]+"。" if chosen["character"] else ""),
                "accessedAt":(extra["observedAt"] if chosen["kind"]=="minimal-factual-supplement" else s["accessed_on"]).split("T")[0],
                "stance":"support","roleEvidence":{"originalText":chosen["term"],"language":s["language"]},
                "positionEvidence":None,"eventParticipationEvidence":None}]
        row={"candidateId":ident,"claimId":claim_id,"subjectQid":c["subject"],"workQid":c["object"],
             "researchRole":c["research_role"],"proposedRole":role,"status":state,"reasons":reasons,
             "sourceIds":[x["source"]["id"] for x in support],"chosenEvidence":chosen,
             "scope":c["scope"],"scopeInterpretation":"null is unstructured, not all cuts/territories/languages/periods",
             "citationIds":[x["id"] for x in citations],"requiresRoleApplicationDecision":role in ["SCRIPT_WRITING","PRODUCING"]}
        rows.append(row)
        all_records["claims"].append(claim);all_records["citations"]+=citations
        if state=="ready-for-human-review":
            proposal["claims"].append(claim);proposal["citations"]+=citations
            for q in [c["subject"],c["object"]]:
                if q not in external:new_entities[q]=entity_records[q]
            for ci in citations:
                if not any(x["record"]["id"]==ci["sourceId"] for x in known["sources"]):new_sources[ci["sourceId"]]=source_records[ci["sourceId"]]
    held={r["candidateId"] for r in rows if r["status"]!="ready-for-human-review"}
    if check_selection:
        need(held==set(recipe["heldCandidateIds"]) and len(held)==len(recipe["heldCandidateIds"]),"Manifest held/ready selection changed")
    proposal["entities"]=list(new_entities.values());proposal["sources"]=list(new_sources.values())
    for f in FIELDS:proposal[f].sort(key=lambda r:r["id"])
    need(proposal["claims"],"No ready records; no acceptance draft can be prepared")
    return recipe,inputs,refs,rows,proposal,mappings

def build(root=ROOT,recipe_path=None):
    recipe,inputs,refs,rows,records,mappings=inspect(root,recipe_path)
    counts={"candidates":len(rows),"ready":len(records["claims"]),"held":sum(r["status"]!="ready-for-human-review" for r in rows)}
    binding={"adapter":ADAPTER,"inputs":refs,"records":{f:{r["id"]:digest(r) for r in records[f]} for f in FIELDS},
             "heldCandidateIds":recipe["heldCandidateIds"],"deferredCandidateIds":recipe["deferredCandidateIds"],
             "publishedCandidateIds":recipe["publishedCandidateIds"],"identityMappings":mappings}
    catalog={entry["id"]:entry for entry in load(root/"vocabulary/contribution-roles/catalog.json")["entries"]}
    used={c["contribution"]["roleId"] for c in records["claims"]}
    need(used <= set(catalog),"A proposed Role is absent from the adopted catalog")
    binding["roleDefinitions"]={role:digest(catalog[role]) for role in sorted(used)}
    h=digest(binding)
    review={"schemaVersion":1,"kind":ADAPTER,"authority":"pending-human-review-only","bindingSha256":h,"counts":counts,
        "identities":list(mappings.values()),"claims":rows,"comparison":{k:v for k,v in inputs["comparison"].items() if k!="records"},
        "formalAcceptance":False,"publicApply":False}
    files={"review/proposed-records.json":dump({"records":records}),"review/review.json":dump(review),
        "review/decision-draft.json":dump({"status":"draft-not-approved","reviewer":None,"applyAuthorized":False,"bindingSha256":h}),
        "ledger.json":dump({"records":rows,"identityMappings":mappings,"deferredCandidateIds":recipe["deferredCandidateIds"],
            "publishedCandidateIds":recipe["publishedCandidateIds"]}),
        "preflight.json":dump({"closedDependencies":True,"counts":counts,"formalAcceptance":False,"publicApply":False})}
    files["bundle-manifest.json"]=dump({"schemaVersion":1,"authority":"immutable-isolated-film-review-not-acceptance",
        "bindingSha256":h,"inputs":refs,"artifacts":{k:base.hashlib.sha256(v.encode()).hexdigest() for k,v in files.items()}})
    need(inventory(root,recipe_path)[2]==refs,"Inputs changed during preparation")
    return files

def verify(directory,root=ROOT,recipe_path=None):
    actual={str(p.relative_to(directory)):p.read_text() for p in directory.rglob("*") if p.is_file()}
    need(actual==build(root,recipe_path),"Manifest review differs from deterministic frozen inputs")
    return load(directory/"preflight.json")

def run(output,root=ROOT,recipe_path=None):
    files=build(root,recipe_path)
    if output.exists():verify(output,root,recipe_path)
    else:
        output.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".film-manifest-",dir=output.parent) as tmp:
            staging=Path(tmp)/"bundle";staging.mkdir()
            for name,text in files.items():
                p=staging/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
            staging.rename(output)
    return load(output/"preflight.json")
