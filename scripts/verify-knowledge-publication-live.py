#!/usr/bin/env python3
"""Three explicit browser-assisted U2 steps over localhost HTTP only.

  python3 scripts/verify-knowledge-publication-live.py create --token TOKEN
  # Keep the resulting old generation open in the browser.
  python3 scripts/verify-knowledge-publication-live.py correct --token TOKEN
  # Observe the update notice and explicitly read the new generation.
  python3 scripts/verify-knowledge-publication-live.py hide --token TOKEN

Creates one clearly fictional record and its own dependencies. Commands and UUIDs
are saved before submission for safe replay. No existing records are modified;
hide retains the synthetic history and stops its public visibility.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "http://localhost:3276"
STATE = ROOT/".local/issue75/u2-live-proof.json"
MARKER = "【仮想・U2検証】"

def now():
    return datetime.now(timezone.utc).isoformat()

def save(state):
    STATE.parent.mkdir(parents=True,exist_ok=True)
    temporary=STATE.with_suffix(".pending.json")
    temporary.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n")
    temporary.chmod(0o600)
    temporary.replace(STATE)

def request(route, query=None, body=None, acceptable=(200,)):
    url=ORIGIN+route+("?"+urllib.parse.urlencode(query) if query else "")
    data=None if body is None else json.dumps(body,ensure_ascii=False).encode()
    req=urllib.request.Request(url,data=data,headers={"Origin":ORIGIN,"Content-Type":"application/json","Accept":"application/json"},method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            status=response.status;payload=json.load(response)
    except urllib.error.HTTPError as error:
        status=error.code
        payload=json.loads(error.read().decode())
    if status not in acceptable:
        raise RuntimeError(f"HTTP {status} for {route}: {payload.get('error','request failed')}")
    return status,payload

def public(mode,acceptable=(200,),**query):
    return request("/api/knowledge/public",{"mode":mode,**query},acceptable=acceptable)

def initialize():
    if STATE.exists():
        state=json.loads(STATE.read_text())
        assert state["schemaVersion"]==1 and state["origin"]==ORIGIN and state["synthetic"] is True
        assert state["marker"]==MARKER and state["prefix"].startswith("u2-live-")
        return state
    prefix="u2-live-"+uuid.uuid4().hex[:16]+"-"
    state={"schemaVersion":1,"origin":ORIGIN,"synthetic":True,"marker":MARKER,"prefix":prefix,"createdAt":now(),"ids":{"subject":prefix+"observer","object":prefix+"observatory","source":prefix+"source","record":prefix+"record"},"commands":{},"results":{},"steps":{}}
    save(state)
    return state

def issue(state,key,action,fields):
    candidate={"action":action,"reason":MARKER+" 公開世代と停止表示の確認",**fields}
    if key not in state["commands"]:
        state["commands"][key]={"requestId":str(uuid.uuid4()),**candidate}
        save(state)
    else:
        old={k:v for k,v in state["commands"][key].items() if k!="requestId"}
        assert old==candidate,"A saved replay command differs; refusing to change its meaning"
    _,result=request("/api/knowledge",body=state["commands"][key])
    state["results"][key]=result
    save(state)
    return result

def own(state):
    _,data=request("/api/knowledge")
    ids=state["ids"]
    found={}
    for kind,table,key in [("entity","entities","subject"),("entity","entities","object"),("source","sources","source"),("record","records","record")]:
        value=next((v for v in data[table] if v["id"]==ids[key]),None)
        if value is None:
            continue
        text=value["content"].get("name") or value["content"].get("title") or value["content"].get("assertion","")
        assert MARKER in text,"An owned ID no longer identifies the synthetic fixture"
        status=next(s for s in data["statuses"] if s["kind"]==kind and s["id"]==ids[key])
        found[key]={"kind":kind,"value":value,"status":status}
    return found

def wait_revision(state,revision,timeout):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        _,status=public("status")
        active=status.get("active")
        if active:
            code,detail=public("record",acceptable=(200,404),generation=active["id"],recordId=state["ids"]["record"])
            if code==200 and detail["record"]["record"]["revision"]==revision:
                return active["id"],detail,status
        time.sleep(1)
    raise RuntimeError("The publication worker did not expose the expected revision within the wait limit")

def assert_absent(state,generation):
    ids=state["ids"]
    code,_=public("record",acceptable=(404,),generation=generation,recordId=ids["record"])
    assert code==404
    _,search=public("search",generation=generation,q=state["prefix"])
    assert not search["records"]
    _,graph=public("graph",generation=generation,recordIds=ids["record"])
    assert not graph["records"] and not graph["entities"]
    near_status,near=public("neighbors",acceptable=(200,404),generation=generation,entityId=ids["subject"])
    assert near_status==404 or not near["records"]
    path_status,paths=public("paths",acceptable=(200,404),generation=generation,**{"from":ids["subject"],"to":ids["object"]})
    assert path_status==404 or (not paths["paths"] and not paths["records"])
    return {"generation":generation,"detailStatus":404,"searchEmpty":True,"graphEmpty":True,"neighborsEmptyOrStopped":True,"pathsEmptyOrStopped":True}

def create(state,timeout):
    if state["steps"].get("create",{}).get("complete"):
        return
    ids=state["ids"]
    issue(state,"create","create-bundle",{"entities":[{"id":ids["subject"],"content":{"name":MARKER+" 観測者","kind":"person","aliases":[state["prefix"]],"description":"実在の人物ではありません。公開更新通知を確認するための検証用対象です。"}},{"id":ids["object"],"content":{"name":MARKER+" 天文台","kind":"organization","description":"実在の施設ではありません。検証後に表示停止します。"}}],"sources":[{"id":ids["source"],"content":{"title":MARKER+" 架空の観測メモ","bibliography":"実在資料ではありません。localhost:3276だけのUI操作検証用メモ。"}}],"records":[{"id":ids["record"],"content":{"kind":"relation","subjectId":ids["subject"],"objectId":ids["object"],"assertion":MARKER+" 観測者が天文台の記録を調べた。","relation":"記録を調べた","polarity":"affirmed","scope":state["prefix"]+"（架空データ、実際の事実を示しません）","evidence":[{"id":"synthetic-note","source":{"id":ids["source"],"revision":1},"locator":"検証メモ・第1節","excerpt":"これは架空のUI検証データです。","stance":"support"}]}}],"visibility":"public"})
    assert len(own(state))==4
    generation,detail,status=wait_revision(state,1,timeout)
    assert detail["record"]["label"]=="記録を調べた"
    state["steps"]["create"]={"complete":True,"completedAt":now(),"generation":generation,"recordRevision":1,"changeToken":status["changeToken"],"searchUrl":ORIGIN+"/themes/explore","searchText":state["prefix"],"detailUrl":ORIGIN+"/api/knowledge/public?"+urllib.parse.urlencode({"mode":"record","generation":generation,"recordId":ids["record"]})}
    save(state)

def correct(state,timeout):
    assert state["steps"].get("create",{}).get("complete"),"Run create first"
    if state["steps"].get("correct",{}).get("complete"):
        return
    observed=own(state)
    assert len(observed)==4
    original=state["results"]["create"]["records"][0]["content"]
    content={**original,"assertion":MARKER+" 観測者が天文台の記録を共同で整理した。","relation":"記録を共同で整理した"}
    assert observed["record"]["value"]["revision"] in (1,2),"Unexpected synthetic content revision"
    issue(state,"correct","correct",{"kind":"record","id":state["ids"]["record"],"expectedRevision":1,"content":content})
    generation,detail,status=wait_revision(state,2,timeout)
    old_generation=state["steps"]["create"]["generation"]
    _,old=public("record",generation=old_generation,recordId=state["ids"]["record"])
    assert old["record"]["record"]["revision"]==1 and old["record"]["label"]=="記録を調べた"
    assert generation!=old_generation and detail["record"]["label"]=="記録を共同で整理した"
    state["steps"]["correct"]={"complete":True,"completedAt":now(),"generation":generation,"recordRevision":2,"oldGeneration":old_generation,"oldRevisionRetained":True,"newRelation":detail["record"]["label"],"changeToken":status["changeToken"]}
    save(state)

def stop_one(state,key):
    current=own(state)[key]
    assert current["value"]["id"]==state["ids"][key]
    command_key="hide-"+key
    if current["status"]["visibility"]=="hidden":
        return
    fields={"kind":current["kind"],"id":state["ids"][key],"expectedStatusRevision":current["status"]["revision"],"visibility":"hidden"}
    # An already-saved command may have committed before an interrupted response.
    if command_key in state["commands"]:
        fields["expectedStatusRevision"]=state["commands"][command_key]["expectedStatusRevision"]
    issue(state,command_key,"set-visibility",fields)

def hide(state,timeout):
    assert state["steps"].get("correct",{}).get("complete"),"Run correct first"
    generations=list(dict.fromkeys([state["steps"]["create"]["generation"],state["steps"]["correct"]["generation"]]))
    stop_one(state,"record")
    checks_before_dependencies=[assert_absent(state,g) for g in generations]
    for key in ("subject","object","source"):
        stop_one(state,key)
    observed=own(state)
    assert len(observed)==4 and all(v["status"]["visibility"]=="hidden" for v in observed.values())
    checks=[assert_absent(state,g) for g in generations]
    deadline=time.monotonic()+timeout
    while True:
        _,status=public("status")
        if not status["pending"]:
            break
        if time.monotonic()>deadline:
            raise RuntimeError("Visibility is stopped, but the worker did not finish the new generation yet")
        time.sleep(1)
    state["steps"]["hide"]={"complete":True,"completedAt":now(),"checksBeforeDependencyStop":checks_before_dependencies,"checks":checks,"hiddenIds":state["ids"],"activeGeneration":status["active"]["id"],"changeToken":status["changeToken"],"pending":False,"syntheticHistoryRetained":True}
    save(state)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("step",choices=("create","correct","hide"))
    parser.add_argument("--token",default=os.environ.get("AUTOPILOT_HOLD_TOKEN"))
    parser.add_argument("--timeout",type=int,default=180)
    args=parser.parse_args()
    if not args.token:
        raise SystemExit("An existing Autopilot hold token is required; this script never acquires a second lock")
    checked=subprocess.run(["python3",str(ROOT/"scripts/autopilot.py"),"assert-held","--token",args.token],cwd=ROOT,capture_output=True,text=True)
    if checked.returncode:
        raise SystemExit("The existing Autopilot hold is not held; no HTTP write was made")
    state=initialize()
    {"create":create,"correct":correct,"hide":hide}[args.step](state,args.timeout)
    print(json.dumps({"step":args.step,"result":state["steps"][args.step],"state":str(STATE.relative_to(ROOT)),"browserInspection":"performed separately by the operator"},ensure_ascii=False))

if __name__=="__main__":
    main()
