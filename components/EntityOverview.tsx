"use client";
import { useEffect, useRef, useState } from "react";
import type { EntityOverviewResponse, EntitySummary } from "../lib/domain/api";
import type { DatasetMode } from "../lib/domain/dataset";
import { ClientApiError, errorMessage, fetchOverview } from "../lib/client/api";
import { overviewLabels } from "../lib/i18n/entity-overview";
import { datasetLabels } from "../lib/i18n/dataset";
import { contributionLabels } from "../lib/i18n/contribution";
import { KIND_LABELS } from "../lib/client/format";
import RootActions from "./RootActions";
import styles from "./Explorer.module.css";
export default function EntityOverview({ entity, dataset, restricted, onClose, onSwitch }: {
  entity: EntitySummary; dataset: DatasetMode; restricted: boolean; onClose: () => void; onSwitch: (mode: "broad" | "same") => void;
}) {
  const labels = overviewLabels();
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<EntityOverviewResponse | null>(null);
  const [failure, setFailure] = useState<{ message: string; missing: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current!; element.showModal();
    return () => {
      element.close();
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus();
      else document.querySelector<HTMLElement>('[data-testid="graph-canvas"]')?.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchOverview(entity.id, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (value.entity.id !== entity.id || value.scope.dataset !== dataset) throw new Error("Unexpected overview scope");
      setResult(value);
    }).catch((error) => {
      if (!controller.signal.aborted) setFailure({ message: errorMessage(error), missing: error instanceof ClientApiError && error.status === 404 });
    });
    return () => controller.abort();
  }, [entity.id, dataset, attempt]);
  return <dialog ref={dialog} className={`${styles.conditionDialog} ${styles.overviewDialog}`} aria-labelledby="overview-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className={styles.detailHeading}><h2 id="overview-title">{labels.title}</h2><button onClick={onClose}>{labels.close}</button></div>
    <p className={styles.muted}>{datasetLabels(dataset).badge}</p>
    <h3>{entity.name}</h3><p className={styles.badge}>{KIND_LABELS[entity.kind]}</p>
    {entity.description && <p>{entity.description}</p>}
    <p className={styles.muted}>{labels.scope}</p>
    <p className={styles.muted}>{labels.countsUnit}</p>
    {!result && !failure && <p role="status">{labels.loading}</p>}
    {failure && <div role="alert"><p>{failure.message}</p>{failure.missing && <p>{labels.unavailable}</p>}
      <button onClick={() => { setFailure(null); setResult(null); setAttempt((value) => value + 1); }}>{labels.retry}</button></div>}
    {result && !result.relations.length && <p>{labels.noClaims}</p>}
    {result?.relations.map((relation) => <section className={styles.overviewRow} key={`${relation.predicate}:${relation.perspective}`}>
      <h3>{labels.relation(relation.predicate, relation.perspective)}</h3>
      <p>{labels.counts(relation.counts.affirmed, relation.counts.denied)}</p>
      {relation.predicate === "CONTRIBUTED_TO" && <details><summary>{labels.roleDetails}</summary>
        <ul>{relation.contributionRoles.map((role) => <li key={role.roleId ?? "unqualified"}>
          {role.roleId ? contributionLabels().roles[role.roleId] : labels.unqualified}：{labels.counts(role.counts.affirmed, role.counts.denied)}
        </li>)}</ul><p className={styles.muted}>{labels.scopeHelp}</p>
      </details>}
    </section>)}
    <details className={styles.overviewExplanation}><summary>{labels.explanation}</summary><p>{labels.countsHelp}</p></details>
    <RootActions restricted={restricted} disabled={failure?.missing} onSwitch={onSwitch} />
  </dialog>;
}
