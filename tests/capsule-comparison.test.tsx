// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CapsuleComparison from "../components/CapsuleComparison";
import { compareCapsuleContent, resolveComparisonReferences } from "../lib/client/capsule-comparison";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";

vi.mock("../components/GraphCanvas", () => ({ default: () => null }));
const owner = "10000000-0000-4000-8000-000000000001";
const claim = examples.claim.claim;
const alternate = { ...claim, id: "30000000-0000-4000-8000-000000000001", polarity: "denied" };
const endpoints = [claim.subjectId, claim.objectId];
const isolated = examples.neighbors.nodes.find(node => !endpoints.includes(node.id))!;
const snapshot: MemberCapsule = { id: "20000000-0000-4000-8000-000000000001", schemaVersion: 1, revision: 1,
  createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
  content: { dataset: "demo", title: "共有した題名", note: "元の説明", language: "ja", entityIds: endpoints, claimIds: [claim.id] } };
const updated: MemberCapsule = { ...snapshot, revision: 3, content: { ...snapshot.content, title: "保存した新しい題名", note: "<script>説明は文字列</script>\n二行目", entityIds: [...endpoints, isolated.id], claimIds: [alternate.id] } };
let current: MemberCapsule;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  current = updated; localStorage.clear(); sessionStorage.clear();
  fetchMock = vi.fn(async (path: string) => {
    if (path.startsWith("/api/member/")) return Response.json({ capsule: current });
    if (path.startsWith("/api/entities/")) return Response.json({ entity: { ...examples.neighbors.nodes.find(node => path.endsWith(node.id)), aliases: [], event: null } });
    if (path.startsWith("/api/claims/")) return Response.json({ claim: path.endsWith(alternate.id) ? alternate : claim });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const open = () => fireEvent.click(screen.getByRole("button", { name: "現在の保存内容と比較" }));
const renderComparison = (onUnauthorized = vi.fn()) => render(<CapsuleComparison snapshot={snapshot} userId={owner} disabled={false} onUnauthorized={onUnauthorized} />);

describe("Capsuleの明示構成差分", () => {
  it("順序変更は差分にせず、孤立対象と同じSPOの別主張もID単位で区別する", () => {
    expect(compareCapsuleContent(snapshot.content, { ...snapshot.content, entityIds: [...endpoints].reverse() }).changed).toBe(false);
    const diff = compareCapsuleContent(snapshot.content, updated.content);
    expect(diff.entities).toEqual({ added: [isolated.id], removed: [], retained: 2 });
    expect(diff.claims).toEqual({ added: [alternate.id], removed: [claim.id], retained: 0 });
    expect(compareCapsuleContent(updated.content, snapshot.content).entities.removed).toEqual([isolated.id]);
    expect(diff.titleChanged && diff.noteChanged).toBe(true);
  });
  it("異なるdatasetを比較しない", () => {
    expect(() => compareCapsuleContent(snapshot.content, { ...updated.content, dataset: "pilot-urasawa-v1" })).toThrow("Dataset mismatch");
  });
  it("変更した主張だけを再解決し、関連主張や近傍を追加しない", async () => {
    const value = await resolveComparisonReferences(snapshot, { ...updated, content: { ...updated.content, claimIds: [claim.id, alternate.id] } }, new AbortController().signal);
    expect(Object.keys(value.after.claims)).toEqual([alternate.id]);
    expect(Object.keys(value.before.claims)).toEqual([]);
    expect(fetchMock.mock.calls.map(call => call[0]).filter(path => path.startsWith("/api/claims/"))).toEqual([`/api/claims/${alternate.id}`]);
    expect(fetchMock.mock.calls.some(call => call[0].includes("neighbors"))).toBe(false);
  });
  it("説明だけの変更ではKGを読み直さない", async () => {
    await resolveComparisonReferences(snapshot, { ...updated, content: { ...snapshot.content, note: "説明だけ" } }, new AbortController().signal);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("各版30対象でも和集合の上限に誤適用せず、最大4要求で読む", async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    let active = 0, maximum = 0;
    fetchMock.mockImplementation(async (path: string) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1)); active--;
      return Response.json({ entity: { ...examples.neighbors.nodes[0], id: path.split("/").at(-1), aliases: [], event: null } });
    });
    const value = await resolveComparisonReferences(
      { ...snapshot, content: { ...snapshot.content, entityIds: ids.slice(0, 30), claimIds: [] } },
      { ...updated, content: { ...updated.content, entityIds: ids.slice(30), claimIds: [] } }, new AbortController().signal);
    expect(Object.keys(value.before.entities)).toHaveLength(30); expect(Object.keys(value.after.entities)).toHaveLength(30);
    expect(value.before.issues.concat(value.after.issues)).toEqual([]); expect(maximum).toBeLessThanOrEqual(4);
  });
  it("主張の端点は元の版の明示構成で検査する", async () => {
    const value = await resolveComparisonReferences({ ...snapshot, content: { ...snapshot.content, entityIds: [claim.subjectId] } }, updated, new AbortController().signal);
    expect(value.before.claims[claim.id]).toBeUndefined();
    expect(value.before.issues).toContainEqual({ kind: "claim", id: claim.id, reason: "endpoints" });
    expect(value.after.claims[alternate.id]).toBeTruthy();
  });
});

describe("所有者の共有版比較", () => {
  it("明示操作で期待User付きの現在版を読み、説明と構成の差分から現在の根拠へ進める", async () => {
    renderComparison(); expect(fetchMock).not.toHaveBeenCalled(); open();
    await screen.findByRole("heading", { name: "共有時の内容版 1 → 取得時の現在版 3" });
    await screen.findByText(isolated.name, { exact: true });
    expect(screen.getByText(updated.content.note, { normalizer: value => value })).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    const claims = within(screen.getByRole("region", { name: "主張の構成" }));
    expect(claims.getByText("追加 1件 · 除外 1件 · 共通 0件")).toBeTruthy();
    expect(claims.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
      `/?read=claim&dataset=demo&id=${claim.id}`, `/?read=claim&dataset=demo&id=${alternate.id}`,
    ]);
    expect(claims.getAllByRole("link").every(link => link.getAttribute("target") === "_blank" && link.getAttribute("rel")?.includes("noreferrer"))).toBe(true);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store", headers: { "X-Member-User": owner } });
    expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it("同じ参照と説明の版では変更なしと示し、知識の履歴差分を捏造しない", async () => {
    current = { ...snapshot, revision: 4, content: { ...snapshot.content, entityIds: [...endpoints].reverse() } };
    renderComparison(); open();
    await screen.findByText("題名・説明・選んだ対象と主張に変更はありません。");
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
  it("取得失敗時は比較なしとせず、再試行でその時点の現在版を読む", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "MEMBER_UNAVAILABLE" } }, { status: 503 }));
    renderComparison(); open(); await screen.findByRole("alert");
    expect(screen.queryByText("題名・説明・選んだ対象と主張に変更はありません。")).toBeNull();
    current = { ...updated, revision: 5 };
    fireEvent.click(screen.getByRole("button", { name: "現在の保存内容を再取得して比較" }));
    await screen.findByRole("heading", { name: "共有時の内容版 1 → 取得時の現在版 5" });
  });
  it.each([
    { ...updated, id: "20000000-0000-4000-8000-000000000002" },
    { ...updated, content: { ...updated.content, dataset: "pilot-urasawa-v1" } },
    { ...updated, revision: 0 },
  ])("文脈または形式が不正な成功応答を表示しない (%#)", async value => {
    fetchMock.mockResolvedValueOnce(Response.json({ capsule: value }));
    renderComparison(); open(); await screen.findByRole("alert");
    expect(screen.queryByText(updated.content.title)).toBeNull();
  });
  it("認可失効は親へ伝え、比較内容を表示しない", async () => {
    const unauthorized = vi.fn(); fetchMock.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    renderComparison(unauthorized); open(); await screen.findByRole("alert");
    expect(unauthorized).toHaveBeenCalledOnce(); expect(screen.queryByText(updated.content.title)).toBeNull();
  });
  it("現在の参照が未解決でも保存済みIDの追加と除外を保持する", async () => {
    const fallback = fetchMock.getMockImplementation() as (path: string) => Promise<Response>;
    fetchMock.mockImplementation((path: string) => path.startsWith("/api/claims/") ? Response.json({}, { status: 404 }) : fallback(path));
    renderComparison(); open();
    await screen.findByText("一部の参照を確認できませんでした。IDと構成差分は保持しています。");
    expect(screen.getByText(claim.id)).toBeTruthy(); expect(screen.getByText(alternate.id)).toBeTruthy();
    expect(screen.getByText("追加 1件 · 除外 1件 · 共通 0件")).toBeTruthy();
  });
  it.each(["close", "unmount"])("%s後の遅いprivate応答を表示しない", async action => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const view = renderComparison(); open();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    if (action === "close") fireEvent.click(screen.getByRole("button", { name: "比較を閉じる" })); else view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { finish(Response.json({ capsule: updated })); });
    expect(screen.queryByText(updated.content.title)).toBeNull(); expect(fetchMock.mock.calls).toHaveLength(1);
  });
  it("選択した共有版より古い現在版の応答は比較しない", async () => {
    current = snapshot;
    render(<CapsuleComparison snapshot={{ ...snapshot, revision: 3 }} userId={owner} disabled={false} onUnauthorized={vi.fn()} />);
    open(); await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: /共有時の内容版.*→/ })).toBeNull();
  });
  it("名称取得全体を60秒で止めても差分を残し、再試行可能にする", async () => {
    vi.useFakeTimers();
    // More than four 15-second batches are needed to reach the overall bound.
    current = { ...updated, content: { ...updated.content, entityIds: [...endpoints, ...Array.from({ length: 28 }, (_, index) => `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`)] } };
    const fallback = fetchMock.getMockImplementation() as (path: string) => Promise<Response>;
    fetchMock.mockImplementation((path: string, options: RequestInit) => path.startsWith("/api/member/") ? fallback(path) : new Promise<Response>((_, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    renderComparison(); await act(async () => { open(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText("一部の参照を確認できませんでした。IDと構成差分は保持しています。")).toBeTruthy();
    expect(screen.getByText("追加 1件 · 除外 1件 · 共通 0件")).toBeTruthy();
    expect(screen.getByRole("button", { name: "現在の保存内容を再取得して比較" }).hasAttribute("disabled")).toBe(false);
    expect(fetchMock.mock.calls.filter(call => call[0].startsWith("/api/entities/")).length).toBeLessThan(32);
  });
  it("比較の再取得を始めると以前のprivate比較を破棄する", async () => {
    renderComparison(); open(); await screen.findByText(isolated.name, { exact: true });
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "現在の保存内容を再取得して比較" }));
    expect(screen.queryByText(updated.content.title)).toBeNull();
    await act(async () => { finish(Response.json({}, { status: 401 })); });
    expect(screen.queryByText(updated.content.title)).toBeNull();
  });
});
