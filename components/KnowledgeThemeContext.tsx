"use client";
import { useState } from "react";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import { useUiLocale } from "../lib/client/ui-locale";
import Icon from "./Icon";
import css from "./KnowledgeThemeContext.module.css";

/** Undated knowledge belongs to the theme, independently of the chosen graph. */
export default function KnowledgeThemeContext({ records, selectedRecordId, onRead, className }: {
  records: KnowledgePublishedRecord[]; selectedRecordId: string | null; onRead: (id: string) => void; className?: string;
}) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [expanded, setExpanded] = useState(false);
  const context = records.filter((r) => r.record.content.times.length === 0);
  if (!context.length) return null;
  return <section className={[css.context,className].filter(Boolean).join(" ")} aria-label={en ? "Theme information" : "テーマの情報"}>
    <header><h3><Icon name="book" />{en ? "Theme information" : "テーマの情報"}<small>{context.length}{en ? " records" : "件"}</small></h3>
      {context.length > 1 && <button className={`${css.more} ${context.length === 2 && !expanded ? css.mobileOnly : ""}`} aria-label={expanded ? en ? "Show less" : "折りたたむ" : en ? "Read all theme information" : "テーマの情報をすべて見る"} aria-expanded={expanded} onClick={() => setExpanded((s) => !s)}>
        {expanded ? en ? "Show less" : "折りたたむ" : <><span className={css.desktopCount}>{en ? `${context.length - 2} more` : `ほか${context.length - 2}件`}</span><span className={css.mobileCount}>{en ? `${context.length - 1} more` : `ほか${context.length - 1}件`}</span></>}<Icon name="chevron" />
      </button>}
    </header>
    <ul data-expanded={expanded || undefined}>{context.map((dto, index) => {
      const r = dto.record.content;
      const name = (id: string | null) => dto.entities.find((e) => e.id === id)?.content.name ?? "";
      return <li key={dto.record.id} className={index === 1 ? css.second : index > 1 ? css.extra : undefined}>
        <button aria-label={`${en ? "Read content and evidence" : "内容と根拠を読む"}：${r.assertion}`} aria-pressed={selectedRecordId === dto.record.id} onClick={() => onRead(dto.record.id)}>
          <span className={css.assertion}>{r.polarity !== "affirmed" && <small className={css.polarity}>{r.polarity === "denied" ? en ? "Denied" : "否定" : en ? "Uncertain" : "不確実"}</small>}{r.assertion}</span>
          {expanded && <>{r.kind === "relation" ? <span className={css.link}><Icon name="graph" />{name(r.subjectId)} <span>{r.relation}</span><Icon name="arrow" />{name(r.objectId)}</span> : <span className={css.meta}>{en ? "Context & explanation" : "背景・解説"}</span>}
            <span className={css.meta}>{en ? "Evidence" : "根拠"} {r.evidence.length} · {en ? "Content revision" : "内容版"} {dto.record.revision}<Icon name="chevron" /></span></>}
        </button>
      </li>;
    })}</ul>
  </section>;
}
