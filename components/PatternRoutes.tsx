"use client";
import type { GraphState } from "../lib/client/graph-state";
import { relationText } from "../lib/i18n/relation-condition";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerMessage } from "../lib/i18n/explorer";
import { qualificationLabel, polarityLabel } from "../lib/client/format";
import styles from "./Explorer.module.css";
import ReadingLink from "./ReadingLink";

export default function PatternRoutes({ graph }: {
  graph: GraphState;
}) {
  const { locale } = useUiLocale(), text = relationText(locale), ex = graph.execution;
  if (ex?.type !== "pattern") return null;
  const routes = Object.entries(ex.routes);
  return <section aria-label={text.routes}>
    <h3>{text.routes} <small>{routes.length}{ex.hasMore ? "+" : ""}</small></h3>
    <p className={styles.muted}>{text.coverage}</p>
    {!routes.length && !ex.loading && <p>{text.empty}</p>}
    <ul className={styles.patternRoutes}>{routes.map(([key, entry]) => <li key={key}>
      <div className={styles.actions}><strong>{entry.route.nodeIds.map(id => graph.cacheNodes[id]?.name ?? id).join(" — ")}</strong>
        <span className={styles.muted}>{entry.open ? text.shown : text.verified}</span></div>
      <div className={styles.actions}>{entry.route.claimIds.map((id, i) => {
        const claim = graph.cacheClaims[id];
        return claim && <ReadingLink key={id} preserveExploration reference={{ kind: "claim", id, dataset: "public-kg" }}>
          {i + 1}. {graph.cacheNodes[claim.subjectId]?.name} → {graph.cacheNodes[claim.objectId]?.name} · {qualificationLabel(claim, locale)} · {polarityLabel(claim, locale)} · {text.evidence}
        </ReadingLink>;
      })}</div>
    </li>)}</ul>
    {ex.error && <p role="alert" className={styles.error}>{explorerMessage(ex.error, locale)}</p>}
    {ex.loading && <p role="status">{text.applying}</p>}
  </section>;
}
