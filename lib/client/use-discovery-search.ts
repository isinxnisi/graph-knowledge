"use client";
import { useEffect, useState } from "react";
import { discoverEntities, errorMessage } from "./api";
import type { DiscoverySearchResponse } from "../domain/api";
import type { SearchKind } from "../domain/search";
import type { DiscoveryTheme } from "../domain/discovery";
import type { PredicateFilter } from "../domain/exploration";
export type DiscoveryCriteria = { presentation?: "explore" | "list"; q: string; kind: SearchKind | null; around?: string; theme?: DiscoveryTheme; predicates?: PredicateFilter };
const cache = new Map<string, { at: number; result: DiscoverySearchResponse }>();

export function useDiscoverySearch(criteria: DiscoveryCriteria, after: string | null, composing: boolean) {
  const [retry, setRetry] = useState(0);
  const predicateKey = criteria.predicates?.join(",") ?? "";
  const key = JSON.stringify([criteria.q, criteria.kind, criteria.around, criteria.theme, predicateKey, after, retry]);
  const [state, setState] = useState<{ key: string; resultKey?: string; result?: DiscoverySearchResponse; error?: string }>({ key: "" });
  useEffect(() => {
    if (composing) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ q: criteria.q, ...(criteria.kind ? { kind: criteria.kind } : {}), ...(criteria.around ? { around: criteria.around } : {}), ...(criteria.theme ? { theme: criteria.theme } : {}), ...(predicateKey ? { predicates: predicateKey } : {}), ...(after ? { after } : {}) });
    const timer = setTimeout(async () => {
      const cached = !retry && cache.get(params.toString());
      if (cached && Date.now() - cached.at < 30_000) { setState({ key, result: cached.result }); return; }
      try {
        const result = await discoverEntities(params, controller.signal);
        if (controller.signal.aborted) return;
        if (cache.size >= 24) cache.delete(cache.keys().next().value!);
        cache.set(params.toString(), { at: Date.now(), result });
        setState({ key, result });
      } catch (e) { if (!controller.signal.aborted) setState(old => ({ key, error: errorMessage(e), result: old.result, resultKey: old.resultKey ?? old.key })); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, criteria.q, criteria.kind, criteria.around, criteria.theme, predicateKey, after, retry, composing]);
  const current = state.key === key && !composing ? state : null;
  return { result: current?.error ? undefined : current?.result, previous: state.result, resultKey: state.resultKey ?? state.key, starts: state.result?.starts ?? [], error: current?.error, loading: !current, retry: () => { cache.clear(); setRetry(v => v + 1); } };
}
