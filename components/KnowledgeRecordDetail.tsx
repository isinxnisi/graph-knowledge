"use client";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import { useUiLocale } from "../lib/client/ui-locale";
import KnowledgeContributors from "./KnowledgeContributors";
import KnowledgeSourceBibliography from "./KnowledgeSourceBibliography";
import css from "./KnowledgeExplorer.module.css";

export default function KnowledgeRecordDetail({ dto, onEntity,onRecord,onTheme }: {onRecord?:(id:string)=>void;onTheme?:(id:string)=>void; dto: KnowledgePublishedRecord; onEntity: (id: string) => void }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const r = dto.record.content, typed = dto.legacyTyped;
  const name = (id: string | null) => dto.entities.find((e) => e.id === id)?.content.name ?? (en ? "No subject" : "対象なし");
  return <article>
    <KnowledgeContributors id={dto.record.id} revision={dto.record.revision}/>
    <h2>{r.kind === "relation" ? `${name(r.subjectId)} → ${name(r.objectId)}` : en ? "Event / context" : "出来事・説明"}</h2>
    {r.aboutRecord&&<p className={css.meta}>{en?"About this knowledge: ":"この知識・関係について："}{onRecord?<button onClick={()=>onRecord(r.aboutRecord!.id)}>{en?"Read the original":"元の知識を読む"}</button>:<a href={"/?krecord="+encodeURIComponent(r.aboutRecord.id)}>{en?"Read the original":"元の知識を読む"}</a>} · {en?"Revision":"内容版"} {r.aboutRecord.revision}</p>}
    {r.aboutTheme&&<p className={css.meta}>{en?"About this theme: ":"このテーマについて："}{onTheme?<button onClick={()=>onTheme(r.aboutTheme!)}>{en?"Open theme":"テーマを読む"}</button>:<a href={"/?ktheme="+encodeURIComponent(r.aboutTheme)}>{en?"Open theme":"テーマを読む"}</a>}</p>}
    {dto.entities.length > 0 && <div className={css.actions} aria-label={en ? "Follow a subject" : "図の対象から辿る"}>{dto.entities.map((e) => <button key={e.id} onClick={() => onEntity(e.id)}>{e.content.name}</button>)}</div>}
    <div className={css.meta}>{en ? "Content revision" : "内容版"} {dto.record.revision} · {r.polarity === "affirmed" ? en ? "Affirmed" : "肯定" : r.polarity === "denied" ? en ? "Denied" : "否定" : en ? "Uncertain" : "不確実"}</div>
    {r.relation && <p lang={r.textLanguages?.relation?.tag}><strong>{r.relation}</strong></p>}<p lang={r.textLanguages?.assertion?.tag}>{r.assertion}</p>{r.textLanguages?.assertion&&<small className={css.meta}>{en?"Original language":"原文の言語"} · {r.textLanguages.assertion.tag}</small>}
    {r.scope && <p>{en ? "Scope" : "範囲"}：{r.scope}</p>}
    {r.times.map((t) => <p key={t.id}>{themeTimeLabel(t.time)}</p>)}
    {typed?.event && <p>{en ? "Event occurrence" : "開催期間"}：{typed.event.metadata.period.from?.value ?? "?"} 〜 {typed.event.metadata.period.to?.value ?? "?"}<br /><span className={css.meta}>{en ? "Separate from a person's participation period." : "人物の参加期間とは別の情報です。"}</span></p>}
    {dto.semantics.status === "current" && dto.semantics.concept && <p className={css.meta}>{en ? "Meaning" : "意味対応"}：{dto.semantics.concept.label}</p>}
    {dto.semantics.status === "stale" && <p className={css.meta}>{en ? "This meaning mapping belongs to an earlier content revision." : "意味対応は旧内容へのものです。現在の意味条件には含めません。"}</p>}
    {r.evidence.map((e) => { const s = dto.sources.find((s) => s.id === e.source.id && s.revision === e.source.revision); return <div className={css.source} key={e.id}>
      {s?.content.url ? <a href={s.content.url} target="_blank" rel="noreferrer">{s.content.title} ↗</a> : <strong>{s?.content.title ?? (en ? "Source" : "資料")}</strong>}
      <div className={css.meta}>{en ? "Source revision" : "資料版"} {e.source.revision} · {e.locator} · {en ? e.stance : ({ support: "支持", refute: "反証", background: "背景" })[e.stance]}</div>
      {s?.content.bibliography && <KnowledgeSourceBibliography value={s.content.bibliography} className={css.meta} locale={locale}/>}
      {e.excerpt && <blockquote lang={e.textLanguages?.excerpt?.tag}>{e.excerpt}</blockquote>}
    </div>; })}
  </article>;
}
