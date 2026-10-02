import type { ClaimResponse, EntityResponse, EntitySearchResponse, NeighborsResponse } from "../domain/api";

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

export const searchPeople = (q: string, signal: AbortSignal) => get<EntitySearchResponse>(`/api/entities?${new URLSearchParams({ q })}`, signal);
export const fetchEntity = (id: string, signal: AbortSignal) => get<EntityResponse>(`/api/entities/${encodeURIComponent(id)}`, signal);
export const fetchClaim = (id: string, signal: AbortSignal) => get<ClaimResponse>(`/api/claims/${encodeURIComponent(id)}`, signal);
export const fetchNeighbors = (id: string, after: string | null, signal: AbortSignal) => {
  const params = new URLSearchParams();
  if (after !== null) params.set("after", after);
  return get<NeighborsResponse>(`/api/entities/${encodeURIComponent(id)}/neighbors${params.size ? `?${params}` : ""}`, signal);
};
export const errorMessage = (error: unknown) => error instanceof ClientApiError ? error.message : "情報を取得できませんでした。再試行してください。";
