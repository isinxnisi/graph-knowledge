// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { CLIENT_REQUEST_TIMEOUT_MS, ClientApiError, fetchClaim, fetchEntity, fetchNeighbors, fetchOverview, searchEntities } from "../lib/client/api";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { useClaimDetails } from "../lib/client/use-claim-details";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { EntitySummary } from "../lib/domain/api";

const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const timeoutMessage = "取得に時間がかかりすぎたため中断しました。再試行してください。";
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}
const hangingFetch: typeof fetch = (_input, init) => untilAborted(init!.signal!);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("クライアントの取得期限", () => {
  it.each([
    ["検索", (signal: AbortSignal) => searchEntities("青葉", signal)],
    ["対象", (signal: AbortSignal) => fetchEntity("entity", signal)],
    ["近傍", (signal: AbortSignal) => fetchNeighbors("entity", null, signal)],
    ["主張", (signal: AbortSignal) => fetchClaim("claim", signal)],
    ["概要", (signal: AbortSignal) => fetchOverview("entity", signal)],
  ] as const)("%sの応答待ちを打ち切り、呼び出し元を取消状態にしない", async (_name, read) => {
    fetchMock.mockImplementation(hangingFetch);
    const owner = new AbortController();
    const result = read(owner.signal);
    const rejected = expect(result).rejects.toMatchObject({ message: timeoutMessage, status: 0 });
    await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(owner.signal.aborted).toBe(false);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ヘッダー到着後の本文待ちも同じ期限で打ち切る", async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      await new Promise(resolve => setTimeout(resolve, 5_000));
      const result = response({});
      vi.spyOn(result, "json").mockImplementation(() => untilAborted(init!.signal!));
      return result;
    });
    const result = fetchClaim("claim", new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ message: timeoutMessage });
    await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("明示取消は元の理由を保ち、本文待ちの取消でもタイムアウト扱いしない", async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      const result = response({});
      vi.spyOn(result, "json").mockImplementation(() => untilAborted(init!.signal!));
      return result;
    });
    const owner = new AbortController();
    const remove = vi.spyOn(owner.signal, "removeEventListener");
    const result = fetchEntity("entity", owner.signal);
    const reason = new DOMException("対象切替", "AbortError");
    const rejected = expect(result).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(1);
    owner.abort(reason);
    await rejected;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("取消済みの要求は通信やタイマーを開始しない", async () => {
    const owner = new AbortController();
    owner.abort();
    await expect(fetchEntity("entity", owner.signal)).rejects.toBe(owner.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 404, 503])("HTTP %sの完了時に期限と取消リスナーを解放する", async status => {
    fetchMock.mockResolvedValue(response({ error: { message: "対象なし" } }, status));
    const owner = new AbortController();
    const remove = vi.spyOn(owner.signal, "removeEventListener");
    const result = fetchEntity("entity", owner.signal);
    if (status === 200) await expect(result).resolves.toEqual({ error: { message: "対象なし" } });
    else await expect(result).rejects.toMatchObject({ status });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    owner.abort();
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(false);
  });

  it("不正JSONと通信失敗の既存メッセージを維持する", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid"));
    await expect(fetchEntity("entity", new AbortController().signal)).rejects.toThrow("応答を読み取れませんでした");
    fetchMock.mockRejectedValueOnce(new TypeError("network failure"));
    await expect(fetchEntity("entity", new AbortController().signal)).rejects.toEqual(new ClientApiError("通信に失敗しました。再試行してください。", 0));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("取得期限後の探索復帰", () => {
  it("続きのタイムアウト後も受理ページと条件を維持し、同じcursorで再試行できる", async () => {
    const root = examples.neighbors.nodes[0] as EntitySummary;
    const first = { ...examples.neighbors, claims: examples.neighbors.claims.filter(claim => claim.predicate === "ASSISTANT_OF"), page: { hasMore: true, nextCursor: "accepted-cursor" } };
    fetchMock.mockResolvedValueOnce(response(first)).mockImplementationOnce(hangingFetch).mockResolvedValueOnce(response({ ...first, claims: [], page: { hasMore: false, nextCursor: null } }));
    const { result } = renderHook(useGraphExplorer);
    await act(async () => { result.current.changePredicates(["ASSISTANT_OF"]); result.current.chooseRoot(root); });
    const accepted = result.current.graph;
    let pending!: Promise<void>;
    act(() => { pending = result.current.expand(root.id, true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS); await pending; });
    expect(result.current.graph.expansions[root.id]).toMatchObject({ loading: false, error: timeoutMessage, nextCursor: "accepted-cursor", hasMore: true });
    expect(result.current.graph.nodes).toEqual(accepted.nodes);
    expect(result.current.graph.claims).toEqual(accepted.claims);
    expect(result.current.graph.expansions[root.id].pages).toEqual(accepted.expansions[root.id].pages);
    expect(result.current.selection).toEqual({ kind: "entity", id: root.id });
    await act(async () => { await result.current.expand(root.id, true); });
    expect(result.current.graph.expansions[root.id]).toMatchObject({ loading: false, error: null, hasMore: false });
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0]);
    expect(String(fetchMock.mock.calls[2][0])).toContain("after=accepted-cursor&predicates=ASSISTANT_OF");
  });

  it("関連主張の一件がタイムアウトしても他の取得を続け、失敗分だけ再試行する", async () => {
    const primary = examples.claim;
    const [slowId, fastId] = primary.relatedClaimIds;
    let slowCalls = 0;
    fetchMock.mockImplementation((input, init) => {
      const id = String(input).split("/").at(-1)!;
      if (id === primary.claim.id) return Promise.resolve(response(primary));
      if (id === slowId && ++slowCalls === 1) return untilAborted(init!.signal!);
      return Promise.resolve(response({ claim: { ...primary.claim, id }, relatedClaimIds: [] }));
    });
    const { result } = renderHook(() => useClaimDetails(primary.claim.id));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.related.map(claim => claim.id)).toEqual([fastId]);
    expect(result.current.pending).toBe(1);
    const acceptedPrimary = result.current.primary;
    const acceptedRelated = result.current.related[0];
    await act(async () => { await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS); });
    expect(result.current).toMatchObject({ pending: 0, failedCount: 1 });
    const beforeRetry = fetchMock.mock.calls.length;
    await act(async () => { result.current.retry(); });
    expect(fetchMock.mock.calls.slice(beforeRetry).map(call => call[0])).toEqual([`/api/claims/${slowId}`]);
    expect(result.current).toMatchObject({ pending: 0, failedCount: 0 });
    expect(result.current.primary).toBe(acceptedPrimary);
    expect(result.current.related.find(claim => claim.id === fastId)).toBe(acceptedRelated);
    expect(result.current.related).toHaveLength(2);
  });
});
