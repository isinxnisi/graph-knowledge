"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CapsuleDocument } from "../lib/domain/capsule-document";
import { capsuleUpdateResponseSchema, type CapsuleUpdateResponse } from "../lib/domain/capsule-updates";
import { planCapsuleKnowledgeUpdate, sameCapsuleUpdate } from "../lib/client/capsule-knowledge-updates";
import { CapsuleModal } from "./CapsuleSurface";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";
import css from "./CapsuleStudio.module.css";
import styles from "./CapsuleKnowledgeUpdates.module.css";

export default function CapsuleKnowledgeUpdates({document,onClose,onApply}:{document:CapsuleDocument;onClose:()=>void;onApply:(response:CapsuleUpdateResponse,includeTheme:boolean)=>boolean}){
 const {locale}=useUiLocale(),en=locale==="en",t=(ja:string,en:string)=>locale==="en"?en:ja;
 const [includeTheme,setIncludeTheme]=useState(false),[attempt,setAttempt]=useState(0),[response,setResponse]=useState<CapsuleUpdateResponse|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const active=useRef<AbortController|null>(null);
 async function read(signal:AbortSignal){
  const k=document.knowledge!;
  const result=await fetch("/api/knowledge/capsule-updates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recordIds:k.snapshot.records.map(r=>r.id),entityIds:k.snapshot.entities.map(e=>e.id),theme:k.theme,includeTheme}),signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]),cache:"no-store"});
  if(!result.ok)throw Error(result.status===404?t("現在は取得元を閲覧できません。保存内容は変更していません。","The source is unavailable. Your saved content is unchanged."):t("更新を取得できませんでした。保存内容は変更していません。","Could not load updates. Your saved content is unchanged."));
  return capsuleUpdateResponseSchema.parse(await result.json());
 }
 useEffect(()=>{
  const controller=new AbortController();active.current=controller;
  void read(controller.signal).then(value=>{if(!controller.signal.aborted){setResponse(value);setBusy(false);}}).catch(cause=>{if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:t("取得できませんでした","Could not load"));setBusy(false);}});
  return()=>{controller.abort();active.current?.abort();};
  // The modal owns one fixed draft; changing the comparison mode starts a new read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[includeTheme,attempt]);
 const plan=useMemo(()=>{if(!response||response.unavailable.length)return null;try{return planCapsuleKnowledgeUpdate(document,response,includeTheme);}catch{return null;}},[document,response,includeTheme]);
 const reload=()=>{setBusy(true);setError(null);setMessage(null);setResponse(null);setAttempt(v=>v+1);};
 async function apply(){
  if(!response||!plan)return;const controller=new AbortController();active.current=controller;setBusy(true);setError(null);setMessage(null);
  try{
   const checked=await read(controller.signal);if(controller.signal.aborted)return;
   if(!sameCapsuleUpdate(response,checked)){setResponse(checked);setMessage(t("比較中に取得元が更新されました。内容をもう一度確認してください。","The source changed during comparison. Review the new changes."));return;}
   if(!onApply(checked,includeTheme))setError(t("上限または形式を確認してください。草稿は残っています。","Check the limits or format. Your draft is retained."));
  }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:t("取り込めませんでした","Could not import"));}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 function close(){active.current?.abort();onClose();}
 return <CapsuleModal wide title={t("取得元の更新","Source updates")} onClose={close} className={styles.modal}>
  <header className={css.dialogHeading}><h3>{t("取得元の更新","Source updates")}</h3><button aria-label={t("比較を閉じる","Close comparison")} onClick={close}><Icon name="close"/></button></header>
  {document.knowledge?.theme&&<div className={styles.modes} role="group" aria-label={t("比較する範囲","Comparison scope")}>{[false,true].map(theme=><button key={String(theme)} aria-pressed={includeTheme===theme} disabled={busy} onClick={()=>{setBusy(true);setResponse(null);setError(null);setMessage(null);setIncludeTheme(theme);}}>{theme?t("テーマの構成","Theme composition"):t("取得済みの原記録","Captured records")}</button>)}</div>}
  <p className={styles.hint}>{includeTheme?t("テーマに含まれる記録の追加・除外と、テーマが選んだ版を比較します。","Compare the theme’s membership and selected editions."):t("取得済みの記録と対象を、現在公開されている版と比較します。","Compare the captured records and objects with their currently published editions.")}</p>
  <div className={styles.results} aria-busy={busy}>
   {busy&&<p role="status">{t("取得元を確認しています…","Checking the source…")}</p>}
   {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
   {response?.unavailable.length? <p role="alert">{t("現在は閲覧できない取得元があります。保存内容を保つため、今回は取り込めません。","Some sources are unavailable. Import is blocked to preserve your content.")}</p>:null}
   {response&&!plan&&!response.unavailable.length&&<p role="alert">{t("この更新は現在のCapsuleへ取り込めません。保存内容は変更していません。","This update cannot be imported into this Capsule. Your saved content is unchanged.")}</p>}
   {plan&&<>{!plan.changes.length?<p role="status">{t("取得元に変更はありません。","The source is unchanged.")}</p>:<><p className={styles.summary}>{t(`${plan.changes.length}件の変更`,`${plan.changes.length} changes`)}</p><ul className={styles.list}>{plan.changes.map(c=><li key={c.kind+":"+c.id}><details><summary><span className={styles.kind}>{({record:t("記録","Record"),entity:t("対象","Object"),source:t("資料","Source"),mapping:t("意味対応","Meaning"),theme:t("テーマ","Theme")})[c.kind]}</span><strong>{c.title}</strong><span className={styles.edition}>{c.beforeRevision??"−"} → {c.afterRevision??"−"}</span></summary><div className={styles.columns}><div><h4>{t("取得済み","Captured")}</h4><UpdateValue value={c.before} en={en}/></div><div><h4>{t("取得元の現在版","Current source")}</h4><UpdateValue value={c.after} en={en}/></div></div></details></li>)}</ul></>}
    {!!plan.retained.length&&<p>{t(`作者の編集がある${plan.retained.length}件の関係は、テーマから外れていてもこのCapsuleに残します。`,`${plan.retained.length} authored relations will remain in this Capsule after removal from the theme.`)}</p>}
    {!!plan.excluded&&<p className={styles.hint}>{t(`Capsuleで外した${plan.excluded}件の関係は追加し直しません。`,`${plan.excluded} excluded relations will stay excluded.`)}</p>}
   </>}
  </div>
  <footer className={styles.footer}><p className={styles.hint}>{t("独自の編集と配置を保ち、草稿へ取り込みます。保存・共有への反映は別操作です。","Import into the draft, keeping authored edits and layout. Saving and publishing remain separate.")}</p><div className={css.actions}><button disabled={busy} onClick={reload}><Icon name="refresh"/>{t("再確認","Check again")}</button><button disabled={busy||!plan?.changes.length} data-variant="primary" onClick={()=>void apply()}>{t("草稿に取り込む","Import into draft")}</button></div></footer>
 </CapsuleModal>;
}
function UpdateValue({value,en}:{value:unknown;en:boolean}){
 if(value===null||value===undefined)return <p>{en?"Not included":"含まれません"}</p>;
 if(typeof value!=="object")return <p>{String(value)}</p>;
 if(Array.isArray(value))return <>{value.map((v,i)=><UpdateValue key={i} value={v} en={en}/>)}</>;
 const labels:Record<string,string>=en?{}:{name:"名前",description:"説明",kind:"種別",aliases:"別名",assertion:"記録",relation:"関係",subjectId:"起点",objectId:"関係先",polarity:"肯否",scope:"範囲",times:"時期",evidence:"根拠",title:"資料名",url:"URL",bibliography:"書誌",language:"言語",concept:"意味",from:"開始・下限",to:"終了・上限",meaning:"時期の意味",label:"表示名",source:"資料版",revision:"版",locator:"該当箇所",excerpt:"引用",stance:"根拠の扱い",time:"時期",id:"ID"};
 return <dl className={styles.fields}>{Object.entries(value).filter(([,v])=>v!==""&&v!==null&&(!Array.isArray(v)||v.length)).map(([k,v])=><div key={k}><dt>{labels[k]??k}</dt><dd><UpdateValue value={v} en={en}/></dd></div>)}</dl>;
}
