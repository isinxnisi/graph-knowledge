#!/usr/bin/env python3
"""Recompute twelve completed work windows. Export timestamps/counters only, never raw messages."""
import argparse, collections, datetime as dt, hashlib, json
from pathlib import Path

TURN_NAMES = [
("01a17454-1967-7232-8e4b-557ff32957dd", "研究資料収集・探索モデル評価"),
("01a1756b-4542-7c60-a2d5-5b8852394853", "Role定義・段別検索"),
("01a17647-4235-7001-b563-e7437d1922ef", "映画adapter・受入準備"),
("01a176df-d26e-7003-97bf-22f920b0ef90", "main統合・試験beta配置"),
("01a178b3-5706-7173-bcb7-b116ef82d880", "正式登録・受入・公開経路の整備"),
("01a178f1-ecd2-75f1-9dd4-e812b3e77eef", "再開現況照合・backup取得案内"),
("01a178f9-4341-79a3-a37d-bd157e7bee3f", "本番backup・重複照合"),
("01a17d16-c51a-7b93-92b4-191c89384f3a", "Role正式登録・Claim受入票確定"),
("01a17d82-4668-79f2-a523-37d5148332e6", "Claim正式受入・公開候補固定"),
("01a17dcc-4cd9-7633-b6c8-ef250660c6b2", "operator更新のロック競合復旧"),
("01a17dd4-e03d-79b0-9fca-ddda453625ef", "実plan・公開request・Web更新準備"),
("01a17e0d-6b79-7b81-802f-c2c08cda95a7", "公開結果確認・beta整理・終了処理")]
CUTOFF = "2026-10-27T16:19:31.058Z"
def stamp(s): return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
def minutes(a,b): return (b-a).total_seconds()/60
def union_seconds(intervals, a, b):
    clipped=sorted((max(a,x),min(b,y)) for x,y in intervals if y>a and x<b)
    union=[]
    for x,y in clipped:
        if not union or x>union[-1][1]: union.append([x,y])
        else: union[-1][1]=max(union[-1][1],y)
    return sum((y-x).total_seconds() for x,y in union)
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--logs",type=Path,required=True)
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    events=[]; sources=[]
    for path in sorted(args.logs.glob("*01a17453*.jsonl")):
        prefix=hashlib.sha256(); count=0
        for raw in path.read_bytes().splitlines(keepends=True):
            e=json.loads(raw)
            if e.get("timestamp","")<=CUTOFF:
                events.append(e);prefix.update(raw);count+=1
        sources.append({"file":path.name,"prefixThroughUtc":CUTOFF,"prefixSha256":prefix.hexdigest(),"lines":count})
    events.sort(key=lambda e:e["timestamp"])
    windows={}; calls={}; intervals=[]; all_intervals=[]; contexts=[]; settings=[]
    for e in events:
        p=e.get("payload",{});t=stamp(e["timestamp"])
        if e["type"]=="turn_context": contexts.append((t,p.get("model"),p.get("effort")))
        if e["type"]=="event_msg":
            if p.get("type")=="thread_settings_applied":
                settings.append((t,p.get("thread_settings",{}).get("service_tier")))
            if p.get("type") in ("task_started","task_complete"):
                windows.setdefault(p.get("turn_id"),{})[p["type"]]=t
        if e["type"]=="response_item":
            kind=p.get("type")
            if kind in ("custom_tool_call","function_call"): calls[p["call_id"]]=(t,kind)
            elif kind in ("custom_tool_call_output","function_call_output") and p.get("call_id") in calls:
                begin,call_kind=calls.pop(p["call_id"])
                all_intervals.append((begin,t))
                if call_kind=="custom_tool_call": intervals.append((begin,t))
    rows=[]
    for i,(ident,name) in enumerate(TURN_NAMES,1):
        a=windows[ident]["task_started"];b=windows[ident]["task_complete"]
        cs=[(m,r) for t,m,r in contexts if a<=t<=b]
        tiers=[v for t,v in settings if a<=t<=b]
        previous=[v for t,v in settings if t<a]
        tiers=list(dict.fromkeys(([previous[-1]] if previous else [])+tiers))
        elapsed=minutes(a,b); blocked=union_seconds(intervals,a,b)/60
        rows.append({"number":i,"turnId":ident,"name":name,"startedAt":a.isoformat(),"completedAt":b.isoformat(),
                     "elapsedMinutes":elapsed,"synchronousCustomToolMinutes":blocked,
                     "synchronousAllToolMinutes":union_seconds(all_intervals,a,b)/60,
                     "otherElapsedMinutes":elapsed-union_seconds(all_intervals,a,b)/60,
                     "modelAndEffort":list(dict.fromkeys(cs)),"serviceTiersObserved":tiers})
    total=sum(r["elapsedMinutes"] for r in rows)
    gap=minutes(stamp(rows[0]["startedAt"]),stamp(rows[-1]["completedAt"]))-total
    out={"authority":"log-metadata-analysis-only","method":"task_started to task_complete; union paired custom_tool_call and function_call output timestamps, clipped to window. custom-only union is also retained. otherElapsed excludes the all-tool union. Neither union is a CPU-idle counter. No raw messages/reasoning/arguments exported.",
         "sources":sources,"rows":rows,"totals":{"elapsedMinutes":total,"customToolMinutes":sum(r["synchronousCustomToolMinutes"] for r in rows),
          "allToolMinutes":sum(r["synchronousAllToolMinutes"] for r in rows),"betweenWindowsMinutes":gap},
         "limitations":["Subtask estimates in report are not instrumented counters.","Between-window gaps are not measured human labor.","Token events are cumulative/repeated across compactions; no billing or causal model-efficiency estimate is inferred."]}
    args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(out["totals"]))
if __name__=="__main__": main()
