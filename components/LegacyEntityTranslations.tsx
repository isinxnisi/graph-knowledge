"use client";
import {useState} from "react";
import {z} from "zod";
import {knowledgeEntityContentSchema,type KnowledgeEntityVersion} from "../lib/domain/knowledge-foundation";
import {useMemberSession} from "../lib/client/use-member-identity";
import {memberRequest} from "../lib/client/member-api";
import KnowledgeTranslationPanel from "./KnowledgeTranslationPanel";
import {useUiLocale} from "../lib/client/ui-locale";
import css from "./KnowledgeTranslationPanel.module.css";
export default function LegacyEntityTranslations({id}:{id:string}){
 const identity=useMemberSession(),{locale}=useUiLocale(),en=locale==="en";
 const [expanded,setExpanded]=useState(false);
 const [entity,setEntity]=useState<KnowledgeEntityVersion|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function open(){setBusy(true);setError("");try{const schema=z.object({entity:z.object({id:z.string(),revision:z.number(),content:knowledgeEntityContentSchema,createdAt:z.string(),reason:z.string()})});const response=await fetch("/api/knowledge/legacy-translations?"+new URLSearchParams({kind:"entity",id}),{cache:"no-store"});let result;if(response.ok)result=schema.parse(await response.json());else{if(response.status!==404||identity.status!=="authenticated"||!identity.user)throw Error(response.status===404?"LOGIN_REQUIRED":"UNAVAILABLE");result=await memberRequest("/api/member/knowledge-translations/legacy",schema,{method:"POST",user:identity.user.id,body:{kind:"entity",id,requestId:crypto.randomUUID()}});}setEntity(result.entity);}catch(e){setError(e instanceof Error&&e.message==="LOGIN_REQUIRED"?(en?"Log in to prepare this public original for translation.":"この公開原文を翻訳で使う初回準備にはログインが必要です。"):en?"Could not prepare the public original. Retry without leaving this page.":"公開原文を取得できませんでした。この画面のまま再試行できます。");}finally{setBusy(false);}}
 return <details className={css.panel} onToggle={event=>{
  const next=event.currentTarget.open;
  setExpanded(next);
  if(next&&!entity&&!busy)void open();
 }}>
  <summary>{en?"Translations":"翻訳"}</summary>
  {expanded&&(entity?<KnowledgeTranslationPanel embedded fields={[{label:en?"Name":"名前",target:{kind:"entity",id,revision:entity.revision,field:"name"}},...(entity.content.description?[{label:en?"Description":"説明",target:{kind:"entity" as const,id,revision:entity.revision,field:"description" as const}}]:[]),...entity.content.aliases.map((alias,aliasIndex)=>({label:(en?"Alias: ":"別名：")+alias,target:{kind:"entity" as const,id,revision:entity.revision,field:"aliases" as const,aliasIndex}}))]}/>:<div className={css.body}>
   {busy?<p role="status">{en?"Preparing original…":"原文を確認中…"}</p>:error&&<p role="alert">{error} <button type="button" className={css.textAction} onClick={()=>void open()}>{en?"Retry":"再試行"}</button></p>}
  </div>)}
 </details>;
}
