"use client";
import { entityDisplayName } from "../lib/domain/entity-display";
import Icon from "./Icon";
import LegacyEntityTranslations from "./LegacyEntityTranslations";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";

import { eventParticipationLabels } from "../lib/i18n/event-participation";
import type { DatasetMode } from "../lib/domain/dataset";
import ReadingLink from "./ReadingLink";
import detailCss from "./ExplorationDetails.module.css";

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
    setDetail(null); setError(null); setMissing(false);
    fetchEntity(entity.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setDetail(result.entity); setMissing(false); setError(null); }
    }).catch((error) => { if (!controller.signal.aborted) { setError(errorMessage(error)); setMissing(error instanceof ClientApiError && error.status === 404); } });
    return () => controller.abort();
  }, [entity.id, attempt]);
  return <section aria-label={ui.entityDetails} className={`${styles.entityDetails} ${detailCss.entity}`}>
    <header className={styles.entityHeading}>
      <span className={styles.entityKind}><Icon name={entity.kind === "work" ? "book" : entity.kind} />{ui.kinds[entity.kind]}</span>
      <h3>{entityDisplayName(detail ?? entity, locale)}</h3>
      <p className={styles.entityDescription}>{detail?.description ?? entity.description ?? ui.descriptionMissing}</p>
    </header>
    {!detail && !error && <p role="status">{ui.entityLoading}</p>}
    {detail?.event && <><dl className={styles.claimFacts}><dt>{eventParticipationLabels(locale).eventPeriod}</dt><dd>{formatPeriod(detail.event.period, locale)}</dd></dl><p className={styles.muted}>{eventParticipationLabels(locale).periodHelp}</p></>}
    {error && <div role="alert" className={styles.error}><p>{explorerMessage(error, locale)}</p><button onClick={() => { setError(null); setDetail(null); setAttempt((value) => value + 1); }}>{ui.entityRetry}</button></div>}
    <nav className={detailCss.explore} aria-label={locale === "en" ? "Explore connections" : "つながりをたどる"}>
      <button onClick={onOverview}><Icon name="graph" /><span>{locale === "en" ? "View connections" : "つながりを見る"}</span><Icon name="chevron" /></button>
      <button disabled={missing} onClick={() => onSwitch("broad")}><Icon name="arrow" /><span>{locale === "en" ? `Explore from ${entityDisplayName(detail ?? entity, locale)}` : `${entityDisplayName(detail ?? entity, locale)}から探索する`}</span><Icon name="chevron" /></button>
      {restricted && <button disabled={missing} onClick={() => onSwitch("same")}><Icon name="settings" /><span>{locale === "en" ? "Explore with the current filters" : "今の条件で探索する"}</span><Icon name="chevron" /></button>}
    </nav>
    <div className={detailCss.branch}>
      <button onClick={expansion?.open ? onClose : () => onExpand(false)} disabled={!expansion?.open && expansion?.loading}>
        <Icon name={expansion?.open ? "minus" : "plus"} />{locale === "en" ? (expansion?.open ? "Collapse connections in the graph" : "Expand connections in the graph") : (expansion?.open ? "図のつながりを閉じる" : "図につながりを広げる")}
      </button>
      {expansion?.loading && <p role="status">{expansion.expanded ? ui.moreLoading : ui.neighborsLoading}</p>}
      {expansion?.error && <div role="alert" className={styles.error}><p>{explorerMessage(expansion.error, locale)}</p><button onClick={() => onExpand(expansion.open && expansion.expanded)}>{ui.graphRetry}</button></div>}
      {expansion?.open && expansion.hasMore && <button onClick={() => onExpand(true)} disabled={expansion.loading || expansion.blocked}>{expansion.loading ? ui.moreLoading : ui.more}</button>}
    </div>
    <div className={detailCss.tools}>
      <details className={detailCss.metadata}><summary>{locale === "en" ? "Names & link" : "別名・閲覧リンク"}</summary><div>
        {!!detail?.aliases.length && <p><span>{ui.aliases}</span>{detail.aliases.join(locale === "en" ? ", " : "、")}</p>}
        {dataset && <ReadingLink reference={{ kind: "entity", dataset, id: entity.id }}><Icon name="link" />{locale === "en" ? "Open the direct link" : "個別の閲覧リンクを開く"}</ReadingLink>}
      </div></details>
      {dataset === "public-kg" && <LegacyEntityTranslations key={entity.id} id={entity.id} />}
    </div>
  </section>;
}
