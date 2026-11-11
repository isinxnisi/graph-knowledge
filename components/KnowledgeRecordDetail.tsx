"use client";
import {useId,useState,type ReactNode} from "react";
import KnowledgeReadingBadge from "./KnowledgeReadingBadge";
import KnowledgeReadingSources,{type EvidenceRequest} from "./KnowledgeReadingSources";
import Icon from "./Icon";
import {useKnowledgeDisplayTranslations} from "../lib/client/use-knowledge-display-translations";
import {recordTimeTextTargets,timelineTextFieldLabel} from "../lib/domain/knowledge-timeline-text";
import {knowledgeDisplayTime,knowledgeDisplayText,knowledgeEntityDisplayName} from "../lib/domain/knowledge-display";
import KnowledgeTranslationPanel, {type TranslationField} from "./KnowledgeTranslationPanel";
import type {KnowledgeTranslationVersion,KnowledgeDisplayTranslation} from "../lib/domain/knowledge-translation";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import { useUiLocale } from "../lib/client/ui-locale";
import KnowledgeContributors from "./KnowledgeContributors";
import css from "./KnowledgeReadingDetail.module.css";
import ReadingDetailSection from "./ReadingDetailSection";

export default function KnowledgeRecordDetail({ dto, onEntity,onRecord,onTheme,onTranslation,title,correction,onBack,backLabel,nestedBack=false,contextEntry=false,explanations=[],openEvidenceIds,onEvidenceOpen,evidenceRequest,displayTranslations }: {correction?:ReactNode;displayTranslations?:readonly KnowledgeDisplayTranslation[];onTranslation?:(v:KnowledgeTranslationVersion)=>void;onRecord?:(id:string)=>void;onTheme?:(id:string)=>void; dto: KnowledgePublishedRecord; onEntity: (id: string) => void;title?:string;onBack?:()=>void;backLabel?:string;nestedBack?:boolean;contextEntry?:boolean;explanations?:{dto:KnowledgePublishedRecord;role:"importance"|"background"|"insight"|"next";heading?:string}[];openEvidenceIds?:string[];onEvidenceOpen?:(ids:string[])=>void;evidenceRequest?:EvidenceRequest|null }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const loadedTranslations=useKnowledgeDisplayTranslations(dto.entities,[dto.record],undefined,locale,displayTranslations===undefined);
  const translations=[...(displayTranslations??[]),...loadedTranslations];
  const text=(field:"assertion"|"relation"|"scope",original:string)=>knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field},locale,original);
  const entityName=(e:KnowledgePublishedRecord["entities"][number])=>knowledgeEntityDisplayName(e,translations,locale);
  const r = dto.record.content, typed = dto.legacyTyped;
  const name = (id: string | null) => {const e=dto.entities.find(e=>e.id===id);return e?entityName(e):(en ? "Name unavailable" : "名前を取得できません");};
  const [localEvidence,setLocalEvidence]=useState<string[]>([]);
  const assertion=text("assertion",r.assertion),scope=text("scope",r.scope),longScope=scope.length>170;
  const heading=title||(r.kind==="relation"?`${name(r.subjectId)} → ${name(r.objectId)}`:assertion);
  const originalLanguage=r.textLanguages?.assertion?.tag;
  const languageName=originalLanguage?new Intl.DisplayNames([locale],{type:"language"}).of(originalLanguage)??originalLanguage:null;
  const [tool,setTool]=useState<"info"|"translation"|null>(null);
  const toolId=useId();
  const Notes=explanations.length>1?"ul":"div", Note=explanations.length>1?"li":"p";
  return <article className={css.detail}>
    <div className={css.detailNav}>{onBack&&<button data-detail-back className={css.back} data-nested={nestedBack||undefined} onClick={onBack} title={backLabel}><Icon name="back"/><span>{backLabel||(en?"Back to reading":"年表・図に戻る")}</span></button>}
    {!contextEntry&&<KnowledgeReadingBadge kind={r.kind} polarity={r.polarity} en={en}/>}</div>
    {heading!==assertion&&<h2>{heading}</h2>}
    <p className={css.statement} lang={assertion!==r.assertion?locale:originalLanguage}>{assertion}</p>

    {scope&&!longScope&&<p className={css.scope}>{scope}</p>}
    {explanations.length>0&&<ReadingDetailSection title={en?"Explanation":"解説"} icon="book">
      <Notes className={css.explanation}>
        {explanations.map(({dto:explanation},index)=><Note key={explanation.record.id}>{explanation.record.content.assertion}{onRecord&&<button className={css.explanationSource} data-detail-record={explanation.record.id} onClick={()=>onRecord(explanation.record.id)} aria-label={en?`Read source for note ${index+1}`:`解説${index+1}の出典を読む`} title={en?"Read source":"出典を読む"}>[{index+1}]</button>}</Note>)}
      </Notes>
    </ReadingDetailSection>}
    <KnowledgeReadingSources dto={dto} locale={locale} translations={translations} openIds={openEvidenceIds??localEvidence} onOpen={onEvidenceOpen??setLocalEvidence} request={evidenceRequest}/>
    {dto.entities.length > 0 && <ReadingDetailSection title={en?"Follow these connections":"関係図でたどる"} icon="graph"><div className={css.subjects}>{dto.entities.map(e=><button key={e.id} onClick={()=>onEntity(e.id)}>{entityName(e)}</button>)}</div></ReadingDetailSection>}

    <footer className={css.recordTools}><div className={css.toolRow}>
      <button aria-expanded={tool==="info"} aria-controls={toolId+"info"} onClick={()=>setTool(tool==="info"?null:"info")}>{en?"Record details":"記録情報"}<Icon name="chevron"/></button>
      <button aria-expanded={tool==="translation"} aria-controls={toolId+"translation"} onClick={()=>setTool(tool==="translation"?null:"translation")}>{en?"Translations":"翻訳"}<Icon name="chevron"/></button>
      {correction}
    </div><div id={toolId+"info"} hidden={tool!=="info"} className={css.infoBody}>
    {r.aboutRecord&&<p className={css.meta}>{en?"About this knowledge: ":"この知識・関係について："}{onRecord?<button onClick={()=>onRecord(r.aboutRecord!.id)}>{en?"Read the original":"元の知識を読む"}</button>:<a href={"/?krecord="+encodeURIComponent(r.aboutRecord.id)}>{en?"Read the original":"元の知識を読む"}</a>} · {en?"Revision":"内容版"} {r.aboutRecord.revision}</p>}
    {r.aboutTheme&&<p className={css.meta}>{en?"About this theme: ":"このテーマについて："}{onTheme?<button onClick={()=>onTheme(r.aboutTheme!)}>{en?"Open theme":"テーマを読む"}</button>:<a href={"/?ktheme="+encodeURIComponent(r.aboutTheme)}>{en?"Open theme":"テーマを読む"}</a>}</p>}
    <div className={css.meta}>{en ? "Content revision" : "内容版"} {dto.record.revision} · {r.polarity === "affirmed" ? en ? "Affirmed" : "肯定" : r.polarity === "denied" ? en ? "Denied" : "否定" : en ? "Uncertain" : "不確実"}</div>
    {r.relation && <p lang={text("relation",r.relation)!==r.relation?locale:r.textLanguages?.relation?.tag}>{en?"Relation: ":"矢印の言葉："}{text("relation",r.relation)}</p>}{languageName&&<p>{en?"Original language: ":"原文の言語："}{languageName}</p>}

    {scope&&longScope&&<p className={css.scopeLong}>{en?"Scope: ":"範囲："}{scope}</p>}
    {r.times.map((t) => <p key={t.id}>{themeTimeLabel(knowledgeDisplayTime(dto.record,t.id,translations,locale),locale)}</p>)}
    {typed?.event && <p>{en ? "Event occurrence" : "開催期間"}：{typed.event.metadata.period.from?.value ?? "?"} 〜 {typed.event.metadata.period.to?.value ?? "?"}<br /><span className={css.meta}>{en ? "Separate from a person's participation period." : "人物の参加期間とは別の情報です。"}</span></p>}
    {dto.semantics.status === "current" && dto.semantics.concept && <p className={css.meta}>{en ? "Meaning" : "意味対応"}：{dto.semantics.concept.label}</p>}
    {dto.semantics.status === "stale" && <p className={css.meta}>{en ? "This meaning mapping belongs to an earlier content revision." : "意味対応は旧内容へのものです。現在の意味条件には含めません。"}</p>}
    <KnowledgeContributors id={dto.record.id} revision={dto.record.revision}/>
    </div><div id={toolId+"translation"} hidden={tool!=="translation"}>{tool==="translation"&&<KnowledgeTranslationPanel embedded onRetain={onTranslation} fields={knowledgeRecordTranslationFields(dto,en)}/>}</div></footer>
  </article>;
}

export function knowledgeRecordTranslationFields(dto:KnowledgePublishedRecord,en:boolean):TranslationField[]{const r=dto.record.content;return [
     {label:en?'Statement':'本文',target:{kind:'record',id:dto.record.id,revision:dto.record.revision,field:'assertion'}},
     ...recordTimeTextTargets(dto.record).map(target=>({label:timelineTextFieldLabel(target,en),target})),
     ...(r.relation?[{label:en?'Relation':'矢印の言葉',target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'relation' as const}}]:[]),
     ...(r.scope?[{label:en?'Scope':'範囲',target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'scope' as const}}]:[]),
     ...r.evidence.map((e,i)=>({label:(en?'Location ':'該当箇所 ')+(i+1),target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'locator' as const,evidenceId:e.id}})),
     ...r.evidence.filter(e=>e.excerpt).map((e,i)=>({label:(en?'Quotation ':'引用 ')+(i+1),target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'excerpt' as const,evidenceId:e.id}})),
     ...dto.sources.flatMap(v=>[{label:(en?'Source title: ':'資料名：')+v.content.title,target:{kind:'source' as const,id:v.id,revision:v.revision,field:'title' as const}},...(v.content.bibliography?[{label:(en?'Bibliography: ':'書誌：')+v.content.title,target:{kind:'source' as const,id:v.id,revision:v.revision,field:'bibliography' as const}}]:[])]),
    ];}
