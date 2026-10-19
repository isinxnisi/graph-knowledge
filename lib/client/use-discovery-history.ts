"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { ConnectionsWorkspace } from "../domain/discovery-connections";

// Keep the existing snapshot format. Coalesce edits; failure of an optional
// browser checkpoint must not become a fatal React effect exception.
export function useDiscoveryHistory(snapshot: Record<string, unknown>, ready: boolean, lab: boolean, returnFocus: RefObject<string | null>) {
  const latest = useRef({ snapshot, ready, lab, source: null as string | null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), dirty = useRef(false);
  const last = useRef({ at: 0, key: "" });
  useLayoutEffect(() => { latest.current = { snapshot, ready, lab, source: returnFocus.current }; }, [snapshot, ready, lab, returnFocus]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current); timer.current = null;
    const current = latest.current;
    if (!current.ready || !dirty.current) return false;
    // A Back operation may already have moved away from the Discovery entry.
    if (!current.lab && !history.state?.plunodeDiscovery) return false;
    const key = JSON.stringify([location.href, current.snapshot, current.source, current.lab]);
    if (key === last.current.key) { dirty.current = false; return true; }
    try {
      history.replaceState(current.lab ? { ...history.state, discoveryPrototype: current.snapshot } : {
        ...history.state, plunodeDiscovery: { ...(current.snapshot.listCriteria as object), presentation: current.snapshot.entry === "list" ? "list" : "explore" },
        discoveryWorkspace: current.snapshot, discoveryReturnFocus: current.source,
      }, "", location.href);
      if (current.lab) { try { sessionStorage.setItem("plunode.discovery-prototype.v1", JSON.stringify(current.snapshot)); } catch { /* Optional storage. */ } }
      last.current = { at: Date.now(), key }; dirty.current = false; return true;
    } catch { return false; } // Quota / frequency / inactive-document restrictions: retain the last valid entry.
  }, []);
  const schedule = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, Math.max(250, 1000 - (Date.now() - last.current.at)));
  }, [flush]);
  useEffect(() => { if (ready) schedule(); }, [snapshot, ready, schedule]);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "hidden") flush(); else if (dirty.current) schedule(); };
    window.addEventListener("pagehide", flush); document.addEventListener("visibilitychange", visibility);
    return () => { if (timer.current) clearTimeout(timer.current); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", visibility); };
  }, [flush, schedule]);
  const checkpoint = useCallback((connectionFlow: ConnectionsWorkspace, immediate = false) => {
    latest.current = { ...latest.current, snapshot: { ...latest.current.snapshot, connectionFlow } };
    dirty.current = true;
    if (immediate) return flush();
    schedule(); return true;
  }, [flush, schedule]);
  return { checkpoint, flush };
}
