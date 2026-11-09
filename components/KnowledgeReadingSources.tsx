"use client";
import {useEffect,useRef} from "react";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import type {KnowledgeDisplayTranslation} from "../lib/domain/knowledge-translation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import ExternalSourceLink from "./ExternalSourceLink";
import KnowledgeSourceBibliography from "./KnowledgeSourceBibliography";
import Icon from "./Icon";
import ReadingDetailSection from "./ReadingDetailSection";
import css from "./KnowledgeReadingDetail.module.css";
export type EvidenceRequest={recordId:string;evidenceId:string;token:number};
export default function KnowledgeReadingSources({dto,locale,translations,openIds,onOpen,request}:{dto:KnowledgePublishedRecord;locale:string;translations:readonly KnowledgeDisplayTranslation[];openIds:string[];onOpen:(ids:string[])=>void;request?:EvidenceRequest|null}){
 const root=useRef<HTMLElement>(null),en=locale==="en";
 useEffect(()=>{if(!request||request.recordId!==dto.record.id)return;onOpen([...new Set([...openIds,request.evidenceId])]);requestAnimationFrame(()=>{const target=[...root.current?.querySelectorAll<HTMLElement>("[data-evidence-id]")??[]].find(e=>e.dataset.evidenceId===request.evidenceId);target?.scrollIntoView({block:"nearest"});target?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});});
 // The token is a deliberate navigation action. Opening another disclosure does not re-scroll.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[request?.token,dto.record.id]);
 return <ReadingDetailSection sectionRef={root} ariaLabel={en?"Sources":"出典"} title={en?"Sources":"出典"} icon="book" className={css.sources}>{dto.record.content.evidence.map(e=>{
 const source=dto.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision),open=openIds.includes(e.id);
 const original=(field:"locator"|"excerpt",value:string)=>knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field,evidenceId:e.id},locale,value);
 const title=source?knowledgeDisplayText(translations,{kind:"source",id:source.id,revision:source.revision,field:"title"},locale,source.content.title):(en?"Source":"資料");
 return <div key={e.id} className={css.source} data-evidence-id={e.id}>
 <div className={css.sourceHeading}><Icon name="link"/><div className={css.sourceName}>{source?.content.url?<ExternalSourceLink href={source.content.url} label={title} locale={locale}/>:<strong>{title}</strong>}</div><span className={css.stance}>{en?{support:"Supports this statement",refute:"Counterevidence",background:"Background source"}[e.stance]:{support:"この記述の根拠",refute:"この記述への反証",background:"背景を知る資料"}[e.stance]}</span></div>
 <button className={css.sourceToggle} aria-expanded={open} onClick={()=>onOpen(open?openIds.filter(id=>id!==e.id):[...openIds,e.id])}><Icon name="chevron"/>{en?"Read the relevant passage":"資料の該当箇所を読む"}</button>
 {open&&<div className={css.quotation}><p className={css.locator}>{original("locator",e.locator)}</p>{source?.content.bibliography&&<KnowledgeSourceBibliography value={source.content.bibliography} locale={locale} className={css.bibliography}/>} {e.excerpt&&<blockquote lang={original("excerpt",e.excerpt)!==e.excerpt?locale:e.textLanguages?.excerpt?.tag}>{original("excerpt",e.excerpt)}</blockquote>}<small>{en?"Source revision":"資料版"} {e.source.revision}</small></div>}
 </div>;
 })}</ReadingDetailSection>;
}
