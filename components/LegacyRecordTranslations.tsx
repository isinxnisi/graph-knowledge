"use client";
import {useState} from "react";
import {z} from "zod";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import {useMemberSession} from "../lib/client/use-member-identity";
import {memberRequest} from "../lib/client/member-api";
import KnowledgeTranslationPanel from "./KnowledgeTranslationPanel";
import {knowledgeRecordTranslationFields} from "./KnowledgeRecordDetail";
import {useUiLocale} from "../lib/client/ui-locale";
export default function LegacyRecordTranslations({id}:{id:string}){
 const identity=useMemberSession(),{locale}=useUiLocale(),en=locale==="en";
 const [record,setRecord]=useState<KnowledgePublishedRecord|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function open(){setBusy(true);setError("");try{const schema=z.object({record:z.custom<KnowledgePublishedRecord>(v=>!!v&&typeof v==="object"&&"record" in v&&"sources" in v)});const response=await fetch("/api/knowledge/legacy-translations?"+new URLSearchParams({kind:"record",id}),{cache:"no-store"});let result;if(response.ok)result=schema.parse(await response.json());else{if(response.status!==404||identity.status!=="authenticated"||!identity.user)throw Error(response.status===404?"LOGIN_REQUIRED":"UNAVAILABLE");result=await memberRequest("/api/member/knowledge-translations/legacy",schema,{method:"POST",user:identity.user.id,body:{kind:"record",id,requestId:crypto.randomUUID()}});}setRecord(result.record);}catch(e){setError(e instanceof Error&&e.message==="LOGIN_REQUIRED"?(en?"Log in to prepare this public original for translation.":"この公開原文を翻訳で使う初回準備にはログインが必要です。"):en?"Could not prepare the public original. Retry without leaving this page.":"公開原文を取得できませんでした。この画面のまま再試行できます。");}finally{setBusy(false);}}
 if(record)return <KnowledgeTranslationPanel fields={knowledgeRecordTranslationFields(record,en)}/>;
 return <div><button disabled={busy} onClick={()=>void open()}>{busy?(en?"Preparing original…":"原文を確認中…"):en?"Translations":"翻訳"}</button>{error&&<p role="alert">{error}</p>}</div>;
}
