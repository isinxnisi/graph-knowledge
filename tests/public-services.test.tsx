// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PublicServices from "../components/PublicServices";
import { privacyKey } from "../lib/client/privacy-preferences";
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(728);
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function() { this.setAttribute("open", ""); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("同意前は外部文書を作らず、許可・別タブでの撤回を反映する", async () => {
  render(<PublicServices policy={{ analytics: true, ads: true }} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  await screen.findByRole("button", { name: "広告を許可" });
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "広告を許可" }));
  await waitFor(() => expect(document.querySelectorAll("iframe")).toHaveLength(1));
  expect(screen.queryByTitle("Analytics")).toBeNull();
  expect(new URL(screen.getByTitle("広告").getAttribute("src")!).origin).not.toBe(location.origin);
  fireEvent(window, new StorageEvent("storage", { key: privacyKey, newValue: '{"analytics":false,"ads":false}' }));
  await waitFor(() => expect(document.querySelectorAll("iframe")).toHaveLength(0));
});
it("確認環境は広告だけで、privacy画面では許可済みでもタグを読み込まない", async () => {
  localStorage.setItem(privacyKey, '{"analytics":true,"ads":true}');
  const { unmount } = render(<PublicServices policy={{ analytics: false, ads: true }} />);
  await screen.findByTitle("広告"); expect(screen.queryByTitle("Analytics")).toBeNull();
  unmount();
  render(<PublicServices policy={{ analytics: true, ads: true }} preferencesOnly />);
  await waitFor(() => expect(screen.queryByRole("button", { name: "広告を許可" })).toBeNull());
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
});
it("日本の新規訪問は広告だけを自動読込し、設定保存を広告の明示同意にしない", async () => {
  const { unmount } = render(<PublicServices policy={{ analytics: true, ads: true, adDefault: true }} />);
  await screen.findByTitle("広告"); expect(screen.queryByTitle("Analytics")).toBeNull();
  expect(screen.queryByRole("button", { name: "広告を許可" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "計測・広告の設定" }));
  expect((screen.getByRole("checkbox", { name: /^広告/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "設定を保存" }));
  expect(JSON.parse(localStorage.getItem(privacyKey)!)).toEqual({ analytics: false, ads: true, adsConsent: false });
  unmount(); render(<PublicServices policy={{ analytics: true, ads: true, adDefault: false }} />);
  await screen.findByRole("button", { name: "広告を許可" }); expect(screen.queryByTitle("広告")).toBeNull();
});
it("標準ONでも過去の拒否を守り、728pxに足りないPC枠を作らない", async () => {
  localStorage.setItem(privacyKey, '{"analytics":false,"ads":false}');
  const { unmount } = render(<PublicServices policy={{ analytics: true, ads: true, adDefault: true }} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
  unmount(); localStorage.clear(); vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(727);
  render(<PublicServices policy={{ analytics: true, ads: true, adDefault: true }} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
});
it("同じ幅分類の再通知で表示済み広告を消さず、幅分類が変わればtagを切り替える", async () => {
  let changed: (() => void) | undefined;
  const media = { matches: false, addEventListener: (_: string, callback: () => void) => { changed = callback; }, removeEventListener() {} };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media));
  localStorage.setItem(privacyKey, '{"analytics":false,"ads":true}');
  render(<PublicServices policy={{ analytics: false, ads: true }} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const frame = screen.getByTitle("広告") as HTMLIFrameElement;
  const slot = frame.parentElement!;
  fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, origin: new URL(frame.src).origin, data: { type: "plunode-ad-status", filled: true, height: 90 } }));
  expect(slot.getAttribute("data-filled")).toBe("true");
  act(() => changed?.()); expect(slot.getAttribute("data-filled")).toBe("true");
  act(() => { media.matches = true; changed?.(); });
  expect(frame.getAttribute("width")).toBe("320"); expect(slot.getAttribute("data-filled")).toBe("false");
});
