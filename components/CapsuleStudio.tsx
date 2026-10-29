"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { claimDetailSchema, entityDetailSchema, type ClaimDetail, type EntityDetail, type NeighborsResponse } from "../lib/domain/api";
import { type CapsuleDocument, type CapsuleEvidence, type CapsuleNode } from "../lib/domain/capsule-document";
import { capsuleHistory, capsuleClone, recordCapsule, undoCapsule, redoCapsule, sameCapsuleValue, withCapsuleView, withDocument, removeCapsuleElements, snapshotEntity, snapshotClaim, compareCapsuleNeighborhood, type CapsuleNeighborhoodComparison } from "../lib/client/capsule-editor";
import { capsulePresentation } from "../lib/client/capsule-presentation";
import { capsuleSchema, type LocalCapsule } from "../lib/client/local-capsules";
import { emptyGraph, type Selection } from "../lib/client/graph-state";
import { type GraphView } from "../lib/client/graph-view";
import { ClientApiError, fetchClaim, fetchDatasetRevision, fetchEntity, fetchNeighbors, searchEntities } from "../lib/client/api";
import { useUiLocale } from "../lib/client/ui-locale";
import { readingHref } from "../lib/client/reading-reference";
import { relationLabel, formatPeriod, polarityLabel, qualificationLabel } from "../lib/client/format";
import GraphCanvas, { type GraphCanvasHandle } from "./GraphCanvas";
import { ClaimCard } from "./ClaimDetails";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";

type Props = { capsule: LocalCapsule; isNew?: boolean; readOnly?: boolean; destination?: string; onClose?: () => void; onSave?: (value: LocalCapsule, asCopy: boolean) => Promise<LocalCapsule>; sharing?: ReactNode; locked?: boolean; capacity?: { documents: boolean; storageBytes: number; totalBytes: number } | null };
type Editor = { kind: "capsule" | "node" | "relation" | "text" | "evidence"; keys: string[]; fresh?: boolean; title: string; description: string; badge: string; style: "note" | "heading" | "muted"; url: string; locator: string; supports: CapsuleEvidence["supports"]; stance: CapsuleEvidence["stance"] };
type Comparison = { key: string; state: "same" | "changed" | "missing" | "failed"; entity?: EntityDetail; claim?: ClaimDetail; revision?: string | null; neighborhood?: CapsuleNeighborhoodComparison };
const noAction = () => {};

export default function CapsuleStudio({ capsule, isNew = false, readOnly = false, destination, onClose, onSave, sharing, capacity, locked = false }: Props) {
  const { locale } = useUiLocale();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  const evidenceSupports = { identity: t("対象の同定", "Identity"), name: t("名称", "Name"), description: t("説明・属性", "Description / attribute"), relation: t("この関係", "This relation") };
  const evidenceStances = { support: t("支持", "Support"), refute: t("反証", "Refute"), background: t("背景・参考", "Background") };
  const [saved, setSaved] = useState<LocalCapsule | null>(isNew ? null : capsule);
  const [history, setHistory] = useState(() => capsuleHistory(capsuleClone(capsule)));
  const [editing, setEditing] = useState(isNew && !readOnly);
  const [generation, setGeneration] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [search, setSearch] = useState(false);
  const [query, setQuery] = useState(""), [results, setResults] = useState<EntityDetail[]>([]), [searched, setSearched] = useState(false);
  const [neighbors, setNeighbors] = useState<{ node: CapsuleNode; value: NeighborsResponse } | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [leave, setLeave] = useState<"close" | "discard" | string | null>(null), [shareOpen, setShareOpen] = useState(false);
  const canvas = useRef<GraphCanvasHandle>(null), modal = useRef<HTMLDialogElement>(null), active = useRef<AbortController | null>(null);
  const [suspendedView, setSuspendedView] = useState<{ generation: number; view: GraphView } | null>(null);
  // React detaches the imperative ref before Cytoscape's passive cleanup.
  // Keep the transient view while private content is hidden for revalidation;
  // this does not save the document or add a viewing move to edit history.
  const bindCanvas = useCallback((handle: GraphCanvasHandle | null) => {
    canvas.current = handle;
    if (!handle) return;
    return () => {
      const captured = handle.capture();
      if (captured) setSuspendedView({ generation, view: captured });
      if (canvas.current === handle) canvas.current = null;
    };
  }, [generation]);
  const newlyAdded = useRef<string | null>(null);
  const [beforeEdit, setBeforeEdit] = useState({ capsule: capsuleClone(capsule), selected: [] as string[], selection: null as Selection });
  const historyRef = useRef(history); useEffect(() => { historyRef.current = history; }, [history]);
  const value = history.present, contentDocument = value.document!;
  const presentation = useMemo(() => capsulePresentation(contentDocument, locale), [contentDocument, locale]);
  const graph = useMemo(() => emptyGraph(generation), [generation]);
  const view = useMemo(() => ({ generation, view: suspendedView?.generation === generation ? suspendedView.view : { ...contentDocument.layout, initialLayoutDone: true } }), [generation, contentDocument.layout, suspendedView]);
  const current = () => withCapsuleView(historyRef.current.present, canvas.current?.capture() ?? null);
  const dirty = editing && (!saved || !sameCapsuleValue(value, saved));
  const editingChanged = editing && !sameCapsuleValue(value, beforeEdit.capsule);
  const dirtyRef = useRef(dirty); useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const selectedNodes = contentDocument.nodes.filter(n => selected.includes(n.key));
  const expandedKeys = [...new Set(selected.flatMap(id => presentation.members[id] ?? [id]))];
  const node = contentDocument.nodes.find(n => n.key === selection?.id);
  const text = contentDocument.texts.find(n => n.key === selection?.id);
  const relationKeys = selection?.kind === "relation" ? presentation.members[selection.id] ?? [] : [];
  const relations = contentDocument.relations.filter(r => relationKeys.includes(r.key));
  const evidenceTargets = new Set(node ? [node.key] : relationKeys);
  const evidences = contentDocument.evidence.filter(e => evidenceTargets.has(e.targetKey));
  const byteSize = new TextEncoder().encode(JSON.stringify(value)).byteLength;

  useEffect(() => {
    if ((editor || search) && modal.current && !modal.current.open) modal.current.showModal();
  }, [editor, search, locked]);
  useEffect(() => {
    if (newlyAdded.current) { canvas.current?.ensureVisible?.(newlyAdded.current); newlyAdded.current = null; }
  }, [generation]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
      const anchor = (event.target as Element)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      event.preventDefault(); event.stopPropagation(); setLeave(anchor.href);
    };
    window.addEventListener("beforeunload", beforeUnload); window.document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.document.removeEventListener("click", navigation, true); };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!editing || locked || busy || editor || search || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || (event.target as Element)?.closest("input,textarea,[contenteditable=true]")) return;
      event.preventDefault(); setHistory(h => event.shiftKey ? redoCapsule(h) : undoCapsule(h)); setGeneration(v => v + 1);
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [editing, locked, busy, editor, search]);
  const navigationGuard = useRef<{ token: string; active: boolean } | null>(null);
  useEffect(() => {
    if (!editing) return;
    // A same-URL entry lets Back ask about the draft before the router leaves
    // this workspace. Nothing is written to browser content storage.
    if (!navigationGuard.current) navigationGuard.current = { token: crypto.randomUUID(), active: true };
    const guard = navigationGuard.current; guard.active = true; const marker = guard.token;
    if (window.history.state?.plunodeCapsuleGuard !== marker) window.history.pushState({ ...window.history.state, plunodeCapsuleGuard: marker }, "", window.location.href);
    const pop = (event: PopStateEvent) => {
      if (window.history.state?.plunodeCapsuleGuard === marker || !dirtyRef.current) return;
      event.stopImmediatePropagation(); window.history.forward(); setLeave("back");
    };
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("popstate", pop, true);
      guard.active = false;
      queueMicrotask(() => { if (!guard.active && window.history.state?.plunodeCapsuleGuard === marker) window.history.back(); });
    };
  }, [editing]);

  function commit(next: LocalCapsule, reveal?: string) {
    try {
      const parsed = capsuleSchema.parse(next);
      if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 2_000_000) throw Error("limit");
      newlyAdded.current = reveal ?? null;
      setHistory(h => recordCapsule(h, parsed)); setGeneration(v => v + 1); setError(null); setMessage(null); return true;
    } catch { setError(t("保存できる内容の上限または形式を確認してください。入力は残しています。", "Check the content limits or fields. Your input is retained.")); return false; }
  }
  function changeDocument(next: CapsuleDocument) { commit(withDocument(current(), next)); }
  function begin() {
    const starting = current(); setBeforeEdit({ capsule: capsuleClone(starting), selected: [...selected], selection });
    setHistory(capsuleHistory(starting)); setEditing(true); setGeneration(v => v + 1); setShareOpen(false); setMessage(null);
  }
  function discard() {
    if (!saved) { onClose?.(); return; }
    setHistory(capsuleHistory(beforeEdit.capsule)); setSelected(beforeEdit.selected); setSelection(beforeEdit.selection);
    setGeneration(v => v + 1); setEditing(false); setLeave(null); setError(null);
  }
  async function save(asCopy = false, next: string | null = null) {
    if (!onSave || locked || busy || capacity?.documents === false) return;
    setBusy(true); setError(null);
    try {
      const result = await onSave(current(), asCopy);
      setSaved(result); setHistory(capsuleHistory(result)); setEditing(false); setGeneration(v => v + 1); setLeave(null);
      setMessage(t("Capsuleを保存しました。", "Capsule saved."));
      dirtyRef.current = false;
      if (next === "close" || next === "back") onClose?.(); else if (next && next !== "discard") window.location.assign(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("保存できませんでした。編集中の内容は残っています。", "Could not save. Your draft is retained.")); }
    finally { setBusy(false); }
  }
  function blankEditor(kind: Editor["kind"], keys: string[] = [], fresh = false): Editor {
    return { kind, keys, fresh, title: "", description: "", badge: "", style: "note", url: "", locator: "", supports: kind === "evidence" && relations.length ? "relation" : "description", stance: "background" };
  }
  function openEditor(kind: Editor["kind"], fresh = false) {
    let draft = blankEditor(kind, kind === "relation" ? relationKeys : selection ? [selection.id] : [], fresh);
    if (!fresh) {
      if (kind === "capsule") draft = { ...draft, title: value.title, description: value.note };
      if (kind === "node" && node) draft = { ...draft, title: node.title, description: node.description, badge: node.badge };
      if (kind === "relation" && relations.length) draft = { ...draft, title: relations[0].label, description: relations[0].note };
      if (kind === "text" && text) draft = { ...draft, title: text.text, style: text.style };
    }
    setEditor(draft); setError(null);
  }
  function connectAdded(next: CapsuleDocument, target: string): CapsuleDocument {
    if (!node || node.key === target) return next;
    return { ...next, relations: [...next.relations, { key: crypto.randomUUID(), source: node.key, target, label: t("関係する", "Related"), note: "", origin: { kind: "local" } }] };
  }
  function submitEditor() {
    if (!editor) return;
    if (editor.kind === "evidence" && editor.url && !/^https?:\/\//i.test(editor.url)) { setError(t("資料URLはhttpまたはhttpsを指定してください。", "Use an http or https source URL.")); return; }
    if (editor.kind === "node" && editor.fresh && contentDocument.nodes.length >= 200 || editor.kind === "text" && editor.fresh && contentDocument.texts.length >= 100 || editor.kind === "evidence" && contentDocument.evidence.length + (node ? 1 : relationKeys.length) > 1000) { setError(t("この種類の要素数が上限に達しています。", "The limit for this element type has been reached.")); return; }
    const source = current(), doc = capsuleClone(source.document!);
    if (editor.kind === "capsule") { if (commit({ ...source, title: editor.title, note: editor.description })) setEditor(null); return; }
    if (editor.kind === "node") {
      if (editor.fresh) {
        const key = crypto.randomUUID(); doc.nodes.push({ key, title: editor.title, description: editor.description, badge: editor.badge, origin: { kind: "local" } });
        const next = connectAdded(doc, key); if (!commit(withDocument(source, next), key)) return; setSelected([key]); setSelection({ kind: "entity", id: key });
      } else { doc.nodes = doc.nodes.map(n => editor.keys.includes(n.key) ? { ...n, title: editor.title, description: editor.description, badge: editor.badge } : n); if (!commit(withDocument(source, doc))) return; }
    } else if (editor.kind === "relation") { doc.relations = doc.relations.map(r => editor.keys.includes(r.key) ? { ...r, label: editor.title, note: editor.description } : r); if (!commit(withDocument(source, doc))) return; }
    else if (editor.kind === "text") {
      if (editor.fresh) {
        const key = crypto.randomUUID(); doc.texts.push({ key, text: editor.title, style: editor.style });
        if (!commit(withDocument(source, doc), key)) return; setSelection({ kind: "entity", id: key }); setSelected([key]);
      } else { doc.texts = doc.texts.map(n => editor.keys.includes(n.key) ? { ...n, text: editor.title, style: editor.style } : n); if (!commit(withDocument(source, doc))) return; }
    } else {
      const targets = node ? [node.key] : relationKeys;
      for (const targetKey of targets) doc.evidence.push({ key: crypto.randomUUID(), targetKey, title: editor.title, url: editor.url || null, locator: editor.locator, note: editor.description, supports: editor.supports, stance: editor.stance });
      if (!commit(withDocument(source, doc))) return;
    }
    setEditor(null);
  }
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null);
    try { await action(controller.signal); } catch { if (!controller.signal.aborted) setError(t("取得できませんでした。もう一度お試しください。", "Could not load. Please retry.")); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function addEntity(entity: EntityDetail) {
    const source = current(), doc = capsuleClone(source.document!);
    const existing = doc.nodes.find(n => n.origin.kind !== "local" && n.origin.id === entity.id);
    const key = existing?.key ?? entity.id;
    if (!existing) doc.nodes.push({ key, title: entity.name, description: entity.description ?? "", badge: "", origin: { kind: "kg", id: entity.id, capturedAt: new Date().toISOString(), revision: null, snapshot: snapshotEntity(entity), detail: entity, neighbors: { state: "unknown", scope: "not queried", claimIds: [] } } });
    if (!commit(withDocument(source, connectAdded(doc, key)), key)) return; setSearch(false); setSelection({ kind: "entity", id: key }); setSelected([key]);
  }
  async function compare() {
    const target = node ?? relations[0];
    if (!target || target.origin.kind === "local") return;
    const id = target.origin.id;
    await run(async signal => {
      const revision = value.dataset === "public-kg" ? (await fetchDatasetRevision(signal)).revision : null;
      try {
        if (node) {
          const entity = entityDetailSchema.parse((await fetchEntity(id, signal)).entity);
          if (entity.id !== id) throw Error();
          const neighborhood = await compareCapsuleNeighborhood(node, revision, signal);
          if (revision && (await fetchDatasetRevision(signal)).revision !== revision) throw Error();
          const baseline = node.origin.kind === "kg" ? node.origin.detail ?? node.origin.snapshot : null;
          const same = baseline && sameCapsuleValue(baseline, node.origin.kind === "kg" && node.origin.detail ? entity : snapshotEntity(entity));
          setComparison({ key: target.key, state: same ? "same" : "changed", entity, revision, neighborhood });
        } else {
          const claim = claimDetailSchema.parse((await fetchClaim(id, signal, revision)).claim);
          if (claim.id !== id) throw Error();
          const baseline = target.origin.kind === "kg" && "sourceCount" in target.origin.snapshot ? target.origin.detail ?? target.origin.snapshot : null;
          const same = sameCapsuleValue(baseline, target.origin.kind === "kg" && target.origin.detail ? claim : snapshotClaim(claim));
          setComparison({ key: target.key, state: same ? "same" : "changed", claim, revision });
        }
      } catch (cause) { if (!signal.aborted) setComparison({ key: target.key, state: cause instanceof ClientApiError && cause.status === 404 ? "missing" : "failed" }); }
    });
  }
  function adoptComparison() {
    if (!comparison) return;
    const source = current(), doc = capsuleClone(source.document!), capturedAt = new Date().toISOString();
    if (comparison.entity) doc.nodes = doc.nodes.map(n => {
      if (n.key !== comparison.key || n.origin.kind === "local") return n;
      const e = comparison.entity!, old = n.origin.kind === "kg" ? n.origin.snapshot : null;
      return { ...n, title: !old || n.title === old.name ? e.name : n.title, description: !old || n.description === (old.description ?? "") ? e.description ?? "" : n.description,
        origin: { kind: "kg", id: e.id, capturedAt, revision: comparison.revision ?? null, snapshot: snapshotEntity(e), detail: e,
          neighbors: n.origin.kind === "kg" ? { capturedAt: n.origin.capturedAt, revision: n.origin.revision, ...n.origin.neighbors } : { state: "unknown", scope: "not queried", claimIds: [] } } };
    });
    if (comparison.claim) doc.relations = doc.relations.map(r => r.key === comparison.key ? { ...r, origin: { kind: "kg", id: comparison.claim!.id, capturedAt, revision: comparison.revision ?? null, snapshot: snapshotClaim(comparison.claim!), detail: comparison.claim! } } : r);
    commit(withDocument(source, doc)); setComparison(null);
  }
  function openNeighbors(more = false) {
    const n = more ? neighbors?.node : node;
    if (!n || n.origin.kind === "local") return;
    const id = n.origin.id;
    void run(async signal => {
      const result = await fetchNeighbors(id, more ? neighbors?.value.page.nextCursor ?? null : null, signal);
      if (result.centerId !== id || result.claims.some(c => c.subjectId !== id && c.objectId !== id)) throw Error();
      setNeighbors({ node: n, value: result });
    });
  }
  function addNeighbor(id: string) {
    if (!neighbors) return;
    const source = current(), doc = capsuleClone(source.document!), claim = neighbors.value.claims.find(c => c.id === id);
    if (!claim) return;
    const capturedAt = new Date().toISOString();
    for (const entityId of [claim.subjectId, claim.objectId]) {
      if (doc.nodes.some(n => n.origin.kind !== "local" && n.origin.id === entityId)) continue;
      const e = neighbors.value.nodes.find(n => n.id === entityId); if (!e) return;
      doc.nodes.push({ key: e.id, title: e.name, description: e.description ?? "", badge: "", origin: { kind: "kg", id: e.id, capturedAt, revision: neighbors.value.revision ?? null, snapshot: snapshotEntity(e), detail: null, neighbors: { state: "unknown", scope: "not queried", claimIds: [] } } });
    }
    if (!doc.relations.some(r => r.origin.kind === "kg" && r.origin.id === id)) doc.relations.push({ key: id, source: doc.nodes.find(n => n.origin.kind !== "local" && n.origin.id === claim.subjectId)!.key, target: doc.nodes.find(n => n.origin.kind !== "local" && n.origin.id === claim.objectId)!.key, label: "", note: "", origin: { kind: "kg", id, capturedAt, revision: neighbors.value.revision ?? null, snapshot: snapshotClaim(claim), detail: null } });
    const added = doc.nodes.find(n => !source.document!.nodes.some(previous => previous.key === n.key));
    if (commit(withDocument(source, doc), added?.key) && added) { setSelected([added.key]); setSelection({ kind: "entity", id: added.key }); }
  }
  function finishLeave() {
    const next = leave; dirtyRef.current = false;
    if (next === "discard") discard(); else if (next === "back") { if (onClose) onClose(); else discard(); } else if (next === "close") onClose?.(); else if (next) window.location.assign(next);
  }
  if (locked) return <section className={css.studio}><p className={css.notice}>{t("編集中の内容は元のアカウントに紐づいています。同じアカウントで再ログインすると再開できます。", "This draft belongs to the original account. Sign in to that account to continue.")}</p><a href="/member" target="_blank" rel="noopener noreferrer">{t("ログインを確認", "Check sign-in")}</a>{onClose && <button onClick={() => setLeave("close")}>{t("閉じる", "Close")}</button>}{leave && <p><button onClick={() => { dirtyRef.current = false; onClose?.(); }}>{t("入力を破棄して閉じる", "Discard and close")}</button><button onClick={() => setLeave(null)}>{t("戻る", "Back")}</button></p>}</section>;

  return <section className={`${css.studio} ${editing ? css.editing : ""}`} aria-label={t("Capsule", "Capsule")}>
    <header className={css.header}><div className={css.identity}><span className={css.eyebrow}><Icon name="capsule" />Capsule {editing && `· ${t("編集中", "Editing")}`}</span><h2>{value.title}</h2><p className={css.status}>{destination} {saved ? `· ${t("保存版", "Saved revision")} ${saved.revision}` : t("未保存", "Not saved")} {dirty && `· ${t("未保存の変更", "Unsaved changes")}`}</p></div>
      <div className={css.actions}>{editing ? <><button disabled={busy} onClick={() => openEditor("capsule")}>{t("タイトル・説明", "Title & description")}</button><button disabled={busy} onClick={() => editingChanged || !saved ? setLeave("discard") : discard()}>{t("破棄", "Discard")}</button><button data-variant="primary" disabled={busy || !onSave || capacity?.documents === false} onClick={() => void save()}>{busy ? t("保存中…", "Saving…") : t("保存", "Save")}</button></> : <>{!readOnly && onSave && <button data-variant="primary" onClick={begin}>{t("編集", "Edit")}</button>}{sharing && <button onClick={() => { if (!shareOpen && saved) { setHistory(capsuleHistory(saved)); setGeneration(v => v + 1); } setShareOpen(v => !v); }}>{t("固定版を共有", "Share saved revision")}</button>}</>}{onClose && <button disabled={busy} aria-label={t("Capsuleを閉じる", "Close Capsule")} onClick={() => dirty ? setLeave("close") : onClose()}><Icon name="close" /></button>}</div>
    </header>
    {capacity?.documents === false && <p className={css.notice} role="status">{t("アカウントのCapsule保存は更新準備中です。入力はこの画面で保持しています。", "Account Capsule storage is being updated. Your draft is retained on this screen.")}</p>}
    {capacity && editing && <p className={css.status} style={{ padding: "8px 20px" }}>{t("アカウント使用量", "Account storage")}: {(capacity.storageBytes / 1_000_000).toFixed(1)} / {Math.round(capacity.totalBytes / 1_000_000)} MB {capacity.totalBytes - capacity.storageBytes < 2_000_000 && t("· 残り容量が少なくなっています。", "· Storage is nearly full.")}</p>}
    {(error || message) && <p className={css.notice} role={error ? "alert" : "status"}>{error ?? message}{error && editing && onSave && <button disabled={busy} onClick={() => void save(true)}>{t("別のCapsuleとして保存", "Save as a new Capsule")}</button>}</p>}
    {leave && <div className={css.notice} role="alert"><p>{t("未保存の変更があります。保存してから移動するか、変更を破棄できます。", "You have unsaved changes. Save them or discard them before leaving.")}</p><div className={css.actions}><button disabled={busy} onClick={() => void save(false, leave)}>{t("保存", "Save")}</button><button disabled={busy} onClick={finishLeave}>{t("変更を破棄", "Discard changes")}</button><button onClick={() => setLeave(null)}>{t("編集に戻る", "Continue editing")}</button></div></div>}
    {shareOpen && <div className={css.tray}><h3>{t("相手に見える保存版", "Saved revision to share")}</h3><p>{t("下の図・説明・根拠をこの保存版として共有します。後で編集しても共有版は変わりません。", "The graph, description, and evidence below form the shared revision. Later edits do not change it.")}</p>{sharing}</div>}
    <div className={css.body} inert={busy}><div><div className={css.graph}><GraphCanvas ref={bindCanvas} compactGuide contentOnly graph={graph} content={presentation} restoration={view} selection={selection} selectedKeys={selected} onSelectionChange={ids => { setSelected(ids); if (!ids.length) setSelection(null); }}
      onEntity={id => { setSelection({ kind: "entity", id }); setComparison(null); }} onRelation={id => { setSelection({ kind: "relation", id }); setComparison(null); }} onToggleEntity={noAction}
      onMove={(before: GraphView, after: GraphView) => { if (editing) setHistory(h => recordCapsule({ ...h, present: withCapsuleView(h.present, before) }, withCapsuleView(h.present, after))); }}
      onContextMenu={editing ? (id, kind) => { setSelected([id]); setSelection({ kind: kind === "edge" ? "relation" : "entity", id }); documentElementFocus(); } : undefined}
      footerAction={<span className={css.status}>{selected.length > 1 ? `${selected.length} ${t("要素を選択・まとめて移動", "selected · drag together")}` : t("Ctrl / ⌘クリックで複数選択", "Ctrl / ⌘ click to select multiple")}</span>} /></div>
      <div className={css.toolbar}>{editing ? <><button disabled={!history.past.length || busy} onClick={() => { setHistory(undoCapsule); setGeneration(v => v + 1); }}>↶ {t("戻す", "Undo")}</button><button disabled={!history.future.length || busy} onClick={() => { setHistory(redoCapsule); setGeneration(v => v + 1); }}>↷ {t("やり直す", "Redo")}</button><button disabled={busy} onClick={() => openEditor("node", true)}><Icon name="plus" />{t("独自Entity", "Custom entity")}</button><button disabled={busy} onClick={() => { setSearch(true); setResults([]); setSearched(false); }}>{t("KGから検索", "Search KG")}</button><button disabled={busy} onClick={() => openEditor("text", true)}>{t("テキスト", "Text")}</button>{selectedNodes.length === 2 && <button disabled={busy} onClick={() => { const source = current(), doc = capsuleClone(source.document!); doc.relations.push({ key: crypto.randomUUID(), source: selectedNodes[0].key, target: selectedNodes[1].key, label: t("関係する", "Related"), note: "", origin: { kind: "local" } }); commit(withDocument(source, doc)); }}>{t("選択した2対象をつなぐ", "Connect selected entities")}</button>}<button disabled title={t("知識登録は準備中です。保存や共有から申請されることはありません。", "Knowledge submissions are being prepared. Saving and sharing do not submit anything.")}>{t("知識登録・準備中", "Submit knowledge · coming later")}</button></> : <><button onClick={() => { if (saved) { setHistory(capsuleHistory(saved)); setGeneration(v => v + 1); } }}>{t("保存位置へ戻す", "Reset to saved layout")}</button><span className={css.status}>{t("閲覧中の移動は保存されません。編集すると今の配置を引き継ぎます。", "Moves while viewing are temporary. Editing starts from this layout.")}</span></>}</div>
    </div>
    <aside className={css.detail} id={`capsule-detail-${value.id}`} tabIndex={-1}>
      {selected.length > 1 && <><h3>{selected.length} {t("要素を選択", "elements selected")}</h3><p>{t("選択したノードを一緒に動かせます。", "Drag a selected node to move the group.")}</p></>}
      {!selection && <><h3>{t("このCapsuleについて", "About this Capsule")}</h3><p>{value.note || t("ノードや線を選ぶと詳細・根拠が表示されます。", "Select a node or line to see details and evidence.")}</p><p className={css.status}>{contentDocument.nodes.length} Entity · {contentDocument.relations.length} {t("関係", "relations")} · {contentDocument.texts.length} {t("テキスト", "texts")}</p></>}
      {node && <><span className={css.badge}>{node.origin.kind === "local" ? t("Capsule独自", "Capsule local") : node.origin.kind === "unresolved" ? t("未取得のKG参照", "Unresolved KG reference") : t("KGから取り込み", "Captured from KG")}</span>{node.badge && <span className={css.badge}>{node.badge}</span>}<h3>{node.title}</h3><p>{node.description}</p></>}
      {text && <><h3>{t("テキスト", "Text")}</h3><p>{text.text}</p></>}
      {relations.map(r => <div key={r.key}><span className={css.badge}>{r.origin.kind === "local" ? t("Capsule独自の関係", "Capsule local relation") : t("KGの個別Claim", "Individual KG claim")}</span><h3>{r.label || (r.origin.kind === "kg" ? relationLabel(r.origin.snapshot, locale) : t("関係する", "Related"))}</h3><p>{r.note}</p>{r.origin.kind === "kg" && <><p>{[polarityLabel(r.origin.snapshot, locale), qualificationLabel(r.origin.snapshot, locale), formatPeriod(r.origin.snapshot.period, locale)].filter(Boolean).join(" / ")}</p>{r.origin.detail ? <ClaimCard referenceDataset={value.dataset} idPrefix="capsule-studio-" title={t("取り込み済みの根拠", "Captured evidence")} claim={r.origin.detail} nodes={Object.fromEntries(contentDocument.nodes.flatMap(n => n.origin.kind === "kg" ? [[n.origin.id, n.origin.snapshot]] : []))} /> : <p className={css.status}>{r.origin.snapshot.sourceCount === 0 ? t("取り込み時のKG応答：出典0件。", "The captured KG response reported no sources.") : t(`取り込み時の出典数：${r.origin.snapshot.sourceCount}。根拠の詳細は未取得です。`, `Sources at capture: ${r.origin.snapshot.sourceCount}. Evidence details were not captured.`)}</p>}</>}</div>)}
      {editing && selection && <div className={css.actions} data-capsule-actions><button onClick={() => openEditor(text ? "text" : node ? "node" : "relation")}>… {t("編集", "Edit")}</button>{(node || relations.length > 0) && <button onClick={() => openEditor("evidence")}>{t("根拠を追加", "Add evidence")}</button>}<button onClick={() => { changeDocument(removeCapsuleElements(current().document!, expandedKeys.length ? expandedKeys : [selection.id])); setSelected([]); setSelection(null); }}>{t("Capsuleから外す", "Remove from Capsule")}</button>{node && node.origin.kind !== "local" && <button disabled={busy} onClick={() => openNeighbors()}>{t("関係先から追加", "Add related KG entities")}</button>}</div>}
      {evidences.map(e => <article className={css.evidence} key={e.key}><strong>{e.title}</strong><p>{e.locator}</p><p>{e.note}</p><span className={css.badge}>{evidenceSupports[e.supports]} · {evidenceStances[e.stance]}</span>{e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">{t("資料を開く", "Open source")}</a>}{editing && <button onClick={() => changeDocument({ ...current().document!, evidence: contentDocument.evidence.filter(item => item.key !== e.key) })}>{t("外す", "Remove")}</button>}</article>)}
      {(node && node.origin.kind !== "local" || relations.some(r => r.origin.kind === "kg")) && <details><summary>{t("元のKG・現在と比較", "Original KG · compare current data")}</summary>{node?.origin.kind === "kg" && <><p>{t("取り込み時", "Captured")}: {new Date(node.origin.capturedAt).toLocaleString(locale)}</p><p>{node.origin.snapshot.name} · {node.origin.snapshot.description}</p><p className={css.status}>{node.origin.neighbors.state === "unknown" ? t("関係先の全体は未確認です。", "The neighborhood was not fully queried.") : t("取り込み時の確認範囲を保持しています。KG全体に他の関係がないという意味ではありません。", "The captured query scope is retained; this does not assert that no other KG relations exist.")}</p><details><summary>{t("確認範囲", "Query scope")}</summary><pre>{JSON.stringify(node.origin.neighbors, null, 2)}</pre></details></>}
        <button disabled={busy} onClick={() => void compare()}>{t("現在のKGを確認", "Check current KG")}</button>
        {comparison && (comparison.key === node?.key || relationKeys.includes(comparison.key)) && <div role="status"><p>{comparison.state === "same" ? t("取得済みの比較範囲では変更はありません。", "No change in the captured comparison scope.") : comparison.state === "changed" ? t("現在のKGに異なる内容があります。保存内容は変えていません。", "Current KG data differs. Your saved content is unchanged.") : comparison.state === "missing" ? t("現在は参照できません。保存した内容は保持しています。", "Currently unavailable. The captured content is retained.") : t("比較できませんでした。再試行できます。", "Comparison failed. You can retry.")}</p>{comparison.entity && <p>{comparison.entity.name}<br />{comparison.entity.description}</p>}{comparison.neighborhood && <p>{comparison.neighborhood.state === "changed" ? t(`同じ確認範囲の関係が変わりました：追加 ${comparison.neighborhood.added.length} 件・参照できなくなった関係 ${comparison.neighborhood.removed.length} 件。`, `The same query scope changed: ${comparison.neighborhood.added.length} added and ${comparison.neighborhood.removed.length} no longer available.`) : comparison.neighborhood.state === "same" ? t("同じ確認範囲の関係の有無にも変更はありません。", "Relation membership is unchanged in the same query scope.") : comparison.neighborhood.state === "failed" ? t("関係先の比較は取得失敗のため判定できません。", "The neighborhood comparison failed; its changes are unknown.") : t("関係先は部分取得・未確認または再実行できない範囲のため、変更の有無を判定していません。", "Neighborhood changes are unknown because the captured scope is partial, unqueried, or cannot be replayed.")}</p>}{comparison.claim && <p>{relationLabel(comparison.claim, locale)} · {comparison.claim.citations.length} {t("根拠", "citations")}{comparison.claim.withdrawal && ` · ${t("撤回", "Withdrawn")}`}</p>}{editing && (comparison.entity || comparison.claim) && <button onClick={adoptComparison}>{t("現在の内容・根拠を取り込む", "Capture current data & evidence")}</button>}</div>}
        <a target="_blank" rel="noopener noreferrer" href={readingHref({ dataset: value.dataset, kind: node ? "entity" : "claim", id: node && node.origin.kind !== "local" ? node.origin.id : relations.find(r => r.origin.kind === "kg")!.origin.kind === "kg" ? (relations.find(r => r.origin.kind === "kg")!.origin as { id: string }).id : "" })}>{t("元のKGを開く", "Open KG record")}</a>
      </details>}
    </aside></div>
    {neighbors && editing && !busy && <section className={css.tray}><div className={css.actions}><h3>{neighbors.node.title} · {t("KGの関係先", "KG neighbors")}</h3><button onClick={() => setNeighbors(null)}>{t("閉じる", "Close")}</button></div>{!neighbors.value.claims.length && <p>{t("この取得範囲には関係がありません。", "No relations in this query scope.")}</p>}<ul>{neighbors.value.claims.map(c => <li key={c.id}><button disabled={contentDocument.relations.some(r => r.origin.kind === "kg" && r.origin.id === c.id)} onClick={() => addNeighbor(c.id)}>{neighbors.value.nodes.find(n => n.id === c.subjectId)?.name} → {relationLabel(c, locale)} → {neighbors.value.nodes.find(n => n.id === c.objectId)?.name}<br /><small>{formatPeriod(c.period, locale)} · {polarityLabel(c, locale)}</small></button></li>)}</ul>{neighbors.value.page.hasMore && <button disabled={busy} onClick={() => openNeighbors(true)}>{t("次の関係先", "More neighbors")}</button>}</section>}
    <details className={css.tray} inert={busy}><summary>{t("Capsuleの内容一覧", "Capsule contents")} · {contentDocument.nodes.length + contentDocument.relations.length + contentDocument.texts.length}</summary><ul>{[...contentDocument.nodes.map(n => ({ key: n.key, title: n.title })), ...contentDocument.texts.map(n => ({ key: n.key, title: n.text }))].map(n => <li key={n.key}><button onClick={() => { setSelected([n.key]); setSelection({ kind: "entity", id: n.key }); canvas.current?.focusEntity(n.key); }}>{n.title}</button></li>)}{Object.values(presentation.relations).map(r => <li key={r.id}><button onClick={() => { setSelected([r.id]); setSelection({ kind: "relation", id: r.id }); canvas.current?.ensureVisible?.(r.id); }}>{contentDocument.nodes.find(n => n.key === r.subjectId)?.title} → {r.canvasLabel} → {contentDocument.nodes.find(n => n.key === r.objectId)?.title}</button></li>)}</ul>{!!contentDocument.unresolvedClaimIds.length && <p>{t("旧版から保持している未取得のClaim", "Unresolved claims retained from the legacy version")}: {contentDocument.unresolvedClaimIds.join(", ")}</p>}</details>
    {editing && (byteSize > 1_500_000 || contentDocument.nodes.length > 175 || contentDocument.relations.length > 350) && <p className={css.notice}>{t("保存上限に近づいています", "Approaching the save limit")}: {Math.ceil(byteSize / 1000)} / 2000 KB · {contentDocument.nodes.length}/200 Entity · {contentDocument.relations.length}/400 {t("関係", "relations")}</p>}
    {(editor || search) && <dialog ref={modal} className={css.modal} onCancel={event => { event.preventDefault(); setEditor(null); setSearch(false); }}>
      {error && <p role="alert">{error}</p>}
      {editor ? <form className={css.form} onSubmit={event => { event.preventDefault(); submitEditor(); }}><h3>{t("Capsule内の内容を編集", "Edit Capsule content")}</h3><label>{editor.kind === "text" ? t("テキスト", "Text") : editor.kind === "relation" ? t("表示ラベル（任意）", "Display label (optional)") : t("タイトル", "Title")}{editor.kind === "text" ? <textarea autoFocus required maxLength={4000} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} /> : <input autoFocus required={editor.kind !== "relation"} maxLength={editor.kind === "capsule" ? 80 : editor.kind === "evidence" ? 300 : 200} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} />}</label>
      {editor.kind !== "text" && <label>{t("説明・メモ（任意）", "Description / note (optional)")}<textarea maxLength={editor.kind === "capsule" || editor.kind === "evidence" ? 4000 : 8000} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} /></label>}
      {editor.kind === "node" && <label>{t("見た目の分類バッジ（任意）", "Visual category badge (optional)")}<input maxLength={60} value={editor.badge} onChange={e => setEditor({ ...editor, badge: e.target.value })} /></label>}
      {editor.kind === "text" && <label>{t("スタイル", "Style")}<select value={editor.style} onChange={e => setEditor({ ...editor, style: e.target.value as Editor["style"] })}><option value="note">{t("メモ", "Note")}</option><option value="heading">{t("見出し", "Heading")}</option><option value="muted">{t("控えめ", "Muted")}</option></select></label>}
      {editor.kind === "evidence" && <><label>URL {t("（任意）", "(optional)")}<input type="url" maxLength={2000} value={editor.url} onChange={e => setEditor({ ...editor, url: e.target.value })} /></label><label>{t("ページ・箇所", "Page / locator")}<input maxLength={1000} value={editor.locator} onChange={e => setEditor({ ...editor, locator: e.target.value })} /></label><label>{t("何についての資料か", "What does this source address?")}<select value={editor.supports} onChange={e => setEditor({ ...editor, supports: e.target.value as Editor["supports"] })}>{node ? <><option value="identity">{t("対象の同定", "Identity")}</option><option value="name">{t("名称", "Name")}</option><option value="description">{t("説明・属性", "Description / attribute")}</option></> : <option value="relation">{t("この関係", "This relation")}</option>}</select></label><label>{t("資料の位置づけ", "Source stance")}<select value={editor.stance} onChange={e => setEditor({ ...editor, stance: e.target.value as Editor["stance"] })}><option value="background">{t("背景・参考", "Background")}</option><option value="support">{t("支持", "Support")}</option><option value="refute">{t("反証", "Refute")}</option></select></label></>}
      {editor.fresh && node && editor.kind === "node" && <p>{t(`「${node.title}」から「関係する」でつなぎます。`, `Connects from “${node.title}” with a local “Related” relation.`)}</p>}<div className={css.actions}><button type="submit" data-variant="primary">{t("適用", "Apply")}</button><button type="button" onClick={() => setEditor(null)}>{t("キャンセル", "Cancel")}</button></div></form> : <form className={css.form} onSubmit={event => { event.preventDefault(); void run(async signal => { const result = await searchEntities(query, signal); setResults(result.items.map(n => entityDetailSchema.parse(n))); setSearched(true); }); }}><h3>{t("KG Entityを検索", "Search KG entities")}</h3><label>{t("名前・別名", "Name / alias")}<input autoFocus required maxLength={100} value={query} onChange={e => setQuery(e.target.value)} /></label><div className={css.actions}><button disabled={busy}>{t("検索", "Search")}</button><button type="button" onClick={() => setSearch(false)}>{t("閉じる", "Close")}</button></div>{node && <p>{t(`選んだ対象を「${node.title}」から独自の「関係する」でつなぎます。`, `Connect the selected entity from “${node.title}” using a local “Related” relation.`)}</p>}{searched && !results.length && <p>{t("該当する対象はありません。", "No matching entities.")}</p>}{results.map(e => <button type="button" key={e.id} onClick={() => addEntity(e)}><strong>{e.name}</strong> · {e.kind}<br />{e.description}</button>)}</form>}
    </dialog>}
  </section>;
  function documentElementFocus() { requestAnimationFrame(() => window.document.getElementById(`capsule-detail-${value.id}`)?.focus()); }
}
