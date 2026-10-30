"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { claimDetailSchema, entityDetailSchema, type ClaimDetail, type EntityDetail, type NeighborsResponse } from "../lib/domain/api";
import { type CapsuleDocument, type CapsuleNode } from "../lib/domain/capsule-document";
import { capsuleHistory, capsuleClone, recordCapsule, undoCapsule, redoCapsule, sameCapsuleValue, withCapsuleView, withDocument, removeCapsuleElements, snapshotEntity, snapshotClaim, compareCapsuleNeighborhood, capsuleGraphView, type CapsuleNeighborhoodComparison } from "../lib/client/capsule-editor";
import { capsulePresentation } from "../lib/client/capsule-presentation";
import { capsuleInsertionPoint } from "../lib/client/capsule-insertion";
import { capsuleSchema, type LocalCapsule } from "../lib/client/local-capsules";
import { emptyGraph, type Selection } from "../lib/client/graph-state";
import { viewportCenter, type GraphView } from "../lib/client/graph-view";
import { ClientApiError, fetchClaim, fetchDatasetRevision, fetchEntity, searchEntities } from "../lib/client/api";
import { useUiLocale } from "../lib/client/ui-locale";
import { readingHref } from "../lib/client/reading-reference";
import { relationLabel, formatPeriod, polarityLabel, qualificationLabel } from "../lib/client/format";
import GraphCanvas, { type GraphCanvasHandle, type GraphContextMenuRequest } from "./GraphCanvas";
import { CapsuleModal, useCapsuleSurfaceClose } from "./CapsuleSurface";
import CapsuleNeighborPicker from "./CapsuleNeighborPicker";
import CapsuleContextMenu from "./CapsuleContextMenu";
import CapsuleEditorForm, { type CapsuleEditorDraft as Editor } from "./CapsuleEditorForm";
import { ClaimCard } from "./ClaimDetails";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";

type Props = { capsule: LocalCapsule; isNew?: boolean; readOnly?: boolean; destination?: string; onClose?: () => void; onSave?: (value: LocalCapsule, asCopy: boolean) => Promise<LocalCapsule>; sharing?: ReactNode; commentDraft?: { hasDraft: () => boolean; hasPending: () => boolean; clear: () => void }; locked?: boolean; capacity?: { documents: boolean; storageBytes: number; totalBytes: number } | null };

type Comparison = { key: string; state: "same" | "changed" | "missing" | "failed"; entity?: EntityDetail; claim?: ClaimDetail; revision?: string | null; neighborhood?: CapsuleNeighborhoodComparison };
const noAction = () => {};
// Screen pixels change with the host size; only the authored graph view is a change.
function sameEditingValue(left: LocalCapsule, right: LocalCapsule) {
  if (!left.document || !right.document) return sameCapsuleValue(left,right);
  const withoutLayout = (value: LocalCapsule) => ({ ...value, document:{ ...value.document, layout:undefined } });
  if (!sameCapsuleValue(withoutLayout(left),withoutLayout(right))) return false;
  const a=capsuleGraphView(left.document.layout), b=capsuleGraphView(right.document.layout);
  const center = (view:GraphView) => view.center ?? (view.viewport ? viewportCenter(view.pan,view.zoom,view.viewport) : undefined);
  const ac=center(a), bc=center(b), keys=Object.keys(a.positions);
  // Capturing a restored Cytoscape view introduces harmless floating point noise
  // and can reorder the position map. Neither is an authored edit.
  return Math.abs(a.zoom-b.zoom) <= .0001 && !!ac === !!bc
    && (!ac || !bc || Math.abs(ac.x-bc.x) <= .5 && Math.abs(ac.y-bc.y) <= .5)
    && keys.length === Object.keys(b.positions).length
    && keys.every(key => b.positions[key] && Math.abs(a.positions[key].x-b.positions[key].x) <= .0001 && Math.abs(a.positions[key].y-b.positions[key].y) <= .0001);
}

export default function CapsuleStudio({ capsule, isNew = false, readOnly = false, destination, onClose, onSave, sharing, commentDraft, capacity, locked = false }: Props) {
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
  const [editorBaseline, setEditorBaseline] = useState<Editor | null>(null);
  const relationDrafts = useRef(new Map<string,Editor>());
  const relationBaselines = useRef(new Map<string,Editor>());
  const [relationFormsChanged,setRelationFormsChanged] = useState(false);
  const [query, setQuery] = useState(""), [results, setResults] = useState<EntityDetail[]>([]), [searched, setSearched] = useState(false);
  const [neighbors, setNeighbors] = useState<CapsuleNode | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [leave, setLeave] = useState<"close" | "discard" | string | null>(null), [shareOpen, setShareOpen] = useState(false);
  const shareDialog = useRef<HTMLDialogElement>(null);
  const [inspector, setInspector] = useState(false), [contentsOpen, setContentsOpen] = useState(false);
  const [menu, setMenu] = useState<GraphContextMenuRequest | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null), composing = useRef(false);
  const insertion = useRef<{ anchorKey?: string; explicit?: { x: number; y: number } } | null>(null);
  const [viewChanged, setViewChanged] = useState(false);
  const canvas = useRef<GraphCanvasHandle>(null), active = useRef<AbortController | null>(null);
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
  const navigateHistory=useCallback((redo=false)=>{
    const next=redo?redoCapsule(historyRef.current):undoCapsule(historyRef.current);
    const doc=next.present.document!,keys=new Set([...doc.nodes,...doc.relations,...doc.texts].map(item=>item.key));
    historyRef.current=next;setHistory(next);setSelected(prior=>prior.filter(key=>keys.has(key)));setSelection(prior=>prior&&keys.has(prior.id)?prior:null);setGeneration(v=>v+1);
  },[]);
  const value = history.present, contentDocument = value.document!;
  const presentation = useMemo(() => capsulePresentation(contentDocument, locale), [contentDocument, locale]);
  const graph = useMemo(() => emptyGraph(generation), [generation]);
  const view = useMemo(() => ({ generation, view: suspendedView?.generation === generation ? suspendedView.view : capsuleGraphView(contentDocument.layout) }), [generation, contentDocument.layout, suspendedView]);
  const current = () => withCapsuleView(historyRef.current.present, canvas.current?.capture() ?? null);
  const formChanged = !!editor && (!sameCapsuleValue(editor,editorBaseline)
    || editor.kind === "relation" && relationFormsChanged);
  const dirty = editing && (!saved || viewChanged || formChanged || titleDraft !== null && titleDraft !== value.title || !sameEditingValue(value, saved));
  const editingChanged = editing && (viewChanged || formChanged || titleDraft !== null && titleDraft !== value.title || !sameEditingValue(value, beforeEdit.capsule));
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
    if (newlyAdded.current) { canvas.current?.ensureVisible?.(newlyAdded.current); newlyAdded.current = null; }
  }, [generation]);
  useEffect(() => () => active.current?.abort(), []);
  const titleEditing = titleDraft !== null;
  useEffect(() => { if (titleEditing) titleInput.current?.focus(); }, [titleEditing]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = (event: MouseEvent) => {
      if ((!dirtyRef.current && !commentDraft?.hasDraft()) || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
      const anchor = (event.target as Element)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      event.preventDefault(); event.stopPropagation(); setLeave(anchor.href);
    };
    window.addEventListener("beforeunload", beforeUnload); window.document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.document.removeEventListener("click", navigation, true); };
  }, [commentDraft]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing || !editing || locked || busy || editor || search || neighbors || leave || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || (event.target as Element)?.closest("input,textarea,[contenteditable=true]")) return;
      event.preventDefault(); navigateHistory(event.shiftKey);
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [editing, locked, busy, editor, search, neighbors, leave, navigateHistory]);
  const guardNavigation = editing || !!commentDraft?.hasDraft();
  const navigationGuard = useRef<{ token: string; active: boolean } | null>(null);
  useEffect(() => {
    if (!guardNavigation) return;
    // A same-URL entry lets Back ask about the draft before the router leaves
    // this workspace. Nothing is written to browser content storage.
    if (!navigationGuard.current) navigationGuard.current = { token: crypto.randomUUID(), active: true };
    const guard = navigationGuard.current; guard.active = true; const marker = guard.token;
    if (window.history.state?.plunodeCapsuleGuard !== marker) window.history.pushState({ ...window.history.state, plunodeCapsuleGuard: marker }, "", window.location.href);
    const pop = (event: PopStateEvent) => {
      if (window.history.state?.plunodeCapsuleGuard === marker || !dirtyRef.current && !commentDraft?.hasDraft()) return;
      event.stopImmediatePropagation(); window.history.forward(); setLeave("back");
    };
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("popstate", pop, true);
      guard.active = false;
      queueMicrotask(() => { if (!guard.active && window.history.state?.plunodeCapsuleGuard === marker) window.history.back(); });
    };
  }, [guardNavigation, commentDraft]);

  function commit(next: LocalCapsule, reveal?: string) {
    try {
      const parsed = capsuleSchema.parse(next);
      if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 2_000_000) throw Error("limit");
      newlyAdded.current = reveal ?? null;
      const before = canvas.current?.capture() ?? null;
      setHistory(h => recordCapsule({ ...h, present:withCapsuleView(h.present,before) }, parsed)); setGeneration(v => v + 1); setError(null); setMessage(null); return true;
    } catch { setError(t("保存できる内容の上限または形式を確認してください。入力は残しています。", "Check the content limits or fields. Your input is retained.")); return false; }
  }
  function changeDocument(next: CapsuleDocument) { commit(withDocument(current(), next)); }
  function begin() {
    const starting = current(); setBeforeEdit({ capsule: capsuleClone(starting), selected: [...selected], selection });
    setHistory(capsuleHistory(starting)); setEditing(true); setGeneration(v => v + 1); setShareOpen(false); setMessage(null); setViewChanged(false);
  }
  function cancelRequests() { active.current?.abort(); active.current = null; setBusy(false); setNeighbors(null); setComparison(null); setMenu(null); }
  function discard() {
    cancelRequests(); setTitleDraft(null); setViewChanged(false); setEditor(null); setSearch(false);
    if (!saved) { onClose?.(); return; }
    setHistory(capsuleHistory(beforeEdit.capsule)); setSelected(beforeEdit.selected); setSelection(beforeEdit.selection);
    setGeneration(v => v + 1); setEditing(false); setLeave(null); setError(null);
  }
  async function save(asCopy = false, next: string | null = null) {
    if (!onSave || locked || busy || editor || capacity?.documents === false) return;
    setBusy(true); setSaving(true); setError(null);
    try {
      const snapshot = { ...current() };
      if (titleDraft !== null) snapshot.title = titleDraft.trim() || value.title;
      const result = await onSave(snapshot, asCopy);
      setSaved(result); setHistory(capsuleHistory(result)); setEditing(false); setGeneration(v => v + 1); setLeave(null);
      setMessage(t("保存しました", "Saved")); setViewChanged(false); setTitleDraft(null);
      dirtyRef.current = false;
      if (next === "close" || next === "back") onClose?.(); else if (next && next !== "discard") window.location.assign(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("保存できませんでした。編集中の内容は残っています。", "Could not save. Your draft is retained.")); }
    finally { setBusy(false); setSaving(false); }
  }
  function blankEditor(kind: Editor["kind"], keys: string[] = [], fresh = false): Editor {
    return { kind, keys, fresh, title: "", description: "", badge: "", style: "note", width: 260, fontSize: 16, fontWeight: "normal", align: "left", url: "", locator: "", supports: kind === "evidence" && relations.length ? "relation" : "description", stance: "background", evidence: [] };
  }
  function openEditor(kind: Editor["kind"], fresh = false, id = selection?.id) {
    relationDrafts.current.clear(); relationBaselines.current.clear(); setRelationFormsChanged(false);
    const node = contentDocument.nodes.find(n => n.key === id), text = contentDocument.texts.find(n => n.key === id);
    const keys = kind === "relation" ? (presentation.members[id ?? ""] ?? [id ?? ""]).slice(0,1) : id ? [id] : [];
    const relations = contentDocument.relations.filter(r => keys.includes(r.key));
    let draft = blankEditor(kind, keys, fresh);
    if (!fresh) {
      if (kind === "capsule") draft = { ...draft, title: value.title, description: value.note };
      if (kind === "node" && node) draft = { ...draft, title: node.title, description: node.description, badge: node.badge, shape: node.shape };
      if (kind === "relation" && relations.length) draft = { ...draft, title: relations[0].label, description: relations[0].note };
      if (kind === "text" && text) draft = { ...draft, title: text.text, style: text.style, width: text.width ?? 260, fontSize: text.fontSize ?? (text.style === "heading" ? 24 : 16), fontWeight: text.fontWeight ?? (text.style === "heading" ? "bold" : "normal"), align: text.align ?? "left" };
      if (kind === "node" || kind === "relation") draft.evidence = capsuleClone(contentDocument.evidence.filter(e => keys.includes(e.targetKey)));
    }
    if (kind === "relation") relationBaselines.current.set(draft.keys[0],capsuleClone(draft));
    setEditorBaseline(capsuleClone(draft)); setEditor(draft); setError(null); setMenu(null);
  }
  function chooseRelation(key:string) {
    const relation=contentDocument.relations.find(item => item.key === key);
    if (!relation) return;
    const baseline=relationBaselines.current.get(key) ?? {...blankEditor("relation",[key]),title:relation.label,description:relation.note,evidence:capsuleClone(contentDocument.evidence.filter(e => e.targetKey === key))};
    relationBaselines.current.set(key,baseline); setEditorBaseline(baseline);
    setEditor(relationDrafts.current.get(key) ?? capsuleClone(baseline));
  }
  function changeEditor(next:Editor) {
    if (next.kind === "relation") {
      relationDrafts.current.set(next.keys[0],next);
      setRelationFormsChanged([...relationDrafts.current].some(([key,draft]) => !sameCapsuleValue(draft,relationBaselines.current.get(key))));
    }
    setEditor(next);
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
    if ((editor.kind === "node" || editor.kind === "relation") && !editor.fresh) doc.evidence = [...doc.evidence.filter(e => !editor.keys.includes(e.targetKey)), ...editor.evidence];
    if (editor.kind === "capsule") { if (commit({ ...source, title: editor.title, note: editor.description })) setEditor(null); return; }
    if (editor.kind === "node") {
      if (editor.fresh) {
        const key = crypto.randomUUID(), added: CapsuleNode = { key, title: editor.title, description: editor.description, badge: editor.badge, shape: editor.shape, origin: { kind: "local" } };
        doc.layout.positions[key] = capsuleInsertionPoint(source.document!, capsuleGraphView(source.document!.layout), "node", { ...insertion.current, locale, node: added });
        doc.nodes.push(added);
        doc.evidence.push(...editor.evidence.map(e => ({ ...e, targetKey: key })));
        const next = connectAdded(doc, key); if (!commit(withDocument(source, next), key)) return; setSelected([key]); setSelection({ kind: "entity", id: key });
      } else { doc.nodes = doc.nodes.map(n => editor.keys.includes(n.key) ? { ...n, title: editor.title, description: editor.description, badge: editor.badge, shape: editor.shape } : n); if (!commit(withDocument(source, doc))) return; }
    } else if (editor.kind === "relation") {
      relationDrafts.current.set(editor.keys[0],editor);
      for (const [key,draft] of relationDrafts.current) {
        doc.relations = doc.relations.map(r => r.key === key ? { ...r, label:draft.title, note:draft.description, ...(r.origin.kind === "local" && draft.reverse ? {source:r.target,target:r.source} : {}) } : r);
        const updated = doc.relations.find(r => r.key === key);
        if (updated?.origin.kind === "local" && draft.addReverse && updated.source !== updated.target && !doc.relations.some(r => r.origin.kind === "local" && r.source === updated.target && r.target === updated.source && r.label === updated.label)) {
          doc.relations.push({key:crypto.randomUUID(),source:updated.target,target:updated.source,label:updated.label,note:"",origin:{kind:"local"}});
        }
        doc.evidence = [...doc.evidence.filter(e => e.targetKey !== key),...draft.evidence];
      }
      if (!commit(withDocument(source,doc))) return;
    }
    else if (editor.kind === "text") {
      if (editor.fresh) {
        const key = crypto.randomUUID(), added = { key, text: editor.title, style: editor.style, width: editor.width, fontSize: editor.fontSize, fontWeight: editor.fontWeight, align: editor.align };
        doc.layout.positions[key] = capsuleInsertionPoint(source.document!, capsuleGraphView(source.document!.layout), "text", { ...insertion.current, locale, text: added });
        doc.texts.push(added);
        if (!commit(withDocument(source, doc), key)) return; setSelection({ kind: "entity", id: key }); setSelected([key]);
      } else { doc.texts = doc.texts.map(n => editor.keys.includes(n.key) ? { ...n, text: editor.title, style: editor.style, width: editor.width, fontSize: editor.fontSize, fontWeight: editor.fontWeight, align: editor.align } : n); if (!commit(withDocument(source, doc))) return; }
    } else {
      const existing = doc.evidence.find(e => editor.keys.includes(e.key));
      if (existing) doc.evidence = doc.evidence.filter(e => e.key !== existing.key);
      const targets = existing ? [existing.targetKey] : node ? [node.key] : relationKeys;
      for (const targetKey of targets) doc.evidence.push({ key: crypto.randomUUID(), targetKey, title: editor.title, url: editor.url || null, locator: editor.locator, note: editor.description, supports: editor.supports, stance: editor.stance });
      if (!commit(withDocument(source, doc))) return;
    }
    setEditor(null); insertion.current = null;
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
          if (!signal.aborted) setComparison({ key: target.key, state: same ? "same" : "changed", entity, revision, neighborhood });
        } else {
          const claim = claimDetailSchema.parse((await fetchClaim(id, signal, revision)).claim);
          if (claim.id !== id) throw Error();
          const baseline = target.origin.kind === "kg" && "sourceCount" in target.origin.snapshot ? target.origin.detail ?? target.origin.snapshot : null;
          const same = sameCapsuleValue(baseline, target.origin.kind === "kg" && target.origin.detail ? claim : snapshotClaim(claim));
          if (!signal.aborted) setComparison({ key: target.key, state: same ? "same" : "changed", claim, revision });
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
  function openNeighbors() { if (node && node.origin.kind !== "local") setNeighbors(node); }
  function addNeighbors(result: NeighborsResponse, ids: string[]) {
    const source=current(), doc=capsuleClone(source.document!), capturedAt=new Date().toISOString();
    for(const id of new Set(ids)) {
      const claim=result.claims.find(c=>c.id===id); if(!claim) return;
      for(const entityId of [claim.subjectId,claim.objectId]) {
        if(doc.nodes.some(n=>n.origin.kind!=="local"&&n.origin.id===entityId)) continue;
        const e=result.nodes.find(n=>n.id===entityId); if(!e)return;
        doc.nodes.push({key:e.id,title:e.name,description:e.description??"",badge:"",origin:{kind:"kg",id:e.id,capturedAt,revision:result.revision??null,snapshot:snapshotEntity(e),detail:null,neighbors:{state:"unknown",scope:"not queried",claimIds:[]}}});
      }
      if(!doc.relations.some(r=>r.origin.kind==="kg"&&r.origin.id===id)) doc.relations.push({key:id,source:doc.nodes.find(n=>n.origin.kind!=="local"&&n.origin.id===claim.subjectId)!.key,target:doc.nodes.find(n=>n.origin.kind!=="local"&&n.origin.id===claim.objectId)!.key,label:"",note:"",origin:{kind:"kg",id,capturedAt,revision:result.revision??null,snapshot:snapshotClaim(claim),detail:null}});
    }
    const added=doc.nodes.filter(n=>!source.document!.nodes.some(previous=>previous.key===n.key));
    if(commit(withDocument(source,doc),added[0]?.key)) {setNeighbors(null);if(added.length){setSelected(added.map(n=>n.key));setSelection({kind:"entity",id:added[0].key});}}
  }
  function finishLeave() {
    const next = leave; dirtyRef.current = false;
    if (next !== "discard") commentDraft?.clear();
    if (next === "discard") discard(); else if (next === "back") { if (onClose) onClose(); else discard(); } else if (next === "close") onClose?.(); else if (next) window.location.assign(next);
  }
  function requestClose() {
    if (busy) return;
    if (dirty || commentDraft?.hasDraft()) setLeave("close"); else onClose?.();
  }
  useCapsuleSurfaceClose(() => {
    if (busy || composing.current || editor || search || leave || shareOpen || neighbors) return;
    if (locked) setLeave("close"); else requestClose();
  });
  function requestShareClose() {
    if (shareDialog.current?.querySelector('[aria-busy="true"],dialog[open]')) return;
    // Comments and uncertain request IDs remain in the parent workspace cache.
    setShareOpen(false);
  }
  function applyTitle() {
    if (titleDraft === null) return;
    const title = titleDraft.trim();
    if (!title) { titleInput.current?.focus(); return; }
    commit({ ...current(), title }); setTitleDraft(null);
  }
  function removeSelection() {
    changeDocument(removeCapsuleElements(current().document!, expandedKeys.length ? expandedKeys : selection ? [selection.id] : []));
    setSelected([]); setSelection(null); setMenu(null);
  }
  function connectSelection() {
    if (selectedNodes.length !== 2) return;
    const source = current(), doc = capsuleClone(source.document!);
    const key = crypto.randomUUID();
    doc.relations.push({ key, source:selectedNodes[0].key, target:selectedNodes[1].key, label:t("関係する", "Related"), note:"", origin:{kind:"local"} });
    commit(withDocument(source,doc));
  }
  function startSearch() { setSearch(true); setResults([]); setSearched(false); setMenu(null); setError(null); }
  function create(kind: "node" | "text") {
    insertion.current = { anchorKey: node?.key ?? text?.key, explicit: menu?.kind === "background" ? menu.position : undefined };
    openEditor(kind,true);
  }
  function editSelected(id = selection?.id) {
    if (!id) return;
    openEditor(contentDocument.texts.some(item => item.key === id) ? "text" : contentDocument.nodes.some(item => item.key === id) ? "node" : "relation", false, id);
  }
  function showContext(request: GraphContextMenuRequest) {
    setSelected(request.selectedKeys);
    if (request.kind !== "background" && request.id) setSelection({ kind:request.kind === "edge" ? "relation" : "entity",id:request.id });
    else setSelection(null);
    setMenu(request);
  }
  const menuActions = [
    ...(selection && selected.length <= 1 ? [{label:t("編集", "Edit"),icon:"edit" as const,action:() => editSelected()}] : []),
    ...(node && node.origin.kind !== "local" && selected.length <= 1 ? [{label:t("KGの関係先を追加", "Add KG neighbors"),icon:"graph" as const,action:() => openNeighbors()}] : []),
    ...(selectedNodes.length === 2 ? [{label:t("2つのEntityをつなぐ", "Connect two entities"),icon:"link" as const,action:connectSelection}] : []),
    {label:t("KGから検索して追加", "Search the KG"),icon:"search" as const,action:startSearch},
    {label:t("独自Entityを追加", "Add custom entity"),icon:"plus" as const,action:() => create("node")},
    {label:t("テキストを追加", "Add text"),icon:"text" as const,action:() => create("text")},
    ...(selection || selected.length ? [{label:selected.length > 1 ? t(`${selected.length}要素をCapsuleから外す`, `Remove ${selected.length} elements`) : relations.length > 1 ? t(`この線の${relations.length}件の関係を外す`, `Remove all ${relations.length} relations on this line`) : t("Capsuleから外す", "Remove from Capsule"),icon:"minus" as const,action:removeSelection,danger:true}] : []),
  ];
  const closingWithComments = leave !== "discard" && !!commentDraft?.hasDraft();
  const formTitle = editor?.kind === "text" ? t("テキストを編集", "Edit text") : t("Capsuleの内容を編集", "Edit Capsule content");
  const formRelation = editor?.kind === "relation" ? contentDocument.relations.find(r => r.key === editor.keys[0]) : undefined;
  const direction = formRelation ? {source:contentDocument.nodes.find(n => n.key === formRelation.source)?.title ?? "",target:contentDocument.nodes.find(n => n.key === formRelation.target)?.title ?? "",editable:formRelation.origin.kind === "local",self:formRelation.source === formRelation.target} : undefined;
  if (locked) return <section className={css.studio}><div className={css.locked}><Icon name="shield"/><h2>{t("ログインを確認してください", "Check your sign-in")}</h2><p>{t("入力はここに残っています。元のアカウントでログインすると続けられます。", "Your draft is retained. Sign in to the original account to continue.")}</p><a href="/member" target="_blank" rel="noopener noreferrer">{t("ログインを確認", "Check sign-in")}</a>{onClose && <button onClick={() => setLeave("close")}>{t("閉じる", "Close")}</button>}{leave && <CapsuleModal title={t("入力を破棄して閉じる", "Discard and close")} onClose={() => setLeave(null)}><h3>{t("入力を破棄して閉じますか？", "Discard this draft and close?")}</h3><div className={css.actions}><button data-autofocus onClick={() => setLeave(null)}>{t("戻る", "Back")}</button><button onClick={() => { dirtyRef.current = false; commentDraft?.clear(); onClose?.(); }}>{t("破棄して閉じる", "Discard and close")}</button></div></CapsuleModal>}</div></section>;

  return <section className={`${css.studio} ${editing ? css.editing : ""}`} aria-label="Capsule" onKeyDown={event => {
    if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229 || (event.target as Element).closest("input,textarea,select,[contenteditable=true]")) return;
    if (event.key === "Escape" && !editor && !search && !leave && !shareOpen && !neighbors) { event.preventDefault(); event.stopPropagation(); if (menu) setMenu(null); else requestClose(); }
    if (editing && !busy && !editor && !search && !leave && (event.key === "Delete" || event.key === "Backspace") && selection) { event.preventDefault(); removeSelection(); }
  }}>
    <header className={css.header}>
      <div className={css.identity}><span className={css.capsuleMark}><Icon name="capsule"/></span><div className={css.identityText}>
        <div className={css.identityMeta}><span className={css.eyebrow}><span className={css.capsuleName}>Capsule</span><span className={editing ? css.editState : css.viewState}>{editing ? t("編集中", "Editing") : t("閲覧", "Viewing")}</span></span>
          <span className={css.saveState} role="status">{busy ? t("処理中…", "Working…") : dirty ? <><span className={css.unsavedDot}/>{t("未保存", "Unsaved")}</> : saved ? t("保存済み", "Saved") : ""}</span>
        </div>
        {titleDraft !== null ? <div className={css.titleEditor}><input ref={titleInput} aria-label={t("Capsuleのタイトル", "Capsule title")} disabled={busy} maxLength={80} value={titleDraft} onChange={event => setTitleDraft(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); applyTitle(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTitleDraft(null); } }}/><button disabled={busy} aria-label={t("タイトルを適用", "Apply title")} onClick={applyTitle}><Icon name="check"/></button><button disabled={busy} aria-label={t("タイトルの変更を取り消す", "Cancel title change")} onClick={() => setTitleDraft(null)}><Icon name="close"/></button></div> : <h2>{editing ? <button className={css.titleButton} disabled={busy} title={t("タイトルを編集", "Edit title")} onClick={() => setTitleDraft(value.title)}><span>{value.title}</span><Icon name="edit"/></button> : value.title}</h2>}
      </div></div>
      <div className={css.actions}>
        {editing ? <><button disabled={busy} className={css.quietButton} onClick={() => editingChanged || !saved ? setLeave("discard") : discard()}>{t("破棄", "Discard")}</button><button data-variant="primary" disabled={busy || !onSave || capacity?.documents === false} onClick={() => void save()}><Icon name="check"/>{t("保存", "Save")}</button></> : <>{sharing && <button aria-label={t("共有", "Share")} title={t("共有", "Share")} onClick={() => setShareOpen(true)}><Icon name="share"/><span className={css.optionalLabel}>{t("共有", "Share")}</span></button>}{!readOnly && onSave && <button data-variant="primary" onClick={begin}><Icon name="edit"/>{t("編集", "Edit")}</button>}</>}
        {onClose && <button className={css.iconButton} disabled={busy} aria-label={t("Capsuleを閉じる", "Close Capsule")} onClick={requestClose}><Icon name="close"/></button>}
      </div>
    </header>
    {capacity?.documents === false && <p className={css.notice} role="status">{t("保存先は更新準備中です。入力はこの画面で保持しています。", "Storage is being updated. Your input is retained here.")}</p>}
    {(error || message) && <div className={css.notice} role={error ? "alert" : "status"}>{!error && <Icon name="check"/>}<span>{error ?? message}</span>{error && editing && onSave && <button disabled={busy} onClick={() => void save(true)}>{t("別のCapsuleとして保存", "Save as a new Capsule")}</button>}<button className={`${css.iconButton} ${css.quietButton}`} aria-label={t("通知を閉じる", "Dismiss notice")} onClick={() => { setError(null); setMessage(null); }}><Icon name="close"/></button></div>}
    <div className={css.body} data-inspector={inspector || undefined} inert={saving}>
      <div className={css.canvasArea}>
        <div className={css.toolRail} role="toolbar" aria-label={t("Capsuleの操作", "Capsule tools")}>
          {editing && <><button title={t("元に戻す · Ctrl/⌘ Z", "Undo · Ctrl/⌘ Z")} aria-label={t("元に戻す", "Undo")} disabled={!history.past.length || busy} onClick={() => navigateHistory()}><Icon name="undo"/></button><button title={t("やり直す · Ctrl/⌘ Shift Z", "Redo · Ctrl/⌘ Shift Z")} aria-label={t("やり直す", "Redo")} disabled={!history.future.length || busy} onClick={() => navigateHistory(true)}><Icon name="redo"/></button><span className={css.toolDivider}/><button title={t("独自Entityを追加", "Add custom entity")} aria-label={t("独自Entityを追加", "Add custom entity")} disabled={busy} onClick={() => create("node")}><Icon name="plus"/></button><button title={t("KGから検索して追加", "Search the KG")} aria-label={t("KGから検索して追加", "Search the KG")} disabled={busy} onClick={startSearch}><Icon name="search"/></button><button title={t("テキストを追加", "Add text")} aria-label={t("テキストを追加", "Add text")} disabled={busy} onClick={() => create("text")}><Icon name="text"/></button><span className={css.toolDivider}/></>}
          <button aria-label={t("内容一覧", "Contents")} title={t("内容一覧", "Contents")} aria-pressed={contentsOpen} onClick={() => setContentsOpen(v => !v)}><Icon name="list"/></button><button aria-label={t("詳細と根拠", "Details & evidence")} title={t("詳細と根拠", "Details & evidence")} aria-pressed={inspector} onClick={() => setInspector(v => !v)}><Icon name="panel"/></button>
        </div>
        {selection && <div className={css.selectionTools}><span>{selected.length > 1 ? t(`${selected.length}要素`, `${selected.length} elements`) : node?.title ?? (text ? t("テキスト", "Text") : t("関係", "Relation"))}</span>{editing && <button aria-label={t("選択対象の操作", "Selection actions")} title={t("選択対象の操作", "Selection actions")} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({kind:selection.kind === "relation" ? "edge" : "node",id:selection.id,selectedKeys:selected,clientX:rect.left,clientY:rect.bottom+6,position:canvas.current?.capture()?.center ?? {x:0,y:0},source:"keyboard"}); }}><Icon name="more"/></button>}<button aria-label={t("選択の詳細", "Selection details")} onClick={() => setInspector(true)}><Icon name="panel"/></button></div>}
        <div className={css.graph}><GraphCanvas ref={bindCanvas} interactionBlocked={saving} fillHeight compactGuide contentOnly graph={graph} content={presentation} restoration={view} selection={selection} selectedKeys={selected} onSelectionChange={ids => { setSelected(ids); if (!ids.length) setSelection(null); }}
          onEntity={id => { setSelection({kind:"entity",id}); setComparison(null); }} onRelation={id => { setSelection({kind:"relation",id}); setComparison(null); }} onToggleEntity={noAction}
          onEntityDoubleClick={id => { if (editing && !busy) editSelected(id); else setInspector(true); }} onRelationDoubleClick={id => { if (editing && !busy) editSelected(id); else setInspector(true); }}
          onMove={(before: GraphView, after: GraphView) => { if (editing) setHistory(h => recordCapsule({...h,present:withCapsuleView(h.present,before)},withCapsuleView(h.present,after))); }}
          onViewChange={() => { if (!editing) return; const now = canvas.current?.capture(), baseline = beforeEdit.capsule.document?.layout; if (now && baseline) { const center = baseline.center; setViewChanged(Math.abs(now.zoom-baseline.zoom) > .0001 || !!center && !!now.center && (Math.abs(center.x-now.center.x) > .5 || Math.abs(center.y-now.center.y) > .5)); } }}
          onContextMenu={editing && !busy ? showContext : undefined}
          footerAction={<span className={css.status}>{selected.length > 1 ? t(`${selected.length}要素をまとめて移動`, `Move ${selected.length} selected elements together`) : t("Ctrl / ⌘ + クリックで複数選択", "Ctrl / ⌘ + click to select multiple")}</span>}/></div>
        {contentsOpen && <aside className={css.contents}><header className={css.dialogHeading}><h3>{t("内容一覧", "Contents")}</h3><button aria-label={t("内容一覧を閉じる", "Close contents")} onClick={() => setContentsOpen(false)}><Icon name="close"/></button></header><ul>{[...contentDocument.nodes.map(n => ({key:n.key,title:n.title})),...contentDocument.texts.map(n => ({key:n.key,title:n.text}))].map(n => <li key={n.key}><button onClick={() => { setSelected([n.key]); setSelection({kind:"entity",id:n.key}); canvas.current?.focusEntity(n.key); }}>{n.title}</button></li>)}{Object.values(presentation.relations).map(r => <li key={r.id}><button onClick={() => { setSelected([r.id]); setSelection({kind:"relation",id:r.id}); canvas.current?.ensureVisible?.(r.id); }}>{contentDocument.nodes.find(n => n.key === r.subjectId)?.title} → {r.canvasLabel} → {contentDocument.nodes.find(n => n.key === r.objectId)?.title}</button></li>)}</ul></aside>}
      </div>
      {inspector && <aside className={css.detail} id={`capsule-detail-${value.id}`} tabIndex={-1}><header className={css.dialogHeading}><span className={css.eyebrow}>{t("詳細と根拠", "Details & evidence")}</span><button aria-label={t("詳細を閉じる", "Close details")} onClick={() => setInspector(false)}><Icon name="close"/></button></header>
      {selected.length > 1 && <><h3>{selected.length} {t("要素を選択", "elements selected")}</h3><p>{t("選択したノードを一緒に動かせます。", "Drag a selected node to move the group.")}</p></>}
      {!selection && <><h3>{t("このCapsuleについて", "About this Capsule")}</h3><p>{value.note || t("ノードや線を選ぶと詳細・根拠が表示されます。", "Select a node or line to see details and evidence.")}</p><p className={css.status}>{contentDocument.nodes.length} Entity · {contentDocument.relations.length} {t("関係", "relations")} · {contentDocument.texts.length} {t("テキスト", "texts")}</p></>}
      {node && <><span className={css.badge}>{node.origin.kind === "local" ? t("Capsule独自", "Capsule local") : node.origin.kind === "unresolved" ? t("未取得のKG参照", "Unresolved KG reference") : t("KGから取り込み", "Captured from KG")}</span>{node.badge && <span className={css.badge}>{node.badge}</span>}<h3>{node.title}</h3><p>{node.description}</p></>}
      {text && <><h3>{t("テキスト", "Text")}</h3><p>{text.text}</p></>}
      {relations.map(r => <div key={r.key}><span className={css.badge}>{r.origin.kind === "local" ? t("Capsule独自の関係", "Capsule local relation") : t("KGの個別Claim", "Individual KG claim")}</span><h3>{r.label || (r.origin.kind === "kg" ? relationLabel(r.origin.snapshot, locale) : t("関係する", "Related"))}</h3><p>{r.note}</p>{r.origin.kind === "kg" && <><p>{[polarityLabel(r.origin.snapshot, locale), qualificationLabel(r.origin.snapshot, locale), formatPeriod(r.origin.snapshot.period, locale)].filter(Boolean).join(" / ")}</p>{r.origin.detail ? <ClaimCard referenceDataset={value.dataset} idPrefix="capsule-studio-" title={t("取り込み済みの根拠", "Captured evidence")} claim={r.origin.detail} nodes={Object.fromEntries(contentDocument.nodes.flatMap(n => n.origin.kind === "kg" ? [[n.origin.id, n.origin.snapshot]] : []))} /> : <p className={css.status}>{r.origin.snapshot.sourceCount === 0 ? t("取り込み時のKG応答：出典0件。", "The captured KG response reported no sources.") : t(`取り込み時の出典数：${r.origin.snapshot.sourceCount}。根拠の詳細は未取得です。`, `Sources at capture: ${r.origin.snapshot.sourceCount}. Evidence details were not captured.`)}</p>}</>}</div>)}
      {editing && selection && <div className={css.actions} data-capsule-actions><button onClick={() => openEditor(text ? "text" : node ? "node" : "relation")}>… {t("編集", "Edit")}</button>{(node || relations.length > 0) && <button onClick={() => openEditor("evidence")}>{t("根拠を追加", "Add evidence")}</button>}<button onClick={() => { changeDocument(removeCapsuleElements(current().document!, expandedKeys.length ? expandedKeys : [selection.id])); setSelected([]); setSelection(null); }}>{t("Capsuleから外す", "Remove from Capsule")}</button>{node && node.origin.kind !== "local" && <button disabled={busy} onClick={() => openNeighbors()}>{t("関係先から追加", "Add related KG entities")}</button>}</div>}
      {evidences.map(e => <article className={css.evidence} key={e.key}>
        <strong className={css.evidenceTitle}>{e.title}</strong>
        <div className={css.evidenceMeta}><span className={css.badge}>{evidenceSupports[e.supports]}</span><span className={css.badge}>{evidenceStances[e.stance]}</span></div>
        {e.locator && <p className={css.evidenceLocator}>{e.locator}</p>}{e.note && <p className={css.evidenceNote}>{e.note}</p>}
        {(e.url || editing) && <footer className={css.evidenceActions}>{e.url && <a href={e.url} target="_blank" rel="noopener noreferrer"><Icon name="link"/>{t("資料を開く", "Open source")}</a>}
          {editing && <><button className={css.iconButton} title={t("根拠を編集", "Edit evidence")} aria-label={t("根拠を編集", "Edit evidence")} onClick={() => { const draft={ ...blankEditor("evidence", [e.key]), title:e.title, description:e.note, url:e.url ?? "", locator:e.locator, supports:e.supports, stance:e.stance }; setEditorBaseline(capsuleClone(draft)); setEditor(draft); setError(null); }}><Icon name="edit"/></button><button className={css.quietButton} onClick={() => changeDocument({ ...current().document!, evidence: contentDocument.evidence.filter(item => item.key !== e.key) })}>{t("外す", "Remove")}</button></>}
        </footer>}
      </article>)}
      {(node && node.origin.kind !== "local" || relations.some(r => r.origin.kind === "kg")) && <details><summary>{t("元のKG・現在と比較", "Original KG · compare current data")}</summary>{node?.origin.kind === "kg" && <><p>{t("取り込み時", "Captured")}: {new Date(node.origin.capturedAt).toLocaleString(locale)}</p><p>{node.origin.snapshot.name} · {node.origin.snapshot.description}</p><p className={css.status}>{node.origin.neighbors.state === "unknown" ? t("関係先の全体は未確認です。", "The neighborhood was not fully queried.") : t("取り込み時の確認範囲を保持しています。KG全体に他の関係がないという意味ではありません。", "The captured query scope is retained; this does not assert that no other KG relations exist.")}</p><details><summary>{t("確認範囲", "Query scope")}</summary><pre>{JSON.stringify(node.origin.neighbors, null, 2)}</pre></details></>}
        <button disabled={busy} onClick={() => void compare()}>{t("現在のKGを確認", "Check current KG")}</button>
        {comparison && (comparison.key === node?.key || relationKeys.includes(comparison.key)) && <div role="status"><p>{comparison.state === "same" ? t("取得済みの比較範囲では変更はありません。", "No change in the captured comparison scope.") : comparison.state === "changed" ? t("現在のKGに異なる内容があります。保存内容は変えていません。", "Current KG data differs. Your saved content is unchanged.") : comparison.state === "missing" ? t("現在は参照できません。保存した内容は保持しています。", "Currently unavailable. The captured content is retained.") : t("比較できませんでした。再試行できます。", "Comparison failed. You can retry.")}</p>{comparison.entity && <p>{comparison.entity.name}<br />{comparison.entity.description}</p>}{comparison.neighborhood && <p>{comparison.neighborhood.state === "changed" ? t(`同じ確認範囲の関係が変わりました：追加 ${comparison.neighborhood.added.length} 件・参照できなくなった関係 ${comparison.neighborhood.removed.length} 件。`, `The same query scope changed: ${comparison.neighborhood.added.length} added and ${comparison.neighborhood.removed.length} no longer available.`) : comparison.neighborhood.state === "same" ? t("同じ確認範囲の関係の有無にも変更はありません。", "Relation membership is unchanged in the same query scope.") : comparison.neighborhood.state === "failed" ? t("関係先の比較は取得失敗のため判定できません。", "The neighborhood comparison failed; its changes are unknown.") : t("関係先は部分取得・未確認または再実行できない範囲のため、変更の有無を判定していません。", "Neighborhood changes are unknown because the captured scope is partial, unqueried, or cannot be replayed.")}</p>}{comparison.claim && <p>{relationLabel(comparison.claim, locale)} · {comparison.claim.citations.length} {t("根拠", "citations")}{comparison.claim.withdrawal && ` · ${t("撤回", "Withdrawn")}`}</p>}{editing && (comparison.entity || comparison.claim) && <button onClick={adoptComparison}>{t("現在の内容・根拠を取り込む", "Capture current data & evidence")}</button>}</div>}
        <a target="_blank" rel="noopener noreferrer" href={readingHref({ dataset: value.dataset, kind: node ? "entity" : "claim", id: node && node.origin.kind !== "local" ? node.origin.id : relations.find(r => r.origin.kind === "kg")!.origin.kind === "kg" ? (relations.find(r => r.origin.kind === "kg")!.origin as { id: string }).id : "" })}>{t("元のKGを開く", "Open KG record")}</a>
      </details>}

      </aside>}
    </div>
    <footer className={css.footer} inert={saving}><span>{destination}{saved && ` · ${t("保存版", "Revision")} ${saved.revision}`}</span><span>{contentDocument.nodes.length} Entity · {contentDocument.relations.length} {t("関係", "relations")}</span><span className={css.footerSpace}/>{editing ? <button className={css.quietButton} onClick={() => openEditor("capsule")}><Icon name="settings"/>{t("説明", "Description")}</button> : <button className={css.quietButton} title={t("閲覧中の移動は一時的です。編集は今の配置から始まります。", "Viewing moves are temporary. Editing starts from this view.")} onClick={() => { if (saved) { setHistory(capsuleHistory(saved)); setGeneration(v => v + 1); } }}><Icon name="history"/>{t("保存位置", "Saved view")}</button>}<span className={css.future} title={t("知識申請・審査・本線KGへのマージは準備中です", "Knowledge submission, review and KG merging are being prepared")}>{t("知識申請：準備中", "Knowledge submission: coming later")}</span></footer>
    {menu && <CapsuleContextMenu x={menu.clientX} y={menu.clientY} title={selected.length > 1 ? t(`${selected.length}要素を選択`, `${selected.length} selected`) : node?.title ?? (text ? t("テキスト", "Text") : relations.length ? t("関係", "Relation") : t("Capsuleに追加", "Add to Capsule"))} actions={menuActions} onClose={() => setMenu(null)}/>}
    {leave && <CapsuleModal title={t("変更を破棄しますか？", "Discard your changes?")} dismissible={!busy} onClose={() => setLeave(null)}><div className={css.confirmBody}><span className={css.confirmIcon}><Icon name="undo"/></span><h3>{t("変更を破棄しますか？", "Discard your changes?")}</h3><p>{!saved ? t("作成中のCapsuleを破棄し、元のGraphへ戻ります。", "Discard this new Capsule and return to the original graph.") : leave === "discard" ? t("今回の編集を取り消し、編集を始める前の表示に戻ります。保存済みのCapsuleは残ります。", "Return to the view before editing. Your saved Capsule stays intact.") : t("保存していない変更は失われます。保存済みのCapsuleは残ります。", "Unsaved changes will be lost. Your saved Capsule stays intact.")}</p>{closingWithComments && <p>{commentDraft?.hasPending() ? t("投稿結果が未確認のコメントがあります。閉じると本文と再送情報が失われます。共有画面に戻ると、同じ投稿の結果を確認できます。", "A comment submission is unconfirmed. Closing loses its text and retry information. Return to sharing to check the same submission.") : t("投稿していないコメントの入力も失われます。共有画面へ戻ると続きを書けます。", "Your unposted comment draft will also be lost. Return to sharing to continue writing.")}</p>}{editor && <p>{t("入力中のフォームへ戻り、内容を適用してから保存できます。", "Return to the form and apply its content before saving.")}</p>}{error && <p role="alert">{error}</p>}<div className={css.confirmActions}><button data-autofocus disabled={busy} onClick={() => setLeave(null)}>{t("編集を続ける", "Keep editing")}</button><button disabled={busy} data-variant="danger" onClick={finishLeave}>{t("変更を破棄", "Discard changes")}</button><button disabled={busy || closingWithComments || !!editor || !onSave || capacity?.documents === false} data-variant="primary" onClick={() => void save(false,leave)}>{t("保存して終了", "Save and finish")}</button></div></div></CapsuleModal>}
    {shareOpen && <CapsuleModal wide dialogRef={shareDialog} title={t("Capsuleを共有", "Share Capsule")} onClose={requestShareClose}><header className={css.dialogHeading}><h3>{t("Capsuleを共有", "Share Capsule")}</h3><button aria-label={t("共有を閉じる", "Close sharing")} onClick={requestShareClose}><Icon name="close"/></button></header>{sharing}
    </CapsuleModal>}
    {editor && <CapsuleModal wide title={formTitle} dismissOnBackdrop={!formChanged} onClose={() => setEditor(null)}>{error && <p role="alert" className={css.formError}>{error}</p>}<CapsuleEditorForm value={editor} locale={locale} direction={direction} onChange={changeEditor} onSubmit={submitEditor} onCancel={() => setEditor(null)} anchor={node?.title} relationChoices={relations.map(r => ({key:r.key,label:r.label || (r.origin.kind === "kg" ? relationLabel(r.origin.snapshot,locale) : t("独自の関係", "Local relation")),choose:() => chooseRelation(r.key)}))}/></CapsuleModal>}
    {search && <CapsuleModal title={t("KGから追加", "Add from KG")} onClose={() => { active.current?.abort(); setBusy(false); setSearch(false); }}><form className={css.form} onSubmit={event => { event.preventDefault(); void run(async signal => { const result = await searchEntities(query,signal); if (!signal.aborted) { setResults(result.items.map(n => entityDetailSchema.parse(n))); setSearched(true); } }); }}><header className={css.dialogHeading}><h3>{t("KGから追加", "Add from KG")}</h3><button type="button" aria-label={t("検索を閉じる", "Close search")} onClick={() => { active.current?.abort(); setBusy(false); setSearch(false); }}><Icon name="close"/></button></header>{node && <p className={css.contextHint}><Icon name="link"/>{t(`「${node.title}」とつなぐ`, `Connect to “${node.title}”`)}</p>}<div className={css.searchRow}><input aria-label={t("名前・別名", "Name or alias")} data-autofocus required maxLength={100} placeholder={t("名前や別名で検索", "Search by name or alias")} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}/><button disabled={busy} type="submit" data-variant="primary"><Icon name="search"/>{t("検索", "Search")}</button></div>{error && <p role="alert">{error}</p>}{busy && <p role="status">{t("検索中…", "Searching…")}</p>}{searched && !results.length && <p>{t("該当するEntityがありません。別の名前で試せます。", "No entities found. Try another name.")}</p>}<div className={css.resultList}>{results.map(e => { const exists = contentDocument.nodes.some(n => n.origin.kind !== "local" && n.origin.id === e.id); return <button type="button" key={e.id} disabled={exists} onClick={() => addEntity(e)}><div><strong>{e.name}</strong><p>{e.description}</p></div>{exists ? <span>{t("追加済み", "Included")}</span> : <Icon name="plus"/>}</button>; })}</div></form></CapsuleModal>}
    {neighbors && editing && <CapsuleNeighborPicker key={neighbors.key} node={neighbors} document={contentDocument} onAdd={addNeighbors} onClose={()=>setNeighbors(null)}/>}
    {editing && (byteSize > 1_500_000 || contentDocument.nodes.length > 175 || contentDocument.relations.length > 350 || capacity && capacity.totalBytes-capacity.storageBytes < 2_000_000) && <p className={css.notice}>{t("保存容量の上限に近づいています。", "Approaching the storage limit.")} {Math.ceil(byteSize/1000)} / 2000 KB</p>}
  </section>;
}
