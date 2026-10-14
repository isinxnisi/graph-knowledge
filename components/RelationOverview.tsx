import { useUiLocale } from "../lib/client/ui-locale";
import type { ClaimSummary, EntitySummary } from "../lib/domain/api";
import { relationPresentation } from "../lib/client/relation-presentation";
import { entityLabel } from "../lib/client/graph-presentation";
import { contributionLabels } from "../lib/i18n/contribution";
import { explorationLabels } from "../lib/i18n/exploration";
import { relationPresentationLabels } from "../lib/i18n/relation-presentation";
import styles from "./Explorer.module.css";

export default function RelationOverview({ claims, nodes }: { claims: ClaimSummary[]; nodes: Record<string, EntitySummary> }) {
  const { locale } = useUiLocale();
  if (!claims.length) return null;
  const first = claims[0], summary = relationPresentation(claims, locale), text = relationPresentationLabels(locale);
  const name = (id: string) => nodes[id] ? entityLabel(nodes[id], nodes, locale).replace("\n", " / ") : id;
  return <section className={styles.relationOverview} aria-label={text.title} data-testid="relation-overview">
    <h3>{text.title}</h3>
    <p><strong>{name(first.subjectId)} → {explorationLabels(locale).predicates[first.predicate]} → {name(first.objectId)}</strong></p>
    <p className={styles.muted}>{text.graphScope}</p>
    <p>{text.graphClaims(claims.length)} · {text.counts(summary.affirmed, summary.denied)}</p>
    {summary.denied > 0 && <p className={styles.muted}>{summary.affirmed ? text.mixedHelp : text.denied}</p>}
    {summary.qualification && <>
      <h4>{summary.qualification.title}</h4>
      <ul className={styles.qualificationSummary}>{summary.qualification.entries.map(entry => <li key={entry.id ?? "unspecified"}>
        <strong>{entry.label}</strong><span>{text.counts(entry.affirmed, entry.denied)}</span>
      </li>)}</ul>
      {first.predicate === "CONTRIBUTED_TO" && summary.qualification.entries.some(entry => entry.id === null) && summary.qualification.entries.some(entry => entry.id !== null) && <p className={styles.muted}>{contributionLabels(locale).broader}</p>}
      <details><summary>{text.qualificationHelp}</summary>
        {summary.qualification.entries.some(entry => entry.id === null) && <p className={styles.muted}>{text.unspecifiedHelp}</p>}
        {summary.qualification.entries.some(entry => entry.id !== null) && <p className={styles.muted}>{summary.qualification.help}</p>}
      </details>
    </>}
  </section>;
}
