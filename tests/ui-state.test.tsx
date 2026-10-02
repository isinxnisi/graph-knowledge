// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { entityLabel, edgeRoutes } from "../lib/client/graph-presentation";
import { emptyGraph, mergePage } from "../lib/client/graph-state";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import { ClaimCard } from "../components/ClaimDetails";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { ClaimDetail, NeighborsResponse, EntitySummary } from "../lib/domain/api";
import { fetchNeighbors } from "../lib/client/api";
vi.mock("../lib/client/api", () => ({ fetchNeighbors: vi.fn(), fetchClaim: vi.fn(), errorMessage: () => "取得失敗" }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const page = examples.neighbors as NeighborsResponse;
const root = page.nodes[0];
const entity = (id: string): EntitySummary => ({ ...root, id });
const deferred = () => { let resolve!: (p: NeighborsResponse) => void; const promise = new Promise<NeighborsResponse>((r) => { resolve = r; }); return { promise, resolve }; };
describe("ページのマージ", () => {
  it("循環・再取得をIDで重複排除する", () => {
    const first = mergePage(emptyGraph(), page); const second = mergePage(first, page);
    expect(Object.keys(second.nodes)).toHaveLength(page.nodes.length);
    expect(Object.keys(second.claims)).toHaveLength(page.claims.length);
  });
  it.each(["nodes", "claims"] as const)("%sの上限まで受理し、超過ページ全体とcursorを維持する", (kind) => {
    const count = kind === "nodes" ? 100 : 200;
    const accepted: NeighborsResponse = { ...page, nodes: [root], claims: [], page: { nextCursor: "saved", hasMore: true } };
    if (kind === "nodes") accepted.nodes = Array.from({ length: count }, (_, i) => entity(String(i)));
    else accepted.claims = Array.from({ length: count }, (_, i) => ({ ...page.claims[0], id: String(i) }));
    const first = mergePage(emptyGraph(), accepted);
    expect(Object.keys(first[kind])).toHaveLength(count);
    const overflow = { ...accepted, nodes: kind === "nodes" ? [...accepted.nodes, entity("overflow")] : accepted.nodes,
      claims: kind === "claims" ? [...accepted.claims, { ...page.claims[0], id: "overflow" }] : [], page: { nextCursor: "advanced", hasMore: false } };
    const rejected = mergePage(first, overflow);
    expect(rejected.nodes).toBe(first.nodes); expect(rejected.claims).toBe(first.claims);
    expect(rejected.expansions[page.centerId]).toMatchObject({ nextCursor: "saved", hasMore: true, blocked: true });
  });
});
describe("探索の通信", () => {
  it("同じEntityの同時取得と取得済みの再展開を抑止する", async () => {
    const d = deferred(); vi.mocked(fetchNeighbors).mockReturnValue(d.promise);
    const { result } = renderHook(useGraphExplorer);
    act(() => { result.current.chooseRoot(root); result.current.selectEntity(root.id); result.current.selectEntity(root.id); });
    expect(fetchNeighbors).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(page); await d.promise; });
    act(() => result.current.selectEntity(root.id)); expect(fetchNeighbors).toHaveBeenCalledTimes(1);
  });
  it("中心切替で古い応答を除外する", async () => {
    const old = deferred(); const next = deferred(); vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result } = renderHook(useGraphExplorer); const other = page.nodes[1];
    act(() => result.current.chooseRoot(root)); act(() => result.current.chooseRoot(other));
    await act(async () => { old.resolve(page); await old.promise; });
    expect(Object.keys(result.current.graph.nodes)).toEqual([other.id]);
    await act(async () => { next.resolve({ centerId: other.id, nodes: [other], claims: [], page: { nextCursor: null, hasMore: false } }); await next.promise; });
    expect(result.current.graph.centerId).toBe(other.id);
  });
  it("別Entityの並行応答を失わずマージする", async () => {
    vi.mocked(fetchNeighbors).mockResolvedValueOnce(page);
    const a = deferred(); const b = deferred(); const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root)); await waitFor(() => expect(result.current.graph.expansions[root.id].expanded).toBe(true));
    vi.mocked(fetchNeighbors).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const ids = page.nodes.slice(1, 3).map((n) => n.id);
    act(() => { result.current.selectEntity(ids[0]); result.current.selectEntity(ids[1]); });
    await act(async () => { a.resolve({ ...page, centerId: ids[0], nodes: [entity("new-a")], claims: [] }); await a.promise; });
    await act(async () => { b.resolve({ ...page, centerId: ids[1], nodes: [entity("new-b")], claims: [] }); await b.promise; });
    expect(result.current.graph.nodes["new-a"]).toBeDefined(); expect(result.current.graph.nodes["new-b"]).toBeDefined();
  });
  it("追加取得失敗でcursorを維持し再試行できる", async () => {
    vi.mocked(fetchNeighbors).mockResolvedValueOnce({ ...page, page: { nextCursor: "saved", hasMore: true } }).mockRejectedValueOnce(new Error("DB" )).mockResolvedValueOnce(page);
    const { result } = renderHook(useGraphExplorer); act(() => result.current.chooseRoot(root));
    await waitFor(() => expect(result.current.graph.expansions[root.id].expanded).toBe(true));
    await act(async () => { await result.current.expand(root.id, true); });
    expect(result.current.graph.expansions[root.id]).toMatchObject({ nextCursor: "saved", error: "取得失敗", hasMore: true });
    await act(async () => { await result.current.expand(root.id, true); });
    expect(result.current.graph.expansions[root.id].error).toBeNull();
    expect(vi.mocked(fetchNeighbors).mock.calls[2][1]).toBe("saved");
  });
});
describe("主張カード", () => {
  it("複数出典、精度付き期間、参照箇所と無効なデモURLを表示する", () => {
    render(<ClaimCard claim={examples.claim.claim as ClaimDetail} nodes={Object.fromEntries(page.nodes.map((n) => [n.id,n]))} title="主張" />);
    expect(screen.getAllByRole("region", { name: "出典と参照箇所" })).toHaveLength(2);
    expect(screen.getByText(/2001年.*2003年/)).toBeDefined(); expect(screen.queryByRole("link")).toBeNull();
  });
  it("否定と出典未確認を文字で表示する", () => {
    const claim = { ...examples.claim.claim, polarity: "denied", sourceCount: 0, citations: [] } as ClaimDetail;
    render(<ClaimCard claim={claim} nodes={{}} title="主張" />);
    expect(screen.getByText("否定する主張")).toBeDefined(); expect(screen.getByText("出典未確認")).toBeDefined();
  });
});

describe("Graphの表示補助", () => {
  it("同名が揃ったときだけ説明を表示する", () => {
    const a = { ...root, id: "a", name: "佐藤アキ", description: "漫画家" };
    const b = { ...a, id: "b", description: "編集者、同名の漫画家とは別人" };
    expect(entityLabel(a, { a })).toBe("佐藤アキ");
    expect(entityLabel(a, { a, b })).toBe("佐藤アキ\n漫画家");
    expect(entityLabel(b, { a, b })).toBe("佐藤アキ\n編集者");
  });
  it("同名で説明も同じ場合はIDを補助表示する", () => {
    const a = { ...root, id: "aaaaaaaa-1" }; const b = { ...root, id: "bbbbbbbb-2" };
    expect(entityLabel(a, { a, b })).toContain("aaaaaaaa");
    expect(entityLabel(b, { a, b })).toContain("bbbbbbbb");
  });
  it("並行・双方向Claimを統合せず、別曲線に割り当てる", () => {
    const a = { ...page.claims[0], id: "a", subjectId: "1", objectId: "2" };
    const b = { ...a, id: "b" }; const c = { ...a, id: "c", subjectId: "2", objectId: "1" };
    const routes = edgeRoutes({ a, b, c });
    expect(Object.keys(routes)).toHaveLength(3);
    expect([routes.a.distance, routes.b.distance, -routes.c.distance]).toEqual([-320, 0, 320]);
  });
});


describe("実fixtureのASSISTANT_OF並行Claim", () => {
  it("肯定2件・否定1件を別の経路と期間付きラベルで表示する", () => {
    const claims = page.claims.filter((claim) => claim.predicate === "ASSISTANT_OF");
    expect(claims).toHaveLength(3);
    const routes = edgeRoutes(Object.fromEntries(claims.map((claim) => [claim.id, claim])));
    const distances = claims.map((claim) => routes[claim.id].distance).sort((a,b) => a-b);
    expect(distances).toEqual([-320, 0, 320]);
    expect(claims.filter((claim) => claim.polarity === "affirmed")).toHaveLength(2);
    expect(new Set(claims.map((claim) => routes[claim.id].label)).size).toBe(3);
    for (const claim of claims) {
      expect(routes[claim.id].label).toContain(claim.polarity === "denied" ? "否定" : "肯定");
      expect(routes[claim.id].label).toContain(claim.period.from!.value);
      expect(routes[claim.id].label).toContain(claim.period.to!.value);
      expect(routes[claim.id].weight).toBe(0.5);
    }
  });
});
