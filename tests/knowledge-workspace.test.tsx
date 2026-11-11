// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readKnowledge, useKnowledgeWorkspace } from "../lib/client/use-knowledge-workspace";
import { knowledgeGraphViewSchema, parseKnowledgeReference, workspaceHistoryKey } from "../lib/client/knowledge-workspace-state";
import type { KnowledgeEntityVersion } from "../lib/domain/knowledge-foundation";
import type { KnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import type { KnowledgeThemeRead } from "../lib/domain/knowledge-theme-reader";

const g1 = "k75-" + "1".repeat(32), g2 = "k75-" + "2".repeat(32);
const entity = (id: string): KnowledgeEntityVersion => ({ id, revision: 1, createdAt: "2026-11-02", reason: "追加", content: { name: id, aliases: [], kind: "person", description: "", language: "ja" } });
const a = entity("a"), b = entity("b"), c = entity("c");
const source = { id: "source", revision: 1, createdAt: "2026-11-02", reason: "追加", content: { title: "資料の本文をcacheしない", url: "https://example.org", bibliography: "", language: "ja" } };
function dto(id: string, target: KnowledgeEntityVersion, revision = 1): KnowledgePublishedRecord {
  return { record: { id, revision, createdAt: "2026-11-02", reason: "追加", content: { kind: "relation", subjectId: a.id, objectId: target.id, assertion: "PRIVATE_BODY_" + revision, relation: "ともに制作", polarity: "affirmed", scope: "", times: [], evidence: [{ id: "e", source: { id: source.id, revision: 1 }, locator: "1頁", excerpt: "PRIVATE_EXCERPT", stance: "support" }] } },
    label: "ともに制作", entities: [a, target], sources: [source], semantics: { status: "unmapped", mappingRevision: null, recordRevision: null, concept: null }, legacyTyped: null };
}
const first = dto("r1", b, 2), second = dto("r2", c), pinned = dto("r1", b);
const theme: KnowledgeThemeRead = {
  theme: { id: "theme", revision: 3, createdAt: "2026-11-02", reason: "テーマ", content: { title: "固定したテーマ", description: "", recordPins: [{ id: "r1", revision: 1 }], entityPins: [a, b].map(({ id, revision }) => ({ id, revision })), sourcePins: [{ id: "source", revision: 1 }], mappingPins: [], initialView: "split" } },
  snapshot: { schemaVersion: 1, entities: [a, b], sources: [source], records: [pinned.record], mappings: [], initialView: "split" }, records: [pinned],
};
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function server() {
  let active = g1, token = "1", stoppedTheme = false;
  const hidden = new Set<string>(), requests: URLSearchParams[] = [];
  const delays = new Map<string, { promise: Promise<ReturnType<typeof response>>; resolve: (value: ReturnType<typeof response>) => void; value?: ReturnType<typeof response> }>();
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const p = new URL(url, "http://localhost").searchParams; requests.push(p);
    const mode = p.get("mode")!, generation = p.get("generation") ?? active;
    const records = [first, second].filter(r => !hidden.has(r.record.id));
    const entities = [a, b, c].filter(e => !hidden.has(e.id));
    const graph = (items: KnowledgePublishedRecord[]) => ({ generation, records: items, entities: [...new Map(items.flatMap(r => r.entities).map(e => [e.id, e])).values()] });
    let result: ReturnType<typeof response>;
    if (mode === "status") result = response({ active: { id: active, publishedAt: "now", recordCount: 2 }, changeToken: token, pending: false, lastFailure: null });
    else if (mode === "entities") result = response({ generation, entities: entities.filter(e => p.has("entityId") ? e.id === p.get("entityId") : p.has("entityIds") ? p.get("entityIds")!.split(",").includes(e.id) : e.id.includes(p.get("q") ?? "")), nextCursor: null, hasMore: false });
    else if (mode === "graph") result = response(graph(records.filter(r => (p.get("recordIds") ?? "").split(",").includes(r.record.id))));
    else if (mode === "neighbors") result = response({ ...graph(p.get("entityId") === "c" ? records.filter(r => r.record.id === "r2") : records.filter(r => r.record.id === "r1")), center: entities.find(e => e.id === p.get("entityId")), nextCursor: null, hasMore: false });
    else if (mode === "record") result = response({ generation, record: records.find(r => r.record.id === p.get("recordId")) });
    else if (mode === "themes") result = response({ themes: stoppedTheme ? [] : [{ id: "theme", revision: 3, title: "固定したテーマ", description: "", initialView: "split", hasTimeline: true, entityIds: ["a", "b"] }] });
    else if (mode === "theme") result = stoppedTheme ? response({ error: "このテーマは閲覧できません" }, 404) : response(theme);
    else throw new Error(mode);
    const held = delays.get(mode);
    if (held && !held.value) { held.value = result; return held.promise; }
    return Promise.resolve(result);
  }));
  return { requests, change: (value: string, generation = active) => { token = value; active = generation; }, hide: (id: string) => hidden.add(id), stopTheme: () => { stoppedTheme = true; },
    hold: (mode: string) => {
      let resolve!: (value: ReturnType<typeof response>) => void;
      const delay = { promise: new Promise<ReturnType<typeof response>>(r => { resolve = r; }), resolve: (v: ReturnType<typeof response>) => resolve(v), value: undefined as ReturnType<typeof response> | undefined };
      delays.set(mode, delay);
      return { get started() { return !!delay.value; }, finish: async () => { expect(delay.value).toBeDefined(); delays.delete(mode); await act(async () => { delay.resolve(delay.value!); }); } };
    },
  };
}
async function flush() { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }
async function tick() { await act(() => vi.advanceTimersByTimeAsync(4000)); await flush(); }
async function setup() { const api = server(), hook = renderHook(() => useKnowledgeWorkspace()); await flush(); expect(hook.result.current.restoring).toBe(false); return { api, ...hook }; }
beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('対象からThemeを開くと固定snapshotの対象を選び、閉じても元探索と位置を保持する',async()=>{
 const {result}=await setup();await act(()=>result.current.startFrom(a));
 act(()=>result.current.selectEntity('b'));
 await act(()=>result.current.openTheme({id:'theme',revision:3,focusEntityId:'b'}));
 expect(result.current.themeSelection).toEqual({kind:'entity',id:'b'});
 expect(new URL(location.href).searchParams.get('kfocus')).toBe('b');
 expect(result.current.normal.rootId).toBe('a');expect(result.current.normal.selection).toEqual({kind:'entity',id:'b'});
 act(()=>result.current.closeTheme());expect(result.current.normal.rootId).toBe('a');expect(result.current.normal.records[0].record.revision).toBe(2);
 await act(()=>result.current.openTheme({id:'theme',revision:3,focusEntityId:'c'}));expect(result.current.themeSelection).toBeNull();
 expect(result.current.activeTheme?.records[0].record.revision).toBe(1);
});
it('Theme直リンクの対象焦点は再読込時も復元し、Record直リンクは古い探索の起点で上書きしない',async()=>{
 const api=server();history.replaceState({},'','/?ktheme=theme&krev=3&kfocus=b');
 const hook=renderHook(()=>useKnowledgeWorkspace({embedded:true}));await flush();
 expect(hook.result.current.themeSelection).toEqual({kind:'entity',id:'b'});hook.unmount();
 history.replaceState({},'','/?krecord=r2');
 const secondHook=renderHook(()=>useKnowledgeWorkspace({embedded:true}));await flush();
 expect(secondHook.result.current.normal.selection).toEqual({kind:'record',id:'r2'});expect(secondHook.result.current.normal.records.map(r=>r.record.id)).toEqual(['r2']);
 expect(api.requests.some(p=>p.get('mode')==='graph'&&p.get('recordIds')==='r2')).toBe(true);
});

it("Themeの固定版・選択と通常探索を分け、閉じても両方の読書状態を保つ", async () => {
  const { result } = await setup();
  await act(() => result.current.startFrom(a));
  act(() => { result.current.setQuery("入力途中"); result.current.selectEntity("b"); });
  const normal = result.current.normal;
  await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  expect(result.current.activeTheme?.records[0].record.revision).toBe(1);
  expect(result.current.normal.records[0].record.revision).toBe(2);
  act(() => { result.current.setThemeView("timeline"); result.current.setThemeSelection({ kind: "record", id: "r1" }); result.current.closeTheme(); });
  expect(result.current.activeTheme).toBeNull();
  expect(result.current.retainedTheme?.theme.revision).toBe(3);
  expect(result.current.normal).toBe(normal);
  expect(result.current.query).toBe("入力途中");
  await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  expect(result.current.themeView).toBe("timeline");
  expect(result.current.themeSelection).toEqual({ kind: "record", id: "r1" });
});

it("遅い初期読込を手動検索の結果へ上書きしない", async () => {
  const api = server(), pending = api.hold("status"), { result } = renderHook(() => useKnowledgeWorkspace()); await flush();
  act(() => result.current.setQuery("c"));
  await act(() => result.current.searchEntities());
  expect(result.current.entityPage?.entities.map(e => e.id)).toEqual(["c"]);
  await pending.finish(); await flush();
  expect(result.current.entityPage?.entities.map(e => e.id)).toEqual(["c"]);
  expect(result.current.restoring).toBe(false);
});

it("古いpoll応答で新しい通常探索・選択を巻き戻さない", async () => {
  const { api, result } = await setup(); await act(() => result.current.startFrom(a));
  const pending = api.hold("graph"); api.change("2"); await tick(); expect(pending.started).toBe(true);
  await act(() => result.current.startFrom(c));
  await act(() => result.current.selectRecord("r2"));
  await pending.finish(); await flush();
  expect(result.current.normal.rootId).toBe("c");
  expect(result.current.normal.records.map(r => r.record.id)).toEqual(["r2"]);
  expect(result.current.normal.selection).toEqual({ kind: "record", id: "r2" });
});

it("新世代を通知し、明示更新までは通常探索を古い世代で読む", async () => {
  const { api, result } = await setup(); await act(() => result.current.startFrom(a));
  api.change("2", g2); await tick();
  expect(result.current.status?.active?.id).toBe(g2);
  expect(result.current.normal.generation).toBe(g1);
  await act(() => result.current.refreshLatest());
  expect(result.current.normal.generation).toBe(g2);
});

it("Themeから明示した探索だけは最新世代を使い、URLに表示指定がなければThemeの初期表示を使う", async () => {
  window.history.replaceState({}, "", "/?ktheme=theme");
  const api = server(), { result } = renderHook(() => useKnowledgeWorkspace()); await flush();
  expect(result.current.themeView).toBe("split");
  api.change("2", g2);
  await act(() => result.current.startFrom(a));
  expect(result.current.activeTheme).toBeNull(); expect(result.current.normal.generation).toBe(g2);
});

it("停止したThemeをactiveとhidden保持面から除き通常探索は保つ", async () => {
  const { api, result } = await setup(); await act(() => result.current.startFrom(a));
  await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  api.stopTheme(); api.change("2"); await tick();
  expect(result.current.activeTheme).toBeNull(); expect(result.current.retainedTheme).toBeNull();
  expect(result.current.themes).toEqual([]);
  expect(result.current.normal.rootId).toBe("a");
  expect(result.current.normal.records[0].record.id).toBe("r1");
  expect(result.current.message).toContain("現在閲覧できません");
});

it("Theme停止404は並行する通常Graphの応答待ちや失敗を待たずに表示から除く", async () => {
  const { api, result } = await setup(); await act(() => result.current.startFrom(a));
  await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  const pending = api.hold("graph"); api.stopTheme(); api.change("2"); await tick();
  expect(pending.started).toBe(true);
  expect(result.current.activeTheme).toBeNull(); expect(result.current.retainedTheme).toBeNull();
  expect(result.current.normal.rootId).toBe("a");
  await pending.finish(); await flush();
  expect(result.current.activeTheme).toBeNull();
});

it("公開状態の再確認は入力途中の検索語を適用せず表示中候補だけ停止確認する", async () => {
  const { api, result } = await setup();
  expect(result.current.entityPage?.entities.map(e => e.id)).toEqual(["a", "b", "c"]);
  act(() => result.current.setQuery("c"));
  api.hide("b"); api.change("2"); await tick();
  expect(result.current.entityPage?.entities.map(e => e.id)).toEqual(["a", "c"]);
  expect(result.current.query).toBe("c");
  expect(api.requests.some(p => p.get("mode") === "entities" && p.get("entityIds") === "a,b,c")).toBe(true);
});

it("再読込はIDと版だけから認可付き再取得し、停止した保存記録を表示しない", async () => {
  const { api, result, unmount } = await setup(); await act(() => result.current.startFrom(a));
  await act(() => result.current.selectRecord("r1"));
  act(() => result.current.setQuery("b"));
  const saved = window.history.state[workspaceHistoryKey];
  expect(parseKnowledgeReference(saved)?.recordIds).toEqual(["r1"]);
  expect(JSON.stringify(saved)).not.toContain("PRIVATE_");
  expect(JSON.stringify(sessionStorage)).not.toContain("PRIVATE_");
  unmount(); api.hide("r1");
  const again = renderHook(() => useKnowledgeWorkspace()); await flush();
  expect(again.result.current.normal.records).toEqual([]);
  expect(again.result.current.normal.selection).toBeNull();
  expect(again.result.current.query).toBe("b");
  expect(api.requests.some(p => p.get("mode") === "graph" && p.get("generation") === g1 && p.get("recordIds") === "r1")).toBe(true);
});

it("Graph位置は保存だけでは復元を起動せず、再読込時にだけ対応する描画世代へ復元する", async () => {
  const { result, unmount } = await setup(); await act(() => result.current.startFrom(a));
  const view = { positions: { a: { x: 90, y: 120 }, b: { x: 180, y: 190 } }, pan: { x: 40, y: 30 }, zoom: 0.8, initialLayoutDone: true, viewport: { width: 500, height: 400 } };
  act(() => result.current.captureNormalView(view));
  expect(result.current.normalRestoration).toBeNull();
  await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  act(() => result.current.captureThemeView({ ...view, zoom: 0.9 }));
  expect(result.current.themeRestoration).toBeNull();
  unmount(); const restored = renderHook(() => useKnowledgeWorkspace()); await flush();
  expect(restored.result.current.normalRestoration).toEqual({ generation: restored.result.current.normal.epoch, view });
  expect(restored.result.current.themeRestoration?.generation).toBe(3);
  expect(restored.result.current.themeRestoration?.view.zoom).toBe(0.9);
  expect(knowledgeGraphViewSchema.safeParse({ ...view, pan: { x: Infinity, y: 0 } }).success).toBe(false);
});

it("Backで元探索を再読込し、遅いTheme読込が閉じた画面を再度開かない", async () => {
  const { api, result } = await setup(); await act(() => result.current.startFrom(a));
  const ordinary = structuredClone(window.history.state);
  await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  window.history.replaceState(ordinary, "", "/");
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: ordinary })); }); await flush();
  expect(result.current.activeTheme).toBeNull(); expect(result.current.normal.rootId).toBe("a");
  const pending = api.hold("theme"); act(() => { void result.current.openTheme({ id: "theme" }); }); await flush();
  act(() => result.current.closeTheme()); await pending.finish(); await flush();
  expect(result.current.activeTheme).toBeNull();
});

it.each([false, true])("検索モーダルだけのBack/Forwardではテーマ・選択・Canvas世代を保持する（初期本文=%s）", async initial => {
  const api = server(); if (initial) history.replaceState({}, "", "/t/theme");
  const { result } = renderHook(() => useKnowledgeWorkspace(initial ? { embedded: true, initialTheme: theme } : {}));
  await flush(); if (!initial) await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  act(() => {
    result.current.setThemeView("timeline"); result.current.setThemeSelection({ kind: "record", id: "r1" });
    result.current.captureThemeView({ positions: { a: { x: 90, y: 120 } }, pan: { x: 40, y: 30 }, zoom: .8, initialLayoutDone: true });
  });
  const before = result.current, requests = api.requests.length, href = location.href, base = structuredClone(history.state);
  const modal = { ...base, plunodeDiscovery: { entry: "themes" }, discoveryReturnFocus: "search" };
  history.pushState(modal, "", href);
  for (const destination of [base, modal, base]) {
    history.replaceState(destination, "", href);
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: destination })); }); await flush();
    expect(api.requests).toHaveLength(requests); expect(result.current.activeTheme).toBe(before.activeTheme);
    expect(result.current.normal).toBe(before.normal); expect(result.current.themeSelection).toBe(before.themeSelection);
    expect(result.current.themeCanvasView).toBe(before.themeCanvasView); expect(result.current.themeRestoration).toBeNull();
    expect(result.current.themeView).toBe("timeline"); expect(result.current.restoring).toBe(false);
  }
});

it("同じURLでも探索の履歴情報が変わったBackは認可付きで復元する", async () => {
  const { api, result } = await setup(); await act(() => result.current.openTheme({ id: "theme", revision: 3 }));
  const base = structuredClone(history.state), href = location.href;
  act(() => result.current.setThemeSelection({ kind: "record", id: "r1" }));
  expect(location.href).toBe(href); const requests = api.requests.length;
  history.replaceState(base, "", href);
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: base })); }); await flush();
  expect(api.requests.slice(requests).map(p => p.get("mode"))).toContain("theme");
  expect(result.current.activeTheme?.theme.id).toBe("theme"); expect(result.current.themeSelection).toBeNull();
});

it("初期テーマ取得中の検索閉鎖は取得を重ねず、到着した本文を保持する", async () => {
  history.replaceState({}, "", "/?ktheme=theme");
  const api = server(), pending = api.hold("status"), { result } = renderHook(() => useKnowledgeWorkspace()); await flush();
  history.pushState({ plunodeDiscovery: { entry: "themes" } }, "", location.href);
  history.replaceState({}, "", location.href);
  await act(async () => { window.dispatchEvent(new PopStateEvent("popstate", { state: {} })); }); await flush();
  expect(api.requests.filter(p => p.get("mode") === "status")).toHaveLength(1);
  await pending.finish(); await flush();
  expect(result.current.activeTheme?.theme.id).toBe("theme"); expect(result.current.restoring).toBe(false);
});

it("応答本文が停止しても15秒で再試行可能にする", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })));
  const outcome = readKnowledge("status").catch(e => e);
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await outcome as Error).message).toContain("再試行できます");
});


it("既存Explorerの通常URLへ戻ったときsession内の古いテーマを再表示しない",async()=>{
 const {result,unmount}=await setup();
 await act(()=>result.current.openTheme({id:"theme",revision:3}));
 unmount();history.replaceState({},"","/?ordinary=1");
 const embedded=renderHook(()=>useKnowledgeWorkspace({embedded:true}));await flush();
 expect(embedded.result.current.activeTheme).toBeNull();
 expect(location.search).toBe("?ordinary=1");
});
it("既存Explorerからのテーマ明示URLは、古いsessionより指定の構成版を優先する",async()=>{
 server();history.replaceState({},"","/?ktheme=theme&krev=3");
 const {result}=renderHook(()=>useKnowledgeWorkspace({embedded:true}));await flush();
 expect(result.current.activeTheme?.theme.revision).toBe(3);
 expect(location.search).toContain("ktheme=theme");
});

it("失効した対象探索は成功扱いせず、呼出側のURLを付け替えない",async()=>{
 const {api,result}=await setup();const pending=api.hold("neighbors");
 let outcome:unknown;act(()=>{void result.current.startFrom(a).then(v=>{outcome=v;});});await flush();
 act(()=>result.current.closeTheme("replace"));await pending.finish();await flush();
 expect(outcome).toBe(false);expect(result.current.normal.rootId).toBeNull();
});

it("opens an explicitly linked record from the latest publication without mixing the retained generation",async()=>{
 const {api,...hook}=await setup();
 await act(async()=>{await hook.result.current.startFrom(a);});expect(hook.result.current.normal.generation).toBe(g1);
 api.change("new-published-record",g2);expect(hook.result.current.normal.generation).toBe(g1);
 await act(async()=>{await hook.result.current.selectRecord("r1");});
 expect(api.requests.filter(q=>q.get("mode")==="record").at(-1)?.get("generation")).toBe(g1);
 await act(async()=>{await hook.result.current.selectRecord("r2",{latest:true});});
 expect(api.requests.filter(q=>q.get("mode")==="record").at(-1)?.has("generation")).toBe(false);
 expect(hook.result.current.normal.generation).toBe(g2);expect(hook.result.current.normal.records.map(r=>r.record.id)).toEqual(["r2"]);
 expect(hook.result.current.normal.rootId).toBeNull();
});
it("starts from an explicit new search result in the latest generation while ordinary expansion stays pinned",async()=>{
 const {api,...hook}=await setup();await act(async()=>{await hook.result.current.startFrom(a);});api.change("new-subject",g2);
 await act(async()=>{await hook.result.current.expandEntity(b.id);});expect(api.requests.filter(q=>q.get("mode")==="neighbors").at(-1)?.get("generation")).toBe(g1);
 await act(async()=>{await hook.result.current.startFrom(c,{latest:true});});
 expect(api.requests.filter(q=>q.get("mode")==="neighbors").at(-1)?.has("generation")).toBe(false);
 expect(hook.result.current.normal).toMatchObject({generation:g2,rootId:c.id});
});

it("explains an unavailable explicitly linked record instead of leaving an unexplained empty graph",async()=>{
 const api=server();api.hide('r1');history.replaceState({},'', '/?krecord=r1');const {result}=renderHook(()=>useKnowledgeWorkspace({embedded:true}));await flush();expect(result.current.normal.records).toHaveLength(0);expect(result.current.message).toContain('この知識は現在閲覧できません');
});
it("explains removal of the selected record when current visibility changes",async()=>{
 const {api,result}=await setup();await act(()=>result.current.selectRecord('r1'));api.hide('r1');api.change('record-hidden');await tick();expect(result.current.normal.records.some(r=>r.record.id==='r1')).toBe(false);expect(result.current.message).toContain('選択していた知識は現在閲覧できません');
});
