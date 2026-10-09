// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act, configure } from "@testing-library/react";
import MemberCapsules from "../components/MemberCapsules";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import type { LocalCapsule, ResolvedCapsule } from "../lib/client/local-capsules";

vi.mock("../components/CapsuleDialog", () => ({
  CapsuleReader: ({ capsule, onEdit }: { capsule: LocalCapsule; onEdit?: (resolved: ResolvedCapsule) => void }) => <section><h3>{capsule.title}</h3>{onEdit && <button onClick={() => onEdit({ entities: {}, claims: {}, issues: [] })}>このCapsuleを編集</button>}</section>,
  ClaimCaption: () => null,
}));
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const capsule: MemberCapsule = { id: "20000000-0000-4000-8000-000000000001", schemaVersion: 1, revision: 1, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
  content: { dataset: "demo", title: "本人だけの題名", note: "本人だけの説明", language: "ja", entityIds: ["30000000-0000-4000-8000-000000000001"], claimIds: [] } };
configure({ asyncUtilTimeout: 5000 });
let identity: string | null;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  identity = owner; localStorage.clear(); sessionStorage.clear();
  history.replaceState(null, "", `/member?capsule=${capsule.id}`);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fetchMock = vi.fn(async (path: string, options: RequestInit = {}) => {
    if (path === "/api/member/status") return Response.json({ provider: "fixture" });
    if (!identity || ((options.headers as Record<string, string>)?.["X-Member-User"] && (options.headers as Record<string, string>)["X-Member-User"] !== identity)) return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    if (path === "/api/member/profile") return Response.json({ user: { id: identity, name: identity === owner ? "本人" : "別人", locale: "ja" } });
    if (path === "/api/member/capsules") return Response.json({ capsules: identity === owner ? [capsule] : [] });
    if (identity !== owner) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    if (path.endsWith("/share")) return Response.json({ share: null });
    return Response.json({ capsule });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function edit() {
  render(<MemberCapsules dataset="demo" />);
  fireEvent.click(await screen.findByRole("button", { name: "このCapsuleを編集" }));
  fireEvent.change(screen.getByLabelText("自分の説明", { exact: true }), { target: { value: "残したい未保存の入力" } });
}
async function visibility(value: "hidden" | "visible") {
  await act(async () => { Object.defineProperty(document, "visibilityState", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")); });
}
describe("会員編集中のprivate表示と入力保持", () => {
  it("非表示中の他タブ通知では再取得・描画せず、復帰して本人を確認してから戻す", async () => {
    await edit(); await visibility("hidden");
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    fetchMock.mockClear();
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "graph-knowledge:member-session-changed", newValue: "changed" })); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    await visibility("visible");
    await waitFor(() => expect((screen.getByLabelText("自分の説明", { exact: true }) as HTMLTextAreaElement).value).toBe("残したい未保存の入力"));
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("期待利用者の不一致で保存を止め、別人には入力を表示せず本人へだけ戻す", async () => {
    await edit(); identity = other;
    fireEvent.click(screen.getByRole("button", { name: "アカウントの変更を保存" }));
    await screen.findByText(/ログインが失効したか/);
    const update = fetchMock.mock.calls.find(call => call[1]?.method === "PUT");
    expect(update?.[1]?.headers).toMatchObject({ "X-Member-User": owner });
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "アカウントと一覧を再確認" }));
    await screen.findByText("別人", { exact: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "アカウントと一覧を再確認" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    expect(document.body.textContent).not.toContain("本人だけの題名");
    identity = owner;
    fireEvent.click(screen.getByRole("button", { name: "アカウントと一覧を再確認" }));
    await waitFor(() => expect((screen.getByLabelText("自分の説明", { exact: true }) as HTMLTextAreaElement).value).toBe("残したい未保存の入力"));
  });
  it("非表示で取消した更新の遅い成功応答は編集を閉じず、復帰時に再確認する", async () => {
    await edit();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "アカウントの変更を保存" }));
    await visibility("hidden");
    await act(async () => { finish(Response.json({ capsule: { ...capsule, revision: 2, content: { ...capsule.content, note: "残したい未保存の入力" } } })); });
    expect(screen.queryByText("アカウントのCapsuleを更新しました。", { exact: true })).toBeNull();
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    await visibility("visible");
    await waitFor(() => expect((screen.getByLabelText("自分の説明", { exact: true }) as HTMLTextAreaElement).value).toBe("残したい未保存の入力"));
  });
});
