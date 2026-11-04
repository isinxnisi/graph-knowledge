"use client";
import {translationTargetKey} from "../lib/domain/knowledge-translation";
import type {KnowledgeSubmissionContent,KnowledgeSubmissionContext} from "../lib/domain/knowledge-submission";
import {translationTextLimit} from "../lib/domain/knowledge-translation";
import css from "./KnowledgeSubmissions.module.css";
export default function KnowledgeTranslationItem({item,context,disabled,onChange,locale}:{item:KnowledgeSubmissionContent['items'][number];context?:KnowledgeSubmissionContext;disabled:boolean;onChange:(text:string)=>void;locale:string}){
 const en=locale==='en',t=item.translation!,original=context?.texts?.find(v=>translationTargetKey(v.target)===translationTargetKey(t.target));
 return <section id={'submission-'+item.key}>
  <h3>{en?'Translation':'訳文の投稿・訂正'}</h3><p className={css.meta}>{en?'Translate the complete meaning. The original and its sources stay unchanged.':'原文の意味を保って訳してください。原文・根拠は変更しません。'}</p>
  <div className={css.row}><span>{en?'Original revision':'原文の内容版'} {t.target.revision} · {t.target.field}</span><span>{en?'Translation language':'訳文の言語'}：{t.language==='ja'?'日本語':t.language==='en'?'English':t.language}</span></div>
  <blockquote lang={original?.language?.tag}>{original?.text??item.record.assertion}</blockquote>
  {original?.translation&&<details><summary>{en?'Previous translation':'訂正前の訳文'} · {original.translation.revision}</summary><p lang={t.language}>{original.translation.text}</p></details>}
  <label>{en?'Proposed translation (required)':'訳文（必須）'}<textarea rows={4} lang={t.language} disabled={disabled} maxLength={translationTextLimit(t.target)} value={t.text} onChange={e=>onChange(e.target.value)} placeholder={en?'Write a faithful translation of the original above':'上の原文を、選んだ言語で訳してください'}/></label>
  <small className={css.hint}>{en?'Keep numbers, names, negation, scope and uncertainty. This changes only the translation.':'数値・名前・否定・範囲・曖昧さを保ちます。訳文だけを更新します。'}</small>
 </section>;
}
