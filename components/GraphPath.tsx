"use client";
import { useUiLocale } from "../lib/client/ui-locale";

import type { EntitySummary } from "../lib/domain/api";
import { entityLabel, type DisplayRelation } from "../lib/client/graph-presentation";
import { shortestVisiblePath } from "../lib/client/graph-path";
import { graphPathLabels } from "../lib/i18n/graph-path";
import styles from "./Explorer.module.css";

export default function GraphPath({ nodes, relations, rootId, targetId, onRelation }: {
  nodes: Record<string, EntitySummary>;
  relations: Record<string, DisplayRelation>;
  rootId: string;
  targetId: string;
  onRelation: (id: string) => void;
}) {
  const { locale } = useUiLocale();
  if (rootId === targetId) return null;
  const text = graphPathLabels(locale);
  const path = shortestVisiblePath(nodes, relations, rootId, targetId);
  const name = (id: string) => entityLabel(nodes[id], nodes, locale).replaceAll("\n", " / ");
  return <section className={styles.graphPath} aria-label={text.title}>
    <h3>{text.title}</h3>
    {path ? <details>
      <summary>{text.summary(path.length)}</summary>
      <p className={styles.muted}>{text.help}</p>
      <p className={styles.muted}>{text.meaning}</p>
      <ol className={styles.pathSteps}>
        {path.map(step => {
          const relation = relations[step.relationId];
          const arrow = relation.subjectId === step.fromId ? "→" : "←";
          return <li key={step.relationId}>
            <button className={styles.resultButton} onClick={() => onRelation(step.relationId)}>
              <strong>{name(step.fromId)}</strong>
              <span>{arrow} {relation.label.replaceAll("\n", " / ")} {arrow}</span>
              <strong>{name(step.toId)}</strong>
              <span>{text.read}</span>
            </button>
          </li>;
        })}
      </ol>
    </details> : <p className={styles.muted}>{text.empty}</p>}
  </section>;
}
