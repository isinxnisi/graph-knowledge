"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchPanelPreferenceKey } from "./search-panel-preference";
export { searchPanelPreferenceKey } from "./search-panel-preference";

// Panel visibility belongs to this browser, independently of exploration URLs.
export function useSearchPanelPreference() {
  const [collapsed, setCollapsed] = useState(false);
  const changed = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (changed.current) return;
      let next = document.documentElement.dataset.searchPanelCollapsed === "true";
      try { next = localStorage.getItem(searchPanelPreferenceKey) === "true"; } catch { /* Storage can be unavailable in private browsing. */ }
      document.documentElement.dataset.searchPanelCollapsed = String(next);
      setCollapsed(next);
    }, 0);
    const sync = (event: StorageEvent) => {
      if (event.key !== searchPanelPreferenceKey && event.key !== null) return;
      if (event.storageArea) {
        try { if (event.storageArea !== window.localStorage) return; } catch { return; }
      }
      changed.current = true;
      document.documentElement.dataset.searchPanelCollapsed = String(event.newValue === "true");
      setCollapsed(event.newValue === "true");
    };
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); };
  }, []);
  const toggle = useCallback(() => {
    changed.current = true;
    const next = document.documentElement.dataset.searchPanelCollapsed !== "true";
    document.documentElement.dataset.searchPanelCollapsed = String(next);
    try { localStorage.setItem(searchPanelPreferenceKey, String(next)); } catch { /* Keep the current session usable. */ }
    setCollapsed(next);
  }, []);
  return [collapsed, toggle] as const;
}
