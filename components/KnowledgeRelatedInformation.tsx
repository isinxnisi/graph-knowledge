"use client";
import {useEffect,useState} from "react";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import {useKnowledgeDisplayTranslations} from "../lib/client/use-knowledge-display-translations";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import type {KnowledgeDisplayTranslation} from "../lib/domain/knowledge-translation";
import ReadingDetailSection,{ReadingMore} from "./ReadingDetailSection";
import css from "./KnowledgeRelatedInformation.module.css";
type Page={records:KnowledgePublishedRecord[];nextCursor:string|null};
export default function KnowledgeRelatedInformation({entityId,onOpen,inViewRecords=[],onOpenInView,inTheme=false,displayTranslations=[]}:{displayTranslations?:readonly KnowledgeDisplayTranslation[];entityId:string;onOpen:(id:string)=>void;inViewRecords?:KnowledgePublishedRecord[];onOpenInView?:(id:string)=>void;inTheme?:boolean}){
 const {locale}=useUiLocale(),en=locale==="en",[page,setPage]=useState<Page|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(true),[visible,setVisible]=useState(3);
 useEffect(()=>{const c=new AbortController();void fetch("/api/knowledge/public?"+new URLSearchParams({mode:"search",entityId,limit:"10",...(cursor?{cursor}:{})}),{signal:c.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("READ_FAILED");return r.json();}).then((v:Page)=>{if(!c.signal.aborted){setPage(old=>({records:cursor?[...new Map([...(old?.records??[]),...v.records].map(r=>[r.record.id,r])).values()]:v.records,nextCursor:v.nextCursor}));setError(false);}}).catch(()=>{if(!c.signal.aborted)setError(true);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[entityId,cursor,retry]);
 const pinned=new Set(inViewRecords.map(r=>r.record.id)),records=[...inViewRecords,...(page?.records??[]).filter(r=>!pinned.has(r.record.id))],remaining=records.length-visible;
 const extras=records.filter(r=>!pinned.has(r.record.id)),loadedTranslations=useKnowledgeDisplayTranslations(extras.flatMap(r=>r.entities),extras.map(r=>r.record),undefined,locale,en);
 const translations=[...displayTranslations,...loadedTranslations];
 const assertion=(r:KnowledgePublishedRecord)=>knowledgeDisplayText(translations,{kind:"record",id:r.record.id,revision:r.record.revision,field:"assertion"},locale,r.record.content.assertion);
 if(!records.length&&!error)return null;
 function more(){setVisible(value=>value+3);if(remaining<=0&&page?.nextCursor){setBusy(true);setCursor(page.nextCursor);}}
 return <ReadingDetailSection title={en?"Related knowledge":"関連する知識"} icon="book" className={css.section}><ul>{records.slice(0,visible).map(r=><li key={r.record.id}><button title={assertion(r)} onClick={()=>pinned.has(r.record.id)&&onOpenInView?onOpenInView(r.record.id):onOpen(r.record.id)}><Icon name={r.record.content.kind==="relation"?"graph":r.record.content.kind==="episode"?"event":"book"}/><span><span className={css.assertion}>{assertion(r)}</span><small>{pinned.has(r.record.id)?(inTheme?(en?"In this theme":"このテーマ"):(en?"In this view":"この表示")):(en?"Other public knowledge":"ほかの公開知識")} · {r.record.content.kind==="relation"?(en?"Relation":"関係"):r.record.content.kind==="episode"?(en?"Event":"出来事"):(en?"Context":"説明・背景")}</small></span><Icon name="arrow"/></button></li>)}</ul>{(remaining>0||(!error&&page?.nextCursor))&&<ReadingMore busy={busy&&remaining<=0} label={busy&&remaining<=0?(en?"Loading…":"読み込み中…"):remaining>0?(en?`Show ${Math.min(3,remaining)} more records`:`知識をさらに${Math.min(3,remaining)}件表示`):(en?"Show more knowledge":"知識の続きを表示")} onClick={more}/>} {error&&<><p role="status">{en?"Could not load more knowledge.":"ほかの知識を取得できませんでした。"}</p><ReadingMore busy={busy} label={en?"Retry":"再試行"} onClick={()=>{setBusy(true);setRetry(v=>v+1);}}/></>}</ReadingDetailSection>;
}
