"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type UiLocale = "ja" | "en";
export const uiLocaleKey = "graph-knowledge.ui-locale.v1";
export function normalizeUiLocale(value: string | null): UiLocale {
  return value?.toLowerCase().split("-")[0] === "en" ? "en" : "ja";
}
const LocaleContext = createContext<{ locale: UiLocale; setLocale: (locale: UiLocale) => void; storageError: boolean }>({ locale: "ja", setLocale: () => {}, storageError: false });

// 表示言語はブラウザ設定。取得条件・探索世代・知識データから独立させる。
export function UiLocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: UiLocale }) {
  const [locale, update] = useState<UiLocale>(initialLocale ?? "ja");
  const resolved = useRef(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (resolved.current) return;
      resolved.current = true;
      try {
        if (initialLocale) localStorage.setItem(uiLocaleKey, initialLocale);
        update(initialLocale ?? normalizeUiLocale(localStorage.getItem(uiLocaleKey)));
      }
      catch { setStorageError(true); }
    }, 0);
    const sync = (event: StorageEvent) => {
      try {
        if (initialLocale === undefined && (event.storageArea === null || event.storageArea === localStorage) && (event.key === uiLocaleKey || event.key === null)) { resolved.current = true; update(normalizeUiLocale(event.newValue)); }
      } catch { setStorageError(true); }
    };
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); };
  }, [initialLocale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  function setLocale(next: UiLocale) {
    resolved.current = true; update(next);
    try { localStorage.setItem(uiLocaleKey, next); setStorageError(false); }
    catch { setStorageError(true); }
  }
  return <LocaleContext.Provider value={{ locale, setLocale, storageError }}>{children}</LocaleContext.Provider>;
}
export const useUiLocale = () => useContext(LocaleContext);
