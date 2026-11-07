"use client";
import type {CapsuleDocument} from "../lib/domain/capsule-document";
import type {KnowledgeTranslationVersion} from "../lib/domain/knowledge-translation";
import css from "./CapsuleSourceDetails.module.css";

/** Read only the captured originals and editions; opening details never refreshes a source. */
export default function CapsuleSourceDetails({document,locale}:{document:CapsuleDocument;locale:string}){
 const k=document.knowledge;if(!k)return null;
 const en=locale==="en",t=(ja:string,en:string)=>locale==="en"?en:ja,theme=k.snapshot.theme;
 const translations=k.snapshot.translations??[];
 const themeText=(field:"title"|"description")=>translations.find(v=>v.language===locale&&v.target.kind==="theme"&&v.target.id===theme?.id&&v.target.revision===theme?.revision&&v.target.field===field)?.text??theme?.content[field];
 const themeLanguage=(field:"title"|"description")=>translations.some(v=>v.language===locale&&v.target.kind==="theme"&&v.target.id===theme?.id&&v.target.revision===theme?.revision&&v.target.field===field)?locale:theme?.content.textLanguages?.[field]?.tag;
 const fieldLabel=(v:KnowledgeTranslationVersion)=>{
  const target=v.target;
  if(target.kind==="theme")return t("取得元テーマ","Source theme")+" · "+(target.field==="title"?t("タイトル","Title"):t("説明","Description"));
  const original=target.kind==="entity"?k.snapshot.entities.find(e=>e.id===target.id)?.content.name:target.kind==="record"?k.snapshot.records.find(r=>r.id===target.id)?.content.assertion:k.snapshot.sources.find(s=>s.id===target.id)?.content.title;
  const labels:Record<string,string>=en?{}:{name:"名前",description:"説明",aliases:"別名",assertion:"本文",relation:"関係の言葉",scope:"範囲",excerpt:"引用",locator:"該当箇所",title:"資料名",bibliography:"書誌"};
  return [original,labels[target.field]??target.field].filter(Boolean).join(" · ");
 };
 if(!theme&&!k.theme&&!translations.length)return null;
 return <section className={css.source} aria-label={t("保存内容と取得元","Saved content and sources")}>
  {theme&&<><h4>{t("取得元のテーマ","Source theme")}</h4><p className={css.title} lang={themeLanguage("title")}>{themeText("title")}</p>{themeText("description")&&<p lang={themeLanguage("description")}>{themeText("description")}</p>}</>}
  <details><summary>{t("原文・訳文と版の情報","Originals, translations and editions")}</summary>
   {k.theme&&<p className={css.meta}>{t("取得元テーマの内容版","Source theme revision")} {k.theme.revision} · <a href={"/?"+new URLSearchParams({ktheme:k.theme.id,krev:String(k.theme.revision)})} target="_blank" rel="noopener noreferrer">{t("取得元を開く","Open source")} ↗</a></p>}
   {theme&&<div><strong>{t("テーマの原文","Original theme")}</strong><p>{theme.content.title}</p>{theme.content.description&&<p>{theme.content.description}</p>}</div>}
   {translations.map(v=><article key={v.id}><h5>{fieldLabel(v)}</h5><small>{v.language} · {t("訳文版","Translation revision")} {v.revision} · {t("原文の内容版","Original revision")} {v.target.revision}</small><p lang={v.language}>{v.text}</p><details><summary>{t("対応する原文","Corresponding original")}</summary><p>{v.originalText}</p></details><a href={"/translations?"+new URLSearchParams({id:v.id,revision:String(v.revision)})} target="_blank" rel="noopener noreferrer">{t("訳文・投稿者を確認","Translation and contributors")} ↗</a></article>)}
  </details>
 </section>;
}
