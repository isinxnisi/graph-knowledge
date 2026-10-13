"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import type { GraphState } from "../lib/client/graph-state";
import type { GraphView } from "../lib/client/graph-view";
import { captureWorkspace, readWorkspaces, rebuildWorkspace, writeWorkspace, workspaceKey, WorkspaceError, WORKSPACE_PAGE_LIMIT, WORKSPACE_COUNT_LIMIT, type RebuiltWorkspace, type SavedWorkspace } from "../lib/client/saved-workspace";
import { ClientApiError } from "../lib/client/api";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import { workspaceLabels } from "../lib/i18n/workspace";
import { conditionSummary } from "../lib/i18n/exploration-entry";
import styles from "./Explorer.module.css";
import WorkspaceBackup from "./WorkspaceBackup";

export default function WorkspaceDialog({ dataset, graph, captureView, onOpen, onClose }: {
  dataset: DatasetMode; graph: GraphState; captureView: () => GraphView | null;
  onOpen: (workspace: RebuiltWorkspace) => void; onClose: () => void;
}) {
  const text = workspaceLabels();
  const dialog = useRef<HTMLDialogElement>(null);
  const selection = useRef<HTMLSelectElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workspace = workspaces.find(item => item.id === selectedId) ?? null;
  const [removing, setRemoving] = useState<SavedWorkspace | null>(null);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState(graph.centerId ? graph.nodes[graph.centerId]?.name.slice(0, 80) ?? "" : "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const refresh = () => {
    try {
      const values = readWorkspaces(window.localStorage, dataset);
      setWorkspaces(values); setSelectedId(values[0]?.id ?? null); setRemoving(null);
      setReady(true); setError(null);
    }
    catch (error) { setReady(false); setError(error instanceof WorkspaceError ? text[error.reason] : text.storage); }
  };
  useEffect(() => {
    dialog.current?.showModal();
    const reload = (initial = false) => {
      try {
        const values = readWorkspaces(window.localStorage, dataset);
        setWorkspaces(values);
        if (initial) setSelectedId(values[0]?.id ?? null);
        setReady(true); setError(null);
      }
      catch (error) { setReady(false); setError(error instanceof WorkspaceError ? text[error.reason] : text.storage); }
    };
    reload(true);
    const changed = (event: StorageEvent) => { if (event.key === null || event.key === workspaceKey(dataset)) reload(); };
    window.addEventListener("storage", changed);
    return () => { pending.current?.abort(); window.removeEventListener("storage", changed); };
  }, [dataset, text]);
  const cancel = () => { pending.current?.abort(); pending.current = null; setProgress(null); };
  const close = () => { cancel(); dialog.current?.close(); onClose(); };
  const backdrop = useDialogBackdrop(close);
  const accept = (value: SavedWorkspace | null) => {
    const values = readWorkspaces(window.localStorage, dataset);
    setWorkspaces(values); setSelectedId(value?.id ?? null); setRemoving(null);
    return values;
  };
  const save = (replace = false) => {
    try {
      const value = captureWorkspace(dataset, title, graph, captureView());
      if (replace && !workspace) return;
      accept(writeWorkspace(window.localStorage, dataset, replace ? workspace!.id : null, value));
      setError(null); setMessage(text.saved);
    } catch (error) { setMessage(null); setError(error instanceof WorkspaceError ? text[error.reason] : text.invalid); }
  };
  const remove = () => {
    try {
      if (!removing) return;
      const remaining = accept(writeWorkspace(window.localStorage, dataset, removing.id, null));
      (remaining.length ? selection.current : nameInput.current ?? closeButton.current)?.focus();
      setError(null); setMessage(text.removed);
    } catch (error) { setMessage(null); setError(error instanceof WorkspaceError ? text[error.reason] : text.storage); }
  };
  const open = async () => {
    if (!workspace || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setError(null); setMessage(null); setProgress({ done: 0, total: workspace.branches.reduce((sum, item) => sum + item.pages, 0) });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    try {
      const rebuilt = await rebuildWorkspace(workspace, controller.signal, (done, total) => {
        if (!controller.signal.aborted) setProgress({ done, total });
      });
      if (controller.signal.aborted) return;
      onOpen(rebuilt); close();
    } catch (error) {
      if (pending.current !== controller) return;
      if (timedOut) setError(text.timeout);
      else if (!controller.signal.aborted) setError(error instanceof WorkspaceError ? text[error.reason] : error instanceof ClientApiError && error.status === 404 ? text.missing : text.response);
    } finally {
      clearTimeout(timer);
      if (pending.current === controller) { pending.current = null; setProgress(null); }
    }
  };
  const loading = Object.values(graph.expansions).some(meta => meta.loading);
  const tooLarge = Object.values(graph.expansions).reduce((sum, meta) => sum + meta.pages.length, 0) > WORKSPACE_PAGE_LIMIT;
  return <dialog lang="ja" ref={dialog} className={`${styles.conditionDialog} ${styles.savedViews}`} aria-labelledby="workspace-title" onCancel={event => { event.preventDefault(); close(); }} {...backdrop}>
    <div className={styles.conditionTitle}><h2 id="workspace-title">{text.title}</h2><button ref={closeButton} aria-label={text.close} onClick={close}>×</button></div>
    <p>{text.help}</p><p className={styles.muted}>{text.local}</p>
    {graph.centerId ? <form className={styles.savedViewForm} onSubmit={event => { event.preventDefault(); save(); }}>
      <p>起点：<strong>{graph.nodes[graph.centerId]?.name}</strong></p>
      <label htmlFor="workspace-name">{text.name}</label>
      <input ref={nameInput} id="workspace-name" maxLength={80} required value={title} onChange={event => setTitle(event.target.value)} />
      <button disabled={!ready || !!progress || loading || tooLarge || !title.trim() || workspaces.length >= WORKSPACE_COUNT_LIMIT}>{text.save}</button>
      {workspace && <button type="button" disabled={!ready || !!progress || loading || tooLarge || !title.trim()}
        onClick={() => save(true)}>{text.replaceSelected(workspace.title)}</button>}
      {workspaces.length >= WORKSPACE_COUNT_LIMIT && <p>{text.countLimit}</p>}
      {loading && <p role="status">{text.loading}</p>}{tooLarge && <p>{text.limit}</p>}
    </form> : <p className={styles.empty}>{text.noRoot}</p>}
    {message && <p role="status">{message}</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button disabled={!!progress} onClick={refresh}>{text.retry}</button></div>}
    <h3>{text.stored}</h3>
    <p className={styles.muted}>{text.count(workspaces.length, WORKSPACE_COUNT_LIMIT)}</p>
    {ready && workspaces.length === 0 && <p className={styles.empty}>{text.empty}</p>}
    {workspaces.length > 0 && <div className={styles.savedViewForm}>
      <label htmlFor="workspace-selection">{text.select}</label>
      <select ref={selection} id="workspace-selection" value={workspace?.id ?? ""} disabled={!ready || !!progress} onChange={event => {
        setSelectedId(event.target.value || null); setRemoving(null); setMessage(null); setError(null);
      }}>
        <option value="">{text.choose}</option>
        {workspaces.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title} · {text.savedAt(item.savedAt)}</option>)}
      </select>
      {!workspace && <p>{text.chooseHelp}</p>}
    </div>}
    {workspace && <div className={styles.savedViewForm}>
      <h4>{workspace.title}</h4>
      <p className={styles.muted}><time dateTime={workspace.savedAt}>{text.savedAt(workspace.savedAt)}</time></p>
      <p>{conditionSummary(workspace.conditions.predicates, workspace.conditions.contributionRoles, "ja", workspace.conditions.organizationPositions, workspace.conditions.eventRoles)}</p>
      <p>{text.scope(workspace.branches.length, workspace.branches.reduce((sum, branch) => sum + branch.pages, 0))}</p>
      <div className={styles.actions}><button disabled={!ready || !!progress} onClick={() => void open()}>{text.open}</button><button disabled={!ready || !!progress} onClick={() => setRemoving(workspace)}>{text.remove}</button></div>
    </div>}
    {removing && <div className={styles.savedViewForm}>
      <p>{text.removeHelp(removing.title)}</p>
      <div className={styles.actions}><button disabled={!ready || !!progress || !workspaces.some(item => item.id === removing.id)} onClick={remove}>{text.confirmRemove}</button>
        <button onClick={() => setRemoving(null)}>{text.keep}</button></div>
      {!workspaces.some(item => item.id === removing.id) && <p role="alert">{text.conflict}</p>}
    </div>}
    {progress && <div><p role="status">{text.opening(progress.done, progress.total)}</p><button onClick={cancel}>{text.cancel}</button></div>}
    <WorkspaceBackup dataset={dataset} workspace={workspace} full={workspaces.length >= WORKSPACE_COUNT_LIMIT} ready={ready} disabled={!!progress} onImported={value => {
      accept(value); setError(null); setMessage(null);
    }} />
  </dialog>;
}
