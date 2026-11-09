"use client";
import {useUiLocale} from "./ui-locale";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeEntityVersion } from "../domain/knowledge-foundation";
import type { KnowledgePublishedRecord } from "../domain/knowledge-publication";
import type { KnowledgeEntityPage, KnowledgeThemePage, KnowledgeThemeRead } from "../domain/knowledge-theme-reader";
import {
  emptyKnowledgeReference, knowledgeGraphViewSchema, knowledgeThemeLocation, knowledgeWorkspaceHref, parseKnowledgeReference,
  workspaceHistoryKey, workspaceStorageKey, type KnowledgeSelection, type KnowledgeView, type KnowledgeWorkspaceReference,
} from "./knowledge-workspace-state";
import type { GraphView, ViewRestoration } from "./graph-view";

export type KnowledgeWorkspaceNormal = {
  generation: string | null; rootId: string | null; records: KnowledgePublishedRecord[];
  entities: KnowledgeEntityVersion[]; selection: KnowledgeSelection; epoch: number;
};
export type KnowledgeWorkspaceStatus = {
  active: { id: string; publishedAt: string; recordCount: number } | null;
  changeToken: string; pending: boolean; lastFailure: { message: string } | null;
};
type GraphRead = { generation: string; records: KnowledgePublishedRecord[]; entities: KnowledgeEntityVersion[] };
type Neighbors = GraphRead & { center: KnowledgeEntityVersion; nextCursor: string | null; hasMore: boolean };
type State = {
  query: string; kind: string; normal: KnowledgeWorkspaceNormal; entityPage: KnowledgeEntityPage | null;
  themes: KnowledgeThemePage["themes"]; activeTheme: KnowledgeThemeRead | null; retainedTheme: KnowledgeThemeRead | null;
  themeView: KnowledgeView; themeSelection: KnowledgeSelection;
  neighborPages: Record<string, { cursor: string | null; hasMore: boolean }>;
  normalView?: GraphView; themeCanvasView?: { themeId: string; revision: number; view: GraphView };
  normalRestoration: ViewRestoration | null; themeRestoration: ViewRestoration | null;
};
class ReadError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function readKnowledge<T>(mode: string, args: Record<string, unknown> = {}): Promise<T> {
  const params = new URLSearchParams({ mode });
  for (const [key, value] of Object.entries(args)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch("/api/knowledge/public?" + params, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new ReadError(typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : "読めませんでした。再試行できます。", response.status);
        return data as T;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new ReadError("取得に時間がかかっています。再試行できます。", 408)); controller.abort(); }, 15_000); }),
    ]);
  } catch (error) {
    if (error instanceof ReadError) throw error;
    throw new ReadError("接続を確認できませんでした。表示を残したまま再試行できます。", 0);
  } finally { clearTimeout(timer); }
}
const blankNormal = (): KnowledgeWorkspaceNormal => ({ generation: null, rootId: null, records: [], entities: [], selection: null, epoch: 0 });
const messageOf = (e: unknown) => e instanceof Error ? e.message : "読めませんでした。再試行できます。";
const unavailable = (e: unknown) => e instanceof ReadError && [403, 404, 410].includes(e.status);
const mergeRecords = (a: KnowledgePublishedRecord[], b: KnowledgePublishedRecord[]) => [...new Map([...a, ...b].map(r => [r.record.id, r])).values()].slice(0, 200);
const mergeEntities = (...lists: KnowledgeEntityVersion[][]) => [...new Map(lists.flat().map(e => [e.id, e])).values()];
const recordEntities = (records: KnowledgePublishedRecord[]) => mergeEntities(...records.map(r => r.entities));
function validSelection(value: KnowledgeSelection, records: KnowledgePublishedRecord[], entities: KnowledgeEntityVersion[]) {
  return value && (value.kind === "record" ? records.some(r => r.record.id === value.id) : entities.some(e => e.id === value.id)) ? value : null;
}
function reference(s: State): KnowledgeWorkspaceReference {
  return { version: 1, query: s.query, kind: s.kind, generation: s.normal.generation, rootId: s.normal.rootId,
    recordIds: s.normal.records.map(r => r.record.id), selection: s.normal.selection,
    theme: s.activeTheme ? { id: s.activeTheme.theme.id, revision: s.activeTheme.theme.revision } : null,
    themeView: s.themeView, themeSelection: s.themeSelection,
    ...(s.normalView ? { normalView: s.normalView } : {}), ...(s.themeCanvasView ? { themeCanvasView: s.themeCanvasView } : {}) };
}
function savedReference(): KnowledgeWorkspaceReference | null {
  const fromHistory = parseKnowledgeReference(window.history.state?.[workspaceHistoryKey]);
  if (fromHistory) return fromHistory;
  try { return parseKnowledgeReference(JSON.parse(sessionStorage.getItem(workspaceStorageKey + location.pathname) ?? "null")); }
  catch { return null; }
}
function writeReference(s: State, push = false) {
  const value = reference(s), href = knowledgeWorkspaceHref(new URL(location.href), value);
  try { sessionStorage.setItem(workspaceStorageKey + location.pathname, JSON.stringify(value)); } catch { /* Private storage can be unavailable. In-memory reading still works. */ }
  try { window.history[push ? "pushState" : "replaceState"]({ ...window.history.state, [workspaceHistoryKey]: value }, "", href); } catch { /* Do not lose the reading state when browser history is rate-limited. */ }
}

/** Keeps ordinary exploration and a pinned Theme as two independent reading states. */
export function useKnowledgeWorkspace({ initialRootId, embedded = false,initialTheme }: { initialRootId?: string; embedded?: boolean;initialTheme?:KnowledgeThemeRead } = {}) {
  const {locale}=useUiLocale();
  const localeRef=useRef(locale);useEffect(()=>{localeRef.current=locale;},[locale]);
  const [state, setState] = useState<State>(() => ({ query: "", kind: "", normal: blankNormal(), entityPage: null, themes: [], activeTheme: initialTheme??null, retainedTheme: initialTheme??null, themeView: initialTheme?.theme.content.initialView??"graph", themeSelection: null, neighborPages: {}, normalRestoration: null, themeRestoration: null }));
  const current = useRef(state), alive = useRef(false), ready = useRef(false);
  const epoch = useRef(0), entitySearch = useRef(0), themeSearch = useRef(0), access = useRef<string | null>(null);
  const themeCriteria = useRef<{ q?: string; entityId?: string }>({});
  const [busy, setBusy] = useState(false), [restoring, setRestoring] = useState(!initialTheme);
  const [searchingEntities, setSearchingEntities] = useState(false), [searchingThemes, setSearchingThemes] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [status, setStatus] = useState<KnowledgeWorkspaceStatus | null>(null);
  const update = useCallback((fn: (s: State) => State, history: "replace" | "push" | "none" = "replace") => {
    const next = fn(current.current); current.current = next; setState(next);
    if (ready.current && history !== "none") writeReference(next, history === "push");
  }, []);
  const begin = () => { const token = ++epoch.current; ready.current = true; setRestoring(false); setBusy(true); setError(""); setMessage(""); return token; };
  const live = (token: number) => alive.current && token === epoch.current;
  const finish = (token: number) => { if (live(token)) setBusy(false); };

  async function restore(saved: KnowledgeWorkspaceReference, override?: ReturnType<typeof knowledgeThemeLocation>) {
    const token = ++epoch.current; ready.current = false; setBusy(true); setError(""); setRestoring(true);
    entitySearch.current++; themeSearch.current++; themeCriteria.current = {};
    setSearchingEntities(false); setSearchingThemes(false);
    // Never show cached bodies during Back/reload; all content is read and authorized again.
    update(s => ({ ...s, query: saved.query, kind: saved.kind, normal: { ...blankNormal(), epoch: s.normal.epoch + 1 }, activeTheme: null, retainedTheme: null, entityPage: null, themeSelection: null, neighborPages: {}, normalRestoration: null, themeRestoration: null }), "none");
    try {
      const s = await readKnowledge<KnowledgeWorkspaceStatus>("status"); if (!live(token)) return; setStatus(s);
      const generation = saved.generation ?? s.active?.id ?? null;
      let normal = { ...blankNormal(), generation, epoch: current.current.normal.epoch };
      let entityPage: KnowledgeEntityPage | null = null;
      if (generation) {
        const [graph, page] = await Promise.all([
          readKnowledge<GraphRead>("graph", { generation, recordIds: saved.recordIds.join(",") }),
          readKnowledge<KnowledgeEntityPage>("entities", { generation, q: saved.query, kind: saved.kind || undefined }),
        ]);
        if (!live(token)) return;
        if (graph.generation !== generation || page.generation !== generation) throw new Error("公開版が一致しません。読み直してください。");
        entityPage = page;
        let root: KnowledgeEntityVersion | undefined;
        if (saved.rootId) {
          root = graph.entities.find(e => e.id === saved.rootId);
          if (!root) root = (await readKnowledge<KnowledgeEntityPage>("entities", { generation, entityId: saved.rootId })).entities[0];
          if (root && !saved.generation) {
            const initial = await readKnowledge<Neighbors>("neighbors", { generation, entityId: root.id });
            graph.records = initial.records; graph.entities = initial.entities;
          }
        }
        const entities = mergeEntities(graph.entities, root ? [root] : []);
        if(saved.selection?.kind==='record'&&!graph.records.some(r=>r.record.id===saved.selection!.id)&&live(token))setMessage("この知識は現在閲覧できません。公開停止や参照先の変更の可能性があります。");
        normal = { ...normal, rootId: root?.id ?? null, records: graph.records, entities, selection: validSelection(saved.selection, graph.records, entities) };
      }
      let theme: KnowledgeThemeRead | null = null;
      const wanted = override ?? (saved.theme ? { ...saved.theme, view: saved.themeView } : null);
      if (wanted) try { theme = await readKnowledge<KnowledgeThemeRead>("theme", { themeId: wanted.id, revision: wanted.revision, language:localeRef.current }); }
      catch (e) { if (!unavailable(e)) throw e; if (live(token)) setMessage("このテーマは現在閲覧できません。元の探索に戻りました。"); }
      if (!live(token)) return;
      const themes = await readKnowledge<KnowledgeThemePage>("themes").catch(() => ({ themes: [] }));
      if (!live(token)) return;
      // Publish the authorized bodies and their view restoration in one new canvas epoch.
      normal = { ...normal, epoch: current.current.normal.epoch + 1 };
      ready.current = true; access.current = s.changeToken;
      const themeView = theme && saved.themeCanvasView?.themeId === theme.theme.id && saved.themeCanvasView.revision === theme.theme.revision ? saved.themeCanvasView : undefined;
      update(old => ({ ...old, normal, entityPage: old.query === saved.query && old.kind === saved.kind ? entityPage : null, themes: themes.themes, activeTheme: theme, retainedTheme: theme,
        normalView: saved.normalView, themeCanvasView: themeView,
        normalRestoration: saved.normalView ? { generation: normal.epoch, view: saved.normalView } : null,
        themeRestoration: themeView ? { generation: themeView.revision, view: themeView.view } : null,
        themeView: wanted?.view ?? theme?.theme.content.initialView ?? "graph",
        themeSelection: theme ? validSelection(wanted?.focusEntityId?{kind:'entity',id:wanted.focusEntityId}:saved.themeSelection, theme.records, theme.snapshot.entities) : null }));
    } catch (e) { if (live(token)) { ready.current = true; setError(messageOf(e)); } }
    finally { if (live(token)) { setRestoring(false); setBusy(false); } }
  }

  useEffect(() => {
    alive.current = true;
    let disposed = false; const pendingEpoch = epoch, pendingEntitySearch = entitySearch, pendingThemeSearch = themeSearch;
    const stored = savedReference() ?? emptyKnowledgeReference();
    if (embedded) {
      // The existing Explorer owns ordinary URLs. Only explicit Theme/common links activate this reader.
      stored.theme = null;
      const directRecord=new URL(location.href).searchParams.get("krecord");
      if(directRecord){stored.rootId=null;stored.recordIds=[directRecord];stored.generation=null;stored.selection={kind:"record",id:directRecord};stored.normalView=undefined;}
      const commonRoot=new URL(location.href).searchParams.get("kentity");
      if(commonRoot && stored.rootId!==commonRoot){stored.rootId=commonRoot;stored.recordIds=[];stored.generation=null;stored.selection={kind:"entity",id:commonRoot};}
    }
    if (initialRootId && stored.rootId !== initialRootId) { stored.rootId = initialRootId; stored.recordIds = []; stored.selection = { kind: "entity", id: initialRootId }; stored.theme = null; }
    queueMicrotask(() => { if(disposed)return;const wanted=knowledgeThemeLocation(new URL(location.href));
      if(initialTheme&&wanted?.id===initialTheme.theme.id&&(!wanted.revision||wanted.revision===initialTheme.theme.revision)){
        ready.current=true;setRestoring(false);update(s=>({...s,themeView:wanted.view??s.themeView,themeSelection:validSelection(wanted.focusEntityId?{kind:"entity",id:wanted.focusEntityId}:stored.themeSelection,initialTheme.records,initialTheme.snapshot.entities)}),"none");
      }else void restore(stored,wanted);
    });
    const pop = () => { void restore(parseKnowledgeReference(window.history.state?.[workspaceHistoryKey]) ?? emptyKnowledgeReference(), knowledgeThemeLocation(new URL(location.href))); };
    window.addEventListener("popstate", pop);
    return () => { disposed = true; alive.current = false; ready.current = false; pendingEpoch.current++; pendingEntitySearch.current++; pendingThemeSearch.current++; window.removeEventListener("popstate", pop); };
    // Initial URL is consumed once. User navigation is handled by popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let polling = false;
    async function poll() {
      if (polling || !ready.current) return;
      polling = true; const token = epoch.current, before = current.current;
      try {
        const s = await readKnowledge<KnowledgeWorkspaceStatus>("status"); if (!live(token)) return; setStatus(s);
        if (s.changeToken === access.current && (before.normal.generation || !s.active)) return;
        const generation = before.normal.generation ?? s.active?.id ?? null, ids = before.normal.records.map(r => r.record.id);
        const heldTheme = before.retainedTheme;
        const candidateToken = themeSearch.current;
        const results = await Promise.allSettled([
          generation ? readKnowledge<GraphRead>("graph", { generation, recordIds: ids.join(",") }) : Promise.resolve(null),
          heldTheme ? readKnowledge<KnowledgeThemeRead>("theme", { themeId: heldTheme.theme.id, revision: heldTheme.theme.revision, language:localeRef.current }).then(value => ({ value, stopped: false })).catch(e => {
            if (!unavailable(e)) throw e;
            // A known stop takes effect even if another, independent read fails or stalls.
            if (live(token) && current.current.retainedTheme?.theme.id === heldTheme.theme.id && current.current.retainedTheme.theme.revision === heldTheme.theme.revision) {
              update(old => ({ ...old, activeTheme: null, retainedTheme: null, themeSelection: null, themeCanvasView: undefined, themeRestoration: null, themes: old.themes.filter(t => t.id !== heldTheme.theme.id) }));
              if (before.activeTheme) setMessage("このテーマは現在閲覧できません。元の探索に戻りました。");
            }
            return { value: null, stopped: true };
          }) : Promise.resolve(null),
          generation && before.entityPage
            ? Promise.all(Array.from({ length: Math.ceil(before.entityPage.entities.length / 50) }, (_, i) => readKnowledge<KnowledgeEntityPage>("entities", { generation, entityIds: before.entityPage!.entities.slice(i * 50, (i + 1) * 50).map(e => e.id).join(","), limit: 50 }))).then(pages => {
              const allowed = new Set(pages.flatMap(p => p.entities.map(e => e.id)));
              return { ...before.entityPage!, entities: before.entityPage!.entities.filter(e => allowed.has(e.id)) };
            })
            : generation && !before.normal.generation ? readKnowledge<KnowledgeEntityPage>("entities", { generation, q: before.query, kind: before.kind || undefined }) : Promise.resolve(null),
          before.themes.length ? readKnowledge<KnowledgeThemePage>("themes", themeCriteria.current) : Promise.resolve(null),
        ]);
        if (!live(token) || current.current !== before || candidateToken !== themeSearch.current) return;
        const graph = results[0].status === "fulfilled" ? results[0].value : null;
        const themeResult = results[1].status === "fulfilled" ? results[1].value : null;
        const page = results[2].status === "fulfilled" ? results[2].value : null;
        const candidates = results[3].status === "fulfilled" ? results[3].value : null;
        const failure = results.find(r => r.status === "rejected");
        if (failure?.status === "rejected") setError(messageOf(failure.reason));
        let root = graph?.entities.find(e => e.id === before.normal.rootId);
        if (generation && before.normal.rootId && !root) root = (await readKnowledge<KnowledgeEntityPage>("entities", { generation, entityId: before.normal.rootId })).entities[0];
        if (!live(token) || current.current !== before || candidateToken !== themeSearch.current) return;
        const records = graph?.records ?? before.normal.records;
        if(graph&&before.normal.selection?.kind==='record'&&!records.some(r=>r.record.id===before.normal.selection!.id))setMessage("選択していた知識は現在閲覧できません。公開停止や参照先の変更の可能性があります。");
        const entities = graph ? mergeEntities(graph.entities, root ? [root] : []) : before.normal.entities;
        update(old => ({ ...old, normal: { ...old.normal, generation, rootId: root?.id ?? (graph ? null : old.normal.rootId), records, entities, selection: validSelection(old.normal.selection, records, entities) },
          entityPage: page ?? old.entityPage,
          themes: candidates ? old.themes.flatMap(t => { const publicTheme = candidates.themes.find(v => v.id === t.id); return publicTheme ? [publicTheme] : []; }) : old.themes,
          activeTheme: old.activeTheme && themeResult ? themeResult.value : old.activeTheme,
          retainedTheme: themeResult ? themeResult.value : old.retainedTheme,
          ...(themeResult?.stopped ? { themeCanvasView: undefined, themeRestoration: null } : {}),
          themeSelection: themeResult?.value ? validSelection(old.themeSelection, themeResult.value.records, themeResult.value.snapshot.entities) : themeResult?.stopped ? null : old.themeSelection }));
        if (themeResult?.stopped && before.activeTheme) setMessage("このテーマは現在閲覧できません。元の探索に戻りました。");
        if (!failure) access.current = s.changeToken;
      } catch (e) { if (live(token)) setError(messageOf(e)); }
      finally { polling = false; }
    }
    const timer = setInterval(() => { void poll(); }, 4000);
    return () => clearInterval(timer);
    // Poll works from synchronized refs; it never starts a second request while pending.
  }, [update]);

  function setQuery(query: string) { if (ready.current) { epoch.current++; setBusy(false); } update(s => ({ ...s, query })); }
  function setKind(kind: string) { if (ready.current) { epoch.current++; setBusy(false); } update(s => ({ ...s, kind })); }
  async function searchEntities(cursor?: string | null) {
    if (!ready.current) { epoch.current++; ready.current = true; setRestoring(false); setBusy(false); }
    const token = ++entitySearch.current, before = current.current;
    setError(""); setSearchingEntities(true);
    try {
      const page = await readKnowledge<KnowledgeEntityPage>("entities", { generation: before.normal.generation ?? undefined, q: before.query, kind: before.kind || undefined, cursor: cursor ?? undefined });
      if (!alive.current || token !== entitySearch.current || before.query !== current.current.query || before.kind !== current.current.kind || before.normal.generation !== current.current.normal.generation) return;
      update(s => ({ ...s, normal: { ...s.normal, generation: page.generation }, entityPage: cursor && s.entityPage ? { ...page, entities: mergeEntities(s.entityPage.entities, page.entities) } : page }));
    } catch (e) { if (alive.current && token === entitySearch.current) setError(messageOf(e)); }
    finally { if (alive.current && token === entitySearch.current) setSearchingEntities(false); }
  }
  async function findThemes(args: { q?: string; entityId?: string }) {
    const token = ++themeSearch.current; themeCriteria.current = args; setSearchingThemes(true); setError("");
    try { const page = await readKnowledge<KnowledgeThemePage>("themes", args); if (alive.current && token === themeSearch.current) update(s => ({ ...s, themes: page.themes })); }
    catch (e) { if (alive.current && token === themeSearch.current) setError(messageOf(e)); }
    finally { if (alive.current && token === themeSearch.current) setSearchingThemes(false); }
  }
  async function loadNeighbors(id: string, cursor?: string | null, start = false, latest = false) {
    const token = begin(), before = current.current.normal;
    try {
      const result = await readKnowledge<Neighbors>("neighbors", { generation: !latest ? before.generation ?? undefined : undefined, entityId: id, cursor: cursor ?? undefined });
      if (!live(token)) return false;
      if (!latest && before.generation && result.generation !== before.generation) throw new Error("公開版が一致しません。");
      update(s => {
        const records = start ? result.records : mergeRecords(s.normal.records, result.records);
        return { ...s, activeTheme: start ? null : s.activeTheme, ...(start ? { normalView: undefined, normalRestoration: null } : {}), normal: { generation: result.generation, rootId: start ? id : s.normal.rootId ?? id, records,
          entities: mergeEntities(start ? [] : s.normal.entities, recordEntities(records), [result.center]), selection: start ? { kind: "entity", id } : s.normal.selection, epoch: s.normal.epoch + (start ? 1 : 0) },
          neighborPages: { ...(start ? {} : s.neighborPages), [id]: { cursor: result.nextCursor, hasMore: result.hasMore } } };
      }, start ? "push" : "replace");
      setMessage(result.records.length ? "周囲の関係を表示しました。" : "この対象に表示できる関係はありません。");
      return true;
    } catch (e) { if (live(token)) setError(messageOf(e)); return false; } finally { finish(token); }
  }
  async function startFrom(entity: KnowledgeEntityVersion,options:{latest?:boolean}={}) { return loadNeighbors(entity.id, undefined, true, options.latest??Boolean(current.current.activeTheme)); }
  async function expandEntity(id: string, cursor?: string | null) { await loadNeighbors(id, cursor); }
  function selectEntity(id: string) {
    epoch.current++; setBusy(false);
    update(s => s.normal.entities.some(e => e.id === id) ? { ...s, normal: { ...s.normal, selection: { kind: "entity", id } } } : s);
  }
  async function selectRecord(id: string,options:{latest?:boolean}={}) {
    const token = begin(), generation = options.latest?null:current.current.normal.generation;
    try {
      const result = await readKnowledge<{ generation: string; record: KnowledgePublishedRecord }>("record", { generation: generation ?? undefined, recordId: id });
      if (!live(token)) return;
      if (generation && result.generation !== generation) throw new Error("公開版が一致しません。");
      update(s => {
        const fresh=options.latest&&s.normal.generation!==result.generation;
        const records=mergeRecords(fresh?[]:s.normal.records,[result.record]);
        return {...s,activeTheme:null,...(fresh?{normalView:undefined,normalRestoration:null,neighborPages:{}}:{}),normal:{...s.normal,...(fresh?{rootId:null,epoch:s.normal.epoch+1}:{}),generation:result.generation,records,entities:mergeEntities(fresh?[]:s.normal.entities,recordEntities(records)),selection:{kind:"record",id}}};
      }, options.latest||current.current.activeTheme ? "push" : "replace");
      return true;
    } catch (e) { if (live(token)) setError(messageOf(e)); return false; } finally { finish(token); }
  }
  async function openTheme(ref: { id: string; revision?: number; focusEntityId?: string }) {
    const token = begin();
    try {
      const theme = await readKnowledge<KnowledgeThemeRead>("theme", { themeId: ref.id, revision: ref.revision, language:localeRef.current });
      if (!live(token)) return;
      update(s => { const same = s.retainedTheme?.theme.id === theme.theme.id && s.retainedTheme.theme.revision === theme.theme.revision; return { ...s, activeTheme: theme, retainedTheme: theme, themeView: same ? s.themeView : theme.theme.content.initialView, themeSelection: ref.focusEntityId?validSelection({kind:'entity',id:ref.focusEntityId},theme.records,theme.snapshot.entities):same ? s.themeSelection : null, ...(same ? {} : { themeCanvasView: undefined, themeRestoration: null }) }; }, "push");
    } catch (e) {
      if (live(token)) { setError(messageOf(e)); if (unavailable(e)) update(s => s.retainedTheme?.theme.id === ref.id ? { ...s, activeTheme: null, retainedTheme: null, themeSelection: null, themeCanvasView: undefined, themeRestoration: null } : s); }
    } finally { finish(token); }
  }
  function closeTheme(history: "push" | "replace" = "push") { epoch.current++; setBusy(false); update(s => ({ ...s, activeTheme: null }), history); }
  function setThemeView(themeView: KnowledgeView) { epoch.current++; setBusy(false); update(s => ({ ...s, themeView })); }
  function setThemeSelection(selection: KnowledgeSelection) {
    epoch.current++; setBusy(false);
    update(s => ({ ...s, themeSelection: s.activeTheme ? validSelection(selection, s.activeTheme.records, s.activeTheme.snapshot.entities) : null }));
  }
  function captureNormalView(view: GraphView | null) {
    if (!ready.current || current.current.activeTheme || !view) return;
    const parsed = knowledgeGraphViewSchema.safeParse(view);
    if (parsed.success) update(s => ({ ...s, normalView: parsed.data }));
  }
  function captureThemeView(view: GraphView | null) {
    const theme = current.current.activeTheme;
    if (!ready.current || !theme || !view) return;
    const parsed = knowledgeGraphViewSchema.safeParse(view);
    if (parsed.success) update(s => ({ ...s, themeCanvasView: { themeId: theme.theme.id, revision: theme.theme.revision, view: parsed.data } }));
  }
  async function refreshLatest() {
    const s = current.current;
    if (s.activeTheme) { await openTheme({ id: s.activeTheme.theme.id }); return; }
    if (s.normal.rootId) { await loadNeighbors(s.normal.rootId, undefined, true, true); return; }
    const token = begin();
    try {
      const page = await readKnowledge<KnowledgeEntityPage>("entities", { q: s.query, kind: s.kind || undefined });
      if (!live(token)) return;
      update(old => ({ ...old, normal: { ...blankNormal(), generation: page.generation, epoch: old.normal.epoch + 1 }, entityPage: page, neighborPages: {}, normalView: undefined, normalRestoration: null }), "push");
    } catch (e) { if (live(token)) setError(messageOf(e)); } finally { finish(token); }
  }
  return { ...state, setQuery, setKind, searchEntities, searchThemes: (q = current.current.query) => findThemes({ q }), relatedThemes: (entityId: string) => findThemes({ entityId }),
    startFrom, expandEntity, selectEntity, selectRecord, openTheme, closeTheme, setThemeView, setThemeSelection, captureNormalView, captureThemeView, refreshLatest, status, busy: busy || searchingEntities || searchingThemes, searchingEntities, searchingThemes, restoring, error, message };
}
