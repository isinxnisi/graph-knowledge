// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CapsuleShareControls from "../components/CapsuleShareControls";
import SharedCapsule from "../components/SharedCapsule";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import type { LocalCapsule } from "../lib/client/local-capsules";
vi.mock("../components/CapsuleDialog", () => ({ CapsuleReader: ({ capsule }: { capsule: LocalCapsule }) => <h3>{capsule.title}</h3> }));
vi.mock("../components/CapsuleDiscussion", () => ({ default: () => <div>自動表示の会話</div>, useDiscussionDraft: () => ({ hasDraft: () => false, hasPending: () => false }) }));
const userId = "10000000-0000-4000-8000-000000000001";
const capsule: MemberCapsule = { id: "20000000-0000-4000-8000-000000000001", schemaVersion: 1, revision: 1, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
  content: { dataset: "demo", title: "共有した版の説明付き関係図", note: "説明", language: "ja", entityIds: ["30000000-0000-4000-8000-000000000001"], claimIds: [] } };
const share = { id: "40000000-0000-4000-8000-000000000001", revision: 1, createdAt: capsule.createdAt }, token = "a".repeat(43);
let fetchMock: Mock;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); history.replaceState(null, "", `/shared#${token}`);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  fetchMock = vi.fn(async () => Response.json({ capsule }));
  vi.stubGlobal("fetch", (path: string, options?: RequestInit) => path === "/api/member/profile"
    ? Promise.resolve(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 })) : fetchMock(path, options));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function visibility(value: "hidden" | "visible") {
  await act(async () => { Object.defineProperty(document, "visibilityState", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")); });
}
async function controls(value: { share: typeof share | null; commentsClosed: boolean; token?: string | null; blocked?: boolean } = { share: null, commentsClosed: false }) {
  fetchMock.mockResolvedValueOnce(Response.json(value));
  render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={vi.fn()} />);
  await screen.findByText(value.share ? `内容版 ${value.share.revision} の限定リンクが有効です。` : "有効な共有リンクはありません。本人だけが読めます。");
  expect(screen.getByRole("switch", { name: "コメント受付" }).hasAttribute("disabled")).toBe(false);
}
describe("限定共有の所有者操作", () => {
  it("共有画面を開き直しても同じリンクを取得し、版やコメントを更新しない", async () => {
    await controls({ share, token, commentsClosed: false });
    expect((screen.getByLabelText("共有リンク") as HTMLInputElement).value).toBe(`${location.origin}/shared#${token}`);
    cleanup();
    await controls({ share, token, commentsClosed: false });
    expect((screen.getByLabelText("共有リンク") as HTMLInputElement).value).toBe(`${location.origin}/shared#${token}`);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("発行応答を失っても再確認で同じ有効リンクを取り戻し、再発行しない", async () => {
    await controls();
    fetchMock.mockRejectedValueOnce(new TypeError("Response lost"));
    fireEvent.click(screen.getByRole("button", { name: "共有リンクを作る" }));
    await screen.findByRole("alert");
    fetchMock.mockResolvedValueOnce(Response.json({ share, token, commentsClosed: false }));
    fireEvent.click(screen.getByRole("button", { name: "共有状態を再確認" }));
    const field = await screen.findByLabelText("共有リンク") as HTMLInputElement;
    expect(field.value).toBe(`${location.origin}/shared#${token}`);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("再取得不能な旧リンクだけに移行案内を出し、別リンクへの更新後は古いURLを残さない", async () => {
    await controls({ share, commentsClosed: false, token: null });
    expect(screen.getByText(/このリンクは再表示に対応していません/)).toBeTruthy();
    expect(screen.queryByLabelText("共有リンク")).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json({ share: { ...share, id: "40000000-0000-4000-8000-000000000002" }, token: "b".repeat(43), commentsClosed: false }));
    fireEvent.click(screen.getByRole("button", { name: "共有状態を再確認" }));
    expect((await screen.findByLabelText("共有リンク") as HTMLInputElement).value).toContain("b".repeat(43));
    expect(screen.queryByText(/このリンクは再表示に対応していません/)).toBeNull();
  });
  it("保存版と受付ONを示し、発行時に期待本人と版とコメント設定を原子的に送る", async () => {
    await controls();
    expect(screen.getByText("共有する内容 · 保存版 1")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "コメント受付" }).getAttribute("aria-checked")).toBe("true");
    fetchMock.mockResolvedValueOnce(Response.json({ share, token }, { status: 201 }));
    fireEvent.click(screen.getByRole("button", { name: "共有リンクを作る" }));
    const field = await screen.findByLabelText("共有リンク") as HTMLInputElement;
    expect(field.value).toBe(`${location.origin}/shared#${token}`);
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ "X-Member-User": userId });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ expectedRevision: 1, expectedShareId: null, commentsClosed: false });
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("発行前は通信なしで受付OFFを選べ、作成時にその設定を送る", async () => {
    await controls();
    fireEvent.click(screen.getByRole("switch", { name: "コメント受付" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(Response.json({ share, token }, { status: 201 }));
    fireEvent.click(screen.getByRole("button", { name: "共有リンクを作る" }));
    await screen.findByLabelText("共有リンク");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).commentsClosed).toBe(true);
  });
  it("通常再確認では表示済みリンクを失わず、停止は確認してから実行する", async () => {
    await controls();
    fetchMock.mockResolvedValueOnce(Response.json({ share, token }));
    fireEvent.click(screen.getByRole("button", { name: "共有リンクを作る" }));
    await screen.findByLabelText("共有リンク");
    fetchMock.mockResolvedValueOnce(Response.json({ share, commentsClosed: false }));
    fireEvent.click(screen.getByRole("button", { name: "共有状態を再確認" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect((screen.getByLabelText("共有リンク") as HTMLInputElement).value).toContain(token);
    fireEvent.click(screen.getByRole("button", { name: "共有を停止" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockResolvedValueOnce(Response.json({ revoked: true }));
    fireEvent.click(screen.getByRole("button", { name: "共有を停止する" }));
    await screen.findByText("共有を停止しました。");
    expect(screen.queryByLabelText("共有リンク")).toBeNull();
  });
  it("応答消失後は再発行を止め、状態を再確認してからリンクを更新する", async () => {
    await controls();
    fetchMock.mockRejectedValueOnce(new TypeError("Network error"));
    fireEvent.click(screen.getByRole("button", { name: "共有リンクを作る" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "共有リンクを作る" }).hasAttribute("disabled")).toBe(true);
    fetchMock.mockResolvedValueOnce(Response.json({ share }));
    fireEvent.click(screen.getByRole("button", { name: "共有状態を再確認" }));
    await screen.findByText("内容版 1 の限定リンクが有効です。");
    fireEvent.click(screen.getByRole("button", { name: "リンクを更新" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/これまでのリンクは使えなくなります/)).toBeTruthy();
    fetchMock.mockResolvedValueOnce(Response.json({ share, token }));
    fireEvent.click(screen.getByRole("button", { name: "リンクを更新する" }));
    await screen.findByLabelText("共有リンク");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).expectedShareId).toBe(share.id);
  });
  it("失効応答は親へ通知し、遅い発行応答はunmount後に描画しない", async () => {
    const onUnauthorized = vi.fn();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    const view = render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={onUnauthorized} />);
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce()); view.unmount();
    fetchMock.mockResolvedValueOnce(Response.json({ share: null }));
    const second = render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={onUnauthorized} />);
    await screen.findByText("有効な共有リンクはありません。本人だけが読めます。");
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "共有リンクを作る" }));
    const signal = fetchMock.mock.calls.at(-1)![1].signal; second.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json({ share, token })));
    expect(screen.queryByLabelText("共有リンク")).toBeNull();
  });
});
describe("共有内容の読取認可と継続性", () => {
  it("秘密はheaderだけに入れ、cookieを送らず、停止後の再確認では本文を閉じる", async () => {
    render(<SharedCapsule dataset="demo" />); await screen.findByRole("heading", { name: capsule.content.title });
    expect(screen.getByText("自動表示の会話")).toBeTruthy();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", headers: { "X-Capsule-Token": token } });
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
    fireEvent.click(screen.getByRole("button", { name: "リンクを再確認" }));
    await screen.findByText(/このリンクでは閲覧できません/);
    expect(screen.queryByRole("heading", { name: capsule.content.title })).toBeNull();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("通常のタブ復帰と通信失敗では図を再生成せず、別tokenは再認可する", async () => {
    render(<SharedCapsule dataset="demo" />);
    const graph = await screen.findByRole("heading", { name: capsule.content.title });
    await visibility("hidden"); expect(graph.isConnected).toBe(true);
    fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
    await visibility("visible");
    await screen.findByText(/共有内容を取得できませんでした/); expect(graph.isConnected).toBe(true);
    history.replaceState(null, "", `/shared#${"b".repeat(43)}`);
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
    fireEvent(window, new Event("hashchange"));
    await screen.findByText(/このリンクでは閲覧できません/); expect(graph.isConnected).toBe(false);
  });
  it("表示中も30秒で再認可し、別datasetを読めた扱いにしない", async () => {
    vi.useFakeTimers(); render(<SharedCapsule dataset="demo" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("heading", { name: capsule.content.title })).toBeTruthy();
    fetchMock.mockResolvedValueOnce(Response.json({ capsule: { ...capsule, content: { ...capsule.content, dataset: "pilot-science-v1" } } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.queryByRole("heading", { name: capsule.content.title })).toBeNull();
    expect(screen.getByText(/共有内容を取得できませんでした/)).toBeTruthy();
  });
});
