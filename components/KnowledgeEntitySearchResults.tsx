"use client";
import {entityDisplayName} from "../lib/domain/entity-display";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import {useKnowledgeDisplayTranslations} from "../lib/client/use-knowledge-display-translations";
import {useEffect,useRef,useState} from "react";
import type {KnowledgeEntityVersion} from "../lib/domain/knowledge-foundation";
import type {KnowledgeEntityPage} from "../lib/domain/knowledge-theme-reader";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import type {DiscoveryCriteria} from "../lib/client/use-discovery-search";
import {knowledgeSearchKinds} from "../lib/domain/knowledge-search-kind";
import {useKnowledgeReading} from "./KnowledgeReading";
import {useUiLocale} from "../lib/client/ui-locale";
import {knowledgeKindLabel} from "../lib/client/knowledge-kind-label";
import Icon from "./Icon";
import css from "./KnowledgeRelatedInformation.module.css";
import rows from "./DiscoverySearch.module.css";
export type KnowledgeEntitySearchMatches={q:string;kind:string|null;ids:string[];pending?:boolean};

export default function KnowledgeEntitySearchResults({q,kind,excludeIds=[],onMatches,criteria,allowEmpty=false,onChoose,recordView=false,onChooseRecord,paused=false}:{
 q:string;kind:string|null;excludeIds?:string[];onMatches?:(value:KnowledgeEntitySearchMatches)=>void;
 criteria?:DiscoveryCriteria;allowEmpty?:boolean;onChoose?:(value:KnowledgeEntityVersion)=>void;
 recordView?:boolean;onChooseRecord?:(id:string)=>void;
 paused?:boolean;
}){
 const reading=useKnowledgeReading(),{locale}=useUiLocale(),en=locale==='en';
 const [result,setResult]=useState<{key:string;page:KnowledgeEntityPage;items:KnowledgeEntityVersion[]}|null>(null);
 const [records,setRecords]=useState<{key:string;items:KnowledgePublishedRecord[]}|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string;restart?:boolean}|null>(null),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 const controller=useRef<AbortController|null>(null),serial=useRef(0);
 const enabled=!!reading&&!paused&&(allowEmpty||!!q.trim());
 const key=JSON.stringify([recordView,q,kind,criteria?.predicates,criteria?.contributionRole,criteria?.around,criteria?.theme]);
 const parameters=new URLSearchParams({mode:recordView?'search':'entities',q,limit:'20',...(kind?recordView?{entityKind:kind}:{kind}:{}),...(criteria?.predicates?.length?{predicates:criteria.predicates.join(',')}:{}),...(criteria?.contributionRole?{roleId:criteria.contributionRole}:{}),...(criteria?.around?{aroundId:criteria.around}:{}),...(criteria?.theme?{collection:criteria.theme}:{})}).toString();
 async function load(more=false){
  controller.current?.abort();const c=new AbortController();controller.current=c;const token=++serial.current;
  setBusy(true);setFailure(null);const timer=setTimeout(()=>c.abort(),15000);
  const params=new URLSearchParams(parameters);
  if(more&&result?.key===key){params.set('generation',result.page.generation);if(result.page.nextCursor)params.set('cursor',result.page.nextCursor);}
  try{
   const response=await fetch('/api/knowledge/public?'+params,{signal:c.signal,cache:'no-store'}),value=await response.json();
   if(!response.ok){if(response.status===400||response.status===409){if(token===serial.current)setFailure({key,message:en?'The search conditions changed. Search again from the first page.':'検索条件や公開状態が変わりました。先頭から検索し直せます。',restart:true});return;}throw Error(typeof value.error==='string'?value.error:'対象を検索できませんでした。');}
   if(token!==serial.current||c.signal.aborted)return;
   const page=value as KnowledgeEntityPage;
   const items=recordView?[]:page.entities.filter(e=>!kind||knowledgeSearchKinds(kind).includes(e.content.kind));
   if(recordView)setRecords(old=>({key,items:[...new Map([...(more&&old?.key===key?old.items:[]),...((value.records??[]) as KnowledgePublishedRecord[])].map(r=>[r.record.id,r])).values()]}));
   setResult(old=>({key,page,items:[...new Map([...(more&&old?.key===key?old.items:[]),...items].map(e=>[e.id,e])).values()]}));
  }catch(error){if(token===serial.current)setFailure({key,message:en?'Could not load these subjects. Retry without losing the displayed results.':error instanceof Error&&error.name!=='AbortError'?error.message:'取得に時間がかかっています。表示を残したまま再試行できます。'});}
  finally{clearTimeout(timer);if(token===serial.current)setBusy(false);}
 }
 useEffect(()=>{
  if(!enabled)return;
  const sequence=serial;
  const timer=setTimeout(()=>void load(),250);
  return()=>{clearTimeout(timer);sequence.current++;controller.current?.abort();};
  // parameters fully identifies the request; callbacks and result do not restart a search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[enabled,key,parameters,retry]);
 const current=enabled&&result?.key===key?result.items.filter(e=>!excludeIds.includes(e.id)):[];
 const recordRows=enabled&&records?.key===key?records.items.filter(r=>!excludeIds.includes(r.record.id)):[];
 const displayEntities=[...new Map([...current,...recordRows.flatMap(r=>r.entities)].map(e=>[e.id,e])).values()];
 const translations=useKnowledgeDisplayTranslations(displayEntities,recordRows.map(r=>r.record),undefined,locale);
 const entityName=(e:KnowledgeEntityVersion)=>{const text=knowledgeDisplayText(translations,{kind:'entity',id:e.id,revision:e.revision,field:'name'},locale,e.content.name);return text===e.content.name?entityDisplayName(e.content,locale):text;};
 const visibleIds=JSON.stringify(recordView?recordRows.map(r=>r.record.id):current.map(e=>e.id));
 const pending=enabled&&(busy||result?.key!==key)&&failure?.key!==key;
 useEffect(()=>{onMatches?.({q,kind,ids:JSON.parse(visibleIds) as string[],pending});},[q,kind,visibleIds,pending,onMatches]);
 if(!enabled)return null;
 const failed=failure?.key===key;
 return <section className={css.section} aria-label={recordView?en?'Additional knowledge':'新しく加わった知識':en?'Additional subjects':'新しく加わった対象'} aria-busy={busy}>
  {!!recordRows.length&&<><h3>{en?'Additional knowledge':'新しく加わった知識'}</h3><ul>{recordRows.map(dto=><li key={dto.record.id}><button onClick={()=>onChooseRecord?onChooseRecord(dto.record.id):reading?.openRecord(dto.record.id)}><Icon name={dto.record.content.kind==='relation'?'graph':'book'}/><span>{knowledgeDisplayText(translations,{kind:'record',id:dto.record.id,revision:dto.record.revision,field:'assertion'},locale,dto.record.content.assertion)}<small>{dto.entities.map(entityName).join(' · ')}</small></span><Icon name="chevron"/></button></li>)}</ul></>}
  {!!current.length&&<><h3>{en?'Additional subjects':'新しく加わった対象'}</h3><ul className={rows.results}>{current.map(e=><li key={e.id}><button onClick={()=>onChoose?onChoose(e):reading?.openEntity(e)}>
   <Icon name={e.content.kind==='work'||e.content.kind==='作品'?'book':e.content.kind==='organization'||e.content.kind==='組織'?'organization':e.content.kind==='event'||e.content.kind==='出来事'?'event':'person'}/>
   <span className={rows.identity}><span className={rows.name}><strong>{entityName(e)}</strong><small>{knowledgeKindLabel(e.content.kind,locale)}</small></span>{e.content.description&&<span className={rows.description}>{knowledgeDisplayText(translations,{kind:'entity',id:e.id,revision:e.revision,field:'description'},locale,e.content.description)}</span>}{e.content.aliases.length>0&&<span className={rows.aliases}>{en?'Aliases: ':'別名：'}{e.content.aliases.join('・')}</span>}</span><Icon name="chevron"/>
  </button></li>)}</ul></>}
  {failed&&<p role="status">{failure.message} <button onClick={()=>{if(!failure.restart&&result?.key===key&&result.page.hasMore)void load(true);else setRetry(v=>v+1);}}>{failure.restart?en?'Search again':'先頭から再検索':en?'Retry':'再試行'}</button></p>}
  {result?.key===key&&result.page.hasMore&&!failed&&<button disabled={busy} onClick={()=>void load(true)}>{busy?en?'Reading…':'読み込み中…':recordView?en?'More knowledge':'知識の続きを表示':en?'More subjects':'対象の続きを表示'}<Icon name="chevron"/></button>}
  {allowEmpty&&busy&&!current.length&&!recordRows.length&&<p role="status">{en?'Searching…':'探しています…'}</p>}
 </section>;
}
