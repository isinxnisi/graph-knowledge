"use client";
import {useState} from "react";
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

export default function KnowledgeRecordDetail({ dto, onEntity,onRecord,onTheme,onTranslation,title,onBack,explanations=[],openEvidenceIds,onEvidenceOpen,evidenceRequest,displayTranslations }: {displayTranslations?:readonly KnowledgeDisplayTranslation[];onTranslation?:(v:KnowledgeTranslationVersion)=>void;onRecord?:(id:string)=>void;onTheme?:(id:string)=>void; dto: KnowledgePublishedRecord; onEntity: (id: string) => void;title?:string;onBack?:()=>void;explanations?:{dto:KnowledgePublishedRecord;role:"importance"|"background"|"next"}[];openEvidenceIds?:string[];onEvidenceOpen?:(ids:string[])=>void;evidenceRequest?:EvidenceRequest|null }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const loadedTranslations=useKnowledgeDisplayTranslations(dto.entities,[dto.record],undefined,locale,displayTranslations===undefined);
  const translations=[...(displayTranslations??[]),...loadedTranslations];
  const text=(field:"assertion"|"relation"|"scope",original:string)=>knowledgeDisplayText(translations,{kind:"record",id:dto.record.id,revision:dto.record.revision,field},locale,original);
  const entityName=(e:KnowledgePublishedRecord["entities"][number])=>knowledgeEntityDisplayName(e,translations,locale);
  const r = dto.record.content, typed = dto.legacyTyped;
  const name = (id: string | null) => {const e=dto.entities.find(e=>e.id===id);return e?entityName(e):(en ? "No subject" : "対象なし");};
  const [localEvidence,setLocalEvidence]=useState<string[]>([]);
  const assertion=text("assertion",r.assertion),scope=text("scope",r.scope),longScope=scope.length>170;
  const originalLanguage=r.textLanguages?.assertion?.tag;
  const languageName=originalLanguage?new Intl.DisplayNames([locale],{type:"language"}).of(originalLanguage)??originalLanguage:null;
  return <article className={css.detail}>
    {onBack&&<button className={css.back} onClick={onBack}><Icon name="back"/>{en?"Back to reading":"年表・図に戻る"}</button>}
    <KnowledgeReadingBadge kind={r.kind} polarity={r.polarity} en={en}/>
    <h2>{title|| (r.kind==="relation"?`${name(r.subjectId)} → ${name(r.objectId)}`:assertion)}</h2>
    <p className={css.statement} lang={assertion!==r.assertion?locale:originalLanguage}>{assertion}</p>
    {scope&&!longScope&&<p className={css.scope}>{en?"Scope: ":"範囲："}{scope}</p>}
    {explanations.map(({dto:explanation,role})=><section key={explanation.record.id} className={css.explanation}><h3><Icon name="book"/>{role==="importance"?(en?"Why it matters":"なぜ重要なのか"):role==="next"?(en?"Read next":"次に読む"):(en?"Background":"背景")}</h3><p>{explanation.record.content.assertion}</p>{onRecord&&<button onClick={()=>onRecord(explanation.record.id)}>{en?"Read explanation & sources":"解説と出典を読む"} →</button>}</section>)}
    <KnowledgeReadingSources dto={dto} locale={locale} translations={translations} openIds={openEvidenceIds??localEvidence} onOpen={onEvidenceOpen??setLocalEvidence} request={evidenceRequest}/>
    {dto.entities.length > 0 && <section className={css.section}><h3><Icon name="graph"/>{en?"Related subjects":"関係する対象"}</h3><div className={css.subjects}>{dto.entities.map(e=><button key={e.id} onClick={()=>onEntity(e.id)}>{entityName(e)}</button>)}</div></section>}
    <details className={css.recordInfo}><summary><Icon name="chevron"/>{en?"Record information, translation & context":"記録情報・翻訳・補足"}</summary>
    {r.aboutRecord&&<p className={css.meta}>{en?"About this knowledge: ":"この知識・関係について："}{onRecord?<button onClick={()=>onRecord(r.aboutRecord!.id)}>{en?"Read the original":"元の知識を読む"}</button>:<a href={"/?krecord="+encodeURIComponent(r.aboutRecord.id)}>{en?"Read the original":"元の知識を読む"}</a>} · {en?"Revision":"内容版"} {r.aboutRecord.revision}</p>}
    {r.aboutTheme&&<p className={css.meta}>{en?"About this theme: ":"このテーマについて："}{onTheme?<button onClick={()=>onTheme(r.aboutTheme!)}>{en?"Open theme":"テーマを読む"}</button>:<a href={"/?ktheme="+encodeURIComponent(r.aboutTheme)}>{en?"Open theme":"テーマを読む"}</a>}</p>}
    <div className={css.meta}>{en ? "Content revision" : "内容版"} {dto.record.revision} · {r.polarity === "affirmed" ? en ? "Affirmed" : "肯定" : r.polarity === "denied" ? en ? "Denied" : "否定" : en ? "Uncertain" : "不確実"}</div>
    {r.relation && <p lang={text("relation",r.relation)!==r.relation?locale:r.textLanguages?.relation?.tag}>{en?"Relation: ":"矢印の言葉："}{text("relation",r.relation)}</p>}{languageName&&<p>{en?"Original language: ":"原文の言語："}{languageName}</p>}
    <KnowledgeTranslationPanel onRetain={onTranslation} fields={knowledgeRecordTranslationFields(dto,en)}/>
    {scope&&longScope&&<p className={css.scopeLong}>{en?"Scope: ":"範囲："}{scope}</p>}
    {r.times.map((t) => <p key={t.id}>{themeTimeLabel(knowledgeDisplayTime(dto.record,t.id,translations,locale),locale)}</p>)}
    {typed?.event && <p>{en ? "Event occurrence" : "開催期間"}：{typed.event.metadata.period.from?.value ?? "?"} 〜 {typed.event.metadata.period.to?.value ?? "?"}<br /><span className={css.meta}>{en ? "Separate from a person's participation period." : "人物の参加期間とは別の情報です。"}</span></p>}
    {dto.semantics.status === "current" && dto.semantics.concept && <p className={css.meta}>{en ? "Meaning" : "意味対応"}：{dto.semantics.concept.label}</p>}
    {dto.semantics.status === "stale" && <p className={css.meta}>{en ? "This meaning mapping belongs to an earlier content revision." : "意味対応は旧内容へのものです。現在の意味条件には含めません。"}</p>}
    <KnowledgeContributors id={dto.record.id} revision={dto.record.revision}/>
    </details>
  </article>;
}

export function knowledgeRecordTranslationFields(dto:KnowledgePublishedRecord,en:boolean):TranslationField[]{const r=dto.record.content;return [
     ...recordTimeTextTargets(dto.record).map(target=>({label:timelineTextFieldLabel(target,en),target})),
     {label:en?'Statement':'本文',target:{kind:'record',id:dto.record.id,revision:dto.record.revision,field:'assertion'}},
     ...(r.relation?[{label:en?'Relation':'矢印の言葉',target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'relation' as const}}]:[]),
     ...(r.scope?[{label:en?'Scope':'範囲',target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'scope' as const}}]:[]),
     ...r.evidence.map((e,i)=>({label:(en?'Location ':'該当箇所 ')+(i+1),target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'locator' as const,evidenceId:e.id}})),
     ...r.evidence.filter(e=>e.excerpt).map((e,i)=>({label:(en?'Quotation ':'引用 ')+(i+1),target:{kind:'record' as const,id:dto.record.id,revision:dto.record.revision,field:'excerpt' as const,evidenceId:e.id}})),
     ...dto.sources.flatMap(v=>[{label:(en?'Source title: ':'資料名：')+v.content.title,target:{kind:'source' as const,id:v.id,revision:v.revision,field:'title' as const}},...(v.content.bibliography?[{label:(en?'Bibliography: ':'書誌：')+v.content.title,target:{kind:'source' as const,id:v.id,revision:v.revision,field:'bibliography' as const}}]:[])]),
    ];}
