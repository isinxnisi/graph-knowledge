// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { captureWorkspace, readWorkspace, rebuildWorkspace, writeWorkspace, workspaceKey, workspaceSchema, WorkspaceError, type SavedWorkspace } from "../lib/client/saved-workspace";
import { closeExpansion, emptyGraph, mergePage, reopenExpansion } from "../lib/client/graph-state";
import { fetchEntity, fetchNeighbors, ClientApiError } from "../lib/client/api";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import WorkspaceDialog from "../components/WorkspaceDialog";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { EntityResponse, NeighborsResponse, ClaimSummary } from "../lib/domain/api";

vi.mock("../lib/client/api", async original => ({ ...await original<typeof import("../lib/client/api")>(), fetchEntity: vi.fn(), fetchNeighbors: vi.fn() }));
const page = examples.neighbors as NeighborsResponse;
const root = page.nodes[0];
const work = page.nodes[1];
const extra = { ...root, id: "008dc14a-7b55-4697-8547-c1201c6df381", name: "別の作者" };
const extraClaim: ClaimSummary = { ...page.claims[0], id: "bd494b85-3225-42fb-a46e-0d51926357d5", subjectId: extra.id };
const workPage: NeighborsResponse = { centerId: work.id, nodes: [root, work, extra], claims: [page.claims[0], extraClaim], page: { hasMore: false, nextCursor: null } };
const view = { positions: { [root.id]: { x: 17, y: 31 }, [work.id]: { x: 400, y: 50 } }, pan: { x: -21, y: 81 }, zoom: 0.7, initialLayoutDone: true };
const graph = () => mergePage(mergePage(emptyGraph(), page), workPage);
const saved = (): SavedWorkspace => captureWorkspace("demo", "制作の途中", graph(), view);
const signal = () => new AbortController().signal;
const entityResponse = (entity = root): EntityResponse => ({ entity: { ...entity, aliases: [], event: null } });
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(fetchEntity).mockResolvedValue(entityResponse());
  vi.mocked(fetchNeighbors).mockImplementation(async id => id === root.id ? page : workPage);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("途中保存の参照と永続化", () => {
  it("知識本文・cursor・通信状態を保存せず、閉じた枝・条件・配置を保持する", () => {
    const state = closeExpansion(graph(), root.id);
    const value = captureWorkspace("demo", "  また続ける  ", state, view);
    writeWorkspace(localStorage, "demo", null, value);
    expect(readWorkspace(localStorage, "demo")).toEqual(value);
    expect(readWorkspace(localStorage, "pilot-event-v1")).toBeNull();
    expect(value.title).toBe("また続ける");
    expect(value.branches).toEqual([{ id: root.id, open: false, pages: 1 }, { id: work.id, open: true, pages: 1 }]);
    expect(value.view).toEqual(view);
    expect(localStorage.getItem(workspaceKey("demo"))).not.toMatch(/claims|cacheNodes|cursor|sourceCount|loading|description/);
    writeWorkspace(localStorage, "demo", value.id, null);
    expect(readWorkspace(localStorage, "demo")).toBeNull();
  });
  it("取得中や40ページ超の保存を拒否し、既存保存を保持する", () => {
    const value = saved(); writeWorkspace(localStorage, "demo", null, value);
    const state = graph(); state.expansions[root.id].loading = true;
    expect(() => captureWorkspace("demo", "途中", state, view)).toThrow(new WorkspaceError("loading"));
    state.expansions[root.id].loading = false;
    state.expansions[root.id].pages = Array.from({ length: 41 }, () => state.expansions[root.id].pages[0]);
    expect(() => captureWorkspace("demo", "途中", state, view)).toThrow(new WorkspaceError("limit"));
    expect(readWorkspace(localStorage, "demo")).toEqual(value);
  });
  it.each([
    (value: SavedWorkspace) => ({ ...value, version: 2 }),
    (value: SavedWorkspace) => ({ ...value, dataset: "pilot-event-v1" }),
    (value: SavedWorkspace) => ({ ...value, conditions: { ...value.conditions, predicates: ["UNKNOWN"] } }),
    (value: SavedWorkspace) => ({ ...value, branches: [...value.branches, value.branches[0]] }),
    (value: SavedWorkspace) => ({ ...value, branches: [{ id: root.id, open: true, pages: 41 }] }),
    (value: SavedWorkspace) => ({ ...value, view: { ...view, zoom: -1 } }),
    (value: SavedWorkspace) => ({ ...value, cursor: "stale" }),
  ])("未知形式・破損を上書きも自動削除もしない", corrupt => {
    const raw = JSON.stringify(corrupt(saved())); localStorage.setItem(workspaceKey("demo"), raw);
    expect(() => readWorkspace(localStorage, "demo")).toThrow(new WorkspaceError("invalid"));
    expect(() => writeWorkspace(localStorage, "demo", null, saved())).toThrow();
    expect(localStorage.getItem(workspaceKey("demo"))).toBe(raw);
  });
  it("別タブの変更と容量不足では、確認済みでない途中保存を消さない", () => {
    const old = saved(); writeWorkspace(localStorage, "demo", null, old);
    const changed = saved(); writeWorkspace(localStorage, "demo", old.id, changed);
    expect(() => writeWorkspace(localStorage, "demo", old.id, null)).toThrow(new WorkspaceError("conflict"));
    const denied = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw new Error("quota"); }, removeItem: vi.fn() };
    expect(() => writeWorkspace(denied, "demo", changed.id, old)).toThrow(new WorkspaceError("storage"));
    expect(readWorkspace(localStorage, "demo")).toEqual(changed);
  });
});

describe("現在のデータから探索途中を組み立てる", () => {
  it("閉じた祖先と休止した子孫を復元し、再開後は追加通信なしで開ける", async () => {
    const value = captureWorkspace("demo", "閉じた途中", closeExpansion(graph(), root.id), view);
    // Storage array order is not a traversal order.
    value.branches.reverse();
    const restored = await rebuildWorkspace(value, signal());
    expect(Object.keys(restored.graph.nodes)).toEqual([root.id]);
    expect(restored.graph.expansions[work.id]).toMatchObject({ open: true, active: false });
    const opened = reopenExpansion(restored.graph, root.id);
    expect(opened.nodes).toEqual(graph().nodes);
    expect(opened.claims).toEqual(graph().claims);
    expect(restored.view).toEqual(view);
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
  });
  it("取得済みページのないopen意図は自動取得せず、明示再試行できる", async () => {
    const value = saved(); value.branches = [{ id: root.id, open: true, pages: 0 }];
    const restored = await rebuildWorkspace(value, signal());
    expect(fetchNeighbors).not.toHaveBeenCalled();
    expect(restored.graph.expansions[root.id]).toMatchObject({ open: true, active: true, expanded: false, pages: [] });
    expect(restored.graph.expansions[root.id].error).toContain("近傍を取得");
  });
  it("現在のcursorだけで保存ページ数まで読み、続きを後の明示取得に残す", async () => {
    const value = saved(); value.branches = [{ id: root.id, open: true, pages: 2 }];
    vi.mocked(fetchNeighbors).mockResolvedValueOnce({ ...page, page: { hasMore: true, nextCursor: "fresh-1" } })
      .mockResolvedValueOnce({ ...page, page: { hasMore: true, nextCursor: "fresh-2" } });
    const restored = await rebuildWorkspace(value, signal());
    expect(vi.mocked(fetchNeighbors).mock.calls.map(args => args[1])).toEqual([null, "fresh-1"]);
    expect(restored.graph.expansions[root.id]).toMatchObject({ nextCursor: "fresh-2", hasMore: true });
    expect(restored.graph.expansions[root.id].pages).toHaveLength(2);
  });
  it("現在のページが短ければ打ち切り、辿れなくなった枝を新しい起点にしない", async () => {
    const value = saved(); value.branches[0].pages = 3;
    vi.mocked(fetchNeighbors).mockResolvedValue({ centerId: root.id, nodes: [root], claims: [], page: { hasMore: false, nextCursor: null } });
    const restored = await rebuildWorkspace(value, signal());
    expect(restored.skippedBranches).toBe(1);
    expect(restored.graph.roots).toEqual([root.id]);
    expect(Object.keys(restored.graph.cacheNodes)).toEqual([root.id]);
    expect(restored.view?.positions).toEqual({ [root.id]: view.positions[root.id] });
    expect(fetchNeighbors).toHaveBeenCalledOnce();
  });
  it("全具体条件を維持し、空集合も全件へ広げない", async () => {
    const value = saved();
    value.conditions = { predicates: ["CONTRIBUTED_TO", "AFFILIATED_WITH", "PARTICIPATED_IN"], contributionRoles: ["SCRIPT_WRITING"], organizationPositions: ["VISITOR"], eventRoles: ["CHAIR"] };
    value.branches = [{ id: root.id, open: true, pages: 1 }];
    vi.mocked(fetchNeighbors).mockResolvedValue({ centerId: root.id, nodes: [root], claims: [], page: { hasMore: false, nextCursor: null } });
    const restored = await rebuildWorkspace(value, signal());
    expect(vi.mocked(fetchNeighbors).mock.calls[0].slice(3)).toEqual([workspaceSchema.parse(value).conditions.predicates, ["SCRIPT_WRITING"], ["VISITOR"], ["CHAIR"]]);
    expect(restored.graph).toMatchObject(workspaceSchema.parse(value).conditions);
    value.conditions.predicates = [];
    await rebuildWorkspace(value, signal());
    expect(vi.mocked(fetchNeighbors).mock.calls[1][3]).toEqual([]);
  });
  it.each(["wrong-center", "missing-endpoint", "wrong-condition", "repeated-cursor"])("不整合な応答を受理しない: %s", async mode => {
    const value = saved(); value.branches = [{ id: root.id, open: true, pages: 2 }];
    if (mode === "wrong-center") vi.mocked(fetchNeighbors).mockResolvedValue(workPage);
    if (mode === "missing-endpoint") vi.mocked(fetchNeighbors).mockResolvedValue({ ...page, nodes: [root] });
    if (mode === "wrong-condition") value.conditions.predicates = [];
    if (mode === "repeated-cursor") vi.mocked(fetchNeighbors).mockResolvedValue({ ...page, page: { hasMore: true, nextCursor: "same" } });
    await expect(rebuildWorkspace(value, signal())).rejects.toThrow(new WorkspaceError("response"));
  });
  it("データ増加で表示上限を超えれば部分復元を返さない", async () => {
    const value = saved(); value.branches = [{ id: root.id, open: true, pages: 6 }];
    vi.mocked(fetchNeighbors).mockImplementation(async (_id, after) => {
      const index = after ? Number(after) : 0;
      return { centerId: root.id, nodes: [root, work], claims: Array.from({ length: 40 }, () => ({ ...page.claims[0], id: crypto.randomUUID() })), page: { hasMore: true, nextCursor: String(index + 1) } };
    });
    await expect(rebuildWorkspace(value, signal())).rejects.toThrow(new WorkspaceError("limit"));
  });
  it("取得途中の取消と遅延応答で復元を返さない", async () => {
    let resolve!: (page: NeighborsResponse) => void;
    vi.mocked(fetchNeighbors).mockImplementation(() => new Promise(done => { resolve = done; }));
    const controller = new AbortController();
    const promise = rebuildWorkspace(saved(), controller.signal);
    await waitFor(() => expect(fetchNeighbors).toHaveBeenCalledOnce());
    controller.abort(); resolve(page);
    await expect(promise).rejects.toThrow();
  });
});

describe("途中保存ダイアログと原子的な探索切替", () => {
  const props = () => ({ dataset: "demo" as const, graph: graph(), captureView: () => view, onOpen: vi.fn(), onClose: vi.fn() });
  it("保存・再読込・削除でき、保存しただけではGraphを変えない", () => {
    const callbacks = props(); const mounted = render(<WorkspaceDialog {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "現在の探索途中を保存" }));
    expect(readWorkspace(localStorage, "demo")?.rootId).toBe(root.id);
    expect(callbacks.onOpen).not.toHaveBeenCalled(); expect(fetchNeighbors).not.toHaveBeenCalled();
    mounted.unmount(); render(<WorkspaceDialog {...props()} graph={emptyGraph()} />);
    expect(screen.getByRole("button", { name: "保存した途中を再開" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "途中保存を削除" }));
    expect(readWorkspace(localStorage, "demo")).toBeNull();
  });
  it("途中取得の失敗では切り替えず、同じ保存を再試行できる", async () => {
    const value = saved(); writeWorkspace(localStorage, "demo", null, value);
    vi.mocked(fetchNeighbors).mockResolvedValueOnce(page).mockRejectedValueOnce(new ClientApiError("Unavailable", 503));
    const callbacks = props(); render(<WorkspaceDialog {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "保存した途中を再開" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("今の探索はそのまま"));
    expect(callbacks.onOpen).not.toHaveBeenCalled(); expect(readWorkspace(localStorage, "demo")).toEqual(value);
    fireEvent.click(screen.getByRole("button", { name: "保存した途中を再開" }));
    await waitFor(() => expect(callbacks.onOpen).toHaveBeenCalledOnce());
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });
  it.each(["再開を中止", "探索途中の保存を閉じる"])("%sした後の遅延応答を適用しない", async button => {
    writeWorkspace(localStorage, "demo", null, saved());
    let resolve!: (response: EntityResponse) => void;
    vi.mocked(fetchEntity).mockImplementation(() => new Promise(done => { resolve = done; }));
    const callbacks = props(); render(<WorkspaceDialog {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "保存した途中を再開" }));
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(vi.mocked(fetchEntity).mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolve(entityResponse()));
    expect(callbacks.onOpen).not.toHaveBeenCalled(); expect(fetchNeighbors).not.toHaveBeenCalled();
  });
  it("復元全体を60秒で中断し、現在の探索を残して再試行を案内する", async () => {
    vi.useFakeTimers();
    try {
      writeWorkspace(localStorage, "demo", null, saved());
      vi.mocked(fetchEntity).mockImplementation((_id, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }));
      const callbacks = props(); render(<WorkspaceDialog {...callbacks} />);
      fireEvent.click(screen.getByRole("button", { name: "保存した途中を再開" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(screen.getByRole("alert").textContent).toContain("時間がかかりすぎたため中断");
      expect(callbacks.onOpen).not.toHaveBeenCalled();
      expect((screen.getByRole("button", { name: "保存した途中を再開" }) as HTMLButtonElement).disabled).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("切替で旧要求を排除し、直前の探索と表示位置へ戻れる", async () => {
    const rebuilt = await rebuildWorkspace(saved(), signal());
    vi.mocked(fetchNeighbors).mockClear();
    let resolve!: (response: NeighborsResponse) => void;
    vi.mocked(fetchNeighbors).mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(() => useGraphExplorer());
    act(() => result.current.chooseRoot(work));
    const oldSignal = vi.mocked(fetchNeighbors).mock.calls[0][2];
    act(() => result.current.openWorkspace(rebuilt, view));
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.graph.centerId).toBe(root.id);
    expect(result.current.graph.claims).toEqual(graph().claims);
    expect(result.current.viewRestoration?.view).toEqual(view);
    expect(fetchNeighbors).toHaveBeenCalledOnce();
    await act(async () => resolve(workPage));
    expect(result.current.graph.centerId).toBe(root.id);
    act(() => result.current.restorePrevious());
    expect(result.current.graph.centerId).toBe(work.id);
    expect(result.current.graph.expansions[work.id].loading).toBe(false);
    expect(result.current.viewRestoration?.view).toEqual({ ...view, positions: { [work.id]: view.positions[work.id] } });
  });
});
