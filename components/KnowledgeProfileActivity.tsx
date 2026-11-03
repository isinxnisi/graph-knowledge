"use client";
import {useEffect,useState} from "react";
import {knowledgeProfileActivitySchema} from "../lib/domain/knowledge-contributors";
import {memberRequest} from "../lib/client/member-api";
import {useUiLocale} from "../lib/client/ui-locale";
import type {z} from "zod";
import css from "./KnowledgeContributors.module.css";
type Activity=z.infer<typeof knowledgeProfileActivitySchema>["activities"][number];
export default function KnowledgeProfileActivity({handle}:{handle:string}){
 const {locale}=useUiLocale(),en=locale==='en';
 const [state,setState]=useState<{handle:string;available:boolean;items:Activity[];next:string|null}|null>(null),[page,setPage]=useState<{handle:string;cursor:string}|null>(null),[status,setStatus]=useState<{handle:string;error:boolean;busy:boolean}|null>(null),[retry,setRetry]=useState(0);
 const cursor=page?.handle===handle?page.cursor:'';
 useEffect(()=>{
  const c=new AbortController();let active=true;queueMicrotask(()=>{if(active)setStatus({handle,error:false,busy:true});});
  void memberRequest('/api/knowledge/contributors?'+new URLSearchParams({kind:'profile',handle,...(cursor?{cursor}:{})}),knowledgeProfileActivitySchema,{publicOnly:true,signal:c.signal}).then(r=>{if(active){
   setState(previous=>({handle,available:r.available,items:!r.available?[]:cursor&&previous?.handle===handle&&previous.available?[...new Map([...previous.items,...r.activities].map(v=>[v.id,v])).values()]:r.activities,next:r.available?r.nextCursor:null}));
   if(!r.available&&cursor)setPage(null);
   setStatus({handle,error:false,busy:false});
  }}).catch(()=>{if(active)setStatus({handle,error:true,busy:false});});
  return()=>{active=false;c.abort();};
 },[handle,cursor,retry]);
 const current=state?.handle===handle?state:null,error=status?.handle===handle&&status.error,busy=status?.handle===handle&&status.busy;
 if(current?.available===false)return null;
 return <section className={css.activity} aria-label={en?'Knowledge contributions':'知識への投稿'}><h3>{en?'Knowledge contributions':'知識への投稿'}</h3>{error&&<p role="status">{en?'Could not refresh contributions.':'投稿履歴を更新できませんでした。'} <button onClick={()=>setRetry(v=>v+1)}>{en?'Retry':'再取得'}</button></p>}{!current&&busy&&<p role="status">{en?'Loading contributions…':'投稿履歴を確認中…'}</p>}{current&&!current.items.length&&!busy&&!error&&<p>{en?'No public knowledge contributions yet.':'公開された知識の投稿はまだありません。'}</p>}<ul>{current?.items.map(a=><li key={a.id}><small>{a.operation==='add-evidence'?(en?'Added sources':'根拠を追加'):a.operation==='correct-record'?(en?'Proposed a correction':'内容を訂正'):en?'Contributed knowledge':'知識を投稿'}</small><a href={a.href}>{a.title}</a><time dateTime={a.publishedAt}>{new Date(a.publishedAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time></li>)}</ul>{current?.next&&<button disabled={!!busy} onClick={()=>setPage({handle,cursor:current.next!})}>{en?'Read more':'さらに読む'}</button>}</section>;
}
