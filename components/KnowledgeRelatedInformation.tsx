"use client";
import {useEffect,useRef,useState} from "react";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import {useKnowledgeDisplayTranslations} from "../lib/client/use-knowledge-display-translations";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import type {KnowledgeDisplayTranslation} from "../lib/domain/knowledge-translation";
import {ExpandableReadingSection,ReadingMore} from "./ReadingDetailSection";
import css from "./KnowledgeRelatedInformation.module.css";
type Page={records:KnowledgePublishedRecord[];nextCursor:string|null};
type Props={displayTranslations?:readonly KnowledgeDisplayTranslation[];entityId:string;onOpen:(id:string)=>void;inViewRecords?:KnowledgePublishedRecord[];onOpenInView?:(id:string)=>void;inTheme?:boolean};
export default function KnowledgeRelatedInformation(props:Props){
 return <RelatedInformationList key={props.entityId} {...props}/>;
}
function RelatedInformationList({entityId,onOpen,inViewRecords=[],onOpenInView,inTheme=false,displayTranslations=[]}:Props){
 const {locale}=useUiLocale(),en=locale==="en",[page,setPage]=useState<Page|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[busy,setBusy]=useState(true),[expanded,setExpanded]=useState(false);
 const completedCursors=useRef(new Set<string>());
 useEffect(()=>{
  // Fetch only the first page until the reader opens the list. Collapsing aborts further pages.
  if(error||(page&&(!expanded||!page.nextCursor))){setBusy(false);return;}
  const cursor=page?.nextCursor??null,c=new AbortController();
  if(cursor&&completedCursors.current.has(cursor)){setError(true);return;}
  setBusy(true);
  void fetch("/api/knowledge/public?"+new URLSearchParams({mode:"search",entityId,limit:cursor?"50":"10",...(cursor?{cursor}:{})}),{signal:c.signal,cache:"no-store"})
   .then(async r=>{if(!r.ok)throw Error("READ_FAILED");return r.json();})
   .then((value:Page)=>{
    if(c.signal.aborted)return;
    if(cursor)completedCursors.current.add(cursor);
    setPage(old=>({records:[...new Map([...(old?.records??[]),...value.records].map(r=>[r.record.id,r])).values()],nextCursor:value.nextCursor}));
   })
   .catch(()=>{if(!c.signal.aborted)setError(true);})
   .finally(()=>{if(!c.signal.aborted)setBusy(false);});
  return()=>c.abort();
 },[entityId,page,expanded,error,retry]);
 const pinned=new Set(inViewRecords.map(r=>r.record.id)),records=[...inViewRecords,...(page?.records??[]).filter(r=>!pinned.has(r.record.id))];
 const extras=(expanded?records:records.slice(0,3)).filter(r=>!pinned.has(r.record.id)),loadedTranslations=useKnowledgeDisplayTranslations(extras.flatMap(r=>r.entities),extras.map(r=>r.record),undefined,locale,en);
 const translations=[...displayTranslations,...loadedTranslations];
 const assertion=(r:KnowledgePublishedRecord)=>knowledgeDisplayText(translations,{kind:"record",id:r.record.id,revision:r.record.revision,field:"assertion"},locale,r.record.content.assertion);
 if(!records.length&&!error)return null;
 return <ExpandableReadingSection title={en?"Related knowledge":"関連する知識"} icon="book" className={css.section} listTag="ul" expanded={expanded} onExpandedChange={setExpanded} hasMore={!!page?.nextCursor} busy={busy} footer={error&&<><p role="status">{en?"Could not load more knowledge.":"ほかの知識を取得できませんでした。"}</p><ReadingMore busy={busy} label={en?"Retry":"再試行"} onClick={()=>{setError(false);setRetry(v=>v+1);}}/></>} items={records.map(r=><li key={r.record.id}><button title={assertion(r)} onClick={()=>pinned.has(r.record.id)&&onOpenInView?onOpenInView(r.record.id):onOpen(r.record.id)}><Icon name={r.record.content.kind==="relation"?"graph":r.record.content.kind==="episode"?"event":"book"}/><span><span className={css.assertion}>{assertion(r)}</span><small>{pinned.has(r.record.id)?(inTheme?(en?"In this theme":"このテーマ"):(en?"In this view":"この表示")):(en?"Other public knowledge":"ほかの公開知識")} · {r.record.content.kind==="relation"?(en?"Relation":"関係"):r.record.content.kind==="episode"?(en?"Event":"出来事"):(en?"Context":"説明・背景")}</small></span><Icon name="arrow"/></button></li>)}/>;
}
