// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { captureWorkspace, readWorkspaces, rebuildWorkspace, writeWorkspace, workspaceKey, workspaceSchema, WorkspaceError, exportWorkspace, importWorkspace, parseWorkspaceBackup, WORKSPACE_FILE_LIMIT, WORKSPACE_COUNT_LIMIT, type SavedWorkspace } from "../lib/client/saved-workspace";
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
const readWorkspace = (storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, dataset: Parameters<typeof readWorkspaces>[1]) => readWorkspaces(storage, dataset)[0] ?? null;
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
  it("公開KGの再構築途中で版が変わったら部分Graphを返さない", async () => {
    const value = captureWorkspace("public-kg", "公開の途中", graph(), view);
    vi.mocked(fetchNeighbors).mockResolvedValueOnce({ ...page, revision: "before-update" })
      .mockResolvedValueOnce({ ...workPage, revision: "after-update" });
    await expect(rebuildWorkspace(value, signal())).rejects.toThrow();
    expect(vi.mocked(fetchNeighbors).mock.calls[1][7]).toBe("before-update");
    // 保存自体は版更新のために削除しない。次回も現データから再構築できる。
    expect(value.dataset).toBe("public-kg");
  });
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
    fireEvent.click(screen.getByRole("button", { name: "この途中保存を削除する" }));
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

describe("途中保存ファイルの持ち運び", () => {
  it("閉鎖・休止枝と配置を控え、別保存領域へ新しい版として取り込む", () => {
    const value = captureWorkspace("demo", "閉じた途中", closeExpansion(graph(), root.id), view);
    writeWorkspace(localStorage, "demo", null, value);
    const raw = exportWorkspace(localStorage, "demo", readWorkspace(localStorage, "demo")?.id ?? "");
    expect(JSON.parse(raw)).toEqual(value);
    localStorage.clear();
    const imported = importWorkspace(localStorage, "demo", null, raw);
    expect(imported.id).not.toBe(value.id);
    expect({ ...imported, id: value.id }).toEqual(value);
    expect(readWorkspace(localStorage, "demo")).toEqual(imported);
    expect(fetchEntity).not.toHaveBeenCalled(); expect(fetchNeighbors).not.toHaveBeenCalled();
  });
  it("最大400枝・座標の書出しも読込サイズ内に収める", () => {
    const value = saved();
    const ids = Array.from({ length: 400 }, () => crypto.randomUUID());
    value.branches = ids.map(id => ({ id, open: true, pages: 0 }));
    value.view!.positions = Object.fromEntries(ids.map(id => [id, { x: -1.2345678901234567e+308, y: Number.MIN_VALUE }]));
    writeWorkspace(localStorage, "demo", null, value);
    const raw = exportWorkspace(localStorage, "demo", readWorkspace(localStorage, "demo")?.id ?? "");
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(WORKSPACE_FILE_LIMIT);
    expect(parseWorkspaceBackup(raw, "demo")).toEqual(value);
  });
  it.each([
    () => "not JSON",
    (value: SavedWorkspace) => JSON.stringify({ ...value, version: 2 }),
    (value: SavedWorkspace) => JSON.stringify({ ...value, claims: [] }),
    (value: SavedWorkspace) => JSON.stringify({ ...value, conditions: { ...value.conditions, eventRoles: ["INVITED"] } }),
    (value: SavedWorkspace) => JSON.stringify({ ...value, branches: [{ id: root.id, open: true, pages: 41 }] }),
    (value: SavedWorkspace) => JSON.stringify({ ...value, view: { ...view, zoom: 3 } }),
    () => JSON.stringify({ version: 1, dataset: "demo", views: [] }),
    (value: SavedWorkspace) => " ".repeat(WORKSPACE_FILE_LIMIT) + JSON.stringify(value),
    // Under the character budget but above the byte budget.
    (value: SavedWorkspace) => JSON.stringify({ ...value, title: "あ".repeat(80) }).padEnd(99_950, " "),
  ])("不正形式・語彙・上限・別形式を拒否し、既存保存を残す", raw => {
    const value = saved(); writeWorkspace(localStorage, "demo", null, value);
    expect(() => importWorkspace(localStorage, "demo", value.id, raw(value))).toThrow(new WorkspaceError("fileInvalid"));
    expect(readWorkspace(localStorage, "demo")).toEqual(value);
  });
  it("dataset違いと保存領域の破損・書込み拒否を区別する", () => {
    const value = saved(); const raw = JSON.stringify(value);
    expect(() => parseWorkspaceBackup(raw, "pilot-event-v1")).toThrow(new WorkspaceError("dataset"));
    expect(() => exportWorkspace(localStorage, "demo", readWorkspace(localStorage, "demo")?.id ?? "")).toThrow(new WorkspaceError("emptyFile"));
    localStorage.setItem(workspaceKey("demo"), "unknown format");
    expect(() => importWorkspace(localStorage, "demo", null, raw)).toThrow(new WorkspaceError("invalid"));
    expect(() => exportWorkspace(localStorage, "demo", readWorkspace(localStorage, "demo")?.id ?? "")).toThrow(new WorkspaceError("invalid"));
    expect(localStorage.getItem(workspaceKey("demo"))).toBe("unknown format");
    const denied = { getItem: () => null, setItem: () => { throw new Error("denied"); }, removeItem: vi.fn() };
    expect(() => importWorkspace(denied, "demo", null, raw)).toThrow(new WorkspaceError("storage"));
  });
  it("同IDのファイルでも取込ごとに版を変え、確認後の別タブ更新を上書きしない", () => {
    const original = saved(); writeWorkspace(localStorage, "demo", null, original);
    const changed = importWorkspace(localStorage, "demo", original.id, JSON.stringify({ ...original, title: "外で編集" }));
    expect(changed.id).not.toBe(original.id);
    expect(() => importWorkspace(localStorage, "demo", original.id, JSON.stringify(original))).toThrow(new WorkspaceError("conflict"));
    expect(() => writeWorkspace(localStorage, "demo", original.id, null)).toThrow(new WorkspaceError("conflict"));
    expect(readWorkspace(localStorage, "demo")).toEqual(changed);
  });
});

describe("途中保存ファイルの確認画面", () => {
  const props = () => ({ dataset: "demo" as const, graph: emptyGraph(), captureView: () => null, onOpen: vi.fn(), onClose: vi.fn() });
  const selectFile = (value: SavedWorkspace, name = "workspace.json") => {
    const file = { name, size: JSON.stringify(value).length, text: async () => JSON.stringify(value) };
    fireEvent.change(screen.getByLabelText("途中保存のJSONファイル"), { target: { files: [file] } });
  };
  it("起点なしで内容を確認し、明示保存まで何も変更しない", async () => {
    const callbacks = props(); render(<WorkspaceDialog {...callbacks} />);
    const value = saved(); selectFile(value);
    await screen.findByRole("region", { name: "読み込む途中保存の確認" });
    expect(screen.getByRole("region").textContent).toContain(value.rootId);
    expect(screen.getByRole("region").textContent).toContain("保存した枝：2件 / 取得済み：2ページ");
    expect(readWorkspace(localStorage, "demo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "確認した途中保存を読み込む" }));
    expect(readWorkspace(localStorage, "demo")?.title).toBe(value.title);
    expect(screen.queryByRole("region")).toBeNull();
    expect(callbacks.onOpen).not.toHaveBeenCalled(); expect(fetchEntity).not.toHaveBeenCalled();
    expect(fetchNeighbors).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("途中保存のJSONファイル"));
  });
  it("置換対象を表示し、取消では保存もGraphも変えない", async () => {
    const previous = saved(); previous.title = "残したい途中"; writeWorkspace(localStorage, "demo", null, previous);
    const callbacks = props(); render(<WorkspaceDialog {...callbacks} />);
    fireEvent.click(screen.getByRole("checkbox"));
    selectFile(saved()); await screen.findByRole("region");
    expect(screen.getByRole("region").textContent).toContain("「残したい途中」を置き換えます");
    fireEvent.click(screen.getByRole("button", { name: "ファイルの読み込みを取り消す" }));
    expect(readWorkspace(localStorage, "demo")).toEqual(previous);
    expect(screen.queryByRole("region")).toBeNull();
    selectFile(saved()); await screen.findByRole("region");
    fireEvent.click(screen.getByRole("button", { name: "確認したファイルで途中保存を置き換える" }));
    expect(readWorkspace(localStorage, "demo")?.title).toBe("制作の途中");
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });
  it.each([true, false])("確認後の他タブ更新を拒否する（storage event=%s）", async event => {
    const previous = saved(); writeWorkspace(localStorage, "demo", null, previous);
    render(<WorkspaceDialog {...props()} />);
    fireEvent.click(screen.getByRole("checkbox"));
    selectFile(saved()); await screen.findByRole("region");
    const changed = saved(); changed.title = "別タブの途中";
    writeWorkspace(localStorage, "demo", previous.id, changed);
    if (event) fireEvent(window, new StorageEvent("storage", { key: workspaceKey("demo") }));
    const confirm = screen.getByRole("button", { name: "確認したファイルで途中保存を置き換える" }) as HTMLButtonElement;
    if (event) expect(confirm.disabled).toBe(true);
    else fireEvent.click(confirm);
    expect(screen.getByRole("alert").textContent).toContain("確認中に保存内容が変わりました");
    expect(readWorkspace(localStorage, "demo")).toEqual(changed);
    // Re-reading storage and reselecting the file is explicit new review.
    fireEvent(window, new StorageEvent("storage", { key: workspaceKey("demo") }));
    fireEvent.change(screen.getByLabelText("再開・管理する途中保存"), { target: { value: changed.id } });
    selectFile(saved()); await screen.findByRole("region");
    expect(screen.getByRole("region").textContent).toContain("「別タブの途中」を置き換えます");
    expect((screen.getByRole("button", { name: "確認したファイルで途中保存を置き換える" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("サイズ超過は本文読込前に拒否する", async () => {
    render(<WorkspaceDialog {...props()} />);
    const file = { name: "huge.json", size: WORKSPACE_FILE_LIMIT + 1, text: vi.fn() };
    fireEvent.change(screen.getByLabelText("途中保存のJSONファイル"), { target: { files: [file] } });
    await screen.findByRole("alert"); expect(file.text).not.toHaveBeenCalled();
    expect(readWorkspace(localStorage, "demo")).toBeNull();
  });
  it.each(["cancel", "replace", "unmount"])("遅いファイル読込を%s後に適用しない", async action => {
    const mounted = render(<WorkspaceDialog {...props()} />);
    let resolve!: (raw: string) => void;
    const file = { name: "slow.json", size: 1000, text: () => new Promise<string>(done => { resolve = done; }) };
    fireEvent.change(screen.getByLabelText("途中保存のJSONファイル"), { target: { files: [file] } });
    if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "ファイルの読み込みを取り消す" }));
    if (action === "replace") { const value = saved(); value.title = "後から選んだ途中"; selectFile(value); await screen.findByRole("region"); }
    if (action === "unmount") mounted.unmount();
    await act(async () => resolve(JSON.stringify(saved())));
    if (action === "replace") expect(screen.getByRole("region").textContent).toContain("後から選んだ途中");
    else expect(screen.queryByRole("region")).toBeNull();
    expect(readWorkspace(localStorage, "demo")).toBeNull(); expect(fetchEntity).not.toHaveBeenCalled();
  });
});

describe("複数の探索途中の保存・管理", () => {
  const props = () => ({ dataset: "demo" as const, graph: graph(), captureView: () => view, onOpen: vi.fn(), onClose: vi.fn() });
  it("旧1件は読むだけでは変更せず、最初の追加でそのまま引き継ぐ", () => {
    const legacy = saved(); const raw = JSON.stringify(legacy);
    localStorage.setItem(workspaceKey("demo"), raw);
    expect(readWorkspaces(localStorage, "demo")).toEqual([legacy]);
    expect(localStorage.getItem(workspaceKey("demo"))).toBe(raw);
    const next = saved(); next.title = "別の調査";
    writeWorkspace(localStorage, "demo", null, next);
    expect(readWorkspaces(localStorage, "demo")).toEqual([next, legacy]);
    expect(JSON.parse(localStorage.getItem(workspaceKey("demo"))!)).toEqual({ version: 2, dataset: "demo", workspaces: [next, legacy] });
    expect(JSON.parse(exportWorkspace(localStorage, "demo", legacy.id))).toEqual(legacy);
  });
  it("移行時に保存拒否が起きても旧形式の元データを維持する", () => {
    const legacy = saved(); const raw = JSON.stringify(legacy);
    localStorage.setItem(workspaceKey("demo"), raw);
    const denied = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw new Error("quota"); }, removeItem: vi.fn() };
    expect(() => writeWorkspace(denied, "demo", null, saved())).toThrow(new WorkspaceError("storage"));
    expect(localStorage.getItem(workspaceKey("demo"))).toBe(raw);
    expect(denied.removeItem).not.toHaveBeenCalled();
  });
  it("最新一覧へ追加し、選択した版だけを置換・削除する", () => {
    const first = saved(); const second = saved(); const otherTab = saved(); const replacement = saved();
    writeWorkspace(localStorage, "demo", null, first);
    writeWorkspace(localStorage, "demo", null, second);
    writeWorkspace(localStorage, "demo", null, otherTab);
    writeWorkspace(localStorage, "demo", first.id, replacement);
    expect(readWorkspaces(localStorage, "demo")).toEqual([replacement, otherTab, second]);
    expect(() => writeWorkspace(localStorage, "demo", first.id, null)).toThrow(new WorkspaceError("conflict"));
    expect(() => exportWorkspace(localStorage, "demo", first.id)).toThrow(new WorkspaceError("emptyFile"));
    writeWorkspace(localStorage, "demo", second.id, null);
    expect(readWorkspaces(localStorage, "demo")).toEqual([replacement, otherTab]);
  });
  it("10件上限では追加・取込を拒否し、選択した1件の置換は許可する", () => {
    const values = Array.from({ length: WORKSPACE_COUNT_LIMIT }, saved);
    values.forEach(value => writeWorkspace(localStorage, "demo", null, value));
    const before = localStorage.getItem(workspaceKey("demo"));
    expect(() => writeWorkspace(localStorage, "demo", null, saved())).toThrow(new WorkspaceError("countLimit"));
    expect(() => importWorkspace(localStorage, "demo", null, JSON.stringify(saved()))).toThrow(new WorkspaceError("countLimit"));
    expect(localStorage.getItem(workspaceKey("demo"))).toBe(before);
    const replacement = saved(); writeWorkspace(localStorage, "demo", values[0].id, replacement);
    expect(readWorkspaces(localStorage, "demo")).toEqual([replacement, ...values.slice(1).reverse()]);
  });
  it.each(["duplicate", "dataset", "unknown", "count", "broken-item"])("不正collectionを一部だけ受理せず保持する: %s", mode => {
    const first = saved();
    const collection = { version: 2, dataset: "demo", workspaces: [first] };
    if (mode === "duplicate") collection.workspaces.push(first);
    if (mode === "dataset") first.dataset = "pilot-event-v1";
    if (mode === "unknown") collection.version = 3;
    if (mode === "count") collection.workspaces = Array.from({ length: 11 }, saved);
    if (mode === "broken-item") first.title = "";
    const raw = JSON.stringify(collection); localStorage.setItem(workspaceKey("demo"), raw);
    expect(() => readWorkspaces(localStorage, "demo")).toThrow(new WorkspaceError("invalid"));
    expect(() => writeWorkspace(localStorage, "demo", first.id, saved())).toThrow(new WorkspaceError("invalid"));
    expect(localStorage.getItem(workspaceKey("demo"))).toBe(raw);
  });
  it("同じUUIDの書込みを拒否し、既存の版・別件との衝突を防ぐ", () => {
    const first = saved(); const second = saved();
    writeWorkspace(localStorage, "demo", null, first);
    writeWorkspace(localStorage, "demo", null, second);
    expect(() => writeWorkspace(localStorage, "demo", first.id, { ...first, title: "同版更新" })).toThrow(new WorkspaceError("invalid"));
    expect(() => writeWorkspace(localStorage, "demo", first.id, second)).toThrow(new WorkspaceError("invalid"));
    expect(readWorkspaces(localStorage, "demo")).toEqual([second, first]);
  });
  it("選択して別々に再開でき、新規保存では前の調査を失わない", async () => {
    const first = captureWorkspace("demo", "閉じた調査", closeExpansion(graph(), root.id), view);
    writeWorkspace(localStorage, "demo", null, first);
    const callbacks = props(); const mounted = render(<WorkspaceDialog {...callbacks} />);
    fireEvent.change(screen.getByLabelText("途中保存の名前"), { target: { value: "開いた調査" } });
    fireEvent.click(screen.getByRole("button", { name: "現在の探索途中を保存" }));
    const values = readWorkspaces(localStorage, "demo");
    expect(values.map(item => item.title)).toEqual(["開いた調査", "閉じた調査"]);
    fireEvent.change(screen.getByLabelText("再開・管理する途中保存"), { target: { value: first.id } });
    fireEvent.click(screen.getByRole("button", { name: "保存した途中を再開" }));
    await waitFor(() => expect(callbacks.onOpen).toHaveBeenCalledOnce());
    expect(Object.keys(callbacks.onOpen.mock.calls[0][0].graph.nodes)).toEqual([root.id]);
    mounted.unmount();
    const next = props(); render(<WorkspaceDialog {...next} />);
    fireEvent.click(screen.getByRole("button", { name: "保存した途中を再開" }));
    await waitFor(() => expect(next.onOpen).toHaveBeenCalledOnce());
    expect(next.onOpen.mock.calls[0][0].graph.nodes).toEqual(graph().nodes);
  });
  it("削除は名前の確認後だけ行い、選択変更は確認を取り消す", () => {
    const first = saved(); first.title = "残す"; const second = saved(); second.title = "削除対象";
    writeWorkspace(localStorage, "demo", null, first); writeWorkspace(localStorage, "demo", null, second);
    const callbacks = props(); render(<WorkspaceDialog {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "途中保存を削除" }));
    expect(readWorkspaces(localStorage, "demo")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("再開・管理する途中保存"), { target: { value: first.id } });
    expect(screen.queryByRole("button", { name: "この途中保存を削除する" })).toBeNull();
    fireEvent.change(screen.getByLabelText("再開・管理する途中保存"), { target: { value: second.id } });
    fireEvent.click(screen.getByRole("button", { name: "途中保存を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "この途中保存を削除する" }));
    expect(readWorkspaces(localStorage, "demo")).toEqual([first]);
    expect((screen.getByLabelText("再開・管理する途中保存") as HTMLSelectElement).value).toBe("");
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });
  it.each([true, false])("選択した版が別タブで変わると置換・削除を拒否する（event=%s）", event => {
    const first = saved(); const second = saved();
    writeWorkspace(localStorage, "demo", null, first); writeWorkspace(localStorage, "demo", null, second);
    render(<WorkspaceDialog {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "途中保存を削除" }));
    const changed = saved(); writeWorkspace(localStorage, "demo", second.id, changed);
    if (event) {
      fireEvent(window, new StorageEvent("storage", { key: workspaceKey("demo") }));
      expect((screen.getByRole("button", { name: "この途中保存を削除する" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole("button", { name: /を現在の探索で置き換える/ })).toBeNull();
    } else {
      fireEvent.click(screen.getByRole("button", { name: /を現在の探索で置き換える/ }));
      fireEvent.click(screen.getByRole("button", { name: "この途中保存を削除する" }));
    }
    expect(screen.getByRole("alert").textContent).toContain("別のタブ");
    expect(readWorkspaces(localStorage, "demo")).toEqual([changed, first]);
  });
  it("ファイルは既定で別件として追加し、同じファイルでも保存を上書きしない", async () => {
    const previous = saved(); writeWorkspace(localStorage, "demo", null, previous);
    render(<WorkspaceDialog {...props()} />);
    const raw = JSON.stringify(previous);
    fireEvent.change(screen.getByLabelText("途中保存のJSONファイル"), { target: { files: [{ name: "backup.json", size: raw.length, text: async () => raw }] } });
    await screen.findByRole("region");
    expect(screen.queryByRole("button", { name: "確認したファイルで途中保存を置き換える" })).toBeNull();
    const other = saved(); writeWorkspace(localStorage, "demo", null, other);
    fireEvent.click(screen.getByRole("button", { name: "確認した途中保存を読み込む" }));
    const values = readWorkspaces(localStorage, "demo");
    expect(values).toHaveLength(3); expect(values.slice(1)).toEqual([other, previous]);
    expect(values[0].id).not.toBe(previous.id);
    expect(fetchEntity).not.toHaveBeenCalled();
  });
  it("ファイル置換の確認後に別件を選択しても、その別件を上書きしない", async () => {
    const first = saved(); const second = saved();
    writeWorkspace(localStorage, "demo", null, first); writeWorkspace(localStorage, "demo", null, second);
    render(<WorkspaceDialog {...props()} />);
    fireEvent.click(screen.getByRole("checkbox"));
    let resolve!: (raw: string) => void;
    fireEvent.change(screen.getByLabelText("途中保存のJSONファイル"), { target: { files: [{ name: "slow.json", size: 1000, text: () => new Promise<string>(done => { resolve = done; }) }] } });
    fireEvent.change(screen.getByLabelText("再開・管理する途中保存"), { target: { value: first.id } });
    await act(async () => resolve(JSON.stringify(saved())));
    expect((screen.getByRole("button", { name: "確認したファイルで途中保存を置き換える" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("確認中に保存内容が変わりました");
    expect(readWorkspaces(localStorage, "demo")).toEqual([second, first]);
  });
});
