import { savedViewSchema } from "../lib/client/saved-views";
import { legacyRelation } from "../lib/client/relation-state";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { editSavedViews, exportSavedViews, importSavedViews, parseSavedViewsBackup, planSavedViewsImport, readSavedViews, savedViewsKey, SavedViewsError, SAVED_VIEWS_FILE_LIMIT, viewConditionsSchema, type SavedView, type ViewConditions } from "../lib/client/saved-views";
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
const view = (overrides: Partial<SavedView> & { conditions?: ViewConditions } = {}): SavedView => {
  const { conditions = all, ...rest } = overrides;
  const raw = { version: 2 as const, id: crypto.randomUUID(), title: "また辿る関係", rootId: root.id,
    relation: { ...legacyRelation(all), ...conditions }, createdAt: "2026-10-08T12:00:00.000Z", ...rest };
  const parsed = savedViewSchema.safeParse(raw); return parsed.success ? parsed.data : raw;
};
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
    expect(readSavedViews(localStorage, "demo")[0]).toEqual(saved);
    expect(readSavedViews(localStorage, "pilot-event-v1")).toEqual([]);
    const empty = { ...all, predicates: [] };
    editSavedViews(localStorage, "demo", { add: view({ conditions: empty }) });
    expect((readSavedViews(localStorage, "demo")[0].relation as ReturnType<typeof legacyRelation>).predicates).toEqual([]);
    expect(viewConditionsSchema.parse({ ...all, contributionRoles: [], organizationPositions: [], eventRoles: [] })).toEqual({ ...all, contributionRoles: [], organizationPositions: [], eventRoles: [] });
    const raw = localStorage.getItem(savedViewsKey("demo"))!;
    expect(raw).not.toMatch(/cursor|claims|nodes|description|facet|positions"/);
    expect(Object.keys(JSON.parse(raw).views[0]).sort()).toEqual(["createdAt", "id", "relation", "rootId", "title", "version"]);
  });
  it.each([
    "not json",
    JSON.stringify({ version: 99, dataset: "demo", views: [] }),
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

const backup = (views: SavedView[], dataset = "demo") => JSON.stringify({ version: 2, dataset, views });

describe("保存ビューのファイル往復と非破壊import", () => {
  it("三限定と空条件を書き出し、新しい保存領域へ同じ内容で追加できる", () => {
    const first = view({ conditions });
    const second = view({ conditions: { ...all, predicates: [] } });
    editSavedViews(localStorage, "demo", { add: first });
    editSavedViews(localStorage, "demo", { add: second });
    const expected = readSavedViews(localStorage, "demo");
    const raw = exportSavedViews(localStorage, "demo");
    expect(JSON.parse(raw)).toEqual({ version: 2, dataset: "demo", views: expected });
    localStorage.clear();
    expect(importSavedViews(localStorage, "demo", raw)).toEqual({ views: expected, added: 2, skipped: 0 });
    expect(readSavedViews(localStorage, "demo")).toEqual(expected);
    expect(readSavedViews(localStorage, "pilot-event-v1")).toEqual([]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(importSavedViews(localStorage, "demo", raw)).toEqual({ views: expected, added: 0, skipped: 2 });
    expect(write).not.toHaveBeenCalled();
  });
  it("条件とJSONプロパティの順序差は重複として扱い、別IDの同名ビューは残す", () => {
    const first = view({ conditions });
    editSavedViews(localStorage, "demo", { add: first });
    const { id, title, rootId, createdAt } = first;
    const reordered = { version: 2 as const, createdAt, relation: { ...legacyRelation(conditions), predicates: [...conditions.predicates!].reverse() }, rootId, title, id };
    const second = view({ title: first.title });
    const result = importSavedViews(localStorage, "demo", backup([reordered, second]));
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(result.views.map(view => view.id)).toEqual([second.id, first.id]);
  });
  it("同じIDで内容が異なる場合は一部追加せず、元の保存を保持する", () => {
    const first = view();
    editSavedViews(localStorage, "demo", { add: first });
    const before = localStorage.getItem(savedViewsKey("demo"));
    expect(() => importSavedViews(localStorage, "demo", backup([view(), { ...first, title: "変更された名前" }]))).toThrow(new SavedViewsError("conflict"));
    expect(localStorage.getItem(savedViewsKey("demo"))).toBe(before);
  });
  it.each([
    ["JSON破損", "{"],
    ["未知version", JSON.stringify({ version: 99, dataset: "demo", views: [] })],
    ["未知語彙", backup([view({ conditions: { ...all, predicates: ["UNKNOWN"] as never } })])],
    ["不要な知識データ", JSON.stringify({ version: 1, dataset: "demo", views: [], claims: [] })],
    ["長すぎる入力", " ".repeat(SAVED_VIEWS_FILE_LIMIT + 1)],
    ["ファイル内件数超過", backup(Array.from({ length: 21 }, () => view()))],
  ])("%sを拒否し保存領域を変更しない", (_name, raw) => {
    editSavedViews(localStorage, "demo", { add: view() });
    const before = localStorage.getItem(savedViewsKey("demo"));
    expect(() => importSavedViews(localStorage, "demo", raw)).toThrow(new SavedViewsError("invalid"));
    expect(localStorage.getItem(savedViewsKey("demo"))).toBe(before);
  });
  it("別datasetとファイル内の重複IDを拒否する", () => {
    const saved = view();
    expect(() => parseSavedViewsBackup(backup([saved], "pilot-event-v1"), "demo")).toThrow(new SavedViewsError("dataset"));
    expect(() => parseSavedViewsBackup(backup([saved, saved]), "demo")).toThrow(new SavedViewsError("invalid"));
  });
  it("プレビュー後に増えた既存保存も保持し、最新状態で上限と衝突を確認する", () => {
    const incoming = view();
    expect(planSavedViewsImport([], [incoming]).added).toBe(1);
    const concurrent = view();
    editSavedViews(localStorage, "demo", { add: concurrent });
    expect(importSavedViews(localStorage, "demo", backup([incoming])).views).toEqual([incoming, concurrent]);
    for (let i = 0; i < 18; i++) editSavedViews(localStorage, "demo", { add: view() });
    const before = localStorage.getItem(savedViewsKey("demo"));
    expect(() => importSavedViews(localStorage, "demo", backup([view()]))).toThrow(new SavedViewsError("limit"));
    expect(localStorage.getItem(savedViewsKey("demo"))).toBe(before);
    expect(importSavedViews(localStorage, "demo", backup([incoming])).skipped).toBe(1);
    expect(() => importSavedViews(localStorage, "demo", backup([{ ...incoming, rootId: other.id }]))).toThrow(new SavedViewsError("conflict"));
  });
  it("読み書き拒否と壊れた保存領域を成功扱いしない", () => {
    const saved = view();
    const readDenied = { getItem: () => { throw new Error("Denied"); }, setItem: vi.fn() };
    expect(() => exportSavedViews(readDenied, "demo")).toThrow(new SavedViewsError("storage"));
    expect(() => importSavedViews(readDenied, "demo", backup([saved]))).toThrow(new SavedViewsError("storage"));
    expect(readDenied.setItem).not.toHaveBeenCalled();
    const writeDenied = { getItem: () => null, setItem: () => { throw new Error("Quota"); } };
    expect(() => importSavedViews(writeDenied, "demo", backup([saved]))).toThrow(new SavedViewsError("storage"));
    localStorage.setItem(savedViewsKey("demo"), "broken");
    expect(() => exportSavedViews(localStorage, "demo")).toThrow(new SavedViewsError("invalid"));
    expect(() => importSavedViews(localStorage, "demo", backup([saved]))).toThrow(new SavedViewsError("invalid"));
    expect(localStorage.getItem(savedViewsKey("demo"))).toBe("broken");
  });
});

describe("保存ファイルの確認と取消", () => {
  const props = () => ({ dataset: "demo" as const, root: null, conditions: all, onOpen: vi.fn(), onClose: vi.fn() });
  const chooseFile = (raw: string, name = "saved-views.json", text = () => Promise.resolve(raw), size = raw.length) => {
    const file = new File([raw], name, { type: "application/json" });
    // jsdom's File does not implement Blob.text yet.
    Object.defineProperties(file, { text: { value: text }, size: { value: size } });
    fireEvent.change(screen.getByLabelText("保存ビューのJSONファイル"), { target: { files: [file] } });
  };
  const openBackup = () => { fireEvent.click(screen.getByText("ファイルに控える・読み込む")); };
  it("起点なしでも内容確認後に追加でき、確認や取消だけでは保存・探索を変えない", async () => {
    const callbacks = props(); render(<SavedViews {...callbacks} />); openBackup();
    const incoming = view({ title: "ファイルから再訪", conditions });
    chooseFile(backup([incoming]));
    await screen.findByRole("region", { name: "読み込む内容の確認" });
    expect(screen.getByText(/追加予定：1件/)).toBeDefined();
    expect(screen.getByText(/起点ID：/).textContent).toContain(root.id);
    expect(readSavedViews(localStorage, "demo")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "読み込みを取り消す" }));
    expect(screen.queryByRole("region", { name: "読み込む内容の確認" })).toBeNull();
    expect(readSavedViews(localStorage, "demo")).toEqual([]);
    chooseFile(backup([incoming]));
    await screen.findByRole("region", { name: "読み込む内容の確認" });
    fireEvent.click(screen.getByRole("button", { name: "確認したビューを追加" }));
    expect(screen.getByRole("status").textContent).toContain("1件を追加しました");
    expect(screen.getByRole("button", { name: "ファイルから再訪を開く" })).toBeDefined();
    expect(callbacks.onOpen).not.toHaveBeenCalled();
    expect(fetchEntity).not.toHaveBeenCalled();
    expect(fetchNeighbors).not.toHaveBeenCalled();
  });
  it("拒否されたファイルを明示し、同じ入力から正しいファイルを再選択できる", async () => {
    render(<SavedViews {...props()} />); openBackup();
    chooseFile(backup([view()], "pilot-event-v1"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("別のデータセット"));
    chooseFile("broken");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("破損"));
    const read = vi.fn().mockResolvedValue("{}");
    chooseFile("{}", "large.json", read, SAVED_VIEWS_FILE_LIMIT + 1);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("上限超過"));
    expect(read).not.toHaveBeenCalled();
    chooseFile(backup([view()]));
    await screen.findByRole("region", { name: "読み込む内容の確認" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("古いファイルの遅延読込を無視し、読込中の取消も保持する", async () => {
    render(<SavedViews {...props()} />); openBackup();
    let resolve!: (value: string) => void;
    chooseFile("", "old.json", () => new Promise(done => { resolve = done; }));
    chooseFile(backup([view({ title: "新しいファイル" })]), "new.json");
    await screen.findByRole("region", { name: "読み込む内容の確認" });
    await act(async () => resolve(backup([view({ title: "古いファイル" })])));
    expect(screen.queryByText("古いファイル")).toBeNull();
    expect(screen.getByText("新しいファイル")).toBeDefined();
    chooseFile("", "cancel.json", () => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "読み込みを取り消す" }));
    await act(async () => resolve(backup([view()])));
    expect(screen.queryByRole("region", { name: "読み込む内容の確認" })).toBeNull();
    expect(readSavedViews(localStorage, "demo")).toEqual([]);
  });
  it("確認時の書込拒否は一覧へ反映せず、再試行して追加できる", async () => {
    render(<SavedViews {...props()} />); openBackup();
    chooseFile(backup([view()]));
    await screen.findByRole("region", { name: "読み込む内容の確認" });
    const denied = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Denied"); });
    fireEvent.click(screen.getByRole("button", { name: "確認したビューを追加" }));
    expect(screen.getByRole("alert").textContent).toContain("保存領域を利用できません");
    expect(screen.queryByRole("button", { name: "また辿る関係を開く" })).toBeNull();
    denied.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "確認したビューを追加" }));
    expect(screen.getByRole("button", { name: "また辿る関係を開く" })).toBeDefined();
  });
  it("別タブで上限に達したら確認ボタンを止め、削除後は確認できる", async () => {
    render(<SavedViews {...props()} />); openBackup();
    chooseFile(backup([view()]));
    await screen.findByRole("region", { name: "読み込む内容の確認" });
    for (let i = 0; i < 20; i++) editSavedViews(localStorage, "demo", { add: view() });
    fireEvent(window, new StorageEvent("storage", { key: savedViewsKey("demo") }));
    expect((screen.getByRole("button", { name: "確認したビューを追加" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("20件まで");
    editSavedViews(localStorage, "demo", { remove: readSavedViews(localStorage, "demo")[0].id });
    fireEvent(window, new StorageEvent("storage", { key: savedViewsKey("demo") }));
    expect((screen.getByRole("button", { name: "確認したビューを追加" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
