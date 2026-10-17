"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { claimSummarySchema, entityDetailSchema, entitySummarySchema } from "../domain/api";
import type { ClaimSummary, EntityDetail, EntitySummary } from "../domain/api";
import type { DiscoveryPlan } from "../domain/discovery-prototype";
import { ClientApiError, errorMessage, fetchDatasetRevision, fetchEntity, fetchNeighbors, searchEntities } from "./api";

const neighborsSchema = z.object({
  revision: z.string(), centerId: z.string(), nodes: z.array(entitySummarySchema), claims: z.array(claimSummarySchema),
  page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
});
export type PrototypeResult = {
  revision: string; anchor: EntitySummary | null; nodes: EntitySummary[]; claims: ClaimSummary[];
  items: EntityDetail[]; nextCursor: string | null; hasMore: boolean;
};

// No module cache: every operation observes one public revision and rejects a change in flight.
export async function executeDiscoveryPlan(plan: Extract<DiscoveryPlan, { state: "ready" }>, after: string | null, signal: AbortSignal): Promise<PrototypeResult> {
  const before = await fetchDatasetRevision(signal);
  if (before.dataset !== "public-kg" || !before.revision) throw new ClientApiError("公開KGの版を確認できませんでした。再試行してください。", 409);
  let result: PrototypeResult;
  if (plan.operation === "names") {
    const response = await searchEntities(plan.q, signal);
    const items = z.array(entityDetailSchema).parse(response.items);
    result = { revision: before.revision, anchor: null, nodes: items, claims: [], items, nextCursor: null, hasMore: response.hasMore };
  } else if (plan.operation === "claims") {
    const c = plan.criteria;
    const params = new URLSearchParams({ q: c.q, revision: before.revision,
      ...(c.kind ? { kind: c.kind } : {}), ...(c.predicates?.length ? { predicates: c.predicates.join(",") } : {}),
      ...(c.contributionRole ? { contributionRole: c.contributionRole } : {}), ...(c.theme ? { theme: c.theme } : {}),
      ...(c.around ? { around: c.around } : {}), ...(after ? { after } : {}) });
    const response = await fetch("/api/discovery/claims?" + params, { signal });
    if (!response.ok) throw new ClientApiError("記録を取得できませんでした。", response.status);
    const data = neighborsSchema.omit({ centerId: true }).parse(await response.json());
    if (data.revision !== before.revision) throw new ClientApiError("公開KGの版が変わりました。", 409);
    result = { revision: data.revision, anchor: null, nodes: data.nodes, claims: data.claims, items: [], nextCursor: data.page.nextCursor, hasMore: data.page.hasMore };
  } else {
    const [entity, raw] = await Promise.all([
      fetchEntity(plan.anchorId, signal),
      fetchNeighbors(plan.anchorId, after, signal, plan.predicate ? [plan.predicate] : null, plan.role ? [plan.role] : null, null, null, before.revision),
    ]);
    const anchor = entityDetailSchema.parse(entity.entity), response = neighborsSchema.parse(raw);
    if (anchor.id !== plan.anchorId || response.centerId !== plan.anchorId || response.revision !== before.revision) throw new ClientApiError("公開KGの版が変わりました。先頭から再取得してください。", 409);
    result = { revision: before.revision, anchor, nodes: response.nodes, claims: response.claims, items: [], nextCursor: response.page.nextCursor, hasMore: response.page.hasMore };
  }
  const afterRead = await fetchDatasetRevision(signal);
  if (afterRead.dataset !== before.dataset || afterRead.revision !== before.revision) throw new ClientApiError("公開KGの版が変わりました。先頭から再取得してください。", 409);
  signal.throwIfAborted();
  return result;
}
export function usePrototypeQuery(plan: DiscoveryPlan, after: string | null, composing = false) {
  const [attempt, setAttempt] = useState(0);
  const planKey = JSON.stringify(plan);
  const key = JSON.stringify([planKey, after, attempt]);
  const [state, setState] = useState<{ key: string; result?: PrototypeResult; error?: string; conflict?: boolean }>({ key: "" });
  useEffect(() => {
    const resolved = JSON.parse(planKey) as DiscoveryPlan;
    if (resolved.state !== "ready" || composing) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await executeDiscoveryPlan(resolved, after, controller.signal);
        if (!controller.signal.aborted) setState({ key, result });
      } catch (error) {
        if (!controller.signal.aborted) setState(old => ({ key, result: old.result, error: errorMessage(error), conflict: error instanceof ClientApiError && error.status === 409 }));
      }
    }, resolved.operation === "names" || resolved.operation === "claims" && resolved.criteria.q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [planKey, after, key, composing]);
  const active = plan.state === "ready", current = active && !composing && state.key === key;
  return {
    result: current && !state.error ? state.result : undefined,
    previous: state.result, error: current ? state.error : undefined,
    loading: active && !current, conflict: current && state.conflict, key,
    retry: () => setAttempt(n => n + 1),
  };
}
