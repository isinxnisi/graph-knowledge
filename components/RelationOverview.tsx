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
    <p className={styles.detailEyebrow}>{text.title}</p>
    <h3 className={styles.relationMeaning}>{explorationLabels(locale).predicates[first.predicate]}</h3>
    <p className={styles.relationPair}>{name(first.subjectId)} <span aria-hidden="true">→</span> {name(first.objectId)}</p>
    {summary.qualification?.entries.some(entry => entry.id !== null) && <ul className={styles.relationTerms} aria-label={text.recordedTerms}>
      {summary.qualification.entries.filter(entry => entry.id !== null).map(entry => <li key={entry.id}>{entry.label}{entry.affirmed === 0 ? ` · ${text.termDenied}` : entry.denied ? ` · ${text.termMixed}` : ""}</li>)}
    </ul>}
    {summary.denied > 0 && <p className={styles.relationCaution}>{summary.affirmed ? text.mixedHelp : text.denied}</p>}
    <details className={`${styles.relationNotes} ${styles.disclosure}`}><summary>{text.qualificationHelp}</summary><div className={styles.disclosureBody}>
      <p className={styles.muted}>{text.graphScope}</p>
      <p>{text.graphClaims(claims.length)} · {text.counts(summary.affirmed, summary.denied)}</p>
      <p className={styles.muted}>{text.recordsHelp}</p>
      <p className={styles.muted}>{text.reading}</p>
      {summary.qualification && <>
        <h4>{summary.qualification.title}</h4>
        <ul className={styles.qualificationSummary}>{summary.qualification.entries.map(entry => <li key={entry.id ?? "unspecified"}>
          <strong>{entry.id === null ? (first.predicate === "CONTRIBUTED_TO" ? text.roleUnspecified : first.predicate === "PARTICIPATED_IN" ? text.eventUnspecified : text.positionUnspecified) : entry.label}</strong><span>{text.counts(entry.affirmed, entry.denied)}</span>
        </li>)}</ul>
        {summary.qualification.entries.some(entry => entry.id === null) && <p className={styles.muted}>{text.unspecifiedHelp}</p>}
        {summary.qualification.entries.some(entry => entry.id !== null) && <p className={styles.muted}>{summary.qualification.help}</p>}
        {first.predicate === "CONTRIBUTED_TO" && summary.qualification.entries.some(entry => entry.id === null) && summary.qualification.entries.some(entry => entry.id !== null) && <p className={styles.muted}>{contributionLabels(locale).broader}</p>}
      </>}
    </div></details>
  </section>;
}
