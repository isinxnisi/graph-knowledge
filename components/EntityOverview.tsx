"use client";
import { focusDestination } from "../lib/client/focus-destination";
import DialogCloseButton from "./DialogCloseButton";
import { useDialogSizeMotion } from "../lib/client/use-dialog-size-motion";
import AnimatedDetails from "./AnimatedDetails";
import { useDialogDismiss } from "../lib/client/use-dialog-dismiss";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";

import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { useEffect, useRef, useState } from "react";
import type { EntityOverviewResponse, EntitySummary } from "../lib/domain/api";
import type { DatasetMode } from "../lib/domain/dataset";
import { ClientApiError, errorMessage, fetchOverview } from "../lib/client/api";
import { overviewLabels } from "../lib/i18n/entity-overview";
import { datasetLabels } from "../lib/i18n/dataset";
import { overviewPresentation, type OverviewRelation } from "../lib/client/overview-presentation";
import RootActions from "./RootActions";
import styles from "./Explorer.module.css";

function RelationOverview({ relation }: { relation: OverviewRelation }) {
  const { locale } = useUiLocale();
  const labels = overviewLabels(locale);
  const view = overviewPresentation(relation, locale);
  return <li className={styles.overviewRow} data-testid={`overview-${relation.predicate}-${relation.perspective}`} data-polarity={view.status}>
    <div className={styles.overviewRelationHeading}>
      <h4>{view.title}</h4>
      {view.status !== "affirmed" && <span className={styles.overviewStatus}>{view.status === "denied" ? labels.deniedOnly : labels.mixed}</span>}
    </div>
    <p className={styles.overviewDirection} role="img" aria-label={`${view.start} → ${view.verb} → ${view.end}`}>
      <span className={view.fromCenter ? styles.overviewCenter : undefined}>{view.start}</span>
      <span aria-hidden="true" className={styles.overviewArrow}>→</span><span>{view.verb}</span>
      <span aria-hidden="true" className={styles.overviewArrow}>→</span>
      <span className={!view.fromCenter ? styles.overviewCenter : undefined}>{view.end}</span>
    </p>
    {view.status === "denied" && <p className={styles.muted}>{labels.deniedHelp}</p>}
    {view.qualificationSummary && <p className={styles.overviewTerms}>{view.qualification!.title}：{view.qualificationSummary}</p>}
    <AnimatedDetails className={styles.overviewStatistics} summary={labels.statistics}>
      <p>{labels.countsUnit}：{labels.counts(relation.counts.affirmed, relation.counts.denied)}</p>
      <p className={styles.muted}>{labels.countsHelp}</p>
      {view.qualification && <section aria-label={view.qualification.details}>
        <h5>{view.qualification.details}</h5>
        <ul>{view.qualification.entries.map(value => <li key={value.id ?? "unqualified"}>
          {value.label}：{labels.counts(value.counts.affirmed, value.counts.denied)}
        </li>)}</ul><p className={styles.muted}>{view.qualification.help}</p>
      </section>}
    </AnimatedDetails>
  </li>;
}

export default function EntityOverview({ entity, dataset, restricted, onClose, onSwitch }: {
  entity: EntitySummary; dataset: DatasetMode; restricted: boolean; onClose: () => void; onSwitch: (mode: "broad" | "same") => void;
}) {
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const labels = overviewLabels(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<EntityOverviewResponse | null>(null);
  const [failure, setFailure] = useState<{ message: string; missing: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current!; element.showModal();
    return () => {
      element.close();
      if (previousFocus?.isConnected && previousFocus !== document.body) focusDestination(previousFocus, {});
      else focusDestination(document.querySelector<HTMLElement>('[data-testid="graph-canvas"]'), {});
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
  useDialogSizeMotion(dialog, result ?? failure ?? attempt);
  const dismiss = useDialogDismiss(dialog, onClose);
  const backdrop = useDialogBackdrop(dismiss);
  return <dialog ref={dialog} className={`${styles.conditionDialog} ${styles.overviewDialog}`} aria-labelledby="overview-title" onCancel={(event) => { event.preventDefault(); dismiss(); }} {...backdrop}>
    <div className={styles.detailHeading}><h2 id="overview-title">{labels.title}</h2><DialogCloseButton label={labels.close} onClick={dismiss} /></div>
    <div className={styles.overviewBody}>
    <p className={styles.muted}>{datasetLabels(dataset, locale).badge}</p>
    <div className={styles.overviewEntity}><h3>{entity.name}</h3><span className={styles.badge}>{ui.kinds[entity.kind]}</span></div>
    {entity.description && <p>{entity.description}</p>}
    <p className={styles.muted}>{labels.scope}</p>
    {!result && !failure && <p role="status">{labels.loading}</p>}
    {failure && <div role="alert"><p>{explorerMessage(failure.message, locale)}</p>{failure.missing && <p>{labels.unavailable}</p>}
      <button onClick={() => { setFailure(null); setResult(null); setAttempt((value) => value + 1); }}>{labels.retry}</button></div>}
    {result && !result.relations.length && <p>{labels.noClaims}</p>}
    {!!result?.relations.length && <>
      <p className={styles.muted}>{labels.registered}</p>
      {(["subject", "object"] as const).map(perspective => {
        const relations = result.relations.filter(relation => relation.perspective === perspective);
        return relations.length > 0 && <section key={perspective} aria-label={perspective === "subject" ? labels.outgoing : labels.incoming} className={styles.overviewGroup}>
          <h3>{perspective === "subject" ? labels.outgoing : labels.incoming}</h3>
          <ul className={styles.overviewRelations}>{relations.map(relation => <RelationOverview relation={relation} key={relation.predicate} />)}</ul>
        </section>;
      })}
    </>}
    </div>
    <div className={styles.overviewFooter}>
      <p className={styles.muted}>{labels.detailHelp}</p>
      <button onClick={dismiss}>{labels.backToGraph}</button>
      <RootActions restricted={restricted} disabled={failure?.missing} onSwitch={onSwitch} />
    </div>
  </dialog>;
}
