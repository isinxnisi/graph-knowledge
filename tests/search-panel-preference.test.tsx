// @vitest-environment jsdom
import { searchPanelPreferenceBootstrap } from "../lib/client/search-panel-preference";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPanelPreferenceKey, useSearchPanelPreference } from "../lib/client/use-search-panel-preference";

beforeEach(() => {
  delete document.documentElement.dataset.searchPanelCollapsed;
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const restore = () => act(() => vi.runOnlyPendingTimers());
function sync(newValue: string | null, key: string | null = searchPanelPreferenceKey, storageArea = localStorage) {
  act(() => window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea })));
}

describe("検索ペインのブラウザ内表示設定", () => {
  it("初回描画前に閉じた表示を復元し、hydration直後の操作でも開く", () => {
    localStorage.setItem(searchPanelPreferenceKey, "true");
    window.eval(searchPanelPreferenceBootstrap);
    expect(document.documentElement.dataset.searchPanelCollapsed).toBe("true");
    const { result } = renderHook(() => useSearchPanelPreference());
    expect(document.documentElement.dataset.searchPanelCollapsed).toBe("true");
    act(() => result.current[1]());
    restore();
    expect(document.documentElement.dataset.searchPanelCollapsed).toBe("false");
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(searchPanelPreferenceKey)).toBe("false");
  });

  it("初回描画前に保存領域へアクセスできなくても画面を表示する", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    expect(() => window.eval(searchPanelPreferenceBootstrap)).not.toThrow();
    expect(document.documentElement.dataset.searchPanelCollapsed).toBe("false");
  });

  it("開閉を保存し、画面を離れて戻っても同じ表示へ復元する", () => {
    const first = renderHook(() => useSearchPanelPreference());
    restore();
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]());
    expect(first.result.current[0]).toBe(true);
    expect(localStorage.getItem(searchPanelPreferenceKey)).toBe("true");
    first.unmount();

    const second = renderHook(() => useSearchPanelPreference());
    restore();
    expect(second.result.current[0]).toBe(true);
    act(() => second.result.current[1]());
    expect(localStorage.getItem(searchPanelPreferenceKey)).toBe("false");
    second.unmount();

    const third = renderHook(() => useSearchPanelPreference());
    restore();
    expect(third.result.current[0]).toBe(false);
  });

  it("保存領域の読み書きが拒否されても、その画面では開閉できる", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    const { result } = renderHook(() => useSearchPanelPreference());
    expect(restore).not.toThrow();
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it("初期復元より先に操作した表示を、保存値で上書きしない", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("false");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    const { result } = renderHook(() => useSearchPanelPreference());
    act(() => result.current[1]());
    restore();
    expect(result.current[0]).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("別タブの変更・削除・全消去に同期し、書き戻しを発生させない", () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useSearchPanelPreference());
    sync("true");
    restore();
    expect(result.current[0]).toBe(true);
    sync("false");
    expect(result.current[0]).toBe(false);
    sync("true");
    sync(null);
    expect(result.current[0]).toBe(false);
    sync("true");
    sync(null, null);
    expect(result.current[0]).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("無関係な設定やsessionStorageの変更・全消去には反応しない", () => {
    localStorage.setItem(searchPanelPreferenceKey, "true");
    const { result } = renderHook(() => useSearchPanelPreference());
    restore();
    sync("false", "plunode.other-setting");
    sync("false", searchPanelPreferenceKey, sessionStorage);
    sync(null, null, sessionStorage);
    expect(result.current[0]).toBe(true);
  });

  it("画面を離れたら復元タイマーと別タブ同期の購読を解除する", () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useSearchPanelPreference());
    unmount();
    restore();
    expect(get).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});
