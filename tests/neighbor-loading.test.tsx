// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import NeighborLoading from "../components/NeighborLoading";
import { captureWorkspace, rebuildWorkspace } from "../lib/client/saved-workspace";
import { emptyGraph, mergePage } from "../lib/client/graph-state";
import { encodeExploration, decodeExploration } from "../lib/client/exploration-url";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { NeighborsResponse } from "../lib/domain/api";
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("200ms未満は点滅せず、遅い取得では対象・初回／追加・操作可能範囲を示す", () => {
  vi.useFakeTimers(); const { rerender, unmount } = render(<NeighborLoading key="1" name="PLUTO" more={false} />);
  act(() => vi.advanceTimersByTime(199)); expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(1)); expect(screen.getByRole("status").textContent).toContain("PLUTO");
  expect(screen.getByRole("status").textContent).toContain("表示済みのGraphは操作できます");
  rerender(<NeighborLoading key="2" name="浦沢直樹" more />); expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(200)); expect(screen.getByRole("status").textContent).toContain("続きを取得中");
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
it("短時間の完了・中断で待機中の表示を残さない", () => {
  vi.useFakeTimers(); const { unmount } = render(<NeighborLoading name="PLUTO" more={false} />);
  act(() => vi.advanceTimersByTime(50)); unmount(); act(() => vi.advanceTimersByTime(500)); expect(screen.queryByRole("status")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it("旧保存URLはID順、新保存URLは評価順で復元し、復元後も方式を保持する", async () => {
  const page = { ...examples.neighbors, revision: "r1", ranking: { mode: "bounded", candidateLimit: 200, connectionLimit: 50, evaluatedCandidates: 3, unevaluatedCandidates: false, cappedCandidates: 0 } } as NeighborsResponse;
  const graph = mergePage(emptyGraph(), page);
  const saved = captureWorkspace("public-kg", "ranked", graph, null);
  expect(saved.execution).toMatchObject({ order: "bounded" });
  const decoded = decodeExploration(encodeExploration(saved), page.centerId, "public-kg");
  expect(decoded.execution).toMatchObject({ order: "bounded" });
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    const body = String(url).includes("neighbors") ? page : String(url).includes("dataset") ? { dataset: "public-kg", revision: "r1" } : { entity: page.nodes.find(n => n.id === page.centerId) };
    return new Response(JSON.stringify(body));
  }));
  const current = await rebuildWorkspace(decoded, new AbortController().signal);
  expect(current.graph.neighborOrder).toBe("bounded");
  expect(calls.find(url => url.includes("neighbors"))).not.toContain("order=id");
  calls.length = 0;
  if (decoded.execution.type !== "adjacent") throw Error();
  delete decoded.execution.order;
  const old = await rebuildWorkspace(decoded, new AbortController().signal);
  expect(old.graph.neighborOrder).toBe("id");
  expect(calls.find(url => url.includes("neighbors"))).toContain("order=id");
  expect(captureWorkspace("public-kg", "restored", current.graph, null).execution).toMatchObject({ order: "bounded" });
});
