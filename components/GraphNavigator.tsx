"use client";

import { useId, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
import type { Selection } from "../lib/client/graph-state";
import { KIND_LABELS } from "../lib/client/format";
import { graphNavigationLabels } from "../lib/i18n/graph-navigation";
import styles from "./Explorer.module.css";

export default function GraphNavigator({ nodes, selection, onNavigate }: {
  nodes: Record<string, EntitySummary>;
  selection: Selection;
  onNavigate: (id: string) => void;
}) {
  const text = graphNavigationLabels();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const entities = Object.values(nodes);
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim();
  const term = normalize(query);
  const matches = entities.filter(entity => [entity.name, entity.description ?? ""].some(value => normalize(value).includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, "ja") || a.id.localeCompare(b.id));

  return <section className={styles.graphNavigator} aria-label={text.title} onKeyDown={event => {
    if (open && event.key === "Escape") {
      event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button ref={trigger} aria-label={`${text.title}（${entities.length}件）`} aria-expanded={open} aria-controls={id} disabled={!entities.length} onClick={() => setOpen(!open)}>
      <span className={styles.wideLabel}>{text.title}</span><span className={styles.compactLabel}>{text.compactTitle}</span>（{entities.length}件）
    </button>
    <div id={id} hidden={!open} className={styles.graphNavigatorBody}>
      <p id={`${id}-help`} className={styles.muted}>{text.help}</p>
      <label htmlFor={`${id}-query`}>{text.filter}</label>
      <input id={`${id}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-describedby={`${id}-help`} autoComplete="off" />
      <p role="status" className={styles.muted}>{matches.length ? text.count(matches.length, entities.length) : text.empty}</p>
      <ul className={styles.navigatorResults}>
        {matches.map(entity => {
          const ambiguous = entities.some(other => other.id !== entity.id && other.name === entity.name && other.kind === entity.kind && other.description === entity.description);
          return <li key={entity.id}>
            <button className={styles.resultButton} aria-pressed={selection?.kind === "entity" && selection.id === entity.id} onClick={() => {
              onNavigate(entity.id); setOpen(false); trigger.current?.focus();
            }}>
              <strong>{entity.name}</strong>
              <span>{KIND_LABELS[entity.kind]} ／ {entity.description ?? text.descriptionMissing}</span>
              {ambiguous && <span>ID：{entity.id}</span>}
              <span>{text.move}</span>
            </button>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
