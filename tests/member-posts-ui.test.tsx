// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MemberPosts from "../components/MemberPosts";
import type { OwnDiscussionPosts } from "../lib/domain/capsule-discussion";

const userId = "20000000-0000-4000-8000-000000000001";
const post = { id: "30000000-0000-4000-8000-000000000001", capsuleId: "10000000-0000-4000-8000-000000000001", revision: 2,
  body: "リンクが失効した後も管理する自分の文章", createdAt: "2026-10-10T00:00:00Z", withdrawnAt: null };
const data: OwnDiscussionPosts = { posts: [post], nextCursor: null };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  localStorage.clear(); sessionStorage.clear();
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open(value = data, onUnauthorized = vi.fn()) {
  fetchMock.mockResolvedValueOnce(Response.json(value));
  render(<MemberPosts userId={userId} onUnauthorized={onUnauthorized} />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "自分の投稿を見る" }));
  await screen.findByText(post.body!);
}
describe("本人の投稿一覧と撤回", () => {
  it("明示取得し、期待Userを送り、本文を永続storageへ残さない", async () => {
    await open();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/member/posts");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin", headers: { "X-Member-User": userId } });
    expect(screen.getByText("内容版 2 への投稿")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "投稿一覧を閉じる" }));
    expect(screen.queryByText(post.body!)).toBeNull();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("撤回を確認し、tokenなしで作者APIを使い、本文を削除した状態を再取得する", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "自分の投稿を撤回" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(Response.json({ withdrawn: true }));
    fetchMock.mockResolvedValueOnce(Response.json({ ...data, posts: [{ ...post, body: null, withdrawnAt: post.createdAt }] }));
    fireEvent.click(screen.getByRole("button", { name: "本文を削除して撤回する" }));
    await screen.findByText("この投稿は撤回済みです。");
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/capsules/${post.capsuleId}/discussion`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE", headers: { "X-Member-User": userId }, body: JSON.stringify({ postId: post.id }) });
    expect(fetchMock.mock.calls[1][1].headers["X-Capsule-Token"]).toBeUndefined();
    expect(screen.queryByText(post.body!)).toBeNull();
    expect(screen.queryByRole("button", { name: "自分の投稿を撤回" })).toBeNull();
  });
  it("結果不明では成功を示さず、自動再送をせず、一覧の再確認で撤回済みと判断する", async () => {
    await open();
    fetchMock.mockRejectedValueOnce(new TypeError("lost response"));
    fireEvent.click(screen.getByRole("button", { name: "自分の投稿を撤回" }));
    fireEvent.click(screen.getByRole("button", { name: "本文を削除して撤回する" }));
    await screen.findByText(/撤回結果を確認できませんでした/);
    expect(screen.queryByText("投稿を撤回しました。")).toBeNull();
    expect(screen.queryByText(post.body!)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(Response.json({ ...data, posts: [{ ...post, body: null, withdrawnAt: post.createdAt }] }));
    fireEvent.click(screen.getByRole("button", { name: "この一覧を再確認" }));
    await screen.findByText("この投稿は撤回済みです。");
    expect(fetchMock.mock.calls.filter(call => call[1].method === "DELETE")).toHaveLength(1);
  });
  it("ページを置換し、再確認は同じcursor、新しい投稿へ戻る操作は先頭を取得する", async () => {
    await open({ ...data, nextCursor: "opaque-next-page" });
    const older = { ...post, id: "30000000-0000-4000-8000-000000000002", body: "前のページの投稿" };
    fetchMock.mockResolvedValueOnce(Response.json({ posts: [older], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "前の投稿20件を見る" }));
    await screen.findByText(older.body);
    expect(screen.queryByText(post.body!)).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/member/posts?cursor=opaque-next-page");
    fetchMock.mockResolvedValueOnce(Response.json({ posts: [older], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "この一覧を再確認" }));
    await screen.findByText(older.body);
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0]);
    fetchMock.mockResolvedValueOnce(Response.json(data));
    fireEvent.click(screen.getByRole("button", { name: "新しい投稿から見る" }));
    await screen.findByText(post.body!);
    expect(fetchMock.mock.calls[3][0]).toBe("/api/member/posts");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("認可失敗を親へ通知し、privateな本文を隠す", async () => {
    const unauthorized = vi.fn(); await open(data, unauthorized);
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    fireEvent.click(screen.getByRole("button", { name: "この一覧を再確認" }));
    await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce());
    expect(screen.queryByText(post.body!)).toBeNull();
  });
  it("アカウント変更通知ですぐ隠し、取消済みの遅い応答を表示しない", async () => {
    await open();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent(window, new StorageEvent("storage", { key: "graph-knowledge:member-session-changed" }));
    expect(screen.queryByText(post.body!)).toBeNull();
    const signal = fetchMock.mock.calls[1][1].signal;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json(data)));
    expect(screen.queryByText(post.body!)).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json(data));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByText(post.body!);
  });
  it("閉じた後の遅い応答を捨て、開き直しでは先頭から再認可する", async () => {
    await open();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "この一覧を再確認" }));
    fireEvent.click(screen.getByRole("button", { name: "投稿一覧を閉じる" }));
    await act(async () => finish(Response.json(data)));
    expect(screen.queryByText(post.body!)).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json({ posts: [], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "自分の投稿を見る" }));
    await screen.findByText("このページに自分の投稿はありません。");
  });
});
