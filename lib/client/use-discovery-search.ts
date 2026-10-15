"use client";
import { useEffect, useState } from "react";
import { discoverEntities, errorMessage } from "./api";
import type { DiscoverySearchResponse } from "../domain/api";
import type { SearchKind } from "../domain/search";
export type DiscoveryCriteria = { q: string; kind: SearchKind | null; around?: string };
const cache = new Map<string, { at: number; result: DiscoverySearchResponse }>();

export function useDiscoverySearch(criteria: DiscoveryCriteria, after: string | null, composing: boolean) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([criteria.q, criteria.kind, criteria.around, after, retry]);
  const [state, setState] = useState<{ key: string; result?: DiscoverySearchResponse; error?: string }>({ key: "" });
  useEffect(() => {
    if (composing) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ q: criteria.q, ...(criteria.kind ? { kind: criteria.kind } : {}), ...(criteria.around ? { around: criteria.around } : {}), ...(after ? { after } : {}) });
    const timer = setTimeout(async () => {
      const cached = !retry && cache.get(params.toString());
      if (cached && Date.now() - cached.at < 30_000) { setState({ key, result: cached.result }); return; }
      try {
        const result = await discoverEntities(params, controller.signal);
        if (controller.signal.aborted) return;
        if (cache.size >= 24) cache.delete(cache.keys().next().value!);
        cache.set(params.toString(), { at: Date.now(), result });
        setState({ key, result });
      } catch (e) { if (!controller.signal.aborted) setState({ key, error: errorMessage(e) }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, criteria.q, criteria.kind, criteria.around, after, retry, composing]);
  const current = state.key === key && !composing ? state : null;
  return { result: current?.result, starts: state.result?.starts ?? [], error: current?.error, loading: !current, retry: () => { cache.clear(); setState({ key: "" }); setRetry(v => v + 1); } };
}
