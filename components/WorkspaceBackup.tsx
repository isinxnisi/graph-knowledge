"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { exportWorkspace, importWorkspace, parseWorkspaceBackup, WorkspaceError, WORKSPACE_FILE_LIMIT, type SavedWorkspace } from "../lib/client/saved-workspace";
import { workspaceLabels } from "../lib/i18n/workspace";
import { conditionSummary } from "../lib/i18n/exploration-entry";
import styles from "./Explorer.module.css";

export default function WorkspaceBackup({ dataset, workspace, full, ready, disabled, onImported }: {
  dataset: DatasetMode; workspace: SavedWorkspace | null; full: boolean; ready: boolean; disabled: boolean;
  onImported: (workspace: SavedWorkspace) => void;
}) {
  const text = workspaceLabels();
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [replace, setReplace] = useState(false);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ raw: string; incoming: SavedWorkspace; name: string; previous: SavedWorkspace | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => () => { request.current++; }, []);
  const conflict = preview?.previous != null && preview.previous.id !== workspace?.id;
  const errorMessage = (error: unknown) => error instanceof WorkspaceError
    ? error.reason === "conflict" ? text.importConflict : text[error.reason] : text.fileFailed;
  const cancel = () => {
    request.current++; setPreview(null); setReading(false); setError(null); setMessage(null);
    input.current?.focus();
  };
  const readFile = async (file: File) => {
    const current = ++request.current;
    setPreview(null); setError(null); setMessage(null); setReading(true);
    try {
      if (file.size > WORKSPACE_FILE_LIMIT) throw new WorkspaceError("fileInvalid");
      const raw = await file.text();
      if (current !== request.current) return;
      setPreview({ raw, incoming: parseWorkspaceBackup(raw, dataset), name: file.name, previous: replace ? workspace : null });
    } catch (error) {
      if (current === request.current) setError(errorMessage(error));
    } finally {
      if (current === request.current) setReading(false);
    }
  };
  const download = () => {
    setError(null); setMessage(null);
    try {
      const raw = exportWorkspace(window.localStorage, dataset, workspace?.id ?? "");
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `graph-knowledge-workspace-${dataset}.json`;
      document.body.append(link);
      try { link.click(); }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setMessage(text.downloadStarted);
    } catch (error) { setError(errorMessage(error)); }
  };
  const confirm = () => {
    if (!preview || !ready || disabled || conflict || (!preview.previous && full)) return;
    setError(null); setMessage(null);
    try {
      const result = importWorkspace(window.localStorage, dataset, preview.previous?.id ?? null, preview.raw);
      onImported(result); setPreview(null); setReplace(false); setMessage(text.imported);
      input.current?.focus();
    } catch (error) { setError(errorMessage(error)); }
  };
  return <details className={styles.savedViewsBackup}>
    <summary>{text.backup}</summary>
    <p className={styles.muted}>{text.backupHelp}</p>
    <button disabled={!ready || disabled || !workspace} onClick={download}>{text.export}</button>
    <label><input type="checkbox" checked={replace} disabled={!ready || disabled || (!workspace && !replace) || reading || !!preview}
      onChange={event => setReplace(event.target.checked)} />{workspace ? text.importReplaceSelected(workspace.title) : text.importReplace}</label>
    <p className={styles.muted}>{text.importAsNew}</p>
    <label htmlFor="workspace-file">{text.importFile}</label>
    <input ref={input} id="workspace-file" type="file" accept=".json,application/json" disabled={!ready || disabled || (replace && !workspace)}
      aria-describedby="workspace-file-help" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void readFile(file);
      }} />
    <p id="workspace-file-help" className={styles.muted}>{text.fileHelp}</p>
    {reading && <p role="status">{text.readingFile}</p>}
    {preview && <section aria-label={text.preview}>
      <h4>{text.preview}</h4>
      <p className={styles.backupPreview}>{preview.name} · {dataset}</p>
      <div className={styles.backupPreview}>
        <strong>{preview.incoming.title}</strong>
        <p><time dateTime={preview.incoming.savedAt}>{text.savedAt(preview.incoming.savedAt)}</time></p>
        <p>{conditionSummary(preview.incoming.conditions.predicates, preview.incoming.conditions.contributionRoles, "ja", preview.incoming.conditions.organizationPositions, preview.incoming.conditions.eventRoles)}</p>
        <p>{text.rootId}：{preview.incoming.rootId}</p>
        <p>{text.scope(preview.incoming.branches.length, preview.incoming.branches.reduce((sum, branch) => sum + branch.pages, 0))}</p>
      </div>
      {preview.previous && <p>{text.replaceHelp(preview.previous.title)}</p>}
      {!preview.previous && full && <p role="alert">{text.countLimit}</p>}
      <p className={styles.muted}>{text.importHelp}</p>
      <button disabled={!ready || disabled || conflict || (!preview.previous && full)} onClick={confirm}>{preview.previous ? text.confirmReplace : text.confirmImport}</button>
    </section>}
    {(reading || preview) && <button onClick={cancel}>{text.cancelImport}</button>}
    {(error || conflict) && <p role="alert" className={styles.error}>{error ?? text.importConflict}</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
