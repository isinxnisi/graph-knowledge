"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useEffect, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { exportSavedViews, importSavedViews, parseSavedViewsBackup, planSavedViewsImport, SavedViewsError, SAVED_VIEWS_FILE_LIMIT, type SavedView } from "../lib/client/saved-views";
import { savedViewLabels } from "../lib/i18n/saved-views";
import { conditionSummary } from "../lib/i18n/exploration-entry";
import styles from "./Explorer.module.css";

export default function SavedViewsBackup({ dataset, views, ready, disabled, onImported }: {
  dataset: DatasetMode; views: SavedView[]; ready: boolean; disabled: boolean;
  onImported: (views: SavedView[]) => void;
}) {
  const { locale } = useUiLocale();
  const text = savedViewLabels(locale);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ raw: string; views: SavedView[]; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => () => { request.current++; }, []);

  const errorMessage = (error: unknown) => error instanceof SavedViewsError ? text[error.reason] : text.fileFailed;
  let plan: ReturnType<typeof planSavedViewsImport> | null = null;
  let planError: string | null = null;
  if (preview && ready) {
    try { plan = planSavedViewsImport(views, preview.views); }
    catch (error) { planError = errorMessage(error); }
  }
  const cancel = () => {
    request.current++; setPreview(null); setReading(false); setError(null); setMessage(null);
    input.current?.focus();
  };
  const readFile = async (file: File) => {
    const current = ++request.current;
    setPreview(null); setError(null); setMessage(null); setReading(true);
    try {
      if (file.size > SAVED_VIEWS_FILE_LIMIT) throw new SavedViewsError("invalid");
      const raw = await file.text();
      if (current !== request.current) return;
      const incoming = parseSavedViewsBackup(raw, dataset);
      setPreview({ raw, views: incoming, name: file.name });
    } catch (error) {
      if (current === request.current) setError(error instanceof SavedViewsError && error.reason === "invalid" ? text.backupInvalid : errorMessage(error));
    } finally {
      if (current === request.current) setReading(false);
    }
  };
  const download = () => {
    setError(null); setMessage(null);
    try {
      const raw = exportSavedViews(window.localStorage, dataset);
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `graph-knowledge-saved-views-${dataset}.json`;
      document.body.append(link);
      try { link.click(); }
      finally {
        link.remove();
        // Allow the browser to consume the download before releasing the blob.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(text.downloadStarted);
    } catch (error) { setError(errorMessage(error)); }
  };
  const confirm = () => {
    setError(null); setMessage(null);
    try {
      if (!preview) return;
      const result = importSavedViews(window.localStorage, dataset, preview.raw);
      onImported(result.views); setPreview(null); setMessage(text.imported(result.added, result.skipped));
      input.current?.focus();
    } catch (error) { setError(errorMessage(error)); }
  };
  return <details className={styles.savedViewsBackup}>
    <summary>{text.backup}</summary>
    <p className={styles.muted}>{text.backupHelp}</p>
    <button disabled={!ready || disabled || !views.length} onClick={download}>{text.export}</button>
    <label htmlFor="saved-views-file">{text.importFile}</label>
    <input ref={input} id="saved-views-file" type="file" accept=".json,application/json" disabled={!ready || disabled}
      aria-describedby="saved-views-file-help" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void readFile(file);
      }} />
    <p id="saved-views-file-help" className={styles.muted}>{text.fileHelp}</p>
    {reading && <p role="status">{text.readingFile}</p>}
    {preview && <section aria-label={text.preview}>
      <h4>{text.preview}</h4>
      <p>{preview.name} · {dataset}</p>
      {plan && <p role="status">{text.importPlan(plan.added, plan.skipped)}</p>}
      {preview.views.length === 0 && <p>{text.emptyBackup}</p>}
      <ul className={styles.backupPreview}>{preview.views.map(view => <li key={view.id}>
        <strong>{view.title}</strong>
        <p className={styles.muted}>{conditionSummary(view.conditions.predicates, view.conditions.contributionRoles, locale, view.conditions.organizationPositions, view.conditions.eventRoles)}</p>
        <p className={styles.muted}>{text.rootId}：{view.rootId}</p>
      </li>)}</ul>
      <p className={styles.muted}>{text.importHelp}</p>
      <button disabled={!ready || disabled || !plan || plan.added === 0} onClick={confirm}>{text.confirmImport}</button>
    </section>}
    {(reading || preview) && <button onClick={cancel}>{text.cancelImport}</button>}
    {(error || planError) && <p role="alert" className={styles.error}>{error ?? planError}</p>}
    {message && <p role="status">{contentMessage(message, locale)}</p>}
  </details>;
}
