// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CAPSULE_LIMITS, CapsuleError, capsuleContentChanged, capsuleEditCandidates, reviseCapsule, capsuleGraph, capsuleSchema, capsulesKey, createCapsule, readCapsules, resolveCapsule, writeCapsule, type LocalCapsule } from "../lib/client/local-capsules";
import { contentPositions } from "../lib/client/graph-layout";
import { displayRelations } from "../lib/client/graph-presentation";
import { emptyGraph } from "../lib/client/graph-state";
import { ClientApiError, fetchDatasetRevision, fetchClaim, fetchEntity } from "../lib/client/api";
import type { ClaimResponse, EntityResponse, NeighborsResponse } from "../lib/domain/api";
import CapsuleDialog from "../components/CapsuleDialog";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";

vi.mock("../lib/client/api", async original => ({ ...await original<typeof import("../lib/client/api")>(), fetchDatasetRevision: vi.fn(), fetchEntity: vi.fn(), fetchClaim: vi.fn() }));
vi.mock("../components/GraphCanvas", () => ({ default: () => <div>Capsule Graph</div> }));
const page = examples.neighbors as NeighborsResponse;
const claim = examples.claim.claim as ClaimResponse["claim"];
const nodes = Object.fromEntries(page.nodes.map(entity => [entity.id, entity]));
const graph = { ...emptyGraph(), nodes, claims: Object.fromEntries(page.claims.map(claim => [claim.id, claim])) };
const endpoints = [claim.subjectId, claim.objectId];
const isolated = page.nodes.find(node => !endpoints.includes(node.id))!;
const capsule = (overrides: Partial<LocalCapsule> = {}): LocalCapsule => ({ id: crypto.randomUUID(), dataset: "demo", revision: 1, title: "師と作品を辿る", note: "自分の調査メモ\n未確認の説明", language: "ja", createdAt: "2026-10-09T00:00:00Z", entityIds: [...endpoints, isolated.id], claimIds: [claim.id], ...overrides });
const detail = (id: string): EntityResponse => ({ entity: { ...nodes[id], aliases: [], event: null } });
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchEntity).mockImplementation(async id => detail(id));
  vi.mocked(fetchClaim).mockResolvedValue(examples.claim as ClaimResponse);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("Capsuleの独立した構成と永続化", () => {
  it("選んだ参照と説明だけを保存し、孤立対象と他datasetを分離する", () => {
    const value = createCapsule("demo", "  辿った文脈  ", "メモ", [...endpoints, isolated.id], [claim.id], graph);
    expect(value.title).toBe("辿った文脈");
    writeCapsule(localStorage, "demo", { add: value });
    expect(readCapsules(localStorage, "demo")).toEqual([value]);
    expect(readCapsules(localStorage, "pilot-event-v1")).toEqual([]);
    const raw = localStorage.getItem(capsulesKey("demo"))!;
    expect(raw).not.toMatch(/cursor|pan|zoom|sourceCount|predicate|positions|expansions|condition/);
    expect(Object.keys(JSON.parse(raw).capsules[0]).sort()).toEqual(["id", "dataset", "revision", "title", "note", "language", "createdAt", "entityIds", "claimIds"].sort());
  });
  it("Entityのみを保存でき、端点なしClaimや非表示参照は保存しない", () => {
    expect(createCapsule("demo", "対象群", "", [isolated.id], [], graph).claimIds).toEqual([]);
    expect(() => createCapsule("demo", "不正", "", [claim.subjectId], [claim.id], graph)).toThrow(CapsuleError);
    expect(() => createCapsule("demo", "不正", "", [crypto.randomUUID()], [], graph)).toThrow(CapsuleError);
    expect(() => createCapsule("demo", "不正", "", endpoints, [crypto.randomUUID()], graph)).toThrow(CapsuleError);
  });
  it.each([
    { entityIds: [] }, { entityIds: [claim.subjectId, claim.subjectId] }, { claimIds: [claim.id, claim.id] },
    { revision: 2 }, { title: " " }, { note: "あ".repeat(4001) }, { entityIds: ["bad"] },
    { entityIds: Array.from({ length: 31 }, () => crypto.randomUUID()) }, { claimIds: Array.from({ length: 61 }, () => crypto.randomUUID()) },
  ])("不正・未対応の構成と上限を拒否 (%#)", overrides => {
    expect(capsuleSchema.safeParse({ ...capsule(), ...overrides }).success).toBe(false);
  });
  it.each(["not JSON", JSON.stringify({ format: "local-capsules", version: 3, capsules: [] }), JSON.stringify({ format: "local-capsules", version: 1, capsules: [capsule({ dataset: "pilot-event-v1" })] })])("破損・異datasetを上書きしない (%#)", raw => {
    localStorage.setItem(capsulesKey("demo"), raw);
    expect(() => writeCapsule(localStorage, "demo", { add: capsule() })).toThrow(new CapsuleError("invalid"));
    expect(localStorage.getItem(capsulesKey("demo"))).toBe(raw);
  });
  it("UTF-8サイズ超過と重複レコードを拒否する", () => {
    const value = capsule();
    localStorage.setItem(capsulesKey("demo"), JSON.stringify({ format: "local-capsules", version: 1, capsules: [value, value] }));
    expect(() => readCapsules(localStorage, "demo")).toThrow(CapsuleError);
    localStorage.setItem(capsulesKey("demo"), "あ".repeat(CAPSULE_LIMITS.bytes / 2));
    expect(() => readCapsules(localStorage, "demo")).toThrow(CapsuleError);
  });
  it("最新追加を保ち、満杯の追加は拒否しても指定削除はできる", () => {
    const first = capsule(); writeCapsule(localStorage, "demo", { add: first });
    for (let i = 1; i < CAPSULE_LIMITS.count; i++) writeCapsule(localStorage, "demo", { add: capsule() });
    expect(() => writeCapsule(localStorage, "demo", { add: capsule() })).toThrow(new CapsuleError("limit"));
    const previous = readCapsules(localStorage, "demo");
    expect(writeCapsule(localStorage, "demo", { remove: first })).toEqual(previous.filter(item => item.id !== first.id));
    expect(() => writeCapsule(localStorage, "demo", { remove: first })).toThrow(new CapsuleError("conflict"));
  });
  it("変更された削除対象と同じIDの追加を拒否する", () => {
    const value = capsule(); writeCapsule(localStorage, "demo", { add: value });
    expect(() => writeCapsule(localStorage, "demo", { add: value })).toThrow(new CapsuleError("conflict"));
    expect(() => writeCapsule(localStorage, "demo", { remove: { ...value, note: "別版" } })).toThrow(new CapsuleError("conflict"));
    expect(readCapsules(localStorage, "demo")).toEqual([value]);
  });
  it("保存領域の読取・書込失敗では成功としない", () => {
    expect(() => readCapsules({ getItem: () => { throw new Error(); }, setItem: vi.fn() }, "demo")).toThrow(new CapsuleError("storage"));
    const storage = { getItem: () => null, setItem: () => { throw new Error(); } };
    expect(() => writeCapsule(storage, "demo", { add: capsule() })).toThrow(new CapsuleError("storage"));
  });
});

describe("現在データへの再解決", () => {
  it("独立構成だけを再取得し、孤立対象と選んだClaimのみを投影する", async () => {
    const value = capsule();
    const result = await resolveCapsule(value, new AbortController().signal);
    expect(result.issues).toEqual([]);
    const projected = capsuleGraph(result);
    expect(Object.keys(projected.nodes).sort()).toEqual(value.entityIds.sort());
    expect(Object.keys(projected.claims)).toEqual(value.claimIds);
    expect(projected.expansions).toEqual({}); expect(projected.centerId).toBeNull();
    expect(fetchClaim).toHaveBeenCalledTimes(1);
  });
  it("孤立対象を初期配置の線ラベルに重ねない", () => {
    const relations = displayRelations({ [claim.id]: claim });
    const positions = contentPositions([isolated.id, ...endpoints], relations);
    const midpoint = { x: (positions[claim.subjectId].x + positions[claim.objectId].x) / 2, y: (positions[claim.subjectId].y + positions[claim.objectId].y) / 2 };
    expect(Math.abs(positions[isolated.id].x - midpoint.x) >= 130 || Math.abs(positions[isolated.id].y - midpoint.y) >= 70).toBe(true);
    const vertical = contentPositions([isolated.id, ...endpoints], relations, true);
    expect(vertical[isolated.id]).toEqual({ x: positions[isolated.id].y, y: positions[isolated.id].x });
    expect(contentPositions([], {})).toEqual({});
  });
  it("再解決の同時要求数を4以内に制限する", async () => {
    let active = 0, max = 0;
    vi.mocked(fetchEntity).mockImplementation(async id => {
      active++; max = Math.max(max, active);
      await new Promise(resolve => setTimeout(resolve, 1)); active--;
      return { entity: { ...detail(claim.subjectId).entity, id } };
    });
    await resolveCapsule(capsule({ entityIds: Array.from({ length: 12 }, () => crypto.randomUUID()), claimIds: [] }), new AbortController().signal);
    expect(max).toBe(4); expect(active).toBe(0);
  });
  it("参照失効と通信失敗を分け、端点欠落時に線を描かず保存内容を維持する", async () => {
    const value = capsule(); writeCapsule(localStorage, "demo", { add: value });
    const before = localStorage.getItem(capsulesKey("demo"));
    vi.mocked(fetchEntity).mockImplementation(async id => { if (id === claim.objectId) throw new ClientApiError("missing", 404); if (id === isolated.id) throw new ClientApiError("failed", 503); return detail(id); });
    const result = await resolveCapsule(value, new AbortController().signal);
    expect(result.issues).toEqual(expect.arrayContaining([{ kind: "entity", id: claim.objectId, reason: "missing" }, { kind: "entity", id: isolated.id, reason: "failed" }]));
    expect(result.claims[claim.id]).toEqual(claim);
    expect(capsuleGraph(result).claims).toEqual({});
    expect(localStorage.getItem(capsulesKey("demo"))).toBe(before);
  });
  it("不正応答・ID違い・端点の構成外変更は自動取り込みしない", async () => {
    vi.mocked(fetchClaim).mockResolvedValue({ ...examples.claim, claim: { ...claim, objectId: crypto.randomUUID() } } as ClaimResponse);
    let result = await resolveCapsule(capsule(), new AbortController().signal);
    expect(result.claims).toEqual({}); expect(result.issues).toContainEqual({ kind: "claim", id: claim.id, reason: "endpoints" });
    vi.mocked(fetchClaim).mockResolvedValue({ ...examples.claim, claim: { ...claim, id: crypto.randomUUID() } } as ClaimResponse);
    vi.mocked(fetchEntity).mockResolvedValue({ entity: {} } as EntityResponse);
    result = await resolveCapsule(capsule(), new AbortController().signal);
    expect(result.entities).toEqual({}); expect(result.claims).toEqual({});
    expect(result.issues.every(issue => issue.reason === "failed")).toBe(true);
  });
  it("取消後に到着した成功を返さず、次の要求も開始しない", async () => {
    const controller = new AbortController();
    let release!: (value: ClaimResponse) => void;
    vi.mocked(fetchClaim).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = resolveCapsule(capsule(), controller.signal);
    controller.abort(); release(examples.claim as ClaimResponse);
    await expect(pending).rejects.toThrow();
  });
});

describe("作成・再閲覧の導線", () => {
  it("独立Claimを選ぶと端点を明示し、メモと保存して出典へ進める", async () => {
    render(<CapsuleDialog dataset="demo" graph={graph} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "表示中のGraphから作る" }));
    fireEvent.change(screen.getByLabelText("Capsuleの題名"), { target: { value: "選んだ文脈" } });
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "自分の考え" } });
    const claimGroup = screen.getByRole("group", { name: "含める主張" });
    const choices = within(claimGroup).getAllByRole("checkbox");
    const index = Object.values(graph.claims).findIndex(item => item.id === claim.id);
    fireEvent.click(choices[index]);
    expect(screen.getAllByText("選んだ主張の対象")).toHaveLength(2);
    const entityGroup = screen.getByRole("group", { name: "含める対象" });
    const endpointBoxes = within(entityGroup).getAllByRole("checkbox").filter(box => (box as HTMLInputElement).disabled);
    expect(endpointBoxes).toHaveLength(2); endpointBoxes.forEach(box => expect((box as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Capsuleを保存" }));
    await screen.findByText("Capsule Graph");
    const saved = readCapsules(localStorage, "demo")[0];
    expect(saved.note).toBe("自分の考え"); expect(saved.entityIds.sort()).toEqual(endpoints.slice().sort()); expect(saved.claimIds).toEqual([claim.id]);
    fireEvent.click(screen.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン/ }));
    await screen.findByText("青葉ハルへのインタビュー");
    expect(document.getElementById(`capsule-citation-${claim.citations[0].id}`)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "関係図・一覧へ戻る" }));
    expect(screen.getByRole("region", { name: "関係図と一覧" })).toBe(document.activeElement);
    expect(screen.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById(`capsule-citation-${claim.citations[0].id}`)).not.toBeNull();
    expect(fetchClaim).toHaveBeenCalledTimes(1);
  });
  it("制作Roleと刊行物の違いを選択前に読み分けられる", () => {
    const selectedClaim = { ...claim, objectId: isolated.id, predicate: "CONTRIBUTED_TO" as const, contribution: { roleId: "SCRIPT_WRITING" as const, scope: { kind: "publication" as const, volumeLabel: "第1巻", editionLabel: "初版", isbn13: "9784091810017", language: "ja" } } };
    render(<CapsuleDialog dataset="demo" graph={{ ...graph, claims: { [claim.id]: selectedClaim } }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "表示中のGraphから作る" }));
    expect(screen.getByRole("checkbox", { name: /脚本.*第1巻.*初版.*9784091810017/ })).not.toBeNull();
  });
  it("未保存の説明はEscapeで即破棄せず、取消で作成へ戻る", () => {
    const close = vi.fn(); render(<CapsuleDialog dataset="demo" graph={graph} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "表示中のGraphから作る" }));
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "途中の説明" } });
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "作成を続ける" }));
    expect((screen.getByLabelText("自分の説明") as HTMLTextAreaElement).value).toBe("途中の説明");
  });
  it("破棄確認から一覧へ戻った後、残った見出しへフォーカスを渡す", () => {
    render(<CapsuleDialog dataset="demo" graph={graph} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "表示中のGraphから作る" }));
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "未保存" } });
    fireEvent.click(screen.getByRole("button", { name: "保存したCapsuleの一覧へ" }));
    fireEvent.click(screen.getByRole("button", { name: "保存せず戻る" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "保存したCapsule" }));
  });
  it("reload後の読取と再試行、確認削除で既存探索へ影響しない", async () => {
    const value = capsule(); writeCapsule(localStorage, "demo", { add: value });
    vi.mocked(fetchClaim).mockRejectedValueOnce(new ClientApiError("missing", 404));
    render(<CapsuleDialog dataset="demo" graph={emptyGraph()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "読む" }));
    await screen.findByText(/現在のデータに参照が見つかりません/);
    fireEvent.click(screen.getByRole("button", { name: "現在データを再取得" }));
    await waitFor(() => expect(screen.queryByText(/現在のデータに参照が見つかりません/)).toBeNull());
    await screen.findByText("Capsule Graph");
    fireEvent.click(screen.getByRole("button", { name: "保存したCapsuleの一覧へ" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(readCapsules(localStorage, "demo")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "削除を取り消す" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "このCapsuleを削除する" }));
    expect(readCapsules(localStorage, "demo")).toHaveLength(0);
  });
  it("閲覧終了で要求を取消し、遅着応答を表示しない", async () => {
    writeCapsule(localStorage, "demo", { add: capsule() });
    let release!: (value: ClaimResponse) => void;
    vi.mocked(fetchClaim).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    render(<CapsuleDialog dataset="demo" graph={emptyGraph()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "読む" }));
    await screen.findByText("現在の対象と主張を読み込んでいます…");
    const signal = vi.mocked(fetchClaim).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "保存したCapsuleの一覧へ" }));
    expect(signal.aborted).toBe(true);
    await act(async () => release(examples.claim as ClaimResponse));
    expect(screen.queryByText("Capsule Graph")).toBeNull();
  });
});

describe("Capsuleの編集と内容版", () => {
  it("旧collectionを無書込で読み、編集時だけ次版へ移してID・作成日時を保持する", () => {
    const original = capsule();
    const raw = JSON.stringify({ format: "local-capsules", version: 1, capsules: [original] });
    localStorage.setItem(capsulesKey("demo"), raw);
    expect(readCapsules(localStorage, "demo")).toEqual([original]);
    expect(localStorage.getItem(capsulesKey("demo"))).toBe(raw);
    const revised = reviseCapsule(original, "訂正した題名", "訂正した説明", endpoints, [claim.id], graph);
    expect(revised).toMatchObject({ id: original.id, createdAt: original.createdAt, dataset: original.dataset, revision: 2, title: "訂正した題名", note: "訂正した説明", entityIds: endpoints });
    expect(revised.updatedAt).toBeDefined();
    writeCapsule(localStorage, "demo", { replace: revised, expected: original });
    expect(readCapsules(localStorage, "demo")).toEqual([revised]);
    expect(JSON.parse(localStorage.getItem(capsulesKey("demo"))!).version).toBe(2);
    const third = reviseCapsule(revised, revised.title, "追記", endpoints, [claim.id], graph);
    writeCapsule(localStorage, "demo", { replace: third, expected: revised });
    expect(readCapsules(localStorage, "demo")[0].revision).toBe(3);
  });
  it("上限10件でも編集でき、編集中に追加された他のCapsuleを保つ", () => {
    const original = capsule(); writeCapsule(localStorage, "demo", { add: original });
    for (let i = 1; i < CAPSULE_LIMITS.count; i++) writeCapsule(localStorage, "demo", { add: capsule() });
    const others = readCapsules(localStorage, "demo").filter(item => item.id !== original.id);
    const revised = reviseCapsule(original, "変更", original.note, original.entityIds, original.claimIds, graph);
    const result = writeCapsule(localStorage, "demo", { replace: revised, expected: original });
    expect(result).toHaveLength(10); expect(result.filter(item => item.id !== original.id)).toEqual(others);
  });
  it("編集開始後の更新・削除に競合し、古い編集や削除で上書きしない", () => {
    const original = capsule(); writeCapsule(localStorage, "demo", { add: original });
    const revised = reviseCapsule(original, "別タブ", original.note, original.entityIds, original.claimIds, graph);
    writeCapsule(localStorage, "demo", { replace: revised, expected: original });
    expect(() => writeCapsule(localStorage, "demo", { replace: { ...revised, note: "古い編集" }, expected: original })).toThrow(new CapsuleError("conflict"));
    expect(() => writeCapsule(localStorage, "demo", { remove: original })).toThrow(new CapsuleError("conflict"));
    expect(readCapsules(localStorage, "demo")).toEqual([revised]);
    writeCapsule(localStorage, "demo", { remove: revised });
    expect(() => writeCapsule(localStorage, "demo", { replace: revised, expected: original })).toThrow(new CapsuleError("conflict"));
    expect(readCapsules(localStorage, "demo")).toEqual([]);
  });
  it.each([
    { id: crypto.randomUUID() }, { dataset: "pilot-event-v1" }, { createdAt: "2026-10-10T00:00:00Z" }, { revision: 4 }, { revision: 1 }, { updatedAt: undefined },
  ])("ID・dataset・作成日時・連続内容版の不正変更を拒否する (%#)", change => {
    const original = capsule(); writeCapsule(localStorage, "demo", { add: original });
    const revised = reviseCapsule(original, "更新", original.note, original.entityIds, original.claimIds, graph);
    expect(() => writeCapsule(localStorage, "demo", { replace: { ...revised, ...change } as LocalCapsule, expected: original })).toThrow(new CapsuleError("invalid"));
    expect(readCapsules(localStorage, "demo")).toEqual([original]);
  });
  it("内容が変わらなければ版を進めず、選択順を意味の差にしない", () => {
    const original = capsule();
    expect(capsuleContentChanged(original, ` ${original.title} `, original.note, [...original.entityIds].reverse(), original.claimIds)).toBe(false);
    expect(reviseCapsule(original, original.title, original.note, original.entityIds, original.claimIds, graph)).toBe(original);
  });
  it("未解決の保存参照を保持し、未知の新規参照・端点喪失を拒否する", () => {
    const original = capsule();
    expect(reviseCapsule(original, "説明訂正", original.note, original.entityIds, original.claimIds, emptyGraph()).claimIds).toEqual(original.claimIds);
    expect(() => reviseCapsule(original, "訂正", "", endpoints, original.claimIds, emptyGraph())).toThrow(CapsuleError);
    expect(() => reviseCapsule(original, "訂正", "", original.entityIds, [crypto.randomUUID()], emptyGraph())).toThrow(CapsuleError);
    expect(() => reviseCapsule(original, "訂正", "", [...original.entityIds, crypto.randomUUID()], [], emptyGraph())).toThrow(CapsuleError);
    expect(() => reviseCapsule(original, "訂正", "", [claim.subjectId], [claim.id], graph)).toThrow(CapsuleError);
    expect(reviseCapsule(original, "主張を除いたメモ", "", [isolated.id], [], emptyGraph()).entityIds).toEqual([isolated.id]);
  });
  it("未解決の保存参照を探索cacheで埋めず、追加候補と再解決済み構成だけを使う", () => {
    const original = capsule({ entityIds: endpoints });
    const choices = capsuleEditCandidates(original, { entities: {}, claims: {}, issues: [] }, graph);
    expect(choices.claims[claim.id]).toBeUndefined();
    expect(choices.nodes[claim.subjectId]).toBeUndefined();
    expect(choices.nodes[isolated.id]).toEqual(isolated);
    const resolved = { entities: { [claim.subjectId]: detail(claim.subjectId).entity }, claims: { [claim.id]: claim }, issues: [] };
    const filled = capsuleEditCandidates(original, resolved, graph);
    expect(filled.nodes[claim.subjectId]).toEqual(resolved.entities[claim.subjectId]); expect(filled.claims[claim.id]).toEqual(claim);
  });
  it("書込失敗では元の内容を残す", () => {
    const original = capsule(); writeCapsule(localStorage, "demo", { add: original });
    const revised = reviseCapsule(original, "訂正", original.note, original.entityIds, original.claimIds, graph);
    const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw new Error(); } };
    expect(() => writeCapsule(storage, "demo", { replace: revised, expected: original })).toThrow(new CapsuleError("storage"));
    expect(readCapsules(localStorage, "demo")).toEqual([original]);
  });
  it("旧envelopeに新しい版を混ぜず、未知版・不正な内容版を拒否する", () => {
    const original = capsule();
    const revised = reviseCapsule(original, "訂正", original.note, original.entityIds, original.claimIds, graph);
    localStorage.setItem(capsulesKey("demo"), JSON.stringify({ format: "local-capsules", version: 1, capsules: [revised] }));
    expect(() => readCapsules(localStorage, "demo")).toThrow(CapsuleError);
    for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(capsuleSchema.safeParse({ ...revised, revision }).success).toBe(false);
  });
});

async function openEditor(value: LocalCapsule, visible = graph) {
  writeCapsule(localStorage, "demo", { add: value });
  render(<CapsuleDialog dataset="demo" graph={visible} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "読む" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "このCapsuleを編集" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "このCapsuleを編集" }));
}

describe("Capsule編集の操作", () => {
  it("保存済み内容を初期選択し、題名・説明・構成を次版へ更新して出典を読む", async () => {
    const original = capsule({ entityIds: endpoints }); await openEditor(original);
    expect((screen.getByLabelText("Capsuleの題名") as HTMLInputElement).value).toBe(original.title);
    expect((screen.getByRole("button", { name: "変更を保存" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Capsuleの題名"), { target: { value: "追記した文脈" } });
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "新しい説明" } });
    fireEvent.click(within(screen.getByRole("group", { name: "含める対象" })).getByRole("checkbox", { name: new RegExp(isolated.name) }));
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByText("Capsule Graph");
    const saved = readCapsules(localStorage, "demo")[0];
    expect(saved).toMatchObject({ id: original.id, revision: 2, title: "追記した文脈", note: "新しい説明" });
    expect(saved.entityIds).toContain(isolated.id);
    fireEvent.click(screen.getByRole("button", { name: /青葉ハル → アシスタントだった → 黒川レン/ }));
    await screen.findByText("青葉ハルへのインタビュー");
  });
  it("確認できない主張・対象を説明の編集で失わず、明示的に外せる", async () => {
    vi.mocked(fetchClaim).mockRejectedValue(new ClientApiError("missing", 404));
    vi.mocked(fetchEntity).mockRejectedValue(new ClientApiError("failed", 503));
    const original = capsule(); await openEditor(original, emptyGraph());
    const entityGroup = screen.getByRole("group", { name: "含める対象" });
    expect(within(entityGroup).getAllByRole("checkbox").every(box => (box as HTMLInputElement).checked && (box as HTMLInputElement).disabled)).toBe(true);
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "参照失効を確認した" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByText("Capsule Graph");
    expect(readCapsules(localStorage, "demo")[0]).toMatchObject({ revision: 2, entityIds: original.entityIds, claimIds: original.claimIds });
    fireEvent.click(screen.getByRole("button", { name: "このCapsuleを編集" }));
    fireEvent.click(within(screen.getByRole("group", { name: "含める主張" })).getByRole("checkbox"));
    const boxes = within(screen.getByRole("group", { name: "含める対象" })).getAllByRole("checkbox");
    expect(boxes.every(box => !(box as HTMLInputElement).disabled)).toBe(true);
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByText("Capsule Graph");
    expect(readCapsules(localStorage, "demo")[0]).toMatchObject({ revision: 3, entityIds: [isolated.id], claimIds: [] });
  });
  it("変更の取消を確認し、編集中の入力を残してから元の版へ戻る", async () => {
    const original = capsule(); await openEditor(original);
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "未保存の訂正" } });
    fireEvent.click(screen.getByRole("button", { name: "編集を取り消す" }));
    fireEvent.click(screen.getByRole("button", { name: "編集を続ける" }));
    expect((screen.getByLabelText("自分の説明") as HTMLTextAreaElement).value).toBe("未保存の訂正");
    fireEvent.click(screen.getByRole("button", { name: "編集を取り消す" }));
    fireEvent.click(screen.getByRole("button", { name: "保存せず戻る" }));
    await screen.findByText("Capsule Graph");
    expect(readCapsules(localStorage, "demo")).toEqual([original]);
    expect(screen.queryByText("未保存の訂正")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: original.title }));
  });
  it.each(["event", "save"])("別タブ更新を%sで検出し、入力と他タブの版を両方保持する", async mechanism => {
    const original = capsule(); await openEditor(original);
    fireEvent.change(screen.getByLabelText("自分の説明"), { target: { value: "自分の未保存入力" } });
    const other = reviseCapsule(original, "別タブの題名", "他方の説明", original.entityIds, original.claimIds, graph);
    writeCapsule(localStorage, "demo", { replace: other, expected: original });
    if (mechanism === "event") act(() => { window.dispatchEvent(new StorageEvent("storage", { key: capsulesKey("demo") })); });
    else fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(screen.getByText(/別のタブでこのCapsuleが更新・削除されました/)).not.toBeNull();
    expect((screen.getByLabelText("自分の説明") as HTMLTextAreaElement).value).toBe("自分の未保存入力");
    expect((screen.getByRole("button", { name: "変更を保存" }) as HTMLButtonElement).disabled).toBe(true);
    expect(readCapsules(localStorage, "demo")).toEqual([other]);
  });
});

it("保存された撤回Claimの根拠を残し、現在の関係線へ混ぜない", async () => {
  const withdrawn = { ...claim, withdrawal: { reason: "撤回の試験", release: "test-release", replacementClaimId: null } };
  vi.mocked(fetchClaim).mockResolvedValue({ claim: withdrawn, relatedClaimIds: [] });
  const resolved = await resolveCapsule(capsule(), new AbortController().signal);
  expect(resolved.claims[claim.id].withdrawal?.reason).toBe("撤回の試験");
  expect(resolved.claims[claim.id].citations).toEqual(claim.citations);
  expect(capsuleGraph(resolved).claims[claim.id]).toBeUndefined();
  expect(capsule().claimIds).toContain(claim.id);
});

it("public Capsuleは一つのrevisionへ結合し、再読込途中の更新では部分表示しない", async () => {
  vi.mocked(fetchDatasetRevision).mockResolvedValueOnce({ dataset: "public-kg", revision: "a" }).mockResolvedValueOnce({ dataset: "public-kg", revision: "b" });
  await expect(resolveCapsule(capsule({ dataset: "public-kg" }), new AbortController().signal)).rejects.toMatchObject({ status: 409 });
  expect(fetchClaim).toHaveBeenCalledWith(claim.id, expect.any(AbortSignal), "a");
});
