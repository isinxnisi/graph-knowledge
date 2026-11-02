"use client";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import { useUiLocale } from "../lib/client/ui-locale";
import css from "./KnowledgeExplorer.module.css";

export default function KnowledgeRecordDetail({ dto, onEntity }: { dto: KnowledgePublishedRecord; onEntity: (id: string) => void }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const r = dto.record.content, typed = dto.legacyTyped;
  const name = (id: string | null) => dto.entities.find((e) => e.id === id)?.content.name ?? (en ? "No subject" : "対象なし");
  return <article>
    <h2>{r.kind === "relation" ? `${name(r.subjectId)} → ${name(r.objectId)}` : en ? "Event / context" : "出来事・説明"}</h2>
    {dto.entities.length > 0 && <div className={css.actions} aria-label={en ? "Follow a subject" : "図の対象から辿る"}>{dto.entities.map((e) => <button key={e.id} onClick={() => onEntity(e.id)}>{e.content.name}</button>)}</div>}
    <div className={css.meta}>{en ? "Content revision" : "内容版"} {dto.record.revision} · {r.polarity === "affirmed" ? en ? "Affirmed" : "肯定" : r.polarity === "denied" ? en ? "Denied" : "否定" : en ? "Uncertain" : "不確実"}</div>
    {r.relation && <p><strong>{r.relation}</strong></p>}<p>{r.assertion}</p>
    {r.scope && <p>{en ? "Scope" : "範囲"}：{r.scope}</p>}
    {r.times.map((t) => <p key={t.id}>{themeTimeLabel(t.time)}</p>)}
    {typed?.event && <p>{en ? "Event occurrence" : "開催期間"}：{typed.event.metadata.period.from?.value ?? "?"} 〜 {typed.event.metadata.period.to?.value ?? "?"}<br /><span className={css.meta}>{en ? "Separate from a person's participation period." : "人物の参加期間とは別の情報です。"}</span></p>}
    {dto.semantics.status === "current" && dto.semantics.concept && <p className={css.meta}>{en ? "Meaning" : "意味対応"}：{dto.semantics.concept.label}</p>}
    {dto.semantics.status === "stale" && <p className={css.meta}>{en ? "This meaning mapping belongs to an earlier content revision." : "意味対応は旧内容へのものです。現在の意味条件には含めません。"}</p>}
    {r.evidence.map((e) => { const s = dto.sources.find((s) => s.id === e.source.id && s.revision === e.source.revision); return <div className={css.source} key={e.id}>
      {s?.content.url ? <a href={s.content.url} target="_blank" rel="noreferrer">{s.content.title} ↗</a> : <strong>{s?.content.title ?? (en ? "Source" : "資料")}</strong>}
      <div className={css.meta}>{en ? "Source revision" : "資料版"} {e.source.revision} · {e.locator} · {en ? e.stance : ({ support: "支持", refute: "反証", background: "背景" })[e.stance]}</div>
      {s?.content.bibliography && <p className={css.meta}>{s.content.bibliography}</p>}
      {e.excerpt && <blockquote>{e.excerpt}</blockquote>}
    </div>; })}
  </article>;
}
