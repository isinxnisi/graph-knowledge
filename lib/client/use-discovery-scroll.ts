"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { ConnectionsWorkspace } from "../domain/discovery-connections";

// Scroll is an imperative position, not search state. Checkpoint after settling
// or leaving; never rerender rows / regenerate Graph URLs on each scroll frame.
export function useDiscoveryScroll(value: ConnectionsWorkspace, body: RefObject<HTMLDivElement | null>, onCheckpoint: (snapshot: ConnectionsWorkspace) => void, canRestore: boolean) {
  const latest = useRef(value), positions = useRef({ ...value.scrolls });
  const restore = useRef<number | null>(value.scrolls[value.step]);
  useLayoutEffect(() => { latest.current = value; }, [value]);
  const capture = useCallback((next: ConnectionsWorkspace) => { const saved = { ...next, scrolls: { ...positions.current } }; latest.current = saved; return saved; }, []);
  const prepare = useCallback((step: ConnectionsWorkspace["step"], top = positions.current[step]) => { restore.current = top; }, []);
  useLayoutEffect(() => {
    const el = body.current;
    if (restore.current === null || !el || !canRestore) return;
    positions.current[value.step] = restore.current; el.scrollTo({ top: restore.current }); restore.current = null;
  }, [value.step, body, canRestore]);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined, dirty = false;
    const flush = () => { clearTimeout(timer); if (dirty) { dirty = false; onCheckpoint(capture(latest.current)); } };
    const scroll = () => {
      if (restore.current !== null || positions.current[latest.current.step] === el.scrollTop) return;
      positions.current[latest.current.step] = el.scrollTop;
      dirty = true; clearTimeout(timer); timer = setTimeout(flush, 500);
    };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    el.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", flush); document.addEventListener("visibilitychange", visibility);
    return () => {
      el.removeEventListener("scroll", scroll); window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility); flush();
    };
  }, [body, onCheckpoint, capture]);
  return { capture, prepare };
}
