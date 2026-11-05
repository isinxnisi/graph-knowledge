"use client";
import {useSearchParams} from "next/navigation";
import {useEffect,useState} from "react";
import {knowledgeTranslationVersionSchema,type KnowledgeTranslationVersion} from "../lib/domain/knowledge-translation";
import {useUiLocale} from "../lib/client/ui-locale";
import KnowledgeContributors from "./KnowledgeContributors";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import css from "./KnowledgeTranslationPage.module.css";
export default function KnowledgeTranslationPage(){
 const q=useSearchParams(),key=q.toString(),{locale}=useUiLocale(),en=locale==='en';
 const [state,setState]=useState<{key:string;v?:KnowledgeTranslationVersion;error?:boolean}|null>(null);
 useEffect(()=>{const c=new AbortController();void fetch('/api/knowledge/translations?'+key,{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return knowledgeTranslationVersionSchema.parse((await r.json()).translation);}).then(v=>{if(!c.signal.aborted)setState({key,v});}).catch(()=>{if(!c.signal.aborted)setState({key,error:true});});return()=>c.abort();},[key]);
 const v=state?.key===key?state.v:undefined;
 return <div className={css.screen}><SiteHeader dataset="public-kg" page="shared"/><main className={css.page}><h1>{en?'Translation':'翻訳'}</h1>{state?.key!==key?<p role="status">{en?'Loading…':'読み込み中…'}</p>:!v?<p role="alert">{en?'This translation is currently unavailable.':'この訳文は現在閲覧できません。'}</p>:<article><p>{v.language} · {en?'Translation revision':'訳文版'} {v.revision} · {en?'Original revision':'原文の内容版'} {v.target.revision}</p><KnowledgeContributors kind="translation" id={v.id} revision={v.revision}/><p lang={v.language}>{v.text}</p><h2>{en?'Original':'原文'}</h2><blockquote>{v.originalText}</blockquote>{v.target.kind!=='source'&&<a href={v.target.kind==='record'?'/records?'+new URLSearchParams({id:v.target.id,revision:String(v.target.revision)}):'/?'+new URLSearchParams({[v.target.kind==='theme'?'ktheme':'kentity']:v.target.id,...(v.target.kind==='theme'?{krev:String(v.target.revision)}:{})})}>{en?'Read in context':'元の知識を読む'} →</a>}<p><a href={'/member/submissions?'+new URLSearchParams({translate:JSON.stringify(v.target),language:v.language})}>{en?'Propose a translation correction':'訳文の訂正を投稿'}</a></p></article>}</main><SiteFooter/></div>;
}
