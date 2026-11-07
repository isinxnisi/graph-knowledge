"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CapsuleDocument } from "../lib/domain/capsule-document";
import { capsuleUpdateResponseSchema, sameUpdateValue, type CapsuleUpdateResponse } from "../lib/domain/capsule-updates";
import { planCapsuleKnowledgeUpdate, sameCapsuleUpdate } from "../lib/client/capsule-knowledge-updates";
import { CapsuleModal } from "./CapsuleSurface";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";
import css from "./CapsuleStudio.module.css";
import styles from "./CapsuleKnowledgeUpdates.module.css";

export default function CapsuleKnowledgeUpdates({document,onClose,onApply}:{document:CapsuleDocument;onClose:()=>void;onApply:(response:CapsuleUpdateResponse,includeTheme:boolean,translationIds:readonly string[])=>boolean}){
 const {locale}=useUiLocale(),en=locale==="en",t=(ja:string,en:string)=>locale==="en"?en:ja;
 const [translationLanguage,setTranslationLanguage]=useState("");
 const [includeTheme,setIncludeTheme]=useState(false),[attempt,setAttempt]=useState(0),[response,setResponse]=useState<CapsuleUpdateResponse|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const [translationIds,setTranslationIds]=useState<string[]>([]);
 const active=useRef<AbortController|null>(null);
 async function read(signal:AbortSignal){
  const k=document.knowledge!;
  const kept=(k.snapshot.translations??[]).map(v=>({target:v.target,language:v.language}));
  const offered=translationLanguage&&k.theme?[{target:{kind:"theme" as const,...k.theme,field:"title" as const},language:translationLanguage},{target:{kind:"theme" as const,...k.theme,field:"description" as const},language:translationLanguage}]:[];
  const translations=[...new Map([...kept,...offered].map(v=>[JSON.stringify([v.target,v.language]),v])).values()];
  if(translations.length>100)throw Error(t("訳文の比較は一度に100項目までです。保存した訳文のみの比較へ戻してください。","Compare up to 100 translation fields at once. Return to captured translations only."));
  const result=await fetch("/api/knowledge/capsule-updates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recordIds:k.snapshot.records.map(r=>r.id),entityIds:k.snapshot.entities.map(e=>e.id),theme:k.theme,includeTheme,translations}),signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]),cache:"no-store"});
  if(!result.ok)throw Error(result.status===404?t("現在は取得元を閲覧できません。保存内容は変更していません。","The source is unavailable. Your saved content is unchanged."):t("更新を取得できませんでした。保存内容は変更していません。","Could not load updates. Your saved content is unchanged."));
  return capsuleUpdateResponseSchema.parse(await result.json());
 }
 useEffect(()=>{
  const controller=new AbortController();active.current=controller;
  void read(controller.signal).then(value=>{if(!controller.signal.aborted){setResponse(value);setBusy(false);}}).catch(cause=>{if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:t("取得できませんでした","Could not load"));setBusy(false);}});
  return()=>{controller.abort();active.current?.abort();};
  // The modal owns one fixed draft; changing the comparison mode starts a new read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[includeTheme,attempt,translationLanguage]);
 const plan=useMemo(()=>{if(!response||response.unavailable.length)return null;try{return planCapsuleKnowledgeUpdate(document,response,includeTheme,translationIds);}catch{return null;}},[document,response,includeTheme,translationIds]);
 const names=useMemo(()=>({before:Object.fromEntries([...document.knowledge!.snapshot.entities.map(e=>[e.id,e.content.name]),...document.knowledge!.snapshot.sources.map(s=>[s.id,s.content.title])]),after:Object.fromEntries([...(response?.snapshot.entities??[]).map(e=>[e.id,e.content.name]),...(response?.snapshot.sources??[]).map(s=>[s.id,s.content.title])])}),[document,response]);
 const reload=()=>{setTranslationIds([]);setBusy(true);setError(null);setMessage(null);setResponse(null);setAttempt(v=>v+1);};
 async function apply(){
  if(!response||!plan)return;const controller=new AbortController();active.current=controller;setBusy(true);setError(null);setMessage(null);
  try{
   const checked=await read(controller.signal);if(controller.signal.aborted)return;
   if(!sameCapsuleUpdate(response,checked)){setResponse(checked);setMessage(t("比較中に取得元が更新されました。内容をもう一度確認してください。","The source changed during comparison. Review the new changes."));return;}
   if(!onApply(checked,includeTheme,translationIds))setError(t("上限または形式を確認してください。草稿は残っています。","Check the limits or format. Your draft is retained."));
  }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:t("取り込めませんでした","Could not import"));}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 function close(){active.current?.abort();onClose();}
 return <CapsuleModal wide title={t("取得元の更新","Source updates")} onClose={close} className={styles.modal}>
  <header className={css.dialogHeading}><h3>{t("取得元の更新","Source updates")}</h3><button aria-label={t("比較を閉じる","Close comparison")} onClick={close}><Icon name="close"/></button></header>
  {document.knowledge?.theme&&<div className={styles.modes} role="group" aria-label={t("比較する範囲","Comparison scope")}>{[false,true].map(theme=><button key={String(theme)} aria-pressed={includeTheme===theme} disabled={busy} onClick={()=>{setBusy(true);setResponse(null);setError(null);setMessage(null);setIncludeTheme(theme);}}>{theme?t("テーマの構成","Theme composition"):t("取得済みの原記録","Captured records")}</button>)}</div>}
  {document.knowledge?.theme&&<label className={styles.translationLanguage}>{t("訳文の比較","Translation comparison")}<select value={translationLanguage} disabled={busy} onChange={e=>{setTranslationLanguage(e.target.value);setTranslationIds([]);setBusy(true);setResponse(null);setError(null);setMessage(null);}}><option value="">{t("保存した訳文のみ","Captured translations only")}</option><option value="ja">{t("テーマの日本語訳も探す","Also find Japanese theme translations")}</option><option value="en">{t("テーマの英語訳も探す","Also find English theme translations")}</option></select></label>}
  <p className={styles.hint}>{includeTheme?t("テーマに含まれる記録の追加・除外と、テーマが選んだ版を比較します。","Compare the theme’s membership and selected editions."):t("取得済みの記録と対象を、現在公開されている版と比較します。","Compare the captured records and objects with their currently published editions.")}</p>
  <div className={styles.results} aria-busy={busy}>
   {busy&&<p role="status">{t("取得元を確認しています…","Checking the source…")}</p>}
   {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
   {response?.unavailable.length? <p role="alert">{t("現在は閲覧できない取得元があります。保存内容を保つため、今回は取り込めません。","Some sources are unavailable. Import is blocked to preserve your content.")}</p>:null}
   {response&&!plan&&!response.unavailable.length&&<p role="alert">{t("この更新は現在のCapsuleへ取り込めません。保存内容は変更していません。","This update cannot be imported into this Capsule. Your saved content is unchanged.")}</p>}
   {plan&&<>{!plan.changes.length?<p role="status">{t("取得元に変更はありません。","The source is unchanged.")}</p>:<><p className={styles.summary}>{t(`${plan.changes.length}件の変更`,`${plan.changes.length} changes`)}</p><ul className={styles.list}>{plan.changes.map(c=><li key={c.kind+":"+c.id}>{c.kind==="translation"&&c.after!==null&&<label className={styles.translationChoice}><input type="checkbox" checked={translationIds.includes(c.id)} onChange={e=>setTranslationIds(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/>{t("この訳文の更新を取り込む","Import this translation update")}</label>}<details><summary><span className={styles.kind}>{({record:t("記録","Record"),entity:t("対象","Object"),source:t("資料","Source"),mapping:t("意味対応","Meaning"),theme:t("テーマ","Theme"),translation:t("訳文","Translation")})[c.kind]}</span><strong>{c.title}</strong><span className={styles.edition}>{c.beforeRevision??"−"} → {c.afterRevision??"−"}</span></summary><div className={styles.columns}><div><h4>{t("取得済み","Captured")}</h4><UpdateValue value={changedValues(c.before,c.after)[0]} en={en} names={names.before}/></div><div><h4>{t("取得元の現在版","Current source")}</h4><UpdateValue value={changedValues(c.before,c.after)[1]} en={en} names={names.after}/></div></div></details></li>)}</ul></>}
    {!!plan.preserved&&<p className={styles.hint}>{t(`独自に編集した${plan.preserved}項目を保持します。`,`${plan.preserved} authored fields will be preserved.`)}</p>}
    {!!plan.retained.length&&<p>{t(`作者の編集がある${plan.retained.length}件の関係は、テーマから外れていてもこのCapsuleに残します。`,`${plan.retained.length} authored relations will remain in this Capsule after removal from the theme.`)}</p>}
    {!!plan.excluded&&<p className={styles.hint}>{t(`Capsuleで外した${plan.excluded}件の関係は追加し直しません。`,`${plan.excluded} excluded relations will stay excluded.`)}</p>}
   </>}
  </div>
  <footer className={styles.footer}><p className={styles.hint}>{t("独自の編集と配置を保ち、草稿へ取り込みます。訳文は選んだ更新だけを取り込みます。対応する原文が変わる訳文は外します。保存・共有への反映は別操作です。","Import into the draft, keeping authored edits and layout. Saving and publishing remain separate.")}</p><div className={css.actions}><button disabled={busy} onClick={reload}><Icon name="refresh"/>{t("再確認","Check again")}</button><button disabled={busy||!plan?.changes.some(c=>c.kind!=="translation"||c.after===null||translationIds.includes(c.id))} data-variant="primary" onClick={()=>void apply()}>{t("草稿に取り込む","Import into draft")}</button></div></footer>
 </CapsuleModal>;
}
/** Show changes, rather than repeating the whole record around a small correction. */
function changedValues(before:unknown,after:unknown):[unknown,unknown]{
 if(Array.isArray(before)&&Array.isArray(after)&&before.length===1&&after.length===1&&before[0]&&after[0]&&typeof before[0]==="object"&&typeof after[0]==="object"){
  const a=before[0] as Record<string,unknown>,b=after[0] as Record<string,unknown>,keys=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>!sameUpdateValue(a[k],b[k]));
  return [Object.fromEntries(keys.map(k=>[k,a[k]])),Object.fromEntries(keys.map(k=>[k,b[k]]))];
 }
 return [before,after];
}
function UpdateValue({value,en,names}:{value:unknown;en:boolean;names:Record<string,string>}){
 if(value===null||value===undefined)return <p>{en?"Not included":"含まれません"}</p>;
 if(typeof value!=="object"){
  const values:Record<string,string>=en?{}:{relation:"関係",note:"説明",period:"期間",calendar:"年月日",cycle:"周期",qualitative:"定性的な時期",affirmed:"肯定",denied:"否定",uncertain:"不確か",support:"支持",refute:"反証",background:"背景",duration:"続いた期間","occurrence-window":"発生時期の幅","legacy-unspecified":"未区別の範囲",year:"年",month:"月",day:"日",ja:"日本語",en:"英語"};
  return <p>{names[String(value)]??values[String(value)]??String(value)}</p>;
 }
 if(Array.isArray(value))return <>{value.map((v,i)=><UpdateValue key={i} value={v} en={en} names={names}/>)}</>;
 const labels:Record<string,string>=en?{}:{name:"名前",description:"説明",kind:"種別",aliases:"別名",assertion:"記録",relation:"関係",subjectId:"起点",objectId:"関係先",polarity:"肯否",scope:"範囲",times:"時期",evidence:"根拠",title:"資料名",url:"URL",bibliography:"書誌",language:"言語",concept:"意味",from:"開始・下限",to:"終了・上限",meaning:"時期の意味",label:"表示名",source:"資料版",revision:"版",locator:"該当箇所",excerpt:"引用",stance:"根拠の扱い",time:"時期",id:"ID",startBounds:"開始の不確かな幅",endBounds:"終了の不確かな幅",precision:"精度",definition:"意味の定義",recordRevision:"対象の記録版",conceptId:"意味の識別子",origin:"基準",unit:"単位",position:"位置",order:"順序"};
 if(!Object.keys(value).length)return <p>{en?"Content unchanged; update the captured edition.":"内容は同じです。取得版を更新します。"}</p>;
 return <dl className={styles.fields}>{Object.entries(value).filter(([k,v])=>k!=="id"&&v!==undefined&&v!==null).map(([k,v])=><div key={k}><dt>{labels[k]??k}</dt><dd><UpdateValue value={v} en={en} names={names}/></dd></div>)}</dl>;
}
