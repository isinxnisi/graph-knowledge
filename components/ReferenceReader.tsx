"use client";

import { useEffect, useRef, useState } from "react";
import type { EntitySummary } from "../lib/domain/api";
import type { DatasetMode } from "../lib/domain/dataset";
import { ClientApiError, errorMessage } from "../lib/client/api";
import { readClaimReference, readEntityReference, readingHref, type ReadingLocation, type ReadingReference } from "../lib/client/reading-reference";
import { KIND_LABELS, formatPeriod } from "../lib/client/format";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { readingLabels } from "../lib/i18n/reading-reference";
import { datasetLabels } from "../lib/i18n/dataset";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { ClaimCard } from "./ClaimDetails";
import ReadingLink from "./ReadingLink";
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
  const text = readingLabels();
  return error ? <div role="alert" className={styles.error}>
    <p>{error instanceof ClientApiError && error.status === 404 ? text.missing : errorMessage(error)}</p>
    <button onClick={retry}>{text.retry}</button>
  </div> : <p role="status">{text.loading}</p>;
}

function EntityReader({ reference, onExplore }: { reference: ReadingReference; onExplore: (entity: EntitySummary) => void }) {
  const { result, retry } = useReference(reference.id, readEntityReference);
  const entity = result?.data, text = readingLabels();
  if (!entity) return <ReadStatus error={result?.error} retry={retry} />;
  return <section aria-label="リンク先の対象">
    <h3>{entity.name}</h3><p className={styles.badge}>{KIND_LABELS[entity.kind]}</p>
    <p>{entity.description ?? "説明は未登録です。"}</p>
    <p>別名：{entity.aliases.length ? entity.aliases.join("、") : "未登録"}</p>
    {entity.event && <><dl className={styles.claimFacts}><dt>{eventParticipationLabels().eventPeriod}</dt><dd>{formatPeriod(entity.event.period)}</dd></dl><p>{eventParticipationLabels().periodHelp}</p></>}
    <button onClick={() => onExplore(entity)}>{text.explore}</button><p className={styles.muted}>{text.exploreHelp}</p>
  </section>;
}

function ClaimReader({ reference, onExplore }: { reference: ReadingReference; onExplore: (entity: EntitySummary) => void }) {
  const { result, retry } = useReference(reference.id, readClaimReference);
  const claim = result?.data, text = readingLabels();
  const subject = useReference(claim?.subjectId ?? null, readEntityReference);
  const object = useReference(claim && claim.objectId !== claim.subjectId ? claim.objectId : null, readEntityReference);
  if (!claim) return <ReadStatus error={result?.error} retry={retry} />;
  const endpoints = [{ id: claim.subjectId, label: text.subject, resource: subject }, ...(claim.objectId === claim.subjectId ? [] : [{ id: claim.objectId, label: text.object, resource: object }])];
  const nodes = Object.fromEntries(endpoints.flatMap(({ resource }) => resource.result?.data ? [[resource.result.data.id, resource.result.data]] : []));
  return <>
    <p className={styles.muted}>{text.individual}</p>
    <ClaimCard referenceDataset={reference.dataset} claim={claim} nodes={nodes} title={text.claim} idPrefix="reference-" />
    <section aria-label={text.endpoints}><h3>{text.endpoints}</h3>
      {endpoints.map(({ id, label, resource }) => <div key={id} className={css.endpoint}>
        <p>{label}：<ReadingLink reference={{ kind: "entity", dataset: reference.dataset, id }}>{resource.result?.data?.name ?? id}</ReadingLink></p>
        {resource.result?.data ? <><p>{resource.result.data.description}</p><button onClick={() => onExplore(resource.result!.data!)}>{resource.result.data.name}から関係を探索する</button></> : <ReadStatus error={resource.result?.error} retry={resource.retry} />}
      </div>)}
      <p className={styles.muted}>{text.exploreHelp}</p>
    </section>
  </>;
}

function ReferenceUrl({ reference }: { reference: ReadingReference }) {
  const text = readingLabels();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Origin is only available in the browser. The relative link is usable before hydration.
  useEffect(() => { if (input.current) input.current.value = new URL(readingHref(reference), window.location.origin).href; }, [reference]);
  return <details className={css.url}><summary>{text.url}</summary>
    <label>{text.url}<input ref={input} readOnly defaultValue={readingHref(reference)} onFocus={event => event.currentTarget.select()} /></label>
    <button onClick={async () => {
      try { await navigator.clipboard.writeText(new URL(readingHref(reference), window.location.origin).href); setMessage(text.copied); }
      catch { setMessage(text.copyFailed); input.current?.focus(); input.current?.select(); }
    }}>{text.copy}</button>
    {message && <p role="status">{message}</p>}<p className={styles.muted}>{text.linkHelp}</p>
  </details>;
}

export default function ReferenceReader({ location, dataset, onClose, onExplore }: {
  location: NonNullable<ReadingLocation>; dataset: DatasetMode; onClose: () => void; onExplore: (entity: EntitySummary) => void;
}) {
  const text = readingLabels();
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); heading.current?.focus();
    return () => { element?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const backdrop = useDialogBackdrop(onClose);
  return <dialog lang="ja" ref={dialog} className={`${styles.conditionDialog} ${css.dialog}`} aria-labelledby="reference-title" onCancel={event => { event.preventDefault(); onClose(); }} {...backdrop}>
    <div className={css.header}><h2 ref={heading} id="reference-title" tabIndex={-1}>{text.title}</h2><button onClick={onClose}>{text.close}</button></div>
    <p className={styles.demo}>{datasetLabels(dataset).badge}</p><p>{text.help}</p>
    {location.status === "invalid" && <p role="alert">{text.invalid}</p>}
    {location.status === "dataset" && <div role="alert"><p>{text.mismatch}</p><p>リンク先：{datasetLabels(location.dataset).badge}</p></div>}
    {location.status === "ready" && <>
      <p className={css.identity}>{location.reference.kind === "entity" ? "Entity" : "Claim"} ID：<code>{location.reference.id}</code></p>
      {location.reference.kind === "entity" ? <EntityReader reference={location.reference} onExplore={onExplore} /> : <ClaimReader reference={location.reference} onExplore={onExplore} />}
      <ReferenceUrl reference={location.reference} />
    </>}
  </dialog>;
}
