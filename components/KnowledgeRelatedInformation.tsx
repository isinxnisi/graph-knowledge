"use client";
import {useEffect,useState} from "react";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import css from "./KnowledgeRelatedInformation.module.css";
type Page={records:KnowledgePublishedRecord[];nextCursor:string|null};
export default function KnowledgeRelatedInformation({entityId,onOpen}:{entityId:string;onOpen:(id:string)=>void}){
 const {locale}=useUiLocale(),[page,setPage]=useState<Page|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(true);
 useEffect(()=>{const c=new AbortController();void fetch("/api/knowledge/public?"+new URLSearchParams({mode:"search",entityId,limit:"10",...(cursor?{cursor}:{})}),{signal:c.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("READ_FAILED");return r.json();}).then((v:Page)=>{if(!c.signal.aborted){setPage(old=>({records:cursor?[...new Map([...(old?.records??[]),...v.records].map(r=>[r.record.id,r])).values()]:v.records,nextCursor:v.nextCursor}));setError(false);}}).catch(()=>{if(!c.signal.aborted)setError(true);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[entityId,cursor,retry]);
 if(!page?.records.length&&!error)return null;
 return <section className={css.section}><h3>{locale==="en"?"Added knowledge":"追加された知識"}</h3><ul>{page?.records.map(r=><li key={r.record.id}><button onClick={()=>onOpen(r.record.id)}><Icon name={r.record.content.kind==="relation"?"graph":r.record.content.kind==="episode"?"event":"book"}/><span>{r.record.content.assertion}<small>{r.record.content.kind==="relation"?r.record.content.relation:r.record.content.kind==="episode"?(locale==="en"?"Event":"出来事"):(locale==="en"?"Context":"説明・背景")}</small></span><Icon name="chevron"/></button></li>)}</ul>{error&&<p role="status">{locale==="en"?"Could not load this knowledge.":"知識を取得できませんでした。"} <button disabled={busy} onClick={()=>{setBusy(true);setCursor(null);setRetry(v=>v+1);}}>{locale==="en"?"Retry":"再試行"}</button></p>}{page?.nextCursor&&<button disabled={busy} onClick={()=>{setBusy(true);setCursor(page.nextCursor);}}>{busy?(locale==="en"?"Loading…":"読み込み中…"):(locale==="en"?"More":"続きを見る")}</button>}</section>;
}
