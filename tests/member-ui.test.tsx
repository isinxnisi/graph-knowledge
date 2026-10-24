// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, act, configure } from "@testing-library/react";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import {invalidateMemberIdentity} from "../lib/client/use-member-identity";
import PersonalFrame from "../components/PersonalFrame";
import type {ReactElement} from "react";
import MemberCapsules from "../components/MemberCapsules";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import type { LocalCapsule, ResolvedCapsule } from "../lib/client/local-capsules";

vi.mock("next/navigation",()=>({usePathname:()=>"/member"}));
const render=(node:ReactElement)=>rtlRender(<PersonalFrame dataset="demo">{node}</PersonalFrame>);
vi.mock("../components/CapsuleDialog", () => ({
  CapsuleReader: ({ capsule, onEdit }: { capsule: LocalCapsule; onEdit?: (resolved: ResolvedCapsule) => void }) => <section data-testid="member-reader"><h3>{capsule.title}</h3>{onEdit && <button onClick={() => onEdit({ entities: {}, claims: {}, issues: [] })}>このCapsuleを編集</button>}</section>,
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
  invalidateMemberIdentity();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
  it("未保存の表示名は別タブ復帰で本人だけに戻り、別人には出ない", async () => {
    history.replaceState(null, "", "/member#account-settings");
    render(<MemberCapsules dataset="demo" />);
    fireEvent.change(await screen.findByLabelText("表示名", { exact: true }), { target: { value: "未保存の自分の名前" } });
    await visibility("hidden"); identity = other; await visibility("visible");
    await waitFor(() => expect((screen.getByLabelText("表示名") as HTMLInputElement).value).toBe("別人"));
    expect(document.body.textContent).not.toContain("未保存の自分の名前");
    await visibility("hidden"); identity = owner; await visibility("visible");
    await waitFor(() => expect((screen.getByLabelText("表示名") as HTMLInputElement).value).toBe("未保存の自分の名前"));
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
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
    fireEvent.click(screen.getByRole("button", { name: "最新の状態に更新" }));
    await waitFor(() => expect(screen.getByLabelText("アカウントメニュー").textContent).toContain("別人"));
    await waitFor(() => expect(screen.getByRole("button", { name: "最新の状態に更新" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    expect(document.body.textContent).not.toContain("本人だけの題名");
    identity = owner;
    fireEvent.click(screen.getByRole("button", { name: "最新の状態に更新" }));
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

describe("本人投稿一覧からの失効通知", () => {
  it("親の処理中の保存も取消し、遅い成功応答からprivate内容を再表示しない", async () => {
    await edit();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "アカウントの変更を保存" }));
    const save = fetchMock.mock.calls.find(call => call[1]?.method === "PUT")!;
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    fireEvent.click(screen.getByRole("navigation", { name: "アカウント内の移動" }).querySelector('a[href="#my-posts"]')!);
    await screen.findByText(/ログインが失効したか/);
    expect(save[1]?.signal?.aborted).toBe(true);
    await act(async () => { finish(Response.json({ capsule: { ...capsule, revision: 2 } })); });
    expect(screen.queryByText("アカウントのCapsuleを更新しました。", { exact: true })).toBeNull();
    expect(screen.queryByLabelText("自分の説明", { exact: true })).toBeNull();
    expect(screen.queryByTestId("member-reader")).toBeNull();
    expect(document.body.textContent).not.toContain(capsule.content.title);
    expect(screen.getByRole("button", { name: "最新の状態に更新" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("共有済み版の所有者再閲覧", () => {
  function historyResponses() {
    const fallback = fetchMock.getMockImplementation() as (path: string, options?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (identity !== owner) return fallback(path, options);
      if (path === "/api/member/capsules") return Response.json({ capsules: [{ ...capsule, revision: 3, content: { ...capsule.content, title: "現在の保存題名" } }] });
      if (path === `/api/member/capsules/${capsule.id}/revisions`) return Response.json({ revisions: [{ revision: 1, title: capsule.content.title, updatedAt: capsule.updatedAt }] });
      if (path === `/api/member/capsules/${capsule.id}/revisions?revision=1`) return Response.json({ capsule });
      if (path === `/api/member/capsules/${capsule.id}`) return Response.json({ capsule: { ...capsule, revision: 3, content: { ...capsule.content, title: "現在の保存題名" } } });
      return fallback(path, options);
    });
  }
  it("明示して一覧を取得し旧版へ切替え、URL・reload・現在版への復帰を分ける", async () => {
    historyResponses();
    const view = render(<MemberCapsules dataset="demo" />);
    await screen.findByRole("heading", { name: "現在の保存題名" });
    expect(fetchMock.mock.calls.some(call => call[0].endsWith("/revisions"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "共有した版を選ぶ" }));
    fireEvent.click(await screen.findByRole("button", { name: "内容版 1 を読む" }));
    await screen.findByRole("heading", { name: "共有時の内容版 1 を閲覧中" });
    expect(screen.getByRole("heading", { name: capsule.content.title })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "現在の保存題名" })).toBeNull();
    expect(screen.queryByRole("button", { name: "このCapsuleを編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "アカウントから削除" })).toBeNull();
    expect(screen.queryByRole("region", { name: "限定リンク共有" })).toBeNull();
    expect(location.search).toContain("revision=1");
    const reads = fetchMock.mock.calls.filter(call => call[0].includes("/revisions"));
    expect(reads.every(call => call[1]?.headers?.["X-Member-User"] === owner)).toBe(true);
    view.unmount(); render(<MemberCapsules dataset="demo" />);
    await screen.findByRole("heading", { name: "共有時の内容版 1 を閲覧中" });
    fireEvent.click(screen.getByRole("button", { name: "現在の保存内容へ戻る" }));
    await screen.findByRole("heading", { name: "現在の保存題名" });
    expect(screen.getByRole("button", { name: "このCapsuleを編集" })).toBeTruthy();
    expect(location.search).not.toContain("revision");
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it("旧版も非表示時に閉じ、別Userへの切替と遅い一覧応答から内容を漏らさない", async () => {
    historyResponses(); history.replaceState(null, "", `/member?capsule=${capsule.id}&revision=1`);
    render(<MemberCapsules dataset="demo" />);
    await screen.findByRole("heading", { name: "共有時の内容版 1 を閲覧中" });
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "共有した版を選ぶ" }));
    await visibility("hidden"); identity = other;
    await act(async () => { finish(Response.json({ revisions: [{ revision: 1, title: "遅れて届く旧版の題名", updatedAt: capsule.updatedAt }] })); });
    expect(document.body.textContent).not.toContain(capsule.content.title);
    expect(document.body.textContent).not.toContain("遅れて届く旧版の題名");
    await visibility("visible");
    await waitFor(() => expect(screen.getByLabelText("アカウントメニュー").textContent).toContain("別人"));
    await screen.findByText(/このCapsuleを閲覧できません/);
    expect(document.body.textContent).not.toContain(capsule.content.title);
    identity = owner; fireEvent.click(screen.getByRole("button", { name: "最新の状態に更新" }));
    await screen.findByRole("heading", { name: "共有時の内容版 1 を閲覧中" });
  });
  it("旧版の取得失敗は現在版へ黙って切替えず、明示再確認で再試行する", async () => {
    historyResponses(); history.replaceState(null, "", `/member?capsule=${capsule.id}&revision=1`);
    const fallback = fetchMock.getMockImplementation() as (path: string, options?: RequestInit) => Promise<Response>;
    let failed = true;
    fetchMock.mockImplementation((path: string, options: RequestInit = {}) => path.includes("/revisions?") && failed ? Response.json({ error: { code: "MEMBER_UNAVAILABLE" } }, { status: 503 }) : fallback(path, options));
    render(<MemberCapsules dataset="demo" />);
    await screen.findByText(/会員保存を現在利用できません/);
    expect(screen.queryByTestId("member-reader")).toBeNull();
    failed = false; fireEvent.click(screen.getByRole("button", { name: "最新の状態に更新" }));
    await screen.findByRole("heading", { name: "共有時の内容版 1 を閲覧中" });
  });
  it("版の一覧取得でsessionが失効したら親のprivate本文も閉じる", async () => {
    historyResponses();
    const fallback = fetchMock.getMockImplementation() as (path: string, options?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation((path: string, options: RequestInit = {}) => path.endsWith("/revisions") ? Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }) : fallback(path, options));
    render(<MemberCapsules dataset="demo" />);
    await screen.findByRole("heading", { name: "現在の保存題名" });
    fireEvent.click(screen.getByRole("button", { name: "共有した版を選ぶ" }));
    await screen.findByText(/ログインが失効したか/);
    expect(screen.queryByTestId("member-reader")).toBeNull();
    expect(document.body.textContent).not.toContain("現在の保存題名");
  });
  it("比較した現在版を非表示時に破棄し、別Userや遅い応答へ引き継がない", async () => {
    historyResponses(); history.replaceState(null, "", `/member?capsule=${capsule.id}&revision=1`);
    render(<MemberCapsules dataset="demo" />);
    fireEvent.click(await screen.findByRole("button", { name: "現在の保存内容と比較" }));
    await screen.findByText("現在の保存題名", { exact: true });
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "現在の保存内容を再取得して比較" }));
    await visibility("hidden"); identity = other;
    await act(async () => { finish(Response.json({ capsule: { ...capsule, revision: 4, content: { ...capsule.content, title: "遅い比較の題名" } } })); });
    expect(document.body.textContent).not.toContain("現在の保存題名");
    expect(document.body.textContent).not.toContain("遅い比較の題名");
    await visibility("visible"); await waitFor(() => expect(screen.getByLabelText("アカウントメニュー").textContent).toContain("別人"));
    expect(screen.queryByRole("region", { name: "共有時からの変更" })).toBeNull();
    identity = owner; fireEvent.click(screen.getByRole("button", { name: "最新の状態に更新" }));
    await screen.findByRole("button", { name: "現在の保存内容と比較" });
    expect(document.body.textContent).not.toContain("現在の保存題名");
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it("比較の認可失効で旧版も閉じ、private現在版を残さない", async () => {
    historyResponses(); history.replaceState(null, "", `/member?capsule=${capsule.id}&revision=1`);
    render(<MemberCapsules dataset="demo" />);
    await screen.findByRole("button", { name: "現在の保存内容と比較" });
    identity = null;
    fireEvent.click(screen.getByRole("button", { name: "現在の保存内容と比較" }));
    await screen.findByText(/ログインが失効したか/);
    expect(screen.queryByTestId("member-reader")).toBeNull();
    expect(document.body.textContent).not.toContain(capsule.content.title);
  });
  it("要求した版と違う成功応答は描画しない", async () => {
    historyResponses(); history.replaceState(null, "", `/member?capsule=${capsule.id}&revision=2`);
    render(<MemberCapsules dataset="demo" />);
    await screen.findByText(/処理を完了できませんでした/);
    expect(screen.queryByRole("heading", { name: capsule.content.title })).toBeNull();
  });
});


describe("追加した参照の所有者付き草稿", () => {
  it("追加を本人の草稿へ保持し、失効・別Userには隠して同じ本人だけ再開する", async () => {
    const fallback = fetchMock.getMockImplementation() as (path: string, options?: RequestInit) => Promise<Response>;
    const claim = examples.claim.claim;
    fetchMock.mockImplementation((path: string, options: RequestInit = {}) => {
      if (path.startsWith("/api/claims/")) return Response.json(examples.claim);
      if (path.startsWith("/api/entities/")) return Response.json({ entity: { ...examples.neighbors.nodes.find(node => path.endsWith(node.id)), aliases: [], event: null } });
      return fallback(path, options);
    });
    await edit();
    fireEvent.change(screen.getByLabelText("対象・主張の閲覧リンク"), { target: { value: `/?read=claim&dataset=demo&id=${claim.id}` } });
    fireEvent.click(screen.getByRole("button", { name: "リンクの内容を確認" }));
    fireEvent.click(await screen.findByRole("button", { name: "確認した参照を編集中の構成へ追加" }));
    expect((screen.getByRole("checkbox", { name: /黒川レン · 人物/ }) as HTMLInputElement).checked).toBe(true);
    await visibility("hidden"); identity = other; await visibility("visible");
    await waitFor(() => expect(screen.getByLabelText("アカウントメニュー").textContent).toContain("別人"));
    expect(screen.queryByLabelText("対象・主張の閲覧リンク")).toBeNull();
    expect(document.body.textContent).not.toContain("黒川レン");
    await waitFor(() => expect(screen.getByRole("button", { name: "最新の状態に更新" }).hasAttribute("disabled")).toBe(false));
    identity = owner; fireEvent.click(screen.getByRole("button", { name: "最新の状態に更新" }));
    const restored = await screen.findByRole("checkbox", { name: /黒川レン · 人物/ }) as HTMLInputElement;
    expect(restored.checked).toBe(true); expect(restored.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "アカウントの変更を保存" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1]?.method === "PUT")).toBe(true));
    const update = fetchMock.mock.calls.find(call => call[1]?.method === "PUT")!;
    expect(update[1]?.headers).toMatchObject({ "X-Member-User": owner });
    expect(JSON.parse(update[1]?.body as string)).toMatchObject({ expectedRevision: 1, content: { claimIds: [claim.id], note: "残したい未保存の入力" } });
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
});
