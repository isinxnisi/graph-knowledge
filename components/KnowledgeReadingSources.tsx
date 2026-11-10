"use client";
import {useEffect,useId,useRef} from "react";
import type {KnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
import type {KnowledgeDisplayTranslation} from "../lib/domain/knowledge-translation";
import {knowledgeDisplayText} from "../lib/domain/knowledge-display";
import ExternalSourceLink from "./ExternalSourceLink";
import KnowledgeSourceBibliography from "./KnowledgeSourceBibliography";
import Icon from "./Icon";
import ReadingDetailSection from "./ReadingDetailSection";
import css from "./KnowledgeReadingSources.module.css";
export type EvidenceRequest={recordId:string;evidenceId:string;token:number};
export default function KnowledgeReadingSources({dto,locale,translations,openIds,onOpen,request}:{dto:KnowledgePublishedRecord;locale:string;translations:readonly KnowledgeDisplayTranslation[];openIds:string[];onOpen:(ids:string[])=>void;request?:EvidenceRequest|null}){
 const root=useRef<HTMLElement>(null),passagePrefix=useId(),en=locale==="en";
 useEffect(()=>{if(!request||request.recordId!==dto.record.id)return;onOpen([...new Set([...openIds,request.evidenceId])]);requestAnimationFrame(()=>{const target=[...root.current?.querySelectorAll<HTMLElement>("[data-evidence-id]")??[]].find(e=>e.dataset.evidenceId===request.evidenceId);target?.scrollIntoView({block:"nearest"});target?.querySelector<HTMLButtonElement>("[data-evidence-toggle]")?.focus({preventScroll:true});});
 // The token is a deliberate navigation action. Opening another disclosure does not re-scroll.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[request?.token,dto.record.id]);
 return <ReadingDetailSection sectionRef={root} ariaLabel={en?"Sources":"出典"} title={en?"Sources":"出典"} icon="book" className={css.sources}>{dto.record.content.evidence.map((e,index)=>{
 const source=dto.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision),open=openIds.includes(e.id);
 const original=(field:"locator"|"excerpt",value:string)=>knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field,evidenceId:e.id},locale,value);
 const title=source?knowledgeDisplayText(translations,{kind:"source",id:source.id,revision:source.revision,field:"title"},locale,source.content.title):(en?"Source":"資料");
 const passageId=`${passagePrefix}-${index}`;
 return <div key={e.id} className={css.source} data-evidence-id={e.id}>
 <div className={css.heading}>
 <div className={css.sourceLink} title={title}>{source?.content.url?<ExternalSourceLink href={source.content.url} label={title} locale={locale}/>:<strong>{title}</strong>}{e.stance!=="support"&&<small className={css.stance}>{en?{refute:"Counterevidence",background:"Background source"}[e.stance]:{refute:"この記述への反証",background:"背景を知る資料"}[e.stance]}</small>}</div>
 <button type="button" data-evidence-toggle className={css.toggle} aria-expanded={open} aria-controls={passageId} aria-label={`${en?"Read the quotation and location":"引用と掲載箇所を読む"}：${title}`} onClick={()=>onOpen(open?openIds.filter(id=>id!==e.id):[...openIds,e.id])}>{en?"Quote":"引用"}<Icon name="chevron"/></button>
 </div>
 {open&&<div id={passageId} className={css.quotation}><p className={css.locator}>{original("locator",e.locator)}</p>{source?.content.bibliography&&<KnowledgeSourceBibliography value={source.content.bibliography} locale={locale} className={css.bibliography}/>} {e.excerpt&&<blockquote lang={original("excerpt",e.excerpt)!==e.excerpt?locale:e.textLanguages?.excerpt?.tag}>{original("excerpt",e.excerpt)}</blockquote>}<small>{en?"Source revision":"資料版"} {e.source.revision}</small></div>}
 </div>;
 })}</ReadingDetailSection>;
}
