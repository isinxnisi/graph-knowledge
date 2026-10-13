"use client";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels } from "../lib/i18n/explorer";

import { useId, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
import type { Selection } from "../lib/client/graph-state";
import { graphNavigationLabels } from "../lib/i18n/graph-navigation";
import styles from "./Explorer.module.css";

export default function GraphNavigator({ nodes, selection, onNavigate, compact = false }: {
  compact?: boolean;
  nodes: Record<string, EntitySummary>;
  selection: Selection;
  onNavigate: (id: string) => void;
}) {
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const text = graphNavigationLabels(locale);
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
    <button ref={trigger} title={`${text.title}${ui.navigatorCount(entities.length)}`} className={compact ? styles.navigatorIconTrigger : undefined} aria-label={`${text.title}${ui.navigatorCount(entities.length)}`} aria-expanded={open} aria-controls={id} disabled={!entities.length} onClick={() => setOpen(!open)}>
      {compact ? <Icon name="list" /> : <><span className={styles.wideLabel}>{text.title}</span><span className={styles.compactLabel}>{text.compactTitle}</span>{ui.navigatorCount(entities.length)}</>}
    </button>
    <div id={id} hidden={!open} className={styles.graphNavigatorBody}>
      <p id={`${id}-help`} className={styles.muted}>{text.help}</p>
      <div className={styles.navigatorFilter}><label htmlFor={`${id}-query`}>{text.filter}<input id={`${id}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-describedby={`${id}-help`} autoComplete="off" /></label>
      <p role="status" className={styles.muted}>{matches.length ? text.count(matches.length, entities.length) : text.empty}</p></div>
      <ul className={styles.navigatorResults}>
        {matches.map(entity => {
          const ambiguous = entities.some(other => other.id !== entity.id && other.name === entity.name && other.kind === entity.kind && other.description === entity.description);
          return <li key={entity.id}>
            <button className={styles.navigatorButton} aria-pressed={selection?.kind === "entity" && selection.id === entity.id} onClick={() => {
              onNavigate(entity.id); setOpen(false); trigger.current?.focus();
            }}>
              <span className={styles.navigatorKindIcon}><Icon name={entity.kind === "work" ? "book" : entity.kind} /></span>
              <span className={styles.navigatorText}><strong>{entity.name}</strong><span className={styles.navigatorKind}>{ui.kinds[entity.kind]}</span>
                <span className={styles.navigatorDescription}>{entity.description ?? text.descriptionMissing}</span>
                {ambiguous && <span className={styles.navigatorDescription}>ID：{entity.id}</span>}
              </span>
              <span className={styles.navigatorMove} title={text.move}><Icon name="arrow" /><span className={styles.srOnly}>{text.move}</span></span>
            </button>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
