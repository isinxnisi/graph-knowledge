// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SiteHeader from "../components/SiteHeader";
import MemberAccountDeletion from "../components/MemberAccountDeletion";
import MemberProfileSettings from "../components/MemberProfileSettings";
import { appearanceKey, readAppearance } from "../lib/client/appearance";
import { memberProfileUpdateSchema } from "../lib/domain/member-profile";

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("最小アカウント設定", () => {
  it("コミュニティのヘッダーは画面内アンカーでなく実アカウントへ移動する", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const view=render(<SiteHeader dataset="demo" page="community" user={null}/>);
    expect(screen.getByRole("link",{name:"ログイン"}).getAttribute("href")).toBe("/member");
    view.rerender(<SiteHeader dataset="demo" page="community" user={{id:"test",name:"Beta",locale:"ja"}}/>);
    const links=screen.getAllByRole("link",{hidden:true}).map(x=>x.getAttribute("href"));
    expect(links).toContain("/member#my-capsules");
    expect(links).toContain("/member#account-settings");
    expect(links).toContain("/member#my-posts");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("表示名だけ許し、空・制御文字・過長・権限fieldを拒否する", () => {
    expect(memberProfileUpdateSchema.parse({ name: "  名 前  " })).toEqual({ name: "名 前" });
    for (const value of [{ name: " " }, { name: "n\na" }, { name: "x".repeat(81) }, { name: "名前", active: true }, { name: "名前", userId: "other" }]) expect(memberProfileUpdateSchema.safeParse(value).success).toBe(false);
  });
  it("保存テーマを復元し、テーマ変更では本人表示以外の会員内容を取得しない", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { code: "MEMBER_UNAVAILABLE" } }, { status: 503 })); vi.stubGlobal("fetch", fetch);
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: "dark-blue", palette: "blue" }));
    render(<SiteHeader dataset="demo" />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark-blue"));
    fireEvent(window, new StorageEvent("storage", { key: appearanceKey, newValue: JSON.stringify({ theme: "dark-brown", palette: "brown" }) }));
    expect(document.documentElement.dataset.theme).toBe("dark-brown");
    fireEvent(window, new StorageEvent("storage", { key: appearanceKey, newValue: null }));
    expect(document.documentElement.dataset.theme).toBe("light"); expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/member/profile"]);
  });
  it("テーマ変更を保存し、Escape・外側クリックで設定を閉じる", async () => {
    render(<SiteHeader dataset="demo" />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    const details = screen.getByLabelText("表示設定").closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "ダークモード" }));
    expect(readAppearance(localStorage.getItem(appearanceKey)).theme).toBe("dark-brown");
    fireEvent.keyDown(document, { key: "Escape" }); expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector("summary"));
    details.open = true; fireEvent.pointerDown(document.body); expect(details.open).toBe(false);
  });
  it("保存不能でもその画面のテーマを使え、破損した値は安全な既定へ戻す", async () => {
    expect(readAppearance('{"theme":"injected"}').theme).toBe("light");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<SiteHeader dataset="demo" />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    (screen.getByLabelText("表示設定").closest("details") as HTMLDetailsElement).open = true;
    fireEvent.click(screen.getByRole("button", { name: "ダークモード" }));
    expect(document.documentElement.dataset.theme).toBe("dark-brown");
    expect(screen.getByRole("status").textContent).toContain("テーマを保存できません");
  });
  it("会員ページ内のメニューは編集中URLを変更するnavigationをしない", () => {
    render(<SiteHeader dataset="demo" page="member" user={{ id: "10000000-0000-4000-8000-000000000001", name: "本人", locale: "ja" }} />);
    (screen.getByLabelText("本人のアカウントメニュー").closest("details") as HTMLDetailsElement).open = true;
    expect(screen.getByRole("link", { name: "アカウント設定" }).getAttribute("href")).toBe("#account-settings");
  });
  it("ヘッダは本人確認済みの名前を表示し、会員内容や名前をブラウザへ保存しない", async () => {
    const user = { id: "10000000-0000-4000-8000-000000000001", name: "本人の表示名", locale: "ja" };
    const fetch = vi.fn().mockResolvedValue(Response.json({ user })); vi.stubGlobal("fetch", fetch);
    render(<SiteHeader dataset="demo" />);
    const account = await screen.findByLabelText("本人の表示名のアカウントメニュー");
    expect(account.getAttribute("data-signed-in")).toBe("true");
    expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/member/profile"]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(JSON.stringify(localStorage)).not.toContain(user.name);
  });
  it("非表示と他タブのログアウトで名前を消し、遅い本人応答を受け入れない", async () => {
    const user = { id: "10000000-0000-4000-8000-000000000001", name: "前の本人", locale: "ja" };
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ user }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValue(Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
    vi.stubGlobal("fetch", fetch); render(<SiteHeader dataset="demo" />);
    await screen.findByLabelText("前の本人のアカウントメニュー");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); fireEvent(document, new Event("visibilitychange"));
    expect(screen.queryAllByText("前の本人")).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent(window, new StorageEvent("storage", { key: "graph-knowledge:member-session-changed", newValue: "changed" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    finish(Response.json({ user }));
    await waitFor(() => expect(screen.getByRole("link", { name: "ログイン" })).toBeDefined());
    expect(screen.queryAllByText("前の本人")).toHaveLength(0);
  });
  it("会員画面のヘッダは親で確認した名前を使い、余分な本人取得を行わない", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const user = { id: "10000000-0000-4000-8000-000000000001", name: "確認済み", locale: "ja" };
    const view = render(<SiteHeader dataset="demo" page="member" user={user} />);
    expect(screen.getByTitle("確認済みでログイン中")).toBeDefined();
    view.rerender(<SiteHeader dataset="demo" page="member" user={null} />);
    expect(screen.queryByTitle("確認済みでログイン中")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it("名前の保存失敗でも入力を消さず、利用者を固定して送り、成功のときだけ反映する", async () => {
    const user = { id: "10000000-0000-4000-8000-000000000001", name: "元の名前", locale: "ja" };
    const saved = vi.fn(), changed = vi.fn(), unauthorized = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: "MEMBER_UNAVAILABLE" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ user: { ...user, name: "新しい名前" } })); vi.stubGlobal("fetch", fetch);
    render(<MemberProfileSettings user={user} value="新しい名前" disabled={false} onChange={changed} onSaved={saved} onUnauthorized={unauthorized} />);
    fireEvent.click(screen.getByRole("button", { name: "表示名を保存" }));
    await screen.findByRole("alert"); expect(changed).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].headers["X-Member-User"]).toBe(user.id);
    fireEvent.click(screen.getByRole("button", { name: "表示名を保存" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ ...user, name: "新しい名前" }));
    expect(unauthorized).not.toHaveBeenCalled();
  });
  it("非表示になった後の遅い名前更新応答を本人確認済みとして反映しない", async () => {
    const user = { id: "10000000-0000-4000-8000-000000000001", name: "元の名前", locale: "ja" };
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const saved = vi.fn();
    const view = render(<MemberProfileSettings user={user} value="新しい名前" disabled={false} onChange={vi.fn()} onSaved={saved} onUnauthorized={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "表示名を保存" }));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); fireEvent(document, new Event("visibilitychange"));
    view.unmount();
    finish(Response.json({ user: { ...user, name: "新しい名前" } }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(saved).not.toHaveBeenCalled();
  });
});


describe("本人のアカウント削除確認", () => {
  const user = { id: "10000000-0000-4000-8000-000000000001", name: "本人", locale: "ja" };
  it("確認と同意までは送信せず、失敗では完了扱いにせず、成功時だけ閉じる", async () => {
    const deleted = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: "RECENT_LOGIN_REQUIRED" } }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ deleted: true })); vi.stubGlobal("fetch", fetch);
    render(<MemberAccountDeletion user={user} disabled={false} onDeleted={deleted} onUnauthorized={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "削除する内容を確認" }));
    const submit = screen.getByRole("button", { name: "退会してアカウントを削除する" });
    expect(submit.hasAttribute("disabled")).toBe(true); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toContain("30分以内"); expect(deleted).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].headers["X-Member-User"]).toBe(user.id);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ confirmation: "delete-account" });
    fireEvent.click(submit); await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  });
  it("取消や未保存入力による無効状態では削除しない", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const view = render(<MemberAccountDeletion user={user} disabled={false} onDeleted={vi.fn()} onUnauthorized={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "削除する内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "取り消す" }));
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    view.rerender(<MemberAccountDeletion user={user} disabled={true} onDeleted={vi.fn()} onUnauthorized={vi.fn()} />);
    expect(screen.getByRole("button", { name: "削除する内容を確認" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("探索と会員の戻り先", () => {
  it("公開Graph URLだけをタブ内へ残し、外部URLや会員URLには戻さない", async () => {
    const { rememberExplorationReturn, explorationReturnHref } = await import("../lib/client/account-navigation");
    sessionStorage.clear();
    history.replaceState(null, "", "/explore/10000000-0000-4000-8000-000000000001?s=example");
    rememberExplorationReturn();
    history.replaceState(null, "", "/member");
    expect(explorationReturnHref()).toBe("/explore/10000000-0000-4000-8000-000000000001?s=example");
    for (const value of ["https://elsewhere.example/explore/10000000-0000-4000-8000-000000000001", "/member?capsule=private", "/shared#private", "javascript:alert(1)"]) {
      sessionStorage.setItem("graph-knowledge:account-return:v1", value);
      expect(explorationReturnHref()).toBe("/");
    }
    sessionStorage.clear(); history.replaceState(null, "", "/");
  });
});
