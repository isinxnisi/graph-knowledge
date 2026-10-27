// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExplorationUrl } from "../lib/client/use-exploration-url";
import { emptyGraph, emptyExpansion, type GraphState } from "../lib/client/graph-state";
import { decodeExploration, rebuildExplorationUrl } from "../lib/client/exploration-url";
import { WorkspaceRootNotFound } from "../lib/client/saved-workspace";
import { discoveryRelationHref, verifyDiscoveryHandoff } from "../lib/client/discovery-relation-navigation";
import { fetchDatasetRevision } from "../lib/client/api";
import { allRelations } from "../lib/domain/discovery-connections";
vi.mock("../lib/client/exploration-url", async original => ({ ...await original<typeof import("../lib/client/exploration-url")>(), rebuildExplorationUrl: vi.fn() }));
vi.mock("../lib/client/discovery-relation-navigation", async original => ({ ...await original<typeof import("../lib/client/discovery-relation-navigation")>(), verifyDiscoveryHandoff: vi.fn() }));
vi.mock("../lib/client/api", async original => ({ ...await original<typeof import("../lib/client/api")>(), fetchDatasetRevision: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const graph = (): GraphState => ({ ...emptyGraph(), centerId: id, cacheNodes: { [id]: { id, kind: "person" as const, name: "name", description: null } }, expansions: { [id]: emptyExpansion() } });
const view = { positions: { [id]: { x: 112.123, y: -45.678 } }, pan: { x: 15, y: 15 }, zoom: 0.71, initialLayoutDone: true };
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); history.replaceState(null, "", "/"); });
describe("exploration URL synchronization", () => {
  it("裸の公開Entityリンクは旧保存ではなく新順位の探索を開始する", async () => {
    history.replaceState(null, "", `/explore/${id}`);
    vi.mocked(rebuildExplorationUrl).mockResolvedValue({ graph: graph(), view: null, skippedBranches: 0 });
    renderHook(() => useExplorationUrl({ dataset: "public-kg", initialRoot: id, graph: emptyGraph(), capture: () => null, apply: vi.fn(), locale: "ja" }));
    await act(async () => {});
    expect(vi.mocked(rebuildExplorationUrl).mock.calls[0][0].execution).toMatchObject({ type: "adjacent", order: "bounded" });
  });
  it("rejects a revision change after Discovery verification without applying or replacing the old Graph", async () => {
    const selection={entity:{id,kind:"person" as const,name:"name",description:null,aliases:[],event:null},relation:allRelations(),revision:"r1",witness:null};
    history.replaceState(null,"",discoveryRelationHref(selection));const before=location.href,apply=vi.fn();
    vi.mocked(verifyDiscoveryHandoff).mockResolvedValue({nodes:[],claims:[]});
    vi.mocked(rebuildExplorationUrl).mockResolvedValue({graph:{...graph(),revision:"r1"},view:null,skippedBranches:0});
    vi.mocked(fetchDatasetRevision).mockResolvedValue({dataset:"public-kg",revision:"r2"});
    const {result}=renderHook(()=>useExplorationUrl({dataset:"public-kg",initialRoot:id,graph:emptyGraph(),capture:()=>null,apply,locale:"ja"}));
    await act(async()=>{});expect(result.current.failure).toContain("対象を再検索");expect(apply).not.toHaveBeenCalled();expect(location.href).toBe(before);expect(result.current.canRestart).toBe(false);
  });
  it("debounces history replacement and synchronously flushes pagehide without local persistence", async () => {
    vi.useFakeTimers(); history.replaceState(null, "", "/"); const length = history.length;
    const capture = vi.fn(() => view);
    const { result } = renderHook(() => useExplorationUrl({ dataset: "demo", graph: graph(), capture, apply: vi.fn(), locale: "ja" }));
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(history.length).toBe(length);
    expect(document.title).toBe("name — 関係性を探索する");
    expect(decodeExploration(new URLSearchParams(location.search).get("s")!, id, "demo").view?.positions).toEqual(view.positions);
    capture.mockReturnValue({ ...view, zoom: 0.9 });
    act(() => { result.current.schedule(); result.current.schedule(); window.dispatchEvent(new Event("pagehide")); });
    expect(decodeExploration(new URLSearchParams(location.search).get("s")!, id, "demo").view?.zoom).toBe(0.9);
    expect(history.length).toBe(length);
  });
  it("does not serialize in-flight pages and flushes only accepted state", async () => {
    vi.useFakeTimers(); const value = graph(); value.expansions[id].loading = true;
    const { result } = renderHook(() => useExplorationUrl({ dataset: "demo", graph: value, capture: () => view, apply: vi.fn(), locale: "ja" }));
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(location.pathname).toBe("/"); expect(result.current.ready).toBe(false);
  });
  it("keeps the last URL visibly stale at the size limit and resumes after reducing the graph", async () => {
    vi.useFakeTimers(); const large = graph();
    for (let i = 0; i < 399; i++) {
      const extra = crypto.randomUUID(); large.cacheNodes[extra] = { id: extra, kind: "person", name: "name", description: null };
      large.expansions[extra] = emptyExpansion();
    }
    const { result, rerender } = renderHook(({ value }) => useExplorationUrl({ dataset: "demo", graph: value, capture: () => view, apply: vi.fn(), locale: "ja" }), { initialProps: { value: large } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(location.pathname).toBe("/"); expect(result.current.ready).toBe(false);
    expect(result.current.notice).toContain("URLは前の状態");
    rerender({ value: graph() }); await act(() => vi.advanceTimersByTimeAsync(350));
    expect(location.pathname).toBe(`/explore/${id}`); expect(result.current.ready).toBe(true);
    expect(result.current.notice).toBe("");
  });
  it("does not clear restoration failure or overwrite its URL when the old graph changes", async () => {
    vi.useFakeTimers(); history.replaceState(null, "", `/explore/${id}?s=invalid`);
    const { result, rerender } = renderHook(({ value }) => useExplorationUrl({ dataset: "demo", initialRoot: id, graph: value, capture: () => view, apply: vi.fn(), locale: "ja" }), { initialProps: { value: emptyGraph() } });
    await act(async () => {}); expect(result.current.failure).toContain("無効");
    rerender({ value: graph() }); await act(() => vi.advanceTimersByTimeAsync(350));
    expect(result.current.failure).toContain("無効"); expect(location.search).toBe("?s=invalid");
  });
  it("distinguishes missing root and ignores a cancelled reconstruction response", async () => {
    vi.mocked(rebuildExplorationUrl).mockRejectedValueOnce(new WorkspaceRootNotFound());
    const apply = vi.fn();
    const first = renderHook(() => useExplorationUrl({ dataset: "demo", initialRoot: id, graph: emptyGraph(), capture: () => null, apply, locale: "ja" }));
    await act(async () => {});
    expect(first.result.current.failure).toContain("起点"); first.unmount();
    let finish!: (value: Awaited<ReturnType<typeof rebuildExplorationUrl>>) => void;
    vi.mocked(rebuildExplorationUrl).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const second = renderHook(() => useExplorationUrl({ dataset: "demo", initialRoot: id, graph: emptyGraph(), capture: () => null, apply, locale: "ja" }));
    second.unmount();
    await act(async () => { finish({ graph: emptyGraph(), view: null, skippedBranches: 0 }); });
    expect(apply).not.toHaveBeenCalled();
  });
});
