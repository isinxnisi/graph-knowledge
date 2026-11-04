"use client";
import {useEffect,useState} from "react";
import {z} from "zod";
import {knowledgeTranslationVersionSchema,type KnowledgeTextTarget,type KnowledgeTranslationVersion} from "../lib/domain/knowledge-translation";
import {useUiLocale} from "../lib/client/ui-locale";
import KnowledgeContributors from "./KnowledgeContributors";
import KnowledgeTranslationGenerate from './KnowledgeTranslationGenerate';
import css from "./KnowledgeTranslationPanel.module.css";
export type TranslationField={label:string;target:KnowledgeTextTarget};
export default function KnowledgeTranslationPanel({fields,onRetain}:{fields:TranslationField[];onRetain?:(v:KnowledgeTranslationVersion)=>void}){
 const {locale}=useUiLocale(),en=locale==='en';const [retained,setRetained]=useState<string|null>(null);const [open,setOpen]=useState(false),[index,setIndex]=useState(0),[language,setLanguage]=useState(en?'en':'ja'),[retry,setRetry]=useState(0);
 const field=fields[index]??fields[0],key=JSON.stringify([field?.target,language]);
 const [state,setState]=useState<{key:string;translation:KnowledgeTranslationVersion|null;error?:boolean;originalLanguage?:string}|null>(null);
 useEffect(()=>{if(!open||!JSON.parse(key)[0])return;const c=new AbortController();
  void fetch('/api/knowledge/translations?'+new URLSearchParams({target:JSON.stringify(JSON.parse(key)[0]),language:JSON.parse(key)[1]}),{cache:'no-store',signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return z.object({translation:knowledgeTranslationVersionSchema.nullable(),original:z.object({language:z.object({tag:z.string()}).optional()}).optional()}).parse(await r.json());}).then(r=>{if(!c.signal.aborted)setState({key,translation:r.translation,originalLanguage:r.original?.language?.tag});}).catch(()=>{if(!c.signal.aborted)setState({key,translation:null,error:true});});return()=>c.abort();
 },[open,key,retry]);
 if(!field)return null;
 const ready=state?.key===key?state:null,v=ready?.translation;
 return <details className={css.panel} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{en?'Translations':'翻訳'}</summary>{open&&<div className={css.body}>
  <div className={css.controls}>{fields.length>1&&<label>{en?'Field':'項目'}<select value={index} onChange={e=>setIndex(Number(e.target.value))}>{fields.map((f,i)=><option key={i} value={i}>{f.label}</option>)}</select></label>}<label>{en?'Language':'訳文の言語'}<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="ja">日本語</option><option value="en">English</option></select></label></div>
  {!ready?<p role="status">{en?'Loading translation…':'訳文を読み込み中…'}</p>:ready.error?<p role="alert">{en?'Translation unavailable.':'訳文を取得できません。'} <button onClick={()=>setRetry(v=>v+1)}>{en?'Retry':'再試行'}</button></p>:<>
   {ready.originalLanguage===language?<p>{en?"This is the original language. Choose another language.":"原文と同じ言語です。別の訳文の言語を選んでください。"}</p>:v?<><p lang={v.language}>{v.text}</p><small>{en?'Translation revision':'訳文版'} {v.revision} · {en?'Original revision':'原文の内容版'} {v.target.revision}</small><KnowledgeContributors kind="translation" id={v.id} revision={v.revision}/>{onRetain&&<button aria-pressed={retained===v.id+"@"+v.revision} onClick={()=>{onRetain(v);setRetained(v.id+"@"+v.revision);}}>{retained===v.id+"@"+v.revision?(en?"Kept for Capsule":"Capsule用に保持済み"):en?'Keep this translation for Capsule':'この訳文をCapsule用に保持'}</button>}</>:<p>{en?'No translation in this language yet.':'この言語の訳文はまだありません。'}</p>}
   {ready.originalLanguage!==language&&<><a href={'/member/submissions?'+new URLSearchParams({translate:JSON.stringify(field.target),language})}>{v?(en?'Propose a translation correction':'訳文の訂正を投稿'):(en?'Write a translation':'訳文を自分で書く')}</a>{!v&&<KnowledgeTranslationGenerate key={key} target={field.target} language={language} en={en}/>}</>}
  </>}
 </div>}</details>;
}
