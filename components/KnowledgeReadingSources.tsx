"use client";
import {useEffect,useId,useRef,useState} from "react";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import type {KnowledgeDisplayTranslation} from "../lib/domain/knowledge-translation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import ExternalSourceLink from "./ExternalSourceLink";
import KnowledgeSourceBibliography from "./KnowledgeSourceBibliography";
import Icon from "./Icon";
import {ExpandableReadingSection} from "./ReadingDetailSection";
import css from "./KnowledgeReadingSources.module.css";
export type EvidenceRequest={recordId:string;evidenceId:string;token:number};
export default function KnowledgeReadingSources({dto,locale,translations,openIds,onOpen,request}:{dto:KnowledgePublishedRecord;locale:string;translations:readonly KnowledgeDisplayTranslation[];openIds:string[];onOpen:(ids:string[])=>void;request?:EvidenceRequest|null}){
 const root=useRef<HTMLElement>(null),passagePrefix=useId(),en=locale==="en",[expandedRecord,setExpandedRecord]=useState<string|null>(null);
 useEffect(()=>{if(!request||request.recordId!==dto.record.id)return;if(dto.record.content.evidence.findIndex(e=>e.id===request.evidenceId)>=3)setExpandedRecord(dto.record.id);onOpen([...new Set([...openIds,request.evidenceId])]);const frame=requestAnimationFrame(()=>{const target=[...root.current?.querySelectorAll<HTMLElement>("[data-evidence-id]")??[]].find(e=>e.dataset.evidenceId===request.evidenceId);target?.scrollIntoView({block:"nearest"});target?.querySelector<HTMLButtonElement>("[data-evidence-toggle]")?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);
 // The token is a deliberate navigation action. Opening another disclosure does not re-scroll.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[request?.token,dto.record.id]);
 return <ExpandableReadingSection locale={locale} expanded={expandedRecord===dto.record.id} onExpandedChange={open=>setExpandedRecord(open?dto.record.id:null)} sectionRef={root} ariaLabel={en?"Sources":"出典"} title={en?"Sources":"出典"} icon="book" className={css.sources} items={dto.record.content.evidence.map((e,index)=>{
 const source=dto.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision),open=openIds.includes(e.id);
 const original=(field:"locator"|"excerpt",value:string)=>knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field,evidenceId:e.id},locale,value);
 const locator=original("locator",e.locator),excerpt=original("excerpt",e.excerpt);
 const language=(value:string,raw:string,tag?:string)=>value!==raw?locale:tag&&tag!=="und"?tag:
  /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(raw)?"ja":undefined;
 const locatorLanguage=language(locator,e.locator,e.textLanguages?.locator?.tag);
 const excerptLanguage=language(excerpt,e.excerpt,e.textLanguages?.excerpt?.tag);
 const fallback=en&&[locatorLanguage,excerptLanguage].some(tag=>tag?.split("-")[0]==="ja");
 const title=source?knowledgeDisplayText(translations,{kind:"source",id:source.id,revision:source.revision,field:"title"},locale,source.content.title):(en?"Source":"資料");
 const passageId=`${passagePrefix}-${index}`;
 return <div key={e.id} className={css.source} data-evidence-id={e.id}>
 <div className={css.heading}>
 <div className={css.sourceLink} title={title}>{source?.content.url?<ExternalSourceLink href={source.content.url} label={title} locale={locale}/>:<strong>{title}</strong>}{e.stance!=="support"&&<small className={css.stance}>{en?{refute:"Counterevidence",background:"Background source"}[e.stance]:{refute:"この記述への反証",background:"背景を知る資料"}[e.stance]}</small>}</div>
 <button type="button" data-evidence-toggle className={css.toggle} aria-expanded={open} aria-controls={passageId} aria-label={`${en?"Read the source note and location":"資料の内容と掲載箇所を読む"}：${title}`} onClick={()=>onOpen(open?openIds.filter(id=>id!==e.id):[...openIds,e.id])}>{en?"Evidence":"根拠"}<Icon name="chevron"/></button>
 </div>
 {open&&<div id={passageId} className={css.quotation}>
  {fallback&&<small>Japanese text shown where an English translation is unavailable.</small>}
  <p className={css.locator} lang={locatorLanguage}>{locator}</p>
  {source?.content.bibliography&&<KnowledgeSourceBibliography value={source.content.bibliography} locale={locale} className={css.bibliography}/>}
  {excerpt&&(e.excerptKind==="quotation"
   ? <><small>{excerpt!==e.excerpt?(en?"Translated quotation":"引用の訳文"):(en?"Quotation":"原文引用")}</small><blockquote lang={excerptLanguage}>{excerpt}</blockquote></>
   : <><small>{e.excerptKind==="summary"?(en?"Summary":"要約"):(en?"Source note":"資料メモ")}</small><p className={css.passage} lang={excerptLanguage}>{excerpt}</p></>)}
  <small>{en?"Source revision":"資料版"} {e.source.revision}</small>
 </div>}
 </div>;
 })}/>;
}
