"use client";

import { siteLabels } from "../i18n/site";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type UiLocale = "ja" | "en";
export const uiLocaleKey = "graph-knowledge.ui-locale.v1";
export function normalizeUiLocale(value: string | null): UiLocale {
  return value?.toLowerCase().split("-")[0] === "en" ? "en" : "ja";
}
const LocaleContext = createContext<{ locale: UiLocale; setLocale: (locale: UiLocale) => void; storageError: boolean }>({ locale: "ja", setLocale: () => {}, storageError: false });

// 表示言語はブラウザ設定。取得条件・探索世代・知識データから独立させる。
export function UiLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, update] = useState<UiLocale>("ja");
  const resolved = useRef(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (resolved.current) return;
      resolved.current = true;
      try { update(normalizeUiLocale(localStorage.getItem(uiLocaleKey))); }
      catch { setStorageError(true); }
    }, 0);
    const sync = (event: StorageEvent) => {
      try {
        if ((event.storageArea === null || event.storageArea === localStorage) && (event.key === uiLocaleKey || event.key === null)) { resolved.current = true; update(normalizeUiLocale(event.newValue)); }
      } catch { setStorageError(true); }
    };
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => { document.documentElement.lang = locale; document.title = siteLabels(locale).name; }, [locale]);
  function setLocale(next: UiLocale) {
    resolved.current = true; update(next);
    try { localStorage.setItem(uiLocaleKey, next); setStorageError(false); }
    catch { setStorageError(true); }
  }
  return <LocaleContext.Provider value={{ locale, setLocale, storageError }}>{children}</LocaleContext.Provider>;
}
export const useUiLocale = () => useContext(LocaleContext);
