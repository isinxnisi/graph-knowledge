"""Read-only reconciliation. Outputs only inside this research directory.
Frozen historical public snapshot + hash-bound formal receipts + current public GETs.
No Worker commands, fetches to its Git mirror, acceptance, DB access or updates.
"""
import json, hashlib, datetime, unicodedata, urllib.request, urllib.parse, time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
MAIN=Path("/home/isinxnisi/1.projects/7.graph-knowledge")
RUNTIME=Path("/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime")
def digest(raw):return hashlib.sha256(raw).hexdigest()
def norm(s):return unicodedata.normalize("NFKC",s).casefold().strip()
def read(p):return json.loads(p.read_text())
def frozen_get(key,url):
 p=ROOT/"evidence"/("public-"+key+".json")
 if p.exists():return read(p)
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PlunodeFilmResearch/0.1"}),timeout=25) as r:
   raw=r.read();status=r.status
  data=json.loads(raw)
 except Exception as e:
  return {"url":url,"error":str(e),"observed_at":datetime.datetime.now(datetime.timezone.utc).isoformat()}
 v={"url":url,"status":status,"observed_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "sha256":digest(raw),"data":data}
 p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+"\n");time.sleep(.15)
 return v
def records(d):
 if not isinstance(d,dict):return {}
 if "records" in d:return d["records"]
 return d if "entities" in d and isinstance(d["entities"],list) else {}
def main():
 study=read(ROOT/"CANDIDATES.json")
 p=MAIN/"backups/issue34-production-20261021/public-backup.json"
 backup=read(p); payload=backup["payload"]; f=payload["fixture"]
 checksum=digest(json.dumps(payload,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode())
 assert checksum==backup["checksum"],"Historical backup checksum failed"
 accepted={"entities":{},"claims":{}}
 receipts=[]; issues=[]
 for p in sorted((RUNTIME/"datasets/manga-collection").glob("accepted-*/acceptance.json")):
  raw=p.read_bytes();d=json.loads(raw)
  if d.get("status")!="accepted-for-release-preparation-only":continue
  pool={"entities":{},"claims":{}}
  used=[]
  for ref in d.get("referenceArtifacts",[]):
   if not ref["file"].endswith(("proposed-records.json","candidates.json")):continue
   src=RUNTIME/ref["file"]
   if not src.exists():issues.append({"file":ref["file"],"error":"missing"});continue
   content=src.read_bytes()
   if digest(content)!=ref["sha256"]:issues.append({"file":ref["file"],"error":"hash mismatch"});continue
   rec=records(json.loads(content))
   used.append(ref)
   for typ in pool:
    for row in rec.get(typ,[]):pool[typ][row["id"]]=row
  missing={}
  for typ in accepted:
   ids=d["acceptedRecordIds"].get(typ,[])
   for id in ids:
    row=pool[typ].get(id)
    if row is None:
     # Identity-preserving public body can corroborate existence but is not
     # represented as a receipt-body content verification.
     row=next((e for e in f[typ] if e["id"]==id),None)
     missing.setdefault(typ,[]).append(id)
    if row is not None:accepted[typ][id]=row
  receipts.append({"path":str(p.relative_to(RUNTIME)),"sha256":digest(raw),"recordedAt":d["recordedAt"],
      "acceptedRecordIds":{k:d["acceptedRecordIds"].get(k,[]) for k in accepted},
      "verified_body_references":used,"body_unresolved_from_references":missing})
 published_ids={t:{e["id"] for e in f[t]} for t in accepted}
 pending=[c for id,c in accepted["claims"].items() if id not in published_ids["claims"]]
 start=frozen_get("revision-start","https://plunode.net/api/dataset")
 searches=[]
 # 9 unique English film names + 4 Japanese disambiguation entrances + 7 bridges.
 terms=sorted(set(e["labels"].get("en",{}).get("value") for e in study["entities"] if e["study_target"]))
 terms += ["デューン","メッセージ","許されざる者","荒野の用心棒","Clint Eastwood","Morgan Freeman",
           "David Peoples","Hampton Fancher","Denis Villeneuve","Hans Zimmer","Christopher Nolan"]
 for i,term in enumerate(terms):
  searches.append({"term":term,"result":frozen_get(f"search-{i:02}",
    "https://plunode.net/api/entities?"+urllib.parse.urlencode({"q":term,"limit":20}))})
 pending_checks=[{"claim_id":c["id"],"result":frozen_get("claim-"+c["id"],
    "https://plunode.net/api/claims/"+c["id"])} for c in pending]
 end=frozen_get("revision-end","https://plunode.net/api/dataset")
 comparisons=[]
 for e in study["entities"]:
  names={norm(v["value"]) for v in e["labels"].values()}
  names|={norm(v["value"]) for vals in e["aliases"].values() for v in vals}
  matches={}
  for state,pool in [("historical-published",f["entities"]),("formally-accepted",list(accepted["entities"].values()))]:
   matches[state]=[{"id":x["id"],"name":x["name"],
    "method":"qid" if any(i["namespace"]=="wikidata" and i["value"]==e["id"] for i in x.get("externalIds",[])) else "name-review-needed"}
     for x in pool if any(i["namespace"]=="wikidata" and i["value"]==e["id"] for i in x.get("externalIds",[]))
        or names.intersection(norm(n) for n in [x["name"],*x.get("aliases",[])])]
  comparisons.append({"research_id":e["id"],"study_target":e["study_target"],"matches":matches})
 stable=start.get("data")==end.get("data") and "error" not in start and "error" not in end
 out={"authority":"read-only-research-observation-not-acceptance",
  "historical_public":{"path":str(MAIN/"backups/issue34-production-20261021/public-backup.json"),
    "file_sha256":digest((MAIN/"backups/issue34-production-20261021/public-backup.json").read_bytes()),
    "checksum_verified":True,"graph_digest_revalidated":False,"savedAt":payload["savedAt"],
    "revision":payload["revision"],"counts":{t:len(f[t]) for t in ["entities","claims"]}},
  "formal_receipts":receipts,"formal_unique_counts":{t:len(v) for t,v in accepted.items()},
  "not_in_historical_public_claims":pending,"current_checks_of_these_claims":pending_checks,
  "live_revision_start":start,"live_revision_end":end,"live_revision_stable":stable,
  "live_name_searches":searches,"entity_comparisons":comparisons,"issues":issues,
  "limitations":["Historical snapshot is not current publication inventory.",
   "Live name search is limited and has no QID input; empty results do not prove universal absence.",
   "Formal receipts read from specified runtime only; missing referenced bodies are explicitly reported.",
   "No identities merged. All new research candidates remain unaccepted and unpublished."]}
 (ROOT/"KG_RECONCILIATION.json").write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({"historical":out["historical_public"]["counts"],"formal":out["formal_unique_counts"],
   "receipts":len(receipts),"unresolved_bodies":[r["path"] for r in receipts if r["body_unresolved_from_references"]],
   "not_in_snapshot":len(pending),"live_revision_stable":stable,"issues":len(issues),
   "matched_research_entities":[c for c in comparisons if any(c["matches"].values())],
   "live_results":[(s["term"],len(s["result"].get("data",{}).get("items",[])),s["result"].get("data",{}).get("hasMore"),s["result"].get("error")) for s in searches]},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
