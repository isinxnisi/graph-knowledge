"use client";
import Icon from "./Icon";
import DialogCloseButton from "./DialogCloseButton";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useEffect, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { entitySummarySchema, type EntitySummary } from "../lib/domain/api";
import { ClientApiError, fetchEntity } from "../lib/client/api";
import { editSavedViews, readSavedViews, savedViewsKey, SavedViewsError, SAVED_VIEW_LIMIT, SAVED_VIEW_TITLE_LIMIT, type SavedView, type ViewConditions } from "../lib/client/saved-views";
import { savedViewLabels } from "../lib/i18n/saved-views";
import { conditionSummary } from "../lib/i18n/exploration-entry";
import { useDialogBackdrop } from "../lib/client/use-dialog-backdrop";
import styles from "./SavedCollections.module.css";
import SavedViewsBackup from "./SavedViewsBackup";
import { legacyRelation } from "../lib/client/relation-state";
import type { RelationCondition } from "../lib/domain/relation-conditions";
import { relationSummary } from "../lib/i18n/relation-condition";

const summary = (conditions: ViewConditions, locale: string) => conditionSummary(conditions.predicates, conditions.contributionRoles, locale, conditions.organizationPositions, conditions.eventRoles);

const textMessages = savedViewLabels();
export default function SavedViews({ dataset, root, conditions, relation, onOpen, onOpenRelation, onClose }: {
  dataset: DatasetMode; root: EntitySummary | null; conditions: ViewConditions;
  relation?: RelationCondition; onOpenRelation?: (entity: EntitySummary, relation: RelationCondition, signal: AbortSignal) => Promise<boolean>;
  onOpen: (entity: EntitySummary, conditions: ViewConditions) => void; onClose: () => void;
}) {
  const { locale } = useUiLocale();
  const text = savedViewLabels(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState(root?.name.slice(0, SAVED_VIEW_TITLE_LIMIT) ?? "");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ id: string; message: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reportStorageError = (error: unknown) => {
    setStorageError(error instanceof SavedViewsError ? text[error.reason] : text.storage);
    if (error instanceof SavedViewsError && error.reason === "invalid") setReady(false);
  };
  const reload = () => {
    try { setViews(readSavedViews(window.localStorage, dataset)); setStorageError(null); setReady(true); }
    catch (error) { reportStorageError(error); setReady(false); }
  };
  useEffect(() => {
    dialog.current?.showModal();
    const refresh = () => {
      try { setViews(readSavedViews(window.localStorage, dataset)); setStorageError(null); setReady(true); }
      catch (error) { setStorageError(error instanceof SavedViewsError ? textMessages[error.reason] : textMessages.storage); setReady(false); }
    };
    refresh();
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key === savedViewsKey(dataset) || event.key === savedViewsKey(dataset).replace(/:v2$/, "")) refresh();
    };
    window.addEventListener("storage", changed);
    return () => { pending.current?.abort(); window.removeEventListener("storage", changed); };
  }, [dataset]);
  const close = () => { pending.current?.abort(); dialog.current?.close(); onClose(); };
  const backdrop = useDialogBackdrop(close);
  const save = () => {
    if (!root || !title.trim()) return;
    try {
      const views = editSavedViews(window.localStorage, dataset, { add: {
        version: 2, id: crypto.randomUUID(), title: title.trim(), rootId: root.id, relation: relation ?? legacyRelation(conditions), createdAt: new Date().toISOString(),
      } });
      setViews(views); setStorageError(null); setMessage(text.saved);
    } catch (error) { setMessage(null); reportStorageError(error); }
  };
  const remove = (id: string) => {
    try {
      setViews(editSavedViews(window.localStorage, dataset, { remove: id }));
      setStorageError(null); setMessage(text.removed); setOpenError(null);
    } catch (error) { setMessage(null); reportStorageError(error); }
  };
  const open = async (view: SavedView) => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setOpening(view.id); setOpenError(null); setMessage(null);
    try {
      const response = await fetchEntity(view.rootId, controller.signal);
      if (controller.signal.aborted) return;
      const entity = entitySummarySchema.strip().parse(response.entity);
      if (entity.id !== view.rootId) throw new Error("Unexpected root");
      if (onOpenRelation) {
        if (!await onOpenRelation(entity, view.relation, controller.signal)) throw new Error("Apply failed");
        if (controller.signal.aborted) return;
      } else if (view.relation.type === "adjacent" && view.relation.polarity === "all-records") {
        const { predicates, contributionRoles, organizationPositions, eventRoles } = view.relation;
        onOpen(entity, { predicates, contributionRoles, organizationPositions, eventRoles });
      }
      else throw new Error("Unsupported relation executor");
      close();
    } catch (error) {
      if (controller.signal.aborted) return;
      setOpenError({ id: view.id, message: error instanceof ClientApiError && error.status === 404 ? text.missing : text.failed });
    } finally {
      if (!controller.signal.aborted) setOpening(null);
      if (pending.current === controller) pending.current = null;
    }
  };
  return <dialog lang={locale} ref={dialog} className={`${styles.conditionDialog} ${styles.savedViews}`} aria-labelledby="saved-views-title" onCancel={event => { event.preventDefault(); close(); }} {...backdrop}>
    <div className={styles.conditionTitle}><h2 id="saved-views-title"><Icon name="bookmark" />{text.title}</h2><DialogCloseButton label={text.close} onClick={close} /></div>
    <p className={styles.intro}>{locale === "en" ? "Keep a starting point and its search conditions." : "気になる起点と条件を保存して、また訪れる。"}</p>
    {root ? <form className={styles.savedViewForm} onSubmit={event => { event.preventDefault(); save(); }}>
      <p>{text.root}：<strong>{root.name}</strong></p>
      <p className={styles.muted}>{relation ? relationSummary(relation, locale) : summary(conditions, locale)}</p>
      <label htmlFor="saved-view-name">{text.name}</label>
      <div className={styles.saveControls}><input id="saved-view-name" value={title} maxLength={SAVED_VIEW_TITLE_LIMIT} required onChange={event => setTitle(event.target.value)} />
      <button data-variant="primary" aria-label={text.save} disabled={!ready || !!opening || !title.trim() || views.length >= SAVED_VIEW_LIMIT}>{locale === "en" ? "Save" : "保存"}</button></div>
    </form> : <p className={styles.empty}>{text.noRoot}</p>}
    {message && <p role="status">{contentMessage(message, locale)}</p>}
    {storageError && <div role="alert" className={styles.error}><p>{contentMessage(storageError, locale)}</p><button onClick={reload}>{text.retry}</button></div>}
    <div className={styles.listHeading}><h3>{text.list}</h3><span>{views.length} / {SAVED_VIEW_LIMIT}</span></div>
    {views.length >= SAVED_VIEW_LIMIT && <p>{text.limit}</p>}
    {ready && views.length === 0 && <p className={styles.empty}>{text.empty}</p>}
    <ul className={styles.savedViewList}>{views.map(view => <li key={view.id}>
      <button className={styles.viewLink} disabled={!ready || !!opening} aria-label={text.openNamed(view.title)} onClick={() => void open(view)}>
        <span><strong>{view.title}</strong><span className={styles.muted}>{relationSummary(view.relation, locale)}</span><time className={styles.muted} dateTime={view.createdAt}>{text.savedAt(view.createdAt)}</time></span><Icon name="arrow" />
      </button>
      <button className={styles.iconButton} disabled={!ready || !!opening} title={text.removeNamed(view.title)} aria-label={text.removeNamed(view.title)} onClick={() => remove(view.id)}><Icon name="trash" /></button>
      {opening === view.id && <p role="status">{text.opening}</p>}
      {openError?.id === view.id && <p role="alert" className={styles.error}>{contentMessage(openError.message, locale)}</p>}
    </li>)}</ul>
    <SavedViewsBackup key={dataset} dataset={dataset} views={views} ready={ready} disabled={!!opening} onImported={views => {
      setViews(views); setStorageError(null); setMessage(null); setOpenError(null);
    }} />
  </dialog>;
}
