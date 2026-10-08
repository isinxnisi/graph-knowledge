// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { editSavedViews, readSavedViews, savedViewsKey, SavedViewsError, viewConditionsSchema, type SavedView, type ViewConditions } from "../lib/client/saved-views";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { ClientApiError, fetchEntity, fetchNeighbors } from "../lib/client/api";
import SavedViews from "../components/SavedViews";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { EntityResponse, NeighborsResponse } from "../lib/domain/api";

vi.mock("../lib/client/api", async importOriginal => ({ ...await importOriginal<typeof import("../lib/client/api")>(), fetchEntity: vi.fn(), fetchNeighbors: vi.fn() }));
const page = examples.neighbors as NeighborsResponse;
const root = page.nodes[0];
const other = page.nodes[1];
const all: ViewConditions = { predicates: null, contributionRoles: null, organizationPositions: null, eventRoles: null };
const conditions: ViewConditions = { predicates: ["CONTRIBUTED_TO", "AFFILIATED_WITH", "PARTICIPATED_IN"], contributionRoles: ["SCRIPT_WRITING"], organizationPositions: ["VISITOR"], eventRoles: ["CHAIR"] };
const view = (overrides: Partial<SavedView> = {}): SavedView => ({ id: crypto.randomUUID(), title: "また辿る関係", rootId: root.id, conditions: all, createdAt: "2026-10-08T12:00:00.000Z", ...overrides });
beforeEach(() => {
  window.localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("保存ビューの永続化境界", () => {
  it("具体条件・空集合・nullを保持し、datasetを分離する", () => {
    const saved = view({ conditions });
    editSavedViews(localStorage, "demo", { add: saved });
    expect(readSavedViews(localStorage, "demo")[0]).toEqual({ ...saved, conditions: viewConditionsSchema.parse(conditions) });
    expect(readSavedViews(localStorage, "pilot-event-v1")).toEqual([]);
    const empty = { ...all, predicates: [] };
    editSavedViews(localStorage, "demo", { add: view({ conditions: empty }) });
    expect(readSavedViews(localStorage, "demo")[0].conditions.predicates).toEqual([]);
    expect(viewConditionsSchema.parse({ ...all, contributionRoles: [], organizationPositions: [], eventRoles: [] })).toEqual({ ...all, contributionRoles: [], organizationPositions: [], eventRoles: [] });
    const raw = localStorage.getItem(savedViewsKey("demo"))!;
    expect(raw).not.toMatch(/cursor|claims|nodes|description|facet|positions"/);
    expect(Object.keys(JSON.parse(raw).views[0]).sort()).toEqual(["conditions", "createdAt", "id", "rootId", "title"]);
  });
  it.each([
    "not json",
    JSON.stringify({ version: 2, dataset: "demo", views: [] }),
    JSON.stringify({ version: 1, dataset: "pilot-event-v1", views: [] }),
    JSON.stringify({ version: 1, dataset: "demo", views: [view({ conditions: { ...all, predicates: ["UNKNOWN"] as never } })] }),
    JSON.stringify({ version: 1, dataset: "demo", views: [view({ conditions: { ...all, predicates: [], eventRoles: ["INVITED"] as never } })] }),
    JSON.stringify({ version: 1, dataset: "demo", views: [view({ rootId: "not-an-id" })] }),
  ])("未対応データを黙って解釈・上書きしない (%#)", raw => {
    localStorage.setItem(savedViewsKey("demo"), raw);
    expect(() => readSavedViews(localStorage, "demo")).toThrow(new SavedViewsError("invalid"));
    expect(() => editSavedViews(localStorage, "demo", { add: view() })).toThrow();
    expect(localStorage.getItem(savedViewsKey("demo"))).toBe(raw);
  });
  it("最新一覧へ追加・削除し、上限失敗で既存保存を失わない", () => {
    const first = view();
    editSavedViews(localStorage, "demo", { add: first });
    const second = view();
    editSavedViews(localStorage, "demo", { add: second });
    expect(editSavedViews(localStorage, "demo", { remove: first.id })).toEqual([second]);
    for (let i = 0; i < 19; i++) editSavedViews(localStorage, "demo", { add: view() });
    expect(() => editSavedViews(localStorage, "demo", { add: view() })).toThrow(new SavedViewsError("limit"));
    expect(readSavedViews(localStorage, "demo")).toHaveLength(20);
  });
  it("書込失敗を成功扱いせず、保存済みデータを残す", () => {
    const saved = view(); editSavedViews(localStorage, "demo", { add: saved });
    const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw new DOMException("Quota", "QuotaExceededError"); } };
    expect(() => editSavedViews(storage, "demo", { remove: saved.id })).toThrow(new SavedViewsError("storage"));
    expect(readSavedViews(localStorage, "demo")).toEqual([saved]);
  });
});

describe("保存ビューを開く探索遷移", () => {
  it("起点と三条件を一度に確定し、古い通信を排除して元の探索へ戻れる", async () => {
    let resolveOld!: (value: NeighborsResponse) => void;
    vi.mocked(fetchNeighbors).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    vi.mocked(fetchNeighbors).mockResolvedValue({ ...page, centerId: other.id, nodes: [other], claims: [] });
    const { result } = renderHook(() => useGraphExplorer());
    act(() => result.current.chooseRoot(root));
    const signal = vi.mocked(fetchNeighbors).mock.calls[0][2];
    const viewport = { initialLayoutDone: true, positions: { [root.id]: { x: 50, y: 70 } }, zoom: 0.8, pan: { x: 1, y: 2 } };
    act(() => result.current.openSavedView(other, conditions, viewport));
    await waitFor(() => expect(result.current.graph.expansions[other.id].loading).toBe(false));
    expect(signal.aborted).toBe(true);
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
    expect(fetchNeighbors).toHaveBeenLastCalledWith(other.id, null, expect.any(AbortSignal), ["AFFILIATED_WITH", "CONTRIBUTED_TO", "PARTICIPATED_IN"], ["SCRIPT_WRITING"], ["VISITOR"], ["CHAIR"]);
    await act(async () => { resolveOld(page); });
    expect(result.current.graph.centerId).toBe(other.id);
    expect(result.current.graph.claims).toEqual({});
    act(() => result.current.restorePrevious());
    expect(result.current.graph.centerId).toBe(root.id);
    expect(result.current.graph.predicates).toBeNull();
    expect(result.current.graph.expansions[root.id].loading).toBe(false);
    expect(result.current.graph.expansions[root.id].error).toBeTruthy();
    expect(result.current.viewRestoration?.view).toEqual(viewport);
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
  });
});

describe("保存ビューの操作と失敗", () => {
  const props = () => ({ dataset: "demo" as const, root, conditions: all, onOpen: vi.fn(), onClose: vi.fn() });
  it("保存成功後だけ一覧へ追加し、削除を保存領域に反映する", () => {
    render(<SavedViews {...props()} />);
    fireEvent.change(screen.getByLabelText("保存ビューの名前"), { target: { value: "制作を再訪" } });
    fireEvent.click(screen.getByRole("button", { name: "現在の起点と条件を保存" }));
    expect(screen.getByRole("status").textContent).toContain("保存しました");
    expect(readSavedViews(localStorage, "demo")[0].title).toBe("制作を再訪");
    fireEvent.click(screen.getByRole("button", { name: "制作を再訪を削除" }));
    expect(readSavedViews(localStorage, "demo")).toEqual([]);
  });
  it("保存拒否を明示し一覧へ成功結果を追加しない", () => {
    render(<SavedViews {...props()} />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Denied"); });
    fireEvent.click(screen.getByRole("button", { name: "現在の起点と条件を保存" }));
    expect(screen.getByRole("alert").textContent).toContain("保存領域を利用できません");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /を削除/ })).toBeNull();
  });
  it("削除済み起点・一時失敗では探索を変更せず、同じボタンで再試行する", async () => {
    editSavedViews(localStorage, "demo", { add: view() });
    vi.mocked(fetchEntity).mockRejectedValueOnce(new ClientApiError("Missing", 404));
    vi.mocked(fetchEntity).mockRejectedValueOnce(new ClientApiError("Unavailable", 503));
    vi.mocked(fetchEntity).mockResolvedValue({ entity: { ...root, name: "最新の名前", aliases: [], event: null } });
    const callbacks = props(); render(<SavedViews {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "また辿る関係を開く" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("起点が見つかりません"));
    expect(callbacks.onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "また辿る関係を開く" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("起点を確認できません"));
    expect(callbacks.onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "また辿る関係を開く" }));
    await waitFor(() => expect(callbacks.onOpen).toHaveBeenCalledWith({ ...root, name: "最新の名前" }, all));
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });
  it("閉じた後の遅延応答は探索へ適用しない", async () => {
    editSavedViews(localStorage, "demo", { add: view() });
    let resolve!: (value: EntityResponse) => void;
    vi.mocked(fetchEntity).mockImplementation(() => new Promise(done => { resolve = done; }));
    const callbacks = props(); render(<SavedViews {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "また辿る関係を開く" }));
    const signal = vi.mocked(fetchEntity).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "保存ビューを閉じる" }));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ entity: { ...root, aliases: [], event: null } }));
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });
  it("別タブの保存変更を反映し、未知形式に変われば操作を止める", () => {
    render(<SavedViews {...props()} />);
    editSavedViews(localStorage, "demo", { add: view() });
    fireEvent(window, new StorageEvent("storage", { key: savedViewsKey("demo") }));
    expect(screen.getByRole("button", { name: "また辿る関係を開く" })).toBeDefined();
    localStorage.setItem(savedViewsKey("demo"), "invalid");
    fireEvent(window, new StorageEvent("storage", { key: savedViewsKey("demo") }));
    expect((screen.getByRole("button", { name: "また辿る関係を開く" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("元のデータは変更していません");
  });
});
