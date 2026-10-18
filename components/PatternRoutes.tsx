"use client";
import type { GraphState } from "../lib/client/graph-state";
import { relationText } from "../lib/i18n/relation-condition";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerMessage } from "../lib/i18n/explorer";
import { qualificationLabel, polarityLabel } from "../lib/client/format";
import styles from "./Explorer.module.css";

export default function PatternRoutes({ graph, disabled, onToggle, onMore, onClaim }: {
  graph: GraphState; disabled: boolean; onToggle: (key: string) => void; onMore: () => void; onClaim: (id: string) => void;
}) {
  const { locale } = useUiLocale(), text = relationText(locale), ex = graph.execution;
  if (ex?.type !== "pattern") return null;
  const routes = Object.entries(ex.routes);
  return <section id="explorer-relations" tabIndex={-1} aria-label={text.routes}>
    <h3>{text.routes} <small>{routes.length}{ex.hasMore ? "+" : ""}</small></h3>
    <p className={styles.muted}>{text.coverage}</p>
    {!routes.length && !ex.loading && <p>{text.empty}</p>}
    <ul className={styles.patternRoutes}>{routes.map(([key, entry]) => <li key={key}>
      <div className={styles.actions}><strong>{entry.route.nodeIds.map(id => graph.cacheNodes[id]?.name ?? id).join(" — ")}</strong>
        <button disabled={disabled || ex.loading} aria-pressed={entry.open} onClick={() => onToggle(key)}>{entry.open ? text.close : text.open}</button></div>
      <div className={styles.actions}>{entry.route.claimIds.map((id, i) => {
        const claim = graph.cacheClaims[id];
        return claim && <button key={id} disabled={!entry.open || disabled} onClick={() => onClaim(id)}>
          {i + 1}. {graph.cacheNodes[claim.subjectId]?.name} → {graph.cacheNodes[claim.objectId]?.name} · {qualificationLabel(claim, locale)} · {polarityLabel(claim, locale)} · {text.evidence}
        </button>;
      })}</div>
    </li>)}</ul>
    {ex.error && <p role="alert" className={styles.error}>{explorerMessage(ex.error, locale)}</p>}
    {ex.loading && <p role="status">{text.applying}</p>}
    {ex.hasMore && <button disabled={disabled || ex.loading || ex.blocked} onClick={onMore}>{text.more}</button>}
  </section>;
}
