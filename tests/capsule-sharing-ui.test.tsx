// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CapsuleShareControls from "../components/CapsuleShareControls";
import SharedCapsule from "../components/SharedCapsule";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import type { LocalCapsule } from "../lib/client/local-capsules";

vi.mock("../components/CapsuleDialog", () => ({ CapsuleReader: ({ capsule }: { capsule: LocalCapsule }) => <h3>{capsule.title}</h3> }));
const userId = "10000000-0000-4000-8000-000000000001";
const capsule: MemberCapsule = { id: "20000000-0000-4000-8000-000000000001", schemaVersion: 1, revision: 1, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
  content: { dataset: "demo", title: "共有した版の説明付き関係図", note: "説明", language: "ja", entityIds: ["30000000-0000-4000-8000-000000000001"], claimIds: [] } };
const share = { id: "40000000-0000-4000-8000-000000000001", revision: 1, createdAt: capsule.createdAt };
const token = "a".repeat(43);
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  history.replaceState(null, "", `/shared#${token}`);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fetchMock = vi.fn(async () => Response.json({ capsule }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function visibility(value: "hidden" | "visible") {
  await act(async () => { Object.defineProperty(document, "visibilityState", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")); });
}
describe("限定共有の所有者操作", () => {
  it("確認後だけ発行し、期待利用者・内容版・リンクを送り、秘密を永続保存しない", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ share: null }));
    render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={vi.fn()} />);
    await screen.findByText("有効な共有リンクはありません。本人だけが読めます。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "この版の共有リンクを作る" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(Response.json({ share, token }, { status: 201 }));
    fireEvent.click(screen.getByRole("button", { name: "この版をリンクで閲覧可能にする" }));
    const field = await screen.findByLabelText("共有リンク") as HTMLInputElement;
    expect(field.value).toBe(`${location.origin}/shared#${token}`);
    const call = fetchMock.mock.calls[1];
    expect(call[1].headers).toMatchObject({ "X-Member-User": userId });
    expect(JSON.parse(call[1].body)).toEqual({ expectedRevision: 1, expectedShareId: null });
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("応答消失後は再発行を止め、状態を取得してから古いリンクの失効を確認する", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ share: null }));
    render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={vi.fn()} />);
    await screen.findByText("有効な共有リンクはありません。本人だけが読めます。");
    fireEvent.click(screen.getByRole("button", { name: "この版の共有リンクを作る" }));
    fetchMock.mockRejectedValueOnce(new TypeError("Network error"));
    fireEvent.click(screen.getByRole("button", { name: "この版をリンクで閲覧可能にする" }));
    await screen.findByText(/共有操作の結果を確認できません/);
    expect(screen.getByRole("button", { name: "この版の共有リンクを作る" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByLabelText("共有リンク")).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json({ share }));
    fireEvent.click(screen.getByRole("button", { name: "共有状態を再確認" }));
    await screen.findByText("内容版 1 の限定リンクが有効です。");
    fireEvent.click(screen.getByRole("button", { name: "この版でリンクを作り直す" }));
    expect(screen.getByText(/これまでのリンクは使えなくなります/)).toBeTruthy();
    fetchMock.mockResolvedValueOnce(Response.json({ share, token }));
    fireEvent.click(screen.getByRole("button", { name: "この版をリンクで閲覧可能にする" }));
    await screen.findByLabelText("共有リンク");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).expectedShareId).toBe(share.id);
  });
  it("失効応答は親へ通知し、秘密を含む遅い発行応答はunmount後に描画しない", async () => {
    const onUnauthorized = vi.fn();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    const view = render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={onUnauthorized} />);
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    view.unmount();
    fetchMock.mockResolvedValueOnce(Response.json({ share: null }));
    const second = render(<CapsuleShareControls capsule={capsule} userId={userId} disabled={false} onUnauthorized={onUnauthorized} />);
    await screen.findByText("有効な共有リンクはありません。本人だけが読めます。");
    fireEvent.click(screen.getByRole("button", { name: "この版の共有リンクを作る" }));
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "この版をリンクで閲覧可能にする" }));
    const signal = fetchMock.mock.calls.at(-1)![1].signal;
    second.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json({ share, token })));
    expect(screen.queryByLabelText("共有リンク")).toBeNull();
  });
});
describe("共有内容の読取認可", () => {
  it("秘密はheaderだけに入れ、cookieを送らず、停止後の再確認では本文を閉じる", async () => {
    render(<SharedCapsule dataset="demo" />);
    await screen.findByRole("heading", { name: capsule.content.title });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/shared/capsule");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", headers: { "X-Capsule-Token": token } });
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
    fireEvent.click(screen.getByRole("button", { name: "リンクを再確認" }));
    await screen.findByText(/このリンクでは閲覧できません/);
    expect(screen.queryByRole("heading", { name: capsule.content.title })).toBeNull();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("非表示で本文を消し、旧tokenの遅い成功を無視し、新tokenは再認可する", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    render(<SharedCapsule dataset="demo" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await visibility("hidden");
    await act(async () => finish(Response.json({ capsule })));
    expect(screen.queryByRole("heading", { name: capsule.content.title })).toBeNull();
    history.replaceState(null, "", `/shared#${"b".repeat(43)}`);
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
    await visibility("visible");
    await screen.findByText(/このリンクでは閲覧できません/);
    expect(fetchMock.mock.calls.at(-1)![1].headers["X-Capsule-Token"]).toBe("b".repeat(43));
  });
  it("表示中も30秒で再認可し、別datasetや失敗を読めた扱いにしない", async () => {
    vi.useFakeTimers();
    render(<SharedCapsule dataset="demo" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("heading", { name: capsule.content.title })).toBeTruthy();
    fetchMock.mockResolvedValueOnce(Response.json({ capsule: { ...capsule, content: { ...capsule.content, dataset: "pilot-science-v1" } } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.queryByRole("heading", { name: capsule.content.title })).toBeNull();
    expect(screen.getByText(/共有内容を取得できませんでした/)).toBeTruthy();
  });
});
