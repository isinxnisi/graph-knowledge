import type { EventRoleFilter, OrganizationPositionFilter, ContributionRoleFilter, PredicateFilter } from "../domain/exploration";
import type { EntityOverviewResponse, ClaimResponse, EntityResponse, EntitySearchResponse, NeighborsResponse } from "../domain/api";

export class ClientApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Bound the entire read, including the response body, so retry stays reachable.
export const CLIENT_REQUEST_TIMEOUT_MS = 15_000;

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
    const body = await response.json().catch(() => null);
    // json() can reject on abort too; do not report that as malformed JSON.
    controller.signal.throwIfAborted();
    if (!response.ok) {
      const message = response.status === 503 ? "データベースを利用できません。時間をおいて再試行してください。"
        : typeof body?.error?.message === "string" ? body.error.message : "情報を取得できませんでした。再試行してください。";
      throw new ClientApiError(message, response.status);
    }
    if (body === null) throw new ClientApiError("応答を読み取れませんでした。再試行してください。", response.status);
    return body as T;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw new ClientApiError("取得に時間がかかりすぎたため中断しました。再試行してください。", 0);
    if (error instanceof ClientApiError) throw error;
    throw new ClientApiError("通信に失敗しました。再試行してください。", 0);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export const searchEntities = (q: string, signal: AbortSignal, kind: import("../domain/search").SearchKind | null = null) => get<EntitySearchResponse>(`/api/entities?${new URLSearchParams({ q, ...(kind === null ? {} : { kind }) })}`, signal);
export const discoverEntities = (params: URLSearchParams, signal: AbortSignal) => get<import("../domain/api").DiscoverySearchResponse>(`/api/discovery/entities?${params}`, signal);
export const fetchEntity = (id: string, signal: AbortSignal) => get<EntityResponse>(`/api/entities/${encodeURIComponent(id)}`, signal);
export const fetchClaim = (id: string, signal: AbortSignal, revision: string | null = null) => get<ClaimResponse>(`/api/claims/${encodeURIComponent(id)}${revision ? `?${new URLSearchParams({ revision })}` : ""}`, signal);
export const fetchDatasetRevision = (signal: AbortSignal) => get<{ dataset: string; revision: string | null }>("/api/dataset", signal);
export const fetchNeighbors = (id: string, after: string | null, signal: AbortSignal, predicates: PredicateFilter = null, roles: ContributionRoleFilter = null, positions: OrganizationPositionFilter = null, eventRoles: EventRoleFilter = null, revision: string | null = null) => {
  const params = new URLSearchParams();
  if (revision) params.set("revision", revision);
  if (eventRoles !== null) params.set("eventRoles", eventRoles.join(","));
  if (after !== null) params.set("after", after);
  if (positions !== null) params.set("organizationPositions", positions.join(","));
  if (roles !== null) params.set("contributionRoles", roles.join(","));
  if (predicates !== null) params.set("predicates", predicates.join(","));
  return get<NeighborsResponse>(`/api/entities/${encodeURIComponent(id)}/neighbors${params.size ? `?${params}` : ""}`, signal);
};
export const errorMessage = (error: unknown) => error instanceof ClientApiError ? error.message : "情報を取得できませんでした。再試行してください。";

export const fetchOverview = (id: string, signal: AbortSignal) => get<EntityOverviewResponse>(`/api/entities/${encodeURIComponent(id)}/overview`, signal);

export const fetchDiscoveryPaths = (params: URLSearchParams, signal: AbortSignal) => get<unknown>(`/api/discovery/paths?${params}`, signal);
