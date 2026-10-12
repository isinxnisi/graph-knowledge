// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SiteHeader from "../components/SiteHeader";
import MemberProfileSettings from "../components/MemberProfileSettings";
import { appearanceKey, readAppearance } from "../lib/client/appearance";
import { memberProfileUpdateSchema } from "../lib/domain/member-profile";

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("最小アカウント設定", () => {
  it("表示名だけ許し、空・制御文字・過長・権限fieldを拒否する", () => {
    expect(memberProfileUpdateSchema.parse({ name: "  名 前  " })).toEqual({ name: "名 前" });
    for (const value of [{ name: " " }, { name: "n\na" }, { name: "x".repeat(81) }, { name: "名前", active: true }, { name: "名前", userId: "other" }]) expect(memberProfileUpdateSchema.safeParse(value).success).toBe(false);
  });
  it("保存テーマを復元し、他タブの変更・削除を反映する。private取得はしない", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: "dark-blue", palette: "blue" }));
    render(<SiteHeader dataset="demo" />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark-blue"));
    fireEvent(window, new StorageEvent("storage", { key: appearanceKey, newValue: JSON.stringify({ theme: "dark-brown", palette: "brown" }) }));
    expect(document.documentElement.dataset.theme).toBe("dark-brown");
    fireEvent(window, new StorageEvent("storage", { key: appearanceKey, newValue: null }));
    expect(document.documentElement.dataset.theme).toBe("light"); expect(fetch).not.toHaveBeenCalled();
  });
  it("テーマ変更を保存し、Escape・外側クリックで設定を閉じる", async () => {
    render(<SiteHeader dataset="demo" />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    const details = screen.getByText("設定").parentElement as HTMLDetailsElement;
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
    (screen.getByText("設定").parentElement as HTMLDetailsElement).open = true;
    fireEvent.click(screen.getByRole("button", { name: "ダークモード" }));
    expect(document.documentElement.dataset.theme).toBe("dark-brown");
    expect(screen.getByRole("status").textContent).toContain("テーマを保存できません");
  });
  it("会員ページ内のメニューは編集中URLを変更するnavigationをしない", () => {
    render(<SiteHeader dataset="demo" page="member" />);
    (screen.getByText("設定").parentElement as HTMLDetailsElement).open = true;
    expect(screen.getByRole("link", { name: "アカウント設定" }).getAttribute("href")).toBe("#account-settings");
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
