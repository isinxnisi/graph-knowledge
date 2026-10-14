"use client";
import { useEffect, useState } from "react";
import { memberProfileSchema, memberRequest, type MemberUser } from "./member-api";

// Display identity only. Authorization and private content stay in the member APIs.
export function useMemberIdentity(enabled = true) {
  const [user, setUser] = useState<MemberUser | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      controller?.abort(); clearTimeout(timer); setUser(null);
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(() => {
        controller = new AbortController();
        const signal = controller.signal;
        void memberRequest("/api/member/profile", memberProfileSchema, { signal }).then(result => {
          if (!signal.aborted) setUser(result.user);
        }).catch(() => { /* Unavailable or unauthenticated: keep the generic account entry. */ });
      }, 0);
    };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === "graph-knowledge:member-session-changed") refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    refresh();
    window.addEventListener("focus", refresh); window.addEventListener("storage", storage);
    window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", refresh);
    return () => {
      controller?.abort(); clearTimeout(timer);
      window.removeEventListener("focus", refresh); window.removeEventListener("storage", storage);
      window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled]);
  return enabled ? user : null;
}
