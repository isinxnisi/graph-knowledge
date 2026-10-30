"use client";
import {useEffect,useState} from "react";
import {z} from "zod";
import {memberRequest} from "../lib/client/member-api";
import {useMemberSession} from "../lib/client/use-member-identity";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import css from "./CapsuleDestinations.module.css";
const schema=z.object({destinations:z.array(z.object({id:z.uuidv4(),communityId:z.uuidv4(),title:z.string(),visibility:z.enum(["public","members"]),audience:z.enum(["public","cohort"]),revision:z.number().int().positive()})),nextCursor:z.string().nullable()});
type Result=z.infer<typeof schema>;
export default function CapsuleDestinations({capsuleId,ownerId,compact=false}:{capsuleId:string;ownerId:string;compact?:boolean}) {
 const identity=useMemberSession(),{locale}=useUiLocale(),en=locale==="en";
 const [open,setOpen]=useState(false),[result,setResult]=useState<Result|null>(null),[cursor,setCursor]=useState<string|null>(null),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const authorized=identity.user?.id===ownerId&&identity.status==="authenticated";
 useEffect(()=>{
  if(!open||!authorized)return;
  const controller=new AbortController();
  void memberRequest(`/api/member/capsules/${capsuleId}/destinations${cursor?"?cursor="+encodeURIComponent(cursor):""}`,schema,{user:ownerId,signal:controller.signal}).then(value=>{
   if(!controller.signal.aborted){setResult(previous=>({destinations:cursor&&previous?[...previous.destinations,...value.destinations.filter(v=>!previous.destinations.some(p=>p.id===v.id))]:value.destinations,nextCursor:value.nextCursor}));setError(false);}
  }).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return()=>controller.abort();
 },[capsuleId,ownerId,authorized,open,cursor,attempt]);
 if(!authorized)return null;
 return <details className={css.destinations} data-compact={compact||undefined} open={open} onToggle={event=>{const expanded=event.currentTarget.open;if(expanded!==open){setOpen(expanded);setResult(null);setCursor(null);setError(false);setBusy(expanded);}}}>
  <summary><Icon name="organization"/><span>{compact?(en?"Community destinations":"コミュニティ掲載先"):(en?"Published communities":"掲載しているコミュニティ")}</span><Icon name="chevron"/></summary>
  {open&&<div className={css.content}>
   {busy&&!result&&<p role="status">{en?"Loading…":"確認中…"}</p>}
   {error&&<p role="alert">{en?"Could not load destinations.":"掲載先を確認できませんでした。"}<button type="button" onClick={()=>{setBusy(true);setAttempt(v=>v+1);}}>{en?"Retry":"再試行"}</button></p>}
   {result?.destinations.map(item=><a key={item.id} href={"/communities#"+encodeURIComponent("/"+item.communityId+"?tab=capsules&listing="+item.id)} target="_blank" rel="noopener noreferrer" title={en?"Open published Capsule in a new tab":"掲載したCapsuleを別タブで開く"}><span><strong>{item.title}</strong><small>{item.audience==="cohort"?(en?"Original participants":"掲載時の参加者限定"):item.visibility==="members"?(en?"Members":"メンバー限定"):(en?"Public":"公開")} · {en?"Version":"保存版"} {item.revision}</small></span><Icon name="external"/></a>)}
   {result&&!result.destinations.length&&<p>{en?"No accessible community listings.":"現在閲覧できる掲載先はありません。"}</p>}
   {result?.nextCursor&&<button type="button" disabled={busy} onClick={()=>{setBusy(true);setCursor(result.nextCursor);}}>{en?"More destinations":"ほかの掲載先を見る"}</button>}
  </div>}
 </details>;
}
