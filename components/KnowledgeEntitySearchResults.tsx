"use client";
import {useEffect,useState} from "react";
import type {KnowledgeEntityVersion} from "../lib/domain/knowledge-foundation";
import {useKnowledgeReading} from "./KnowledgeReading";
import {useUiLocale} from "../lib/client/ui-locale";
import {knowledgeKindLabel} from "../lib/client/knowledge-kind-label";
import Icon from "./Icon";
import css from "./KnowledgeRelatedInformation.module.css";
export type KnowledgeEntitySearchMatches={q:string;kind:string|null;ids:string[]};
export default function KnowledgeEntitySearchResults({q,kind,excludeIds=[],onMatches}:{q:string;kind:string|null;excludeIds?:string[];onMatches?:(value:KnowledgeEntitySearchMatches)=>void}){
 const reading=useKnowledgeReading(),{locale}=useUiLocale(),[result,setResult]=useState<{q:string;kind:string|null;items:KnowledgeEntityVersion[]}|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const enabled=!!reading;
 useEffect(()=>{if(!enabled||!q.trim())return;const c=new AbortController();const timer=setTimeout(()=>{void fetch("/api/knowledge/public?"+new URLSearchParams({mode:"entities",q,limit:"20"}),{signal:c.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("SEARCH_FAILED");return r.json();}).then(v=>{if(!c.signal.aborted){const aliases:Record<string,string[]>={person:["人物","person"],work:["作品","work"],organization:["組織","organization"],event:["出来事","event"]};setResult({q,kind,items:(v.entities as KnowledgeEntityVersion[]).filter(e=>!kind||(aliases[kind]??[kind]).includes(e.content.kind))});setError(false);}}).catch(()=>{if(!c.signal.aborted)setError(true);});},250);return()=>{clearTimeout(timer);c.abort();};},[q,kind,enabled,retry]);
 const current=reading&&q.trim()&&result?.q===q&&result.kind===kind?result.items.filter(v=>!excludeIds.includes(v.id)):[];
 const visibleIds=JSON.stringify(current.slice(0,10).map(v=>v.id));
 useEffect(()=>{onMatches?.({q,kind,ids:JSON.parse(visibleIds) as string[]});},[q,kind,visibleIds,onMatches]);
 if(!reading||!q.trim())return null;
 return <section className={css.section} aria-label={locale==="en"?"Additional subjects":"追加された対象"}>{!!current.length&&<><h3>{locale==="en"?"Additional subjects":"追加された対象"}</h3><ul>{current.slice(0,10).map(e=><li key={e.id}><button onClick={()=>reading.openEntity(e)}><Icon name="person"/><span>{e.content.name}<small>{knowledgeKindLabel(e.content.kind,locale)}{e.content.description&&` · ${e.content.description}`}</small></span><Icon name="chevron"/></button></li>)}</ul></>}{error&&<p role="status">{locale==="en"?"Additional subjects are unavailable.":"追加された対象を検索できませんでした。"} <button onClick={()=>setRetry(v=>v+1)}>{locale==="en"?"Retry":"再試行"}</button></p>}</section>;
}
