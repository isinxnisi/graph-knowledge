import type { EventRoleFilter, OrganizationPositionFilter, ContributionRoleFilter, PredicateFilter } from "../domain/exploration";
import type { EntityOverviewResponse, ClaimResponse, EntityResponse, EntitySearchResponse, NeighborsResponse } from "../domain/api";

export class ClientApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  try {
    const response = await fetch(path, { signal, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = response.status === 503 ? "データベースを利用できません。時間をおいて再試行してください。"
        : typeof body?.error?.message === "string" ? body.error.message : "情報を取得できませんでした。再試行してください。";
      throw new ClientApiError(message, response.status);
    }
    if (body === null) throw new ClientApiError("応答を読み取れませんでした。再試行してください。", response.status);
    return body as T;
  } catch (error) {
    if (signal.aborted || error instanceof ClientApiError) throw error;
    throw new ClientApiError("通信に失敗しました。再試行してください。", 0);
  }
}

export const searchEntities = (q: string, signal: AbortSignal, kind: import("../domain/search").SearchKind | null = null) => get<EntitySearchResponse>(`/api/entities?${new URLSearchParams({ q, ...(kind === null ? {} : { kind }) })}`, signal);
export const fetchEntity = (id: string, signal: AbortSignal) => get<EntityResponse>(`/api/entities/${encodeURIComponent(id)}`, signal);
export const fetchClaim = (id: string, signal: AbortSignal) => get<ClaimResponse>(`/api/claims/${encodeURIComponent(id)}`, signal);
export const fetchNeighbors = (id: string, after: string | null, signal: AbortSignal, predicates: PredicateFilter = null, roles: ContributionRoleFilter = null, positions: OrganizationPositionFilter = null, eventRoles: EventRoleFilter = null) => {
  const params = new URLSearchParams();
  if (eventRoles !== null) params.set("eventRoles", eventRoles.join(","));
  if (after !== null) params.set("after", after);
  if (positions !== null) params.set("organizationPositions", positions.join(","));
  if (roles !== null) params.set("contributionRoles", roles.join(","));
  if (predicates !== null) params.set("predicates", predicates.join(","));
  return get<NeighborsResponse>(`/api/entities/${encodeURIComponent(id)}/neighbors${params.size ? `?${params}` : ""}`, signal);
};
export const errorMessage = (error: unknown) => error instanceof ClientApiError ? error.message : "情報を取得できませんでした。再試行してください。";

export const fetchOverview = (id: string, signal: AbortSignal) => get<EntityOverviewResponse>(`/api/entities/${encodeURIComponent(id)}/overview`, signal);
