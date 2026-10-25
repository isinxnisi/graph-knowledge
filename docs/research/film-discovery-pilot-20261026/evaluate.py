"""Offline, bounded film research; reuses only graph()/reach(), not Issue #34 build()."""
import json, hashlib, importlib.util
from pathlib import Path
from collections import Counter
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
spec=importlib.util.spec_from_file_location("bridge",REPO/"scripts/collection-bridge-candidates.py")
bridge=importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
def read(name): return json.loads((HERE/name).read_text())
def write(name,value): (HERE/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n")
def sha(p): return hashlib.sha256(p.read_bytes().replace(b"\r\n",b"\n")).hexdigest()
D=read("CANDIDATES.json")
E={e["id"]:e for e in D["entities"]}
CHECKED=[c for c in D["candidates"] if c["state"]=="checked-source-candidate"]
TARGETS=sorted(e["id"] for e in D["entities"] if e["study_target"])
def label(q): return E[q]["labels"].get("en",{}).get("value",q)
def graph(cs, nodes=None):
 if nodes is None: nodes={q for c in cs for q in [c["subject"],c["object"]]}|set(TARGETS)
 return bridge.graph({q:E[q] for q in nodes},[(c["subject"],c["object"]) for c in cs])
def paths(cs,root,roles=None,relations=None):
 depth=len(roles or relations); out=[]; attempts=0
 adj={}
 for c in sorted(cs,key=lambda c:c["id"]):
  for q in [c["subject"],c["object"]]:adj.setdefault(q,[]).append(c)
 def step(nodes,edges):
  nonlocal attempts
  i=len(edges)
  if i==depth:
   out.append({"nodes":nodes,"names":[label(q) for q in nodes],
    "steps":[{"candidate_id":c["id"],"role":c["research_role"],"relation":c["relation"],
      "canonical_subject":c["subject"],"canonical_object":c["object"],
      "traversal":"forward" if c["subject"]==nodes[j] else "reverse",
      "source_ids":[s["source_id"] for s in c["citations"] if s["stance"]=="support"]}
      for j,c in enumerate(edges)]})
   return
  for c in adj.get(nodes[-1],[]):
   attempts+=1
   if attempts>100000:raise ValueError("research path budget exhausted; do not report absence")
   other=c["object"] if c["subject"]==nodes[-1] else c["subject"]
   if other in nodes:continue
   if roles and c["research_role"] not in roles[i]:continue
   if relations and c["relation"] not in relations[i]:continue
   step(nodes+[other],edges+[c])
 step([root],[])
 return out
def signatures(cs,depth):
 return {tuple(p["nodes"])+tuple(s["candidate_id"] for s in p["steps"])
   for root in TARGETS for p in paths(cs,root,relations=[set(c["relation"] for c in cs)]*depth)}
def metrics(cs,nodes=None):
 a,owner,groups=graph(cs,nodes)
 pairs=[set() for _ in range(3)]
 for root in sorted(a):
  for i,ends in enumerate(bridge.reach(a,root)): pairs[i]|={(root,end) for end in ends}
 roots={q:[len(v) for v in bridge.reach(a,q)] for q in TARGETS}
 return {"nodes":len(a),"records":len(cs),"unique_endpoint_pairs":sum(map(len,a.values()))//2,
  "components":len(groups),"component_sizes":sorted(map(len,groups.values()),reverse=True),
  "branching_nodes":sum(len(v)>=2 for v in a.values()),
  "within_hops_ordered_pairs":[len(v) for v in pairs],"film_root_within_hops":roots}, pairs,owner,groups
def main():
 assert D["not_an_import"] and not D["published"] and len(TARGETS)==10
 ids=[c["id"] for c in D["candidates"]]; assert len(ids)==len(set(ids))
 for c in CHECKED:
  assert c["subject"] in E and c["object"] in E and c["polarity"]=="affirmed"
  assert any(s["stance"]=="support" for s in c["citations"])
  assert not c["published"] and not c["formal_acceptance"]
 credits=[c for c in CHECKED if c["relation"]=="CREDIT"]
 baseline=[c for c in credits if c["research_role"] in {"SCREENWRITING","PRODUCING"}]
 universe={q for c in CHECKED for q in [c["subject"],c["object"]]}|set(TARGETS)
 base,bpairs,owner,groups=metrics(baseline,universe)
 cohorts={"current_role_syntax_projection":baseline,"plus_directing":baseline+[c for c in credits if c["research_role"]=="DIRECTING"],
  "plus_cast":baseline+[c for c in credits if c["research_role"]=="CAST"],
  "plus_music":baseline+[c for c in credits if c["research_role"]=="MUSIC"],
  "all_checked_credits":credits,"all_checked_relations":CHECKED}
 bsigns={depth:signatures(baseline,depth) for depth in (2,3)}
 rows={}
 for name,cs in cohorts.items():
  m,ps,_,_=metrics(cs,universe)
  m["new_ordered_endpoint_pairs_vs_baseline"]=[len(b-a) for a,b in zip(bpairs,ps)]
  m["film_root_exact_hop_claim_paths"]={str(depth):len(signatures(cs,depth)) for depth in (2,3)}
  m["new_claim_paths_vs_baseline"]={str(depth):len(signatures(cs,depth)-bsigns[depth]) for depth in (2,3)}
  m["active_endpoint_only_components"]=metrics(cs)[0]["components"]
  rows[name]=m
 queries={}
 def query(key,root,roles=None,relations=None):
  result=paths(CHECKED,root,roles,relations)
  queries[key]={"root":root,"roles":roles,"relations":relations,"path_count":len(result),
     "distinct_targets":sorted({p["nodes"][-1] for p in result}),"paths":result}
 query("same_screenwriter","Q184843",[["SCREENWRITING"],["SCREENWRITING"]])
 query("same_director","Q20382729",[["DIRECTING"],["DIRECTING"]])
 query("cast_to_director","Q104137",[["CAST"],["DIRECTING"]])
 query("uniform_cast_or_director","Q104137",[["CAST","DIRECTING"]]*2)
 query("same_director_inception","Q25188",[["DIRECTING"]]*2)
 query("same_music_inception","Q25188",[["MUSIC"]]*2)
 query("uniform_director_or_music","Q25188",[["DIRECTING","MUSIC"]]*2)
 query("same_novel","Q114819",relations=[["BASED_ON"],["BASED_ON"]])
 query("sequel_to_previous_cast","Q21500755",relations=[["SEQUEL_OF"],["CREDIT"]])
 # Direction + role restrict mixed-predicate result after exact bounded enumeration.
 mixed=queries["sequel_to_previous_cast"]
 mixed["paths"]=[p for p in mixed["paths"] if p["steps"][0]["traversal"]=="forward" and p["steps"][1]["role"]=="CAST"]
 mixed["path_count"]=len(mixed["paths"]); mixed["distinct_targets"]=sorted({p["nodes"][-1] for p in mixed["paths"]})
 query("writer_other_film_cast","Q184843",[["SCREENWRITING"],["SCREENWRITING"],["CAST"]])
 conjunction=sorted(set(queries["same_director_inception"]["distinct_targets"])&set(queries["same_music_inception"]["distinct_targets"]))
 queries["director_and_music"]={"distinct_targets":conjunction,"witnesses":{q:
   [p for key in ["same_director_inception","same_music_inception"] for p in queries[key]["paths"] if p["nodes"][-1]==q] for q in conjunction}}
 # Literal reviewed expected endpoints are regression oracles, not generated expectations.
 assert queries["same_screenwriter"]["distinct_targets"]==sorted(["Q21500755","Q104137"])
 assert queries["same_director"]["distinct_targets"]==sorted(["Q21500755","Q60834962"])
 assert queries["cast_to_director"]["path_count"]==1 and queries["cast_to_director"]["distinct_targets"]==["Q184255"]
 assert queries["uniform_cast_or_director"]["distinct_targets"]==sorted(["Q184255","Q76479"])
 assert conjunction==["Q13417189"]
 assert queries["same_novel"]["distinct_targets"]==["Q60834962"]
 assert queries["writer_other_film_cast"]["path_count"]==7
 # Genuine single-record bridges: removing a parallel credit must not erase another.
 full,_,_,_=metrics(CHECKED,universe); bridges=[]
 for c in CHECKED:
  remaining=[v for v in CHECKED if v["id"]!=c["id"]]
  m,_,o,g=metrics(remaining,universe)
  if m["components"]>full["components"]:
   sides=[g[o[c[k]]] for k in ["subject","object"]]
   bridges.append({"candidate_id":c["id"],"role":c["research_role"],"relation":c["relation"],
    "both_sides_have_person_and_work":all({"person","work"}<=set(E[q]["kind"] for q in side) for side in sides)})
 # Evidence ablations: leaf credits can increase records/endpoints without merging film groups.
 ablations={}
 for name,exclude in [("without_acmi",lambda c:any(s["source_id"]=="S04" and s["stance"]=="support" for s in c["citations"])),
                       ("without_david_peoples",lambda c:c["subject"]=="Q1177114")]:
  cs=[c for c in CHECKED if not exclude(c)]
  ablations[name]=metrics(cs,universe)[0]
 result={"authority":"isolated-research-not-public-search","fixed_node_universe":len(universe),
  "baseline_note":"Syntax-only projection SCREENWRITING->SCRIPT_WRITING, PRODUCING->PRODUCING; no approved film ingest or publication.",
  "input_hashes":{str(p.relative_to(REPO)):sha(p) for p in [HERE/"CANDIDATES.json",HERE/"source_reviews.json",REPO/"scripts/collection-bridge-candidates.py"]},
  "reused_functions":["scripts/collection-bridge-candidates.py:graph","scripts/collection-bridge-candidates.py:reach"],
  "semantics":{"components":"weak, fixed checked-node universe incl. isolates","reach":"exact cumulative <=1/2/3 distinct ordered pairs",
    "paths":"exact 2/3 simple Claim paths for 10 roots; guard 100000 inspected edges per root; no scope/time inference"},
  "counts_by_role":dict(Counter(c["research_role"] or c["relation"] for c in CHECKED)),
  "cohorts":rows,"single_record_bridges":bridges,"ablations":ablations,"queries":queries}
 write("EVALUATION.json",result)
 print(json.dumps({"cohorts":{k:{n:v for n,v in r.items() if n not in ["film_root_within_hops","component_sizes"]} for k,r in rows.items()},
 "queries":{k:{"paths":v.get("path_count"),"targets":v["distinct_targets"]} for k,v in queries.items()},
 "bridges":len(bridges),"meaningful_bridges":sum(b["both_sides_have_person_and_work"] for b in bridges)},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
