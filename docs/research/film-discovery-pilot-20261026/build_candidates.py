"""Generate a research ledger from frozen CC0 responses + explicit source reviews.
Never emits Plunode import-schema data. No network or database connections.
"""
import gzip, json, hashlib, re
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent
def read(p): return json.loads(gzip.decompress((ROOT/p).read_bytes()) if p.endswith(".gz") else (ROOT/p).read_bytes())
def write(p,v): (ROOT/p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+"\n")
FILMS={
 "Q184843":(1982,"Blade Runner","ブレードランナー",["Q81328","Q213574","Q230736"]),
 "Q21500755":(2017,"Blade Runner 2049","ブレードランナー 2049",["Q193815","Q81328","Q272972","Q44158"]),
 "Q114819":(1984,"Dune","デューン/砂の惑星",["Q207506","Q230736","Q483203"]),
 "Q60834962":(2021,"Dune","DUNE/デューン 砂の惑星",["Q19877770","Q4947838","Q44158"]),
 "Q20382729":(2016,"Arrival","メッセージ",["Q481832","Q23365","Q182763"]),
 "Q25188":(2010,"Inception","インセプション",["Q38111","Q211553","Q123351"]),
 "Q13417189":(2014,"Interstellar","インターステラー",["Q188955","Q123351","Q19877770"]),
 "Q76479":(1964,"A Fistful of Dollars","荒野の用心棒",["Q43203","Q317110","Q77405"]),
 "Q104137":(1992,"Unforgiven","許されざる者",["Q43203","Q48337","Q150943"]),
 "Q184255":(2004,"Million Dollar Baby","ミリオンダラー・ベイビー",["Q93187","Q43203","Q48337"]),
}
ROLES={"P57":"DIRECTING","P58":"SCREENWRITING","P86":"MUSIC","P344":"CINEMATOGRAPHY","P162":"PRODUCING","P161":"CAST"}
HOLDS={
 ("Q20382729","P58","Q503095"):("原著者を脚本担当へ変換できない。Paramountは原著者とWriterを分離。",["S06"]),
 ("Q184255","P58","Q321713"):("短編集由来の著者を脚本へ変換できない。AFIはLiterary sourceとWriterを分離。",["S11"]),
 ("Q76479","P57","Q945188"):("映画全体の共同監督としての範囲が未確認。Cannesの作品クレジットはLeone。版固有関与の可能性を含め保留、否定ではない。",["S09"]),
 ("Q25188","P179","Q26705935"):("BBCの選出ランキングへの所属であり映画シリーズではない。",[]),
 ("Q76479","P144","Q1935469"):("Red Harvestの直接翻案か、間接由来か未確認。Yojimboとの関係と同一視しない。",["S13"]),
}
def main():
 raw=read("evidence/films.json.gz"); films=raw["data"]["entities"]; all_entities=dict(films)
 for p in sorted((ROOT/"evidence").glob("labels-*.json")):
  d=json.loads(p.read_text())["data"]; all_entities.update(d["entities"])
  for redirect in d.get("redirects",[]):
   if redirect["to"] in d["entities"]: all_entities[redirect["from"]]=d["entities"][redirect["to"]]
 sources=read("source_reviews.json")
 rows=[]; wanted=set(FILMS); omitted=Counter()
 for f in FILMS:
  e=films[f]
  for prop in [*ROLES,"P144","P179","P155","P156"]:
   for s in e.get("claims",{}).get(prop,[]):
    v=s["mainsnak"].get("datavalue",{}).get("value")
    target=v.get("id") if isinstance(v,dict) else None
    if prop=="P161" and target not in FILMS[f][3]:
     omitted["cast_statements_not_selected"]+=1; continue
    support=[x["id"] for x in sources if x["film"]==f and target in x["supports"].get(prop,[])]
    hold=HOLDS.get((f,prop,target))
    status="checked-source-candidate" if support else "structured-only-candidate"
    reason="原資料の担当欄を照合した研究候補。人間による正式受入は未実施。" if support else "構造化資料を取得。参照元資料の支持・適用範囲は未照合、主評価には含めない。"
    if hold: status="held";reason=hold[0];support=hold[1]
    if target is None: status="held";reason="valueを持たないsnak。未記載・不存在・順序の意味を人物関係へ変換しない。"
    if s["rank"]=="deprecated":status="held";reason="deprecated statement; keep for audit, not traversal"
    relation="CREDIT" if prop in ROLES else {"P144":"BASED_ON","P179":"SERIES_MEMBERSHIP","P155":"FOLLOWS","P156":"PRECEDES"}[prop]
    if f=="Q21500755" and prop=="P155" and target=="Q184843":relation="SEQUEL_OF"
    subject=target if prop in ROLES else f; obj=f if prop in ROLES else target
    row={"id":"candidate:"+s["id"],"subject":subject,"relation":relation,"object":obj,
      "research_role":ROLES.get(prop),"polarity":"affirmed","state":status,"reason":reason,
      "scope":{"level":"film-work-record","cut":None,"territory":None,"language":None,
               "interpretation":"credit scope unresolved across versions; null is not all cuts"},
      "citations":[{"source_id":"WD:"+f,"locator":prop+"/"+s["id"],"stance":"support-as-recorded",
        "statement_url":"https://www.wikidata.org/wiki/"+f+"#"+prop,
        "revision_url":f"https://www.wikidata.org/w/index.php?oldid={e['lastrevid']}",
        "upstream_references_checked":False}]+[{"source_id":x,"locator":next(a["locator"] for a in sources if a["id"]==x),
        "stance":"context-for-hold" if status=="held" else "support","original_role_heading":next(a.get("role_terms",{}).get(prop) for a in sources if a["id"]==x),"review_scope":"exact film/person/role listed in source_reviews.json"} for x in support],
      "provenance":{"entity":f,"property":prop,"statement_id":s["id"],"entity_revision":e["lastrevid"],
       "acquired_at":raw["accessed_at"],"raw_statement":s},
      "formal_acceptance":False,"published":False}
    rows.append(row)
    if target:wanted.add(target)
 # No raw P144->REMAKE_OF or ORIGINAL_STORY mapping. Keep undecided semantic hypotheses separate.
 entities=[]
 for q in sorted(wanted):
  e=all_entities.get(q,{})
  isfilm=q in FILMS
  credit_subject=any(c["relation"]=="CREDIT" and c["subject"]==q for c in rows)
  kind="work" if not credit_subject or isfilm else "organization" if q=="Q207472" else "person"
  subtype="film" if isfilm else ("music-group" if q=="Q207472" else "person" if credit_subject else
     "novel" if q=="Q190192" else "series" if q in ["Q370180","Q109300883"] else "ranked-list" if q=="Q26705935" else "work-unresolved")
  entities.append({"id":q,"kind":kind,"research_subtype":subtype,"study_target":isfilm,
   "labels":e.get("labels",{}),"aliases":e.get("aliases",{}),"description":e.get("descriptions",{}),
   "external_id":{"namespace":"wikidata","value":q},"identity_status":"source-crosschecked-film" if isfilm else "external-identity-candidate",
   "display_year":FILMS[q][0] if isfilm else None,
   "display_ja":FILMS[q][2] if isfilm else e.get("labels",{}).get("ja",{}).get("value"),
   "year_policy":"work identification year, not Claim period; see P577 and regional release discrepancies" if isfilm else None,
   "metadata_evidence":{p:films[q]["claims"].get(p,[]) for p in ["P31","P577","P495","P364","P136"]} if isfilm else {},
   "formal_acceptance":False})
 result={"research_schema":"film-discovery-candidates/1","not_an_import":True,"formal_acceptance":False,"published":False,
   "target_count":10,"selection":"1964–2021, 7 SF films + 2 westerns + 1 sports drama; purposive, not representative",
   "scope_policy":"No recursive acquisition beyond film targets; 303 referenced IDs fetched for labels only; graph uses selected endpoints.",
   "source_reviews":"source_reviews.json","entities":entities,"candidates":rows,
   "omissions":dict(omitted),
   "hypotheses":[{"id":"H01","relation":"REMAKE_OF","subject":"Q60834962","object":"Q114819","state":"held",
       "reason":"同一原作の別翻案であることだけでは映画同士のリメイク関係を支持しない。"},
     {"id":"H02","relation":"REMAKE_OF","subject":"Q76479","object":"Q20475","state":"held",
       "source_ids":["S13"],"reason":"由来の資料はあるが、直接翻案とリメイクの新Predicate契約と受入は未決。"}],
   "counts":{"entities":len(entities),"candidates":len(rows),"states":dict(Counter(r["state"] for r in rows))}}
 write("CANDIDATES.json",result)
 write("evidence/manifest.json",{"files":[{"file":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"bytes":p.stat().st_size}
  for p in sorted((ROOT/"evidence").glob("*")) if p.is_file() and p.name!="manifest.json"]})
 print(json.dumps(result["counts"],ensure_ascii=False))
if __name__=="__main__":main()
