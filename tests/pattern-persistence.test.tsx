// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { emptyGraph } from "../lib/client/graph-state";
import { useExplorationUrl } from "../lib/client/use-exploration-url";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { deflateSync, strToU8 } from "fflate";
import { captureWorkspace, readWorkspaces, writeWorkspace, rebuildWorkspace, restartWorkspace, parseWorkspaceBackup, legacyWorkspaceKey, workspaceKey } from "../lib/client/saved-workspace";
import { editSavedViews, readSavedViews, exportSavedViews, importSavedViews, legacySavedViewsKey, savedViewsKey, type SavedView } from "../lib/client/saved-views";
import { decodeExploration, encodeExploration, rebuildExplorationUrl, explorationHref } from "../lib/client/exploration-url";
import { emptyPatternGraph, mergePatternPage, openPatternNode, projectGraph } from "../lib/client/graph-state";
import { routeKey } from "../lib/domain/pattern-graph";
import { PREDICATE_KEYS } from "../lib/domain/predicates";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { freeRelation, legacyRelation } from "../lib/client/relation-state";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import RelationFilter from "../components/RelationFilter";
import { root, id, relation, route, page } from "./pattern-graph-fixture";

const a = route(100, 2), b = route(100, 3), body = page([a, b]);
const view = { positions: { [root.id]: { x: 25, y: 51 }, [id(3)]: { x: 82, y: 11 } }, pan: { x: 5, y: 8 }, zoom: .7, initialLayoutDone: true };
const state = () => {
  const g = openPatternNode(mergePatternPage(emptyPatternGraph(root, relation), body, null), id(100));
  // A migrated old route-open save owns only the retained endpoint Claim.
  return projectGraph({ ...g, expansions: { ...g.expansions, [id(100)]: { ...g.expansions[id(100)], pages: [{ after: null, claimIds: [b.claimIds[1]], nextCursor: null }] } } });
};
const saved = () => captureWorkspace("public-kg", "経路を再訪", state(), view);
const signal = () => new AbortController().signal;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn<typeof fetch>();
const restoreBody = (revision = "r1") => ({ version: 1, dataset: "public-kg", revision, relation, root: body.root, nodes: body.nodes, claims: body.claims,
  operation: "restore", verifiedRoutes: [a, b], continuation: revision === "r1" ? { state: "resumable", hasMore: false, nextCursor: null } : { state: "restart" } });
const legacy = () => ({ version: 1, dataset: "public-kg", id: id(900), title: "旧探索", savedAt: "2026-10-01T00:00:00.000Z", rootId: root.id,
  conditions: { predicates: ["CONTRIBUTED_TO"], contributionRoles: [], organizationPositions: null, eventRoles: null }, branches: [{ id: root.id, open: false, pages: 1 }], view });
const legacyView = () => ({ id: id(800), title: "旧View", rootId: root.id, conditions: legacy().conditions, createdAt: "2026-10-01T00:00:00.000Z" });
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async url => String(url).includes("/api/discovery/paths") ? response(restoreBody()) : response({ entity: body.root }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe("patternの保存と原子的復元", () => {
  it("条件・経路・開閉・別々の境界・revisionと配置だけを保存し、URLでも往復する", async () => {
    const value = saved(); writeWorkspace(localStorage, "public-kg", null, value);
    expect(readWorkspaces(localStorage, "public-kg")).toEqual([value]);
    expect(value.execution).toMatchObject({ type: "pattern", requiredRouteKey: routeKey(a), candidateBoundary: b, routes: [{ route: a, open: false }, { route: b, open: true }] });
    expect(localStorage.getItem(workspaceKey("public-kg"))).not.toMatch(/cacheClaims|nextCursor|loading|description|sourceCount/);
    const decoded = decodeExploration(encodeExploration(value), root.id, "public-kg");
    expect(decoded).toMatchObject({ version: 2, relation, execution: value.execution, observedRevision: "r1", view: { positions: view.positions, pan: { x: 0, y: 0 }, zoom: .7 } });
    expect(explorationHref(value).length).toBeLessThan(4000);
    const rebuilt = await rebuildExplorationUrl(decoded, signal());
    expect(rebuilt.graph.nodes[id(2)]).toBeUndefined(); expect(rebuilt.graph.nodes[id(3)]).toBeDefined();
    expect(Object.keys(rebuilt.graph.claims)).toHaveLength(2); expect(rebuilt.view?.recenter).toBe(true);
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.operation).toEqual({ type: "restore", routes: [a, b], observedRevision: "r1", candidateBoundary: b });
  });
  it("新版で全参照の再検証に成功したときだけ復元し、候補は先頭から再開する", async () => {
    fetchMock.mockImplementation(async url => String(url).includes("paths") ? response(restoreBody("r2")) : response({ entity: body.root }));
    const rebuilt = await rebuildWorkspace(saved(), signal());
    expect(rebuilt.revisionChanged).toBe(true); expect(rebuilt.graph.revision).toBe("r2");
    expect(rebuilt.graph.execution).toMatchObject({ hasMore: true, nextCursor: null, candidateBoundary: null });
    expect(rebuilt.graph.nodes[id(2)]).toBeUndefined();
  });
  it.each(["missing", "denied", "role", "wrong-direction", "short-path", "timeout", "revision"])("不完全・誤った経路や失敗を部分復元しない: %s", async mode => {
    writeWorkspace(localStorage, "public-kg", null, saved()); const before = localStorage.getItem(workspaceKey("public-kg"));
    const corrupted = structuredClone(restoreBody());
    if (mode === "missing") corrupted.verifiedRoutes = [a];
    if (mode === "denied") Object.assign(corrupted.claims[0], { polarity: "denied" });
    if (mode === "role") Object.assign(corrupted, { relation: { ...relation, contributionRoles: ["DRAWING"] } });
    if (mode === "wrong-direction") [corrupted.claims[0].subjectId, corrupted.claims[0].objectId] = [corrupted.claims[0].objectId, corrupted.claims[0].subjectId];
    if (mode === "short-path") corrupted.verifiedRoutes[0].claimIds.pop();
    fetchMock.mockImplementation(async url => String(url).includes("paths") ? response(corrupted, mode === "timeout" ? 503 : mode === "revision" ? 409 : 200) : response({ entity: body.root }));
    await expect(rebuildWorkspace(saved(), signal())).rejects.toThrow();
    expect(localStorage.getItem(workspaceKey("public-kg"))).toBe(before);
  });
  it("中止後の遅着応答は復元せず、保存も変えない", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementation(async url => String(url).includes("paths") ? new Promise(resolve => { release = resolve; }) : response({ entity: body.root }));
    const controller = new AbortController(), pending = rebuildWorkspace(saved(), controller.signal);
    const failure = expect(pending).rejects.toThrow();
    await waitFor(() => expect(release).toBeDefined()); controller.abort(); release(response(restoreBody())); await failure;
  });
  it("失敗した保存参照の代わりを自動採用せず、明示再開では同じ対象と条件を検索する", async () => {
    fetchMock.mockImplementation(async url => String(url).includes("paths") ? response(page([route(101, 4)])) : response({ entity: body.root }));
    const fresh = await restartWorkspace(saved(), signal());
    expect(fresh.graph.centerId).toBe(root.id); expect(fresh.graph.relation).toEqual(relation);
    expect(fresh.graph.cacheNodes[id(4)]).toBeDefined(); expect(fresh.graph.nodes[id(2)]).toBeUndefined();
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).operation).toEqual({ type: "page", after: null, requiredWitness: null });
  });
  it.each(["variant", "root", "duplicate", "required", "boundary", "pattern-revision", "dataset"])("保存の意味が不整合なら拒否する: %s", mode => {
    const value = saved(); if (value.execution.type !== "pattern") throw Error();
    if (mode === "variant") Object.assign(value.execution, { type: "adjacent" });
    if (mode === "root") value.rootId = id(99);
    if (mode === "duplicate") value.execution.routes.push(value.execution.routes[0]);
    if (mode === "required") value.execution.requiredRouteKey = routeKey(route(900, 901));
    if (mode === "boundary") value.execution.candidateBoundary = route(900, 901);
    if (mode === "pattern-revision") Object.assign(value.relation, { pattern: { id: "other-works", revision: 2 } });
    if (mode === "dataset") value.dataset = "demo";
    expect(() => parseWorkspaceBackup(JSON.stringify(value), "public-kg")).toThrow();
  });
  it("閉じた経路も元Claimの完全性を検証してから保存する", () => {
    const graph = state(); delete graph.cacheClaims[a.claimIds[1]];
    expect(() => captureWorkspace("public-kg", "壊れた経路", graph, null)).toThrow();
  });
});

describe("旧データと非破壊移行", () => {
  it.each(["single", "collection"])("旧Workspace %sを読むだけで書かず、初回編集で全件を新キーへ移行する", mode => {
    const old = legacy(), raw = JSON.stringify(mode === "single" ? old : { version: 2, dataset: "public-kg", workspaces: [old] });
    localStorage.setItem(legacyWorkspaceKey("public-kg"), raw);
    const read = readWorkspaces(localStorage, "public-kg");
    expect(localStorage.getItem(workspaceKey("public-kg"))).toBeNull();
    expect(read[0]).toMatchObject({ version: 2, relation: { type: "adjacent", polarity: "all-records", contributionRoles: [] }, execution: { type: "adjacent", branches: old.branches }, view });
    writeWorkspace(localStorage, "public-kg", null, saved());
    expect(readWorkspaces(localStorage, "public-kg")).toHaveLength(2);
    expect(localStorage.getItem(legacyWorkspaceKey("public-kg"))).toBe(raw);
  });
  it("旧Viewを全件検証してからv2へ移し、patternも本文なしで保存・importできる", () => {
    const old = legacyView(), raw = JSON.stringify({ version: 1, dataset: "public-kg", views: [old] });
    localStorage.setItem(legacySavedViewsKey("public-kg"), raw);
    expect(readSavedViews(localStorage, "public-kg")[0].relation).toMatchObject({ type: "adjacent", polarity: "all-records", contributionRoles: [] });
    expect(localStorage.getItem(savedViewsKey("public-kg"))).toBeNull();
    const entry: SavedView = { version: 2, id: id(801), title: "別作品", rootId: root.id, createdAt: old.createdAt, relation };
    editSavedViews(localStorage, "public-kg", { add: entry });
    const backup = exportSavedViews(localStorage, "public-kg");
    expect(backup).not.toMatch(/routes|execution|claims|nextCursor/);
    localStorage.removeItem(savedViewsKey("public-kg"));
    expect(importSavedViews(localStorage, "public-kg", backup).views).toHaveLength(2);
    expect(localStorage.getItem(legacySavedViewsKey("public-kg"))).toBe(raw);
  });
  it.each(["view", "workspace"])("書込失敗と壊れた新キーで旧データへ逃げず、全削除も旧データを復活させない: %s", kind => {
    const key = kind === "view" ? savedViewsKey("public-kg") : workspaceKey("public-kg"), oldKey = kind === "view" ? legacySavedViewsKey("public-kg") : legacyWorkspaceKey("public-kg");
    const raw = JSON.stringify(kind === "view" ? { version: 1, dataset: "public-kg", views: [legacyView()] } : legacy());
    localStorage.setItem(oldKey, raw);
    const denied = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw Error("quota"); }, removeItem: vi.fn() };
    const remove = (storage: typeof denied | Storage) => kind === "view" ? editSavedViews(storage, "public-kg", { remove: legacyView().id }) : writeWorkspace(storage, "public-kg", legacy().id, null);
    expect(() => remove(denied)).toThrow(); expect(localStorage.getItem(oldKey)).toBe(raw); expect(localStorage.getItem(key)).toBeNull();
    remove(localStorage); expect(JSON.parse(localStorage.getItem(key)!)[kind === "view" ? "views" : "workspaces"]).toEqual([]);
    localStorage.setItem(key, "broken");
    expect(() => kind === "view" ? readSavedViews(localStorage, "public-kg") : readWorkspaces(localStorage, "public-kg")).toThrow();
    expect(() => remove(localStorage)).toThrow(); expect(localStorage.getItem(key)).toBe("broken");
  });
  it("旧URL v1は否定を含む一段の意味を保ち、未知URL版を縮退させない", () => {
    const old = legacy();
    const pack = (value: unknown) => btoa(String.fromCharCode(...deflateSync(strToU8(JSON.stringify(value))))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const portable = { v: 1, d: old.dataset, r: root.id, c: old.conditions, b: [[root.id, 0, 1]], p: [], z: .7, l: true };
    expect(decodeExploration(pack(portable), root.id, "public-kg")).toMatchObject({ relation: { type: "adjacent", polarity: "all-records", contributionRoles: [] }, execution: { type: "adjacent", branches: old.branches } });
    expect(() => decodeExploration(pack({ ...portable, v: 3 }), root.id, "public-kg")).toThrow();
  });
});

describe("Graph編集・自由探索・Undo", () => {
  it("下書きは適用まで反映せず、失敗・キャンセルで元の条件を保つ", async () => {
    const apply = vi.fn().mockResolvedValue(false), cancel = vi.fn();
    render(<RelationFilter value={null} relation={legacyRelation({ predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null })} patternAllowed onApply={vi.fn()} onApplyRelation={apply} onCancelRelation={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("radio", { name: "同じつくり手の別作品" }));
    expect(apply).not.toHaveBeenCalled(); expect(screen.getByTestId("active-predicates").textContent).not.toContain("同じつくり手");
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("元の探索は保持"));
    expect(apply).toHaveBeenCalledWith({...relation,pattern:{id:"other-works",revision:2}});
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(cancel).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("不適合な対象のパターン選択を無効にし、対象は自動変更しない", () => {
    render(<RelationFilter value={null} patternAllowed={false} onApply={vi.fn()} onApplyRelation={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    expect((screen.getByRole("radio", { name: "同じつくり手の別作品" }) as HTMLInputElement).disabled).toBe(true);
  });
  it("自由探索で制作Role・肯定・同じ対象を保ち、Undoで経路の開閉・選択・配置を復元する", async () => {
    const scoped = { ...relation, contributionRoles: ["AUTHORSHIP"] as ["AUTHORSHIP"] }, adjacent = freeRelation(scoped);
    const { result } = renderHook(() => useGraphExplorer());
    act(() => result.current.openWorkspace({ graph: { ...state(), relation: scoped, conditionKey: relationConditionKey(scoped) }, view, skippedBranches: 0 }, null));
    act(() => result.current.selectClaim(b.claimIds[1]));
    fetchMock.mockResolvedValueOnce(response({ revision: "r1", relation: adjacent, centerId: root.id, nodes: body.nodes.filter(n => n.id === root.id || n.kind === "person"), claims: body.claims.filter(c => c.objectId === root.id), page: { hasMore: false, nextCursor: null } }));
    await act(async () => { expect(await result.current.applyRelation(root, adjacent, null, view)).toBe(true); });
    expect(result.current.graph.centerId).toBe(root.id); expect(result.current.graph.relation).toEqual(adjacent);
    fetchMock.mockResolvedValueOnce(response({ dataset: "public-kg", revision: "r1" }));
    await act(async () => result.current.restorePrevious());
    expect(result.current.graph.execution).toMatchObject({ type: "pattern", routes: { [routeKey(a)]: { open: false }, [routeKey(b)]: { open: true } } });
    expect(result.current.selection).toEqual({ kind: "claim", id: b.claimIds[1] }); expect(result.current.viewRestoration?.view).toEqual(view);
  });
});

it("patternのURL上限で経路を黙って省かない", () => {
  const value = saved();
  if (value.execution.type !== "pattern") throw Error();
  value.execution = { type: "pattern", routes: Array.from({ length: 100 }, () => ({ route: { nodeIds: [root.id, crypto.randomUUID(), crypto.randomUUID()], claimIds: [crypto.randomUUID(), crypto.randomUUID()] }, open: false })), requiredRouteKey: null, candidateBoundary: null };
  expect(() => explorationHref(value)).toThrow("limit");
});
it("明示した全predicate集合は保存・復元と編集でnullへ変換しない", async () => {
  const adjacent = { ...legacyRelation({ predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null }), predicates: [...PREDICATE_KEYS] };
  const value = saved(); value.relation = adjacent; value.execution = { type: "adjacent", branches: [{ id: root.id, open: true, pages: 1 }] }; value.view = null;
  fetchMock.mockImplementation(async url => String(url).includes("neighbors") ? response({ revision: "r1", centerId: root.id, relation: adjacent, nodes: [root], claims: [], page: { hasMore: false, nextCursor: null } }) : response({ entity: body.root }));
  const rebuilt = await rebuildWorkspace(value, signal());
  expect(rebuilt.graph.relation).toEqual({ ...adjacent, predicates: [...PREDICATE_KEYS].sort() });
  expect(String(fetchMock.mock.calls[1][0])).toContain("polarity=all-records");
  render(<RelationFilter value={[...PREDICATE_KEYS]} relation={adjacent} patternAllowed onApply={vi.fn()} onApplyRelation={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
  expect((screen.getByRole("button", { name: "適用" }) as HTMLButtonElement).disabled).toBe(true);
});
it("Undo時のrevision変更で古いpatternキャッシュを復活させない", async () => {
  const { result } = renderHook(() => useGraphExplorer());
  act(() => result.current.openWorkspace({ graph: state(), view, skippedBranches: 0 }, null));
  fetchMock.mockResolvedValueOnce(response(page([route(101, 4)])));
  await act(async () => { await result.current.applyRelation(root, relation, null, view); });
  const current = result.current.graph;
  fetchMock.mockResolvedValueOnce(response({ dataset: "public-kg", revision: "r2" }));
  await act(async () => result.current.restorePrevious());
  expect(result.current.previous).toBeNull(); expect(result.current.graph.nodes).toBe(current.nodes);
});

it("共有URLの経路欠落を正常復元にせず、明示再開だけが同じ条件の新経路を適用する", async () => {
  history.replaceState(null, "", explorationHref(saved()));
  const apply = vi.fn();
  fetchMock.mockImplementation(async (url, init) => String(url).includes("paths") ? (JSON.parse(String(init?.body)).operation.type === "restore" ? response({ error: { message: "missing route" } }, 400) : response(page([route(101, 4)]))) : response({ entity: body.root }));
  const { result } = renderHook(() => useExplorationUrl({ dataset: "public-kg", initialRoot: root.id, graph: emptyGraph(), capture: () => null, apply, locale: "ja" }), { wrapper: StrictMode });
  await waitFor(() => expect(result.current.failure).toBeTruthy());
  expect(apply).not.toHaveBeenCalled(); expect(result.current.canRestart).toBe(true);
  act(() => result.current.restart());
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  expect(apply.mock.calls[0][0].graph).toMatchObject({ centerId: root.id, relation });
  expect(apply.mock.calls[0][0].graph.cacheNodes[id(4)]).toBeDefined();
  expect(result.current.failure).toBeNull();
});

it("既に中止された適用は、進行中の別の適用もGraphも変更しない", async () => {
  let release!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const { result } = renderHook(() => useGraphExplorer()); let pending!: Promise<boolean>;
  act(() => { pending = result.current.applyRelation(root, relation); });
  const aborted = new AbortController(); aborted.abort();
  await act(async () => { expect(await result.current.applyRelation(root, relation, null, null, aborted.signal)).toBe(false); });
  expect(result.current.relationLoading).toBe(true);
  await act(async () => { release(response(body)); expect(await pending).toBe(true); });
  expect(result.current.graph.execution?.type).toBe("pattern");
});
