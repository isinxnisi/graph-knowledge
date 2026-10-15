"use client";
import { focusDestination } from "../lib/client/focus-destination";
import DialogCloseButton from "./DialogCloseButton";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";

import { useEffect, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
import type { DatasetMode } from "../lib/domain/dataset";
import { ClientApiError, errorMessage } from "../lib/client/api";
import { readClaimReference, readEntityReference, readingHref, type ReadingLocation, type ReadingReference } from "../lib/client/reading-reference";
import { formatPeriod } from "../lib/client/format";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { readingLabels } from "../lib/i18n/reading-reference";
import { datasetLabels } from "../lib/i18n/dataset";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { ClaimCard } from "./ClaimDetails";
import ReadingLink from "./ReadingLink";
import Icon from "./Icon";
import styles from "./Explorer.module.css";
import css from "./ReferenceReader.module.css";

function useReference<T>(id: string | null, load: (id: string, signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ id: string; data: T; error?: never } | { id: string; data?: never; error: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void load(id, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ id, data });
    }).catch(error => { if (!controller.signal.aborted) setResult({ id, error }); });
    return () => controller.abort();
  }, [id, load, attempt]);
  return { result: result?.id === id ? result : null, retry: () => { setResult(null); setAttempt(value => value + 1); } };
}

function ReadStatus({ error, retry }: { error?: unknown; retry: () => void }) {
  const { locale } = useUiLocale();
  const text = readingLabels(locale);
  return error ? <div role="alert" className={styles.error}>
    <p>{error instanceof ClientApiError && error.status === 404 ? text.missing : explorerMessage(errorMessage(error), locale)}</p>
    <button onClick={retry}>{text.retry}</button>
  </div> : <p role="status">{text.loading}</p>;
}

function EntityReader({ reference, onExplore }: { reference: ReadingReference; onExplore: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale();
  const { result, retry } = useReference(reference.id, readEntityReference);
  const entity = result?.data, text = readingLabels(locale);
  if (!entity) return <ReadStatus error={result?.error} retry={retry} />;
  return <section aria-label={text.linkedEntity}>
    <h3>{entity.name}</h3><p className={styles.badge}>{explorerLabels(locale).kinds[entity.kind]}</p>
    <p>{entity.description ?? explorerLabels(locale).descriptionMissing}</p>
    <p>{explorerLabels(locale).aliases}：{entity.aliases.length ? entity.aliases.join("、") : explorerLabels(locale).unregistered}</p>
    {entity.event && <><dl className={styles.claimFacts}><dt>{eventParticipationLabels(locale).eventPeriod}</dt><dd>{formatPeriod(entity.event.period, locale)}</dd></dl><p>{eventParticipationLabels(locale).periodHelp}</p></>}
    <button onClick={() => onExplore(entity)}>{text.explore}</button><p className={styles.muted}>{text.exploreHelp}</p>
  </section>;
}

function ClaimReader({ reference, onExplore }: { reference: ReadingReference; onExplore: (entity: EntitySummary) => void }) {
  const { locale } = useUiLocale();
  const { result, retry } = useReference(reference.id, readClaimReference);
  const claim = result?.data, text = readingLabels(locale);
  const subject = useReference(claim?.subjectId ?? null, readEntityReference);
  const object = useReference(claim && claim.objectId !== claim.subjectId ? claim.objectId : null, readEntityReference);
  if (!claim) return <ReadStatus error={result?.error} retry={retry} />;
  const endpoints = [{ id: claim.subjectId, resource: subject }, ...(claim.objectId === claim.subjectId ? [] : [{ id: claim.objectId, resource: object }])];
  const nodes = Object.fromEntries(endpoints.flatMap(({ resource }) => resource.result?.data ? [[resource.result.data.id, resource.result.data]] : []));
  return <>
    <p className={styles.muted}>{text.individual}</p>
    <ClaimCard referenceDataset={reference.dataset} claim={claim} nodes={nodes} title={text.claim} idPrefix="reference-" />
    <section aria-label={text.endpoints} className={css.endpoints}><h3>{text.endpoints}</h3><div className={css.endpointGrid}>
      {endpoints.map(({ id, resource }) => <div key={id} className={css.endpoint}>
        <p className={css.endpointName}>{resource.result?.data && <span className={css.kind}><Icon name={resource.result.data.kind === "work" ? "book" : resource.result.data.kind} />{explorerLabels(locale).kinds[resource.result.data.kind]}</span>}<ReadingLink reference={{ kind: "entity", dataset: reference.dataset, id }}>{resource.result?.data?.name ?? id}</ReadingLink></p>
        {resource.result?.data ? <><p>{resource.result.data.description}</p><button onClick={() => onExplore(resource.result!.data!)}>{text.exploreFrom(resource.result.data.name)}</button></> : <ReadStatus error={resource.result?.error} retry={resource.retry} />}
      </div>)}
      </div><p className={styles.muted}>{text.exploreHelp}</p>
    </section>
  </>;
}

function ReferenceUrl({ reference }: { reference: ReadingReference }) {
  const { locale } = useUiLocale();
  const text = readingLabels(locale);
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Origin is only available in the browser. The relative link is usable before hydration.
  useEffect(() => { if (input.current) input.current.value = new URL(readingHref(reference), window.location.origin).href; }, [reference]);
  return <section className={css.url} aria-label={text.url}>
    <button onClick={async () => {
      try { await navigator.clipboard.writeText(new URL(readingHref(reference), window.location.origin).href); setMessage(text.copied); }
      catch { setMessage(text.copyFailed); const details = input.current?.closest("details"); if (details) details.open = true; input.current?.focus(); input.current?.select(); }
    }}><Icon name="copy" />{text.copy}</button>
    {message && <p role="status">{contentMessage(message, locale)}</p>}
    <details className={styles.disclosure}><summary>{text.urlDetails}</summary><div className={styles.disclosureBody}>
      <label>{text.url}<input ref={input} readOnly defaultValue={readingHref(reference)} onFocus={event => event.currentTarget.select()} /></label>
      <p>{text.linkHelp}</p><p>{text.accessHelp}</p><p className={css.identity}>{text.identity}：<code>{reference.id}</code></p>
    </div></details>
  </section>;
}

export default function ReferenceReader({ location, dataset, onClose, onExplore }: {
  location: NonNullable<ReadingLocation>; dataset: DatasetMode; onClose: () => void; onExplore: (entity: EntitySummary) => void;
}) {
  const { locale } = useUiLocale();
  const text = readingLabels(locale);
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); focusDestination(heading.current, {});
    return () => { element?.close(); if (opener?.isConnected) focusDestination(opener); };
  }, []);
  const backdrop = useDialogBackdrop(onClose);
  const title = location.status === "ready" ? (location.reference.kind === "entity" ? text.entityTitle : text.claimTitle) : text.title;
  return <dialog lang={locale} ref={dialog} className={`${styles.conditionDialog} ${css.dialog}`} aria-labelledby="reference-title" onCancel={event => { event.preventDefault(); onClose(); }} {...backdrop}>
    <div className={css.header}><h2 ref={heading} id="reference-title" tabIndex={-1} data-focus-destination>{title}</h2><DialogCloseButton label={text.close} onClick={onClose} /></div>
    <p className={css.dataset}>{datasetLabels(dataset, locale).badge}</p><p className={css.intro}>{text.help}</p>
    {location.status === "invalid" && <p role="alert">{text.invalid}</p>}
    {location.status === "dataset" && <div role="alert"><p>{text.mismatch}</p><p>{text.linkedDataset}：{datasetLabels(location.dataset, locale).badge}</p></div>}
    {location.status === "ready" && <>
      <ReferenceUrl reference={location.reference} />
      {location.reference.kind === "entity" ? <EntityReader reference={location.reference} onExplore={onExplore} /> : <ClaimReader reference={location.reference} onExplore={onExplore} />}
    </>}
  </dialog>;
}
