// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CapsuleDiscussion, { type DiscussionDraft, type DiscussionDraftStore } from "../components/CapsuleDiscussion";
import type { CapsuleDiscussion as Discussion } from "../lib/domain/capsule-discussion";

const capsuleId = "10000000-0000-4000-8000-000000000001", userId = "20000000-0000-4000-8000-000000000001", postId = "30000000-0000-4000-8000-000000000001";
const token = "a".repeat(43);
const data: Discussion = { capsuleId, revision: 1, closed: false, viewer: { id: userId, name: "読む人" }, canManage: false, posts: [] };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  localStorage.clear(); sessionStorage.clear();
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function open(value: Discussion = data, cache?: DiscussionDraftStore) {
  fetchMock.mockResolvedValueOnce(Response.json(value));
  const result = render(<CapsuleDiscussion capsuleId={capsuleId} revision={1} token={token} draftCache={cache} />);
  fireEvent.click(screen.getByRole("button", { name: "この版のコメントを見る" }));
  await screen.findByText("この版のコメントはまだありません。");
  return result;
}
describe("共有版の会話", () => {
  it("明示して開き、匿名にはログイン導線だけを出す", async () => {
    await open({ ...data, viewer: null });
    expect(screen.queryByLabelText("コメント本文")).toBeNull();
    expect(screen.getByRole("link", { name: /投稿するにはアカウント/ }).getAttribute("href")).toBe("/member");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).not.toContain(token); expect(options.headers["X-Capsule-Token"]).toBe(token);
    expect(options.cache).toBe("no-store"); expect(options.referrerPolicy).toBe("no-referrer");
  });
  it("結果不明の投稿は期待本人・同一キー・同一本文で再送し、成功後だけ入力を消す", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("コメント本文"), { target: { value: "資料の期間を確かめたい" } });
    fetchMock.mockRejectedValueOnce(new TypeError("lost response"));
    fireEvent.click(screen.getByRole("button", { name: "この版へ投稿する" }));
    await screen.findByText(/投稿結果が不明/);
    const first = fetchMock.mock.calls[1][1];
    expect(first.headers["X-Member-User"]).toBe(userId);
    expect((screen.getByLabelText("コメント本文") as HTMLTextAreaElement).disabled).toBe(true);
    fetchMock.mockResolvedValueOnce(Response.json({ postId, replayed: true }));
    fetchMock.mockResolvedValueOnce(Response.json(data));
    fireEvent.click(screen.getByRole("button", { name: "同じ投稿の結果を確認・再送" }));
    await screen.findByText("投稿しました。");
    expect(fetchMock.mock.calls[2][1].body).toBe(first.body);
    await waitFor(() => expect((screen.getByLabelText("コメント本文") as HTMLTextAreaElement).value).toBe(""));
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("失効で本文を隠し、別Userへ草稿を渡さず、同じ本人の復帰で入力を戻す", async () => {
    let draft: DiscussionDraft | null = null;
    const cache: DiscussionDraftStore = { get: () => draft, set: value => { draft = value; } };
    const view = await open(data, cache);
    fireEvent.change(screen.getByLabelText("コメント本文"), { target: { value: "未送信の説明" } });
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    fireEvent.click(screen.getByRole("button", { name: "この版へ投稿する" }));
    await screen.findByText(/ログインが変わったか期限/);
    expect(screen.queryByLabelText("コメント本文")).toBeNull();
    view.unmount();
    const other = await open({ ...data, viewer: { id: postId, name: "別の人" } }, cache);
    expect((screen.getByLabelText("コメント本文") as HTMLTextAreaElement).value).toBe("");
    other.unmount();
    await open(data, cache);
    expect((screen.getByLabelText("コメント本文") as HTMLTextAreaElement).value).toBe("未送信の説明");
  });
  it("結果不明後の再送が401でも元のキーを保ち、再ログイン後に二重投稿しない", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("コメント本文"), { target: { value: "受理されたか不明" } });
    fetchMock.mockRejectedValueOnce(new TypeError("lost response"));
    fireEvent.click(screen.getByRole("button", { name: "この版へ投稿する" }));
    await screen.findByText(/投稿結果が不明/);
    const original = fetchMock.mock.calls[1][1].body;
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    fireEvent.click(screen.getByRole("button", { name: "同じ投稿の結果を確認・再送" }));
    await screen.findByText(/ログインが変わったか期限/);
    fetchMock.mockResolvedValueOnce(Response.json(data));
    fireEvent.click(screen.getByRole("button", { name: "コメントとログインを再確認" }));
    await screen.findByRole("button", { name: "同じ投稿の結果を確認・再送" });
    expect((screen.getByLabelText("コメント本文") as HTMLTextAreaElement).disabled).toBe(true);
    fetchMock.mockResolvedValueOnce(Response.json({ postId, replayed: true }));
    fetchMock.mockResolvedValueOnce(Response.json(data));
    fireEvent.click(screen.getByRole("button", { name: "同じ投稿の結果を確認・再送" }));
    await screen.findByText("投稿しました。");
    expect(fetchMock.mock.calls[4][1].body).toBe(original);
  });
  it("会員の失効を親へ通知し、同じ画面のprivate閲覧も閉じられる", async () => {
    const onUnauthorized = vi.fn();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    render(<CapsuleDiscussion capsuleId={capsuleId} revision={1} userId={userId} onUnauthorized={onUnauthorized} />);
    fireEvent.click(screen.getByRole("button", { name: "この版のコメントを見る" }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].headers["X-Member-User"]).toBe(userId);
    expect(screen.queryByLabelText("コメント本文")).toBeNull();
  });
  it("非表示で会話を消し、取消後の応答を捨てる", async () => {
    await open();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "コメントとログインを再確認" }));
    const signal = fetchMock.mock.calls[1][1].signal;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json(data)));
    expect(screen.queryByLabelText("コメント本文")).toBeNull();
    expect(screen.queryByText("この版のコメントはまだありません。")).toBeNull();
  });
  it("作者だけの撤回確認と所有者の投稿停止を別操作にする", async () => {
    const post = { id: postId, revision: 1, authorName: "読む人", body: "<script>alert(1)</script>", createdAt: "2026-10-10T00:00:00Z", withdrawnAt: null, own: true };
    fetchMock.mockResolvedValueOnce(Response.json({ ...data, canManage: true, posts: [post] }));
    render(<CapsuleDiscussion capsuleId={capsuleId} revision={1} userId={userId} />);
    fireEvent.click(screen.getByRole("button", { name: "この版のコメントを見る" }));
    await screen.findByText(post.body);
    expect(document.querySelector("script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "自分の投稿を撤回" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(Response.json({ withdrawn: true }));
    fetchMock.mockResolvedValueOnce(Response.json({ ...data, canManage: true, posts: [{ ...post, body: null, authorName: null, withdrawnAt: post.createdAt }] }));
    fireEvent.click(screen.getByRole("button", { name: "本文を削除して撤回する" }));
    await screen.findByText("投稿者が撤回しました。");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ postId });
    fetchMock.mockResolvedValueOnce(Response.json({ closed: true }));
    fetchMock.mockResolvedValueOnce(Response.json({ ...data, canManage: true, closed: true }));
    fireEvent.click(screen.getByRole("button", { name: "新しい投稿を停止する" }));
    await screen.findByRole("button", { name: "投稿を受け付ける" });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ closed: true, expectedClosed: false });
    expect(screen.queryByLabelText("コメント本文")).toBeNull();
  });
});
