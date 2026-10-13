"use client";
import Icon from "./Icon";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";

import { eventParticipationLabels } from "../lib/i18n/event-participation";
import type { DatasetMode } from "../lib/domain/dataset";
import ReadingLink from "./ReadingLink";
import RootActions from "./RootActions";
import { overviewLabels } from "../lib/i18n/entity-overview";
import { useEffect, useState } from "react";
import type { EntityDetail, EntitySummary } from "../lib/domain/api";
import type { Expansion } from "../lib/client/graph-state";
import { ClientApiError, fetchEntity, errorMessage } from "../lib/client/api";
import { formatPeriod } from "../lib/client/format";
import styles from "./Explorer.module.css";

export default function EntityDetails({ entity, expansion, onExpand, onClose, onOverview, onSwitch, restricted, dataset }: {
  dataset?: DatasetMode;
  onOverview: () => void; onSwitch: (mode: "broad" | "same") => void; restricted: boolean;
  entity: EntitySummary; expansion?: Expansion; onExpand: (more: boolean) => void; onClose: () => void;
}) {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchEntity(entity.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setDetail(result.entity); setMissing(false); setError(null); }
    }).catch((error) => { if (!controller.signal.aborted) { setError(errorMessage(error)); setMissing(error instanceof ClientApiError && error.status === 404); } });
    return () => controller.abort();
  }, [entity.id, attempt]);
  return <section aria-label={ui.entityDetails}>
    <h3>{entity.name}</h3><p className={styles.badge}>{ui.kinds[entity.kind]}</p>
    <p>{entity.description ?? ui.descriptionMissing}</p>
    {!detail && !error && <p role="status">{ui.entityLoading}</p>}
    {detail && <p>{ui.aliases}：{detail.aliases.length ? detail.aliases.join("、") : ui.unregistered}</p>}
    {detail?.event && <><dl className={styles.claimFacts}><dt>{eventParticipationLabels(locale).eventPeriod}</dt><dd>{formatPeriod(detail.event.period, locale)}</dd></dl><p className={styles.muted}>{eventParticipationLabels(locale).periodHelp}</p></>}
    {error && <div role="alert" className={styles.error}><p>{explorerMessage(error, locale)}</p><button onClick={() => { setError(null); setDetail(null); setAttempt((value) => value + 1); }}>{ui.entityRetry}</button></div>}
    {dataset && <p><ReadingLink reference={{ kind: "entity", dataset, id: entity.id }} /></p>}
    <button onClick={onOverview}><Icon name="graph" />{overviewLabels(locale).open}</button>
    <RootActions restricted={restricted} disabled={missing} onSwitch={onSwitch} />
    <div className={styles.actions}>
      {expansion?.open ? <button onClick={onClose}>{ui.closeBranch}</button> : <button onClick={() => onExpand(false)}>{expansion?.pages.length ? ui.reopenBranch : ui.expand}</button>}
    </div>
    {!expansion?.open && !!expansion?.pages.length && <p className={styles.muted}>{ui.restoreHelp}</p>}
    {expansion?.loading && <p role="status">{expansion.expanded ? ui.moreLoading : ui.neighborsLoading}</p>}
    {expansion?.error && <div role="alert" className={styles.error}><p>{explorerMessage(expansion.error, locale)}</p>
      <button onClick={() => onExpand(expansion.open && expansion.expanded)}>{ui.graphRetry}</button>
    </div>}
    {expansion?.expanded && !expansion.hasMore && <p className={styles.muted}>{ui.fetched}</p>}
    {expansion?.open && expansion.hasMore && <button onClick={() => onExpand(true)} disabled={expansion.loading || expansion.blocked}>
      {expansion.loading ? ui.moreLoading : ui.more}
    </button>}
  </section>;
}
