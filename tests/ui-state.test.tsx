// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor, fireEvent } from "@testing-library/react";
import { restorationPositions } from "../lib/client/graph-view";
import { captureExploration } from "../lib/client/exploration-snapshot";
import { createNodeClickHandler } from "../lib/client/graph-interaction";
import { entityLabel, edgeRoutes, displayRelations, relationId } from "../lib/client/graph-presentation";
import { initialPositions, additionalPositions } from "../lib/client/graph-layout";
import { emptyGraph, mergePage, closeExpansion, reopenExpansion, projectGraph } from "../lib/client/graph-state";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import SearchPanel from "../components/SearchPanel";
import ClaimDetails, { ClaimCard } from "../components/ClaimDetails";
import examples from "../docs/API_RESPONSE_EXAMPLES.json";
import type { ClaimSummary, ClaimDetail, ClaimResponse, NeighborsResponse, EntitySummary } from "../lib/domain/api";
import { fetchNeighbors, fetchClaim, searchEntities } from "../lib/client/api";
vi.mock("../lib/client/api", () => ({ fetchNeighbors: vi.fn(), fetchClaim: vi.fn(), searchEntities: vi.fn(), errorMessage: () => "取得失敗" }));
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
    const accepted: NeighborsResponse = { ...page, nodes: [root, entity("target")], claims: [], page: { nextCursor: "saved", hasMore: true } };
    if (kind === "nodes") {
      accepted.nodes = [root, ...Array.from({ length: count - 1 }, (_, i) => entity(String(i)))];
      accepted.claims = accepted.nodes.slice(1).map((node, i) => ({ ...page.claims[0], id: String(i), subjectId: root.id, objectId: node.id }));
    } else accepted.claims = Array.from({ length: count }, (_, i) => ({ ...page.claims[0], id: String(i), subjectId: root.id, objectId: "target" }));
    const first = mergePage(emptyGraph(), accepted);
    expect(Object.keys(first[kind])).toHaveLength(count);
    const overflow = { ...accepted, nodes: [...accepted.nodes, entity("overflow")],
      claims: [...accepted.claims, { ...page.claims[0], id: "overflow", subjectId: root.id, objectId: kind === "nodes" ? "overflow" : "target" }], page: { nextCursor: "advanced", hasMore: false } };
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
    await act(async () => { a.resolve({ ...page, centerId: ids[0], nodes: [entity("new-a")], claims: [{ ...page.claims[0], id: "new-a", subjectId: ids[0], objectId: "new-a" }] }); await a.promise; });
    await act(async () => { b.resolve({ ...page, centerId: ids[1], nodes: [entity("new-b")], claims: [{ ...page.claims[0], id: "new-b", subjectId: ids[1], objectId: "new-b" }] }); await b.promise; });
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
  it("同一関係は表示だけ集約し、逆方向と別predicateは弱い別曲線にする", () => {
    const a = { ...page.claims[0], id: "a", subjectId: "1", objectId: "2" };
    const b = { ...a, id: "b" }; const c = { ...a, id: "c", subjectId: "2", objectId: "1" };
    const d = { ...a, id: "d", predicate: "INFLUENCED_BY" as const };
    const relations = displayRelations({ a, b, c, d });
    expect(Object.keys(relations)).toHaveLength(3);
    expect(relations[relationId(a)].claimIds).toEqual(["a", "b"]);
    const routes = edgeRoutes(relations);
    expect(Object.values(routes).every((route) => Math.abs(route.distance) <= 115 && route.weight === 0.5)).toBe(true);
    expect(new Set([routes[relationId(a)].distance, -routes[relationId(c)].distance, routes[relationId(d)].distance]).size).toBe(3);
  });
  it("実fixtureの3 Claimを1 Relationにし、期間を出さず肯否の混在だけ示す", () => {
    const claims = Object.fromEntries(page.claims.map((claim) => [claim.id, claim]));
    const relations = displayRelations(claims);
    expect(Object.keys(relations)).toHaveLength(5);
    const relation = relations[relationId(page.claims.find((claim) => claim.predicate === "ASSISTANT_OF")!)];
    expect(relation.claimIds).toHaveLength(3);
    expect(relation.label).toBe("アシスタントだった\n異説あり");
    expect(edgeRoutes(relations)[relation.id].distance).toBe(0);
    expect(Object.keys(claims)).toHaveLength(7);
  });
  it("期間の違いだけでは異説とせず、肯定のみは通常、否定のみは否定表示にする", () => {
    const a = { ...page.claims[0], id: "a", polarity: "affirmed" as const };
    const b = { ...a, id: "b", period: { from: null, to: null } };
    expect(displayRelations({ a, b })[relationId(a)].label).not.toContain("異説");
    expect(displayRelations({ a })[relationId(a)].label).not.toContain("肯定");
    expect(displayRelations({ a: { ...a, polarity: "denied" } })[relationId(a)].label).toContain("否定");
    expect(displayRelations({ a, b })[relationId(a)].id).toBe(displayRelations({ a })[relationId(a)].id);
  });
  it("Relation詳細は未取得ページにある関連Claimも取得し、同格のカードで比較する", async () => {
    const primary = examples.claim;
    const related = primary.relatedClaimIds.map((id, index) => ({ ...primary.claim, id,
      polarity: index ? "denied" : "affirmed", citations: [], sourceCount: 0 } as ClaimDetail));
    vi.mocked(fetchClaim).mockImplementation(async (id) => id === primary.claim.id ? primary as ClaimResponse : { claim: related.find((claim) => claim.id === id)!, relatedClaimIds: [] });
    render(<ClaimDetails id={primary.claim.id} nodes={{}} mode="relation" />);
    await waitFor(() => expect(screen.getAllByTestId(/^claim-card-/)).toHaveLength(3));
    expect(screen.getByText("否定する主張")).toBeDefined();
    expect(screen.getAllByText("出典未確認")).toHaveLength(2);
    expect(screen.queryByText("選択した主張")).toBeNull();
    expect(fetchClaim).toHaveBeenCalledTimes(3);
  });
});

describe("Graphの配置", () => {
  it("初期配置は横書きの余白を確保し、縦に長い十字を避ける", () => {
    const positions = initialPositions("root", ["a", "b", "c", "d"]);
    expect(positions.root).toEqual({ x: 0, y: 0 });
    const points = Object.values(positions).slice(1);
    expect(points.every((point) => Math.abs(point.x) > 150 && Math.abs(point.y) > 100)).toBe(true);
    expect(Math.max(...points.map((p) => Math.abs(p.x)))).toBeGreaterThan(Math.max(...points.map((p) => Math.abs(p.y))));
    const short = initialPositions("root", ["a", "b", "c", "d"], 265);
    expect(Math.abs(short.a.y)).toBeLessThan(Math.abs(positions.a.y));
    expect(Math.abs(short.a.x)).toBeGreaterThan(Math.abs(positions.a.x));
  });
  it("追加Nodeは複数の接続先の近くへ置き、既存Nodeを移動しない", () => {
    const existing = { a: { x: -160, y: 0 }, b: { x: 160, y: 0 }, root: { x: 0, y: -220 } };
    const before = structuredClone(existing);
    const relations = displayRelations({ a: { ...page.claims[0], id: "a", subjectId: "a", objectId: "new" }, b: { ...page.claims[0], id: "b", subjectId: "b", objectId: "new" } });
    const result = additionalPositions(existing, ["new"], relations, "a");
    expect(existing).toEqual(before);
    for (const id of Object.keys(existing)) expect(result[id]).toEqual(existing[id as keyof typeof existing]);
    for (const id of ["a", "b"]) expect(Math.hypot(result.new.x - result[id].x, result.new.y - result[id].y)).toBeLessThan(400);
    expect(Math.abs(result.new.y)).toBeGreaterThan(100);
    expect(additionalPositions(existing, ["new"], relations, "a")).toEqual(result);
  });
  it("双方向曲線は距離で調整し上下限を守り、単独Relationは直線のまま", () => {
    const a = { ...page.claims[0], id: "a", subjectId: "a", objectId: "b" };
    const b = { ...a, id: "b", subjectId: "b", objectId: "a" };
    const relations = displayRelations({ a, b });
    const route = (span: number) => edgeRoutes(relations, { a: { x: 0, y: 0 }, b: { x: span, y: 0 } })[relationId(a)];
    expect(Math.abs(route(200).distance)).toBe(70);
    expect(Math.abs(route(300).distance)).toBe(96);
    expect(Math.abs(route(800).distance)).toBe(115);
    expect(edgeRoutes(displayRelations({ a }))[relationId(a)].distance).toBe(0);
  });
});

const link = (id: string, subjectId: string, objectId: string) => ({ ...page.claims[0], id, subjectId, objectId });
const localPage = (centerId: string, claims: NeighborsResponse["claims"], cursor: string | null = null): NeighborsResponse => ({
  centerId, nodes: [...new Set([centerId, ...claims.flatMap((claim) => [claim.subjectId, claim.objectId])])].map(entity), claims,
  page: { nextCursor: cursor, hasMore: !!cursor },
});
const branch = () => {
  let state = mergePage(emptyGraph(), localPage("A", [link("AB", "A", "B"), link("AD", "A", "D")]));
  state = mergePage(state, localPage("B", [link("BC", "B", "C")]));
  state = mergePage(state, localPage("C", [link("CE", "C", "E"), link("EC", "E", "C")]));
  return state;
};
describe("探索の開閉と所属", () => {
  it("孤立Entityの受理済み空ページを閉じても未取得にしない", () => {
    const isolated = mergePage(emptyGraph(), localPage("A", []));
    const closed = closeExpansion(isolated, "A");
    expect(closed.expansions.A).toMatchObject({ open: false, expanded: false, pages: [{ after: null, claimIds: [], nextCursor: null }] });
    const restored = reopenExpansion(closed, "A");
    expect(restored.expansions.A.expanded).toBe(true); expect(restored.claims).toEqual({}); expect(Object.keys(restored.nodes)).toEqual(["A"]);
  });
  it("切断循環を除き、再開で子孫とそのcursorを復元する", () => {
    const before = branch(); const closed = closeExpansion(before, "B");
    expect(Object.keys(closed.nodes).sort()).toEqual(["A", "B", "D"]);
    expect(closed.expansions.C).toMatchObject({ open: true, active: false, expanded: false });
    const reopened = reopenExpansion(closed, "B");
    expect(reopened.nodes).toEqual(before.nodes); expect(reopened.claims).toEqual(before.claims);
    expect(reopened.expansions.C.expanded).toBe(true);
  });
  it("明示的に閉じた子孫を再開しない", () => {
    const closed = closeExpansion(closeExpansion(branch(), "C"), "B");
    const reopened = reopenExpansion(closed, "B");
    expect(reopened.nodes.C).toBeDefined(); expect(reopened.nodes.E).toBeUndefined();
    expect(reopened.expansions.C.open).toBe(false);
  });
  it("合流したEntityと別展開が支える同一Claimを維持する", () => {
    const joined = mergePage(branch(), localPage("D", [link("DC", "D", "C"), link("BC", "B", "C")]));
    const closed = closeExpansion(joined, "B");
    expect(closed.nodes.E).toBeDefined(); expect(closed.claims.BC).toBeDefined();
    const cut = closeExpansion(closed, "D");
    expect(cut.nodes.C).toBeUndefined(); expect(cut.nodes.E).toBeUndefined();
  });
  it("起点を閉じても残し、子孫を休止する", () => {
    const closed = closeExpansion(branch(), "A");
    expect(Object.keys(closed.nodes)).toEqual(["A"]); expect(closed.claims).toEqual({});
    expect(reopenExpansion(closed, "A").nodes).toEqual(branch().nodes);
  });
  it("受理済み複数ページとcursorを閉じても維持する", () => {
    const first = mergePage(emptyGraph(), localPage("A", [link("AB", "A", "B")], "saved"));
    const second = mergePage(first, localPage("A", [link("AC", "A", "C")], "next"), "saved");
    const reopened = reopenExpansion(closeExpansion(second, "A"), "A");
    expect(reopened.expansions.A.pages).toHaveLength(2);
    expect(reopened.expansions.A).toMatchObject({ nextCursor: "next", hasMore: true });
    expect(Object.keys(reopened.claims).sort()).toEqual(["AB", "AC"]);
  });
  it("枝全体の復元が上限を超えると原子的に拒否し、閉じた後再開できる", () => {
    let state = mergePage(emptyGraph(), localPage("A", [link("AB", "A", "B"), link("AD", "A", "D")]));
    state = mergePage(state, localPage("B", Array.from({ length: 190 }, (_, i) => link(`b${i}`, "B", "C"))));
    state = closeExpansion(state, "B");
    state = mergePage(state, localPage("D", Array.from({ length: 190 }, (_, i) => link(`d${i}`, "D", "E"))));
    const rejected = reopenExpansion(state, "B");
    expect(rejected.nodes).toBe(state.nodes); expect(rejected.claims).toBe(state.claims);
    expect(rejected.expansions.B).toMatchObject({ open: false, blocked: true });
    const restored = reopenExpansion(closeExpansion(rejected, "D"), "B");
    expect(restored.expansions.B.expanded).toBe(true); expect(restored.claims.b0).toBeDefined();
  });
  it("キャッシュ予算を超える休止展開を所属・cursorごと破棄する", () => {
    let state = mergePage(emptyGraph(), localPage("A", Array.from({ length: 5 }, (_, i) => link(`root${i}`, "A", `B${i}`))));
    for (let i = 0; i < 5; i++) {
      state = mergePage(state, localPage(`B${i}`, Array.from({ length: 190 }, (_, j) => link(`${i}-${j}`, `B${i}`, `C${i}`)), "saved"));
      state = closeExpansion(state, `B${i}`);
    }
    expect(Object.keys(state.cacheClaims).length).toBeLessThanOrEqual(800);
    expect(state.expansions.B0).toBeUndefined(); expect(state.cacheNodes.C0).toBeUndefined();
    expect(state.nodes.B0).toBeDefined(); expect(state.expansions.B4.pages).toHaveLength(1);
  });
});
describe("開閉時の通信と選択", () => {
  it("再開は通信せず受理済みの枝を戻し、消失した選択Claimを解除する", async () => {
    vi.mocked(fetchNeighbors).mockResolvedValueOnce(page);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root));
    await waitFor(() => expect(result.current.graph.expansions[root.id].expanded).toBe(true));
    act(() => result.current.selectClaim(page.claims[0].id));
    act(() => result.current.close(root.id));
    expect(result.current.selection).toBeNull(); expect(Object.keys(result.current.graph.nodes)).toEqual([root.id]);
    await act(async () => { await result.current.expand(root.id); });
    expect(fetchNeighbors).toHaveBeenCalledTimes(1); expect(result.current.graph.claims[page.claims[0].id]).toBeDefined();
  });
  it("閉じた応答と古いfinallyは新しい要求を変更しない", async () => {
    const old = deferred(), fresh = deferred();
    vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root)); act(() => result.current.close(root.id));
    act(() => { void result.current.expand(root.id); });
    await act(async () => { old.resolve(page); await old.promise; });
    expect(result.current.graph.claims).toEqual({}); expect(result.current.graph.expansions[root.id].loading).toBe(true);
    act(() => result.current.selectEntity(root.id)); expect(fetchNeighbors).toHaveBeenCalledTimes(2);
    await act(async () => { fresh.resolve(page); await fresh.promise; });
    expect(result.current.graph.claims[page.claims[0].id]).toBeDefined();
  });
  it("祖先を閉じて到達不能な子孫の通信を破棄し、選択を起点へ戻す", async () => {
    const delayed = deferred();
    vi.mocked(fetchNeighbors).mockResolvedValueOnce(localPage("A", [link("AB", "A", "B")])).mockReturnValueOnce(delayed.promise);
    const { result } = renderHook(useGraphExplorer); act(() => result.current.chooseRoot(entity("A")));
    await waitFor(() => expect(result.current.graph.nodes.B).toBeDefined());
    act(() => result.current.selectEntity("B")); act(() => result.current.close("A"));
    expect(result.current.selection).toEqual({ kind: "entity", id: "A" });
    expect(result.current.graph.expansions.B).toMatchObject({ open: true, active: false, loading: false });
    await act(async () => { delayed.resolve(localPage("B", [link("BC", "B", "C")])); await delayed.promise; });
    await act(async () => { await result.current.expand("A"); });
    expect(result.current.graph.nodes.C).toBeUndefined(); expect(fetchNeighbors).toHaveBeenCalledTimes(2);
    act(() => result.current.selectEntity("B")); expect(fetchNeighbors).toHaveBeenCalledTimes(3);
  });
});


describe("Nodeのクリック判定", () => {
  const setup = (initial: string | null = "A") => {
    let selected = initial;
    const select = vi.fn((id: string) => { selected = id; });
    const toggle = vi.fn(), doubleClick = vi.fn();
    const handler = createNodeClickHandler({ isSelected: (id) => selected === id, select, toggle, doubleClick });
    return { ...handler, select, toggle, doubleClick, deselect: () => { selected = null; } };
  };
  it("未選択は即時選択し、選択中だけ300ms後に開閉する", () => {
    vi.useFakeTimers();
    try {
      const clicks = setup(null); clicks.click("A"); expect(clicks.select).toHaveBeenCalledWith("A");
      clicks.cancelPending(); vi.advanceTimersByTime(301); expect(clicks.toggle).not.toHaveBeenCalled();
      clicks.click("A"); vi.advanceTimersByTime(299); expect(clicks.toggle).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(clicks.toggle).toHaveBeenCalledExactlyOnceWith("A");
    } finally { vi.useRealTimers(); }
  });
  it.each([null, "A"])("ダブルクリックは開閉せず、別動作へ1回だけ渡す（選択=%s）", (initial) => {
    vi.useFakeTimers();
    try {
      const clicks = setup(initial); clicks.click("A"); if (initial === null) clicks.cancelPending();
      vi.advanceTimersByTime(100); clicks.click("A"); vi.advanceTimersByTime(500);
      expect(clicks.toggle).not.toHaveBeenCalled(); expect(clicks.doubleClick).toHaveBeenCalledExactlyOnceWith("A");
    } finally { vi.useRealTimers(); }
  });
  it("選択変更・他Node・破棄・ドラッグ時の取消で遅い開閉を残さない", () => {
    vi.useFakeTimers();
    try {
      const clicks = setup(); clicks.click("A"); clicks.deselect(); clicks.selectionChanged(null); vi.advanceTimersByTime(300);
      expect(clicks.toggle).not.toHaveBeenCalled();
      clicks.click("B"); vi.advanceTimersByTime(301); clicks.click("B"); clicks.click("C"); vi.advanceTimersByTime(300);
      expect(clicks.toggle).not.toHaveBeenCalled(); expect(clicks.select).toHaveBeenLastCalledWith("C");
      clicks.click("C"); clicks.cancel(); vi.advanceTimersByTime(300); expect(clicks.toggle).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});

describe("条件付き探索", () => {
  const filtered = { ...page, claims: page.claims.filter((claim) => claim.predicate === "ASSISTANT_OF") };
  it("条件変更で旧応答・cursor・枝を捨て、同条件の再適用は通信しない", async () => {
    const old = deferred(); vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockResolvedValueOnce(filtered);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root));
    const signal = vi.mocked(fetchNeighbors).mock.calls[0][2];
    act(() => result.current.changePredicates(["ASSISTANT_OF"]));
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(Object.keys(result.current.graph.claims)).toHaveLength(filtered.claims.length));
    await act(async () => { old.resolve(page); await old.promise; });
    expect(result.current.graph.conditionKey).toBe("ASSISTANT_OF");
    expect(Object.values(result.current.graph.claims).every((claim) => claim.predicate === "ASSISTANT_OF")).toBe(true);
    expect(fetchNeighbors).toHaveBeenLastCalledWith(root.id, null, expect.any(AbortSignal), ["ASSISTANT_OF"], null, null, null);
    act(() => result.current.changePredicates(["ASSISTANT_OF", "ASSISTANT_OF"]));
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
    act(() => result.current.close(root.id));
    const calls = vi.mocked(fetchNeighbors).mock.calls.length;
    act(() => result.current.toggleEntity(root.id));
    expect(fetchNeighbors).toHaveBeenCalledTimes(calls);
    expect(Object.keys(result.current.graph.claims)).toHaveLength(filtered.claims.length);
  });
  it("条件を起点変更でも維持し、空条件の受理済み空ページを復元する", async () => {
    vi.mocked(fetchNeighbors).mockImplementation(async (id) => ({ centerId: id, nodes: [entity(id)], claims: [], page: { nextCursor: null, hasMore: false } }));
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.changePredicates([]));
    act(() => result.current.chooseRoot(root));
    await waitFor(() => expect(result.current.graph.expansions[root.id]?.expanded).toBe(true));
    expect(fetchNeighbors).toHaveBeenLastCalledWith(root.id, null, expect.any(AbortSignal), [], null, null, null);
    act(() => result.current.close(root.id)); act(() => result.current.toggleEntity(root.id));
    expect(fetchNeighbors).toHaveBeenCalledTimes(1);
    act(() => result.current.chooseRoot(page.nodes[1]));
    expect(result.current.graph.predicates).toEqual([]);
  });
  it("別条件のページを受理せず、表示投影にも混ぜない", () => {
    const graph = { ...emptyGraph(), predicates: ["INFLUENCED_BY"] as const };
    expect(() => mergePage({ ...graph, predicates: ["INFLUENCED_BY"] }, page)).toThrow("Unexpected predicate");
    const all = mergePage(emptyGraph(), page);
    const projected = projectGraph({ ...all, predicates: ["INFLUENCED_BY"] });
    expect(Object.values(projected.claims).every((claim) => claim.predicate === "INFLUENCED_BY")).toBe(true);
  });
  it("条件内でも上限拒否でcursorを維持し、閉じた後に受理範囲を復元する", () => {
    const claim = page.claims.find((item) => item.predicate === "ASSISTANT_OF")!;
    const accepted = { ...page, claims: Array.from({ length: 200 }, (_, i) => ({ ...claim, id: String(i) })),
      page: { nextCursor: "condition-cursor", hasMore: true } };
    const first = mergePage({ ...emptyGraph(), predicates: ["ASSISTANT_OF"], conditionKey: "ASSISTANT_OF" }, accepted);
    const rejected = mergePage(first, { ...accepted, claims: [{ ...claim, id: "overflow" }], page: { nextCursor: null, hasMore: false } }, "condition-cursor");
    expect(rejected.expansions[root.id]).toMatchObject({ blocked: true, nextCursor: "condition-cursor", hasMore: true });
    expect(Object.keys(rejected.claims)).toHaveLength(200);
    const closed = closeExpansion(rejected, root.id);
    expect(Object.keys(closed.claims)).toHaveLength(0);
    expect(Object.keys(reopenExpansion(closed, root.id).claims)).toHaveLength(200);
  });
});

describe("制作Roleの条件・ページ・復元", () => {
  const work = { ...entity("role-work"), kind: "work" as const }, child = entity("role-child"), secondWork = { ...entity("role-work-second"), kind: "work" as const };
  const roleClaim = { ...page.claims[0], predicate: "CONTRIBUTED_TO" as const, contribution: { roleId: "SUPERVISION" as const, scope: null }, id: "role-claim", subjectId: root.id, objectId: work.id };
  const rolePage: NeighborsResponse = { centerId: root.id, nodes: [root, work], claims: [roleClaim], page: { nextCursor: "role-cursor", hasMore: true } };
  it("通信途中のRole変更は旧応答を捨て、再取得と再開に同じ条件を使う", async () => {
    const old = deferred(); vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockResolvedValueOnce(rolePage);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root));
    const signal = vi.mocked(fetchNeighbors).mock.calls[0][2];
    act(() => result.current.changePredicates(["CONTRIBUTED_TO"], ["SUPERVISION"]));
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.graph.claims[roleClaim.id]).toBeDefined());
    await act(async () => { old.resolve(page); await old.promise; });
    expect(Object.keys(result.current.graph.claims)).toEqual([roleClaim.id]);
    expect(fetchNeighbors).toHaveBeenLastCalledWith(root.id, null, expect.any(AbortSignal), ["CONTRIBUTED_TO"], ["SUPERVISION"], null, null);
    act(() => result.current.close(root.id)); act(() => result.current.toggleEntity(root.id));
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
    expect(result.current.graph.expansions[root.id].nextCursor).toBe("role-cursor");
  });
  it("受理と投影は別Roleを除外し、休止した子孫・循環を同条件で復元する", () => {
    let graph = { ...emptyGraph(), predicates: ["CONTRIBUTED_TO"] as ClaimSummary["predicate"][], contributionRoles: ["SUPERVISION"] as ("SUPERVISION")[] };
    const state = mergePage({ ...graph, contributionRoles: ["SUPERVISION"] }, rolePage);
    const next = mergePage(state, { centerId: work.id, nodes: [work, child], claims: [{ ...roleClaim, id: "child", subjectId: child.id, objectId: work.id }], page: { nextCursor: null, hasMore: false } });
    const branch = mergePage(next, { centerId: child.id, nodes: [child, secondWork], claims: [{ ...roleClaim, id: "cycle", subjectId: child.id, objectId: secondWork.id }], page: { nextCursor: null, hasMore: false } });
    const cycle = mergePage(branch, { centerId: secondWork.id, nodes: [secondWork, root], claims: [{ ...roleClaim, id: "return", subjectId: root.id, objectId: secondWork.id }], page: { nextCursor: null, hasMore: false } });
    expect(Object.keys(cycle.nodes)).toHaveLength(4);
    const closed = closeExpansion(cycle, root.id); expect(Object.keys(closed.nodes)).toEqual([root.id]);
    expect(Object.keys(reopenExpansion(closed, root.id).claims)).toHaveLength(4);
    expect(() => mergePage(state, { ...rolePage, claims: [{ ...roleClaim, contribution: { roleId: "PRODUCING", scope: null } }] })).toThrow();
    expect(Object.keys(projectGraph({ ...state, contributionRoles: ["PRODUCING"] }).claims)).toHaveLength(0);
    graph = { ...emptyGraph(), predicates: ["CONTRIBUTED_TO"], contributionRoles: ["SUPERVISION"] };
    const many = mergePage(graph, { ...rolePage, claims: Array.from({ length: 200 }, (_, i) => ({ ...roleClaim, id: `claim-${i}` })) });
    const rejected = mergePage(many, { ...rolePage, claims: [{ ...roleClaim, id: "overflow" }], page: { nextCursor: "advance", hasMore: false } }, "role-cursor");
    expect(Object.keys(rejected.claims)).toHaveLength(200); expect(rejected.expansions[root.id].nextCursor).toBe("role-cursor");
  });
});

describe("探索条件の入口とdraft", () => {
  it("種類のdraft・取消・精密条件との合成は明示適用まで外へ出ない", async () => {
    const { default: RelationFilter } = await import("../components/RelationFilter");
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    const onApply = vi.fn();
    render(<RelationFilter value={null} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("radio", { name: "関係の種類から選ぶ" }));
    expect(screen.getByTestId("draft-conditions").textContent).toContain("関係を表示しない");
    fireEvent.click(screen.getByRole("checkbox", { name: "特定開催回への参加" }));
    expect(screen.getByTestId("draft-conditions").textContent).toContain("特定開催回への参加");
    expect(screen.getByTestId("active-predicates").textContent).toContain("追加条件なし");
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    expect((screen.getByRole("radio", { name: "すべての関係" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "関係の種類から選ぶ" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "特定開催回への参加" }));
    fireEvent.click(screen.getByRole("button", { name: "参加上の立場を調整" }));
    fireEvent.click(screen.getByRole("radio", { name: "参加上の立場を指定する" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "会議議長" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(["PARTICIPATED_IN"], null, null, ["CHAIR"]);
  });
  it("個別Predicateの適用値をfacetへ丸めず、編集方式変更だけでは適用しない", async () => {
    const { default: RelationFilter } = await import("../components/RelationFilter");
    const onApply = vi.fn();
    render(<RelationFilter value={["ASSISTANT_OF", "INFLUENCED_BY"]} onApply={onApply} />);
    expect(screen.getByTestId("active-predicates").textContent).toContain("個別指定");
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    expect((screen.getByRole("checkbox", { name: "影響を受けた" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("heading", { name: "選んだ関係の追加条件" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "関係の種類から選ぶ" }));
    expect(screen.getByTestId("draft-conditions").textContent).toContain("関係を表示しない");
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByTestId("active-predicates").textContent).toContain("影響を受けた");
  });
  it("同じ具体条件の方式変更はdirtyにならず、三種類全部は無制限ではない", async () => {
    const { default: RelationFilter } = await import("../components/RelationFilter");
    const onApply = vi.fn();
    render(<RelationFilter value={["CONTRIBUTED_TO"]} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("radio", { name: "個別の関係を指定" }));
    expect((screen.getByRole("button", { name: "適用" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "関係の種類から選ぶ" }));
    fireEvent.click(screen.getByRole("button", { name: "この3種類をすべて選択" }));
    expect(screen.getByTestId("draft-conditions").textContent).not.toContain("すべての関係");
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(["AFFILIATED_WITH", "CONTRIBUTED_TO", "PARTICIPATED_IN"], null, null, null);
  });
  it("適用要約はRoleの作用対象と無指定・空集合を区別し、locale境界を保つ", async () => {
    const { conditionSummary } = await import("../lib/i18n/exploration-entry");
    expect(conditionSummary(null, null, "ja-JP")).toContain("追加条件なし");
    expect(conditionSummary([], null)).toBe("関係を表示しない");
    expect(conditionSummary(["CONTRIBUTED_TO", "INFLUENCED_BY"], ["PRODUCING"])).toBe("個別指定：制作に関わった（プロデュース） ／ 影響を受けた");
    expect(conditionSummary(null, [])).toContain("制作関与は表示しない");
    expect(conditionSummary(["INFLUENCED_BY"], null)).not.toContain("役割");
  });
  it("開く・編集・キャンセルは適用しない。再開時は確定値から開始", async () => {
    const { default: RelationFilter } = await import("../components/RelationFilter");
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    const onApply = vi.fn();
    const { fireEvent } = await import("@testing-library/react");
    render(<RelationFilter value={null} onApply={onApply} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    expect(screen.queryByRole("checkbox", { name: "監修" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "選択を解除" }));
    expect(screen.getByTestId("active-predicates").textContent).toContain("追加条件なし");
    expect(screen.getByTestId("draft-conditions").textContent).toContain("関係を表示しない");
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    expect((screen.getByRole("radio", { name: "すべての関係" }) as HTMLInputElement).checked).toBe(true);
  });
  it("役割無指定・全Role・空Roleを区別して明示適用する", async () => {
    const { default: RelationFilter } = await import("../components/RelationFilter");
    const { fireEvent } = await import("@testing-library/react");
    const onApply = vi.fn();
    render(<RelationFilter value={null} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "制作の役割を調整" }));
    fireEvent.click(screen.getByRole("radio", { name: "役割を指定する" }));
    expect(screen.getByText(/制作の関係は表示されません/)).toBeDefined();
    for (const name of ["脚本", "監修", "プロデュース", "ストーリー共同制作"]) fireEvent.click(screen.getByRole("checkbox", { name }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(null, ["PRODUCING", "SCRIPT_WRITING", "STORY_CO_CREATION", "SUPERVISION"], null, null);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "制作の役割を調整" }));
    fireEvent.click(screen.getByRole("radio", { name: "役割を指定する" }));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenLastCalledWith(null, [], null, null);
  });
});

describe("直前探索と原子的な起点切替", () => {
  it("条件と起点を一度に変え、受理済み範囲・選択・閉じた意図を復元する", async () => {
    vi.mocked(fetchNeighbors).mockResolvedValueOnce(page);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root));
    await waitFor(() => expect(result.current.graph.expansions[root.id].expanded).toBe(true));
    act(() => result.current.close(root.id));
    const saved = result.current.graph;
    const next = deferred(); vi.mocked(fetchNeighbors).mockReturnValueOnce(next.promise);
    const view = { positions: { [root.id]: { x: 12, y: 34 } }, pan: { x: 40, y: 50 }, zoom: 0.8, initialLayoutDone: true };
    const other = page.nodes[1];
    act(() => result.current.switchRoot(other, "broad", view));
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
    act(() => result.current.restorePrevious());
    expect(result.current.graph.centerId).toBe(root.id);
    expect(result.current.graph.expansions[root.id].open).toBe(false);
    expect(result.current.graph.cacheClaims).toEqual(saved.cacheClaims);
    expect(result.current.selection).toEqual({ kind: "entity", id: root.id });
    expect(result.current.viewRestoration?.view).toEqual(view);
    expect(result.current.previous).toBeNull();
    await act(async () => { next.resolve({ ...page, centerId: other.id }); await next.promise; });
    expect(result.current.graph.centerId).toBe(root.id); expect(fetchNeighbors).toHaveBeenCalledTimes(2);
  });
  it("同条件の空集合を維持し、広く見るでは解除し旧起点を取得しない", async () => {
    vi.mocked(fetchNeighbors).mockResolvedValue({ ...page, claims: [], nodes: [root] });
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.changePredicates([]));
    act(() => result.current.chooseRoot(root));
    await waitFor(() => expect(result.current.graph.expansions[root.id].expanded).toBe(true));
    const other = page.nodes[1];
    act(() => result.current.switchRoot(other, "same", null));
    expect(result.current.graph.predicates).toEqual([]);
    expect(vi.mocked(fetchNeighbors).mock.calls.at(-1)?.[0]).toBe(other.id);
    act(() => result.current.switchRoot(root, "broad", null));
    expect(result.current.graph.predicates).toBeNull();
    expect(vi.mocked(fetchNeighbors).mock.calls.at(-1)?.slice(3)).toEqual([null, null, null, null]);
  });
  it("通信中の保存はcontrollerを保存せず、復帰後に明示再試行できる", async () => {
    const old = deferred(), next = deferred();
    vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise).mockResolvedValueOnce(page);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(root));
    act(() => result.current.switchRoot(page.nodes[1], "broad", null));
    expect(vi.mocked(fetchNeighbors).mock.calls[0][2].aborted).toBe(true);
    act(() => result.current.restorePrevious());
    expect(result.current.graph.expansions[root.id]).toMatchObject({ loading: false, open: true, pages: [] });
    expect(result.current.graph.expansions[root.id].error).toContain("中断");
    await act(async () => { old.resolve(page); await old.promise; });
    expect(Object.keys(result.current.graph.claims)).toHaveLength(0);
    await act(async () => { await result.current.expand(root.id); });
    expect(Object.keys(result.current.graph.claims)).toHaveLength(page.claims.length);
    act(() => result.current.chooseRoot(root)); expect(result.current.previous).toBeNull();
  });
});

it("直前探索の保存は既存キャッシュ上限を超えず、座標もキャッシュ範囲へ限定する", () => {
  const graph = mergePage(emptyGraph(), page);
  const view = { positions: { [root.id]: { x: 1, y: 2 }, obsolete: { x: 3, y: 4 } }, pan: { x: 0, y: 0 }, zoom: 1, initialLayoutDone: true };
  expect(captureExploration(graph, null, view)?.view?.positions).toEqual({ [root.id]: { x: 1, y: 2 } });
  const cacheNodes = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [String(i), entity(String(i))]));
  expect(captureExploration({ ...graph, cacheNodes }, null, null)).toBeNull();
});

it("受理済み・未描画Nodeの復帰は保存座標を固定し、欠けたNodeだけ補完する", () => {
  const graph = mergePage(emptyGraph(), page);
  const view = { positions: { [root.id]: { x: 12, y: 34 } }, pan: { x: 5, y: 7 }, zoom: 0.8, initialLayoutDone: false };
  const positions = restorationPositions(graph, view);
  expect(positions[root.id]).toEqual(view.positions[root.id]);
  expect(Object.keys(positions).sort()).toEqual(Object.keys(graph.nodes).sort());
  for (const [id, point] of Object.entries(positions)) if (id !== root.id) expect(Math.hypot(point.x - 12, point.y - 34)).toBeGreaterThan(100);
  expect(restorationPositions(graph, { ...view, positions: {} })[root.id]).toEqual({ x: 0, y: 0 });
});


describe("一般Entity検索の境界", () => {
  it("候補の取得・種別変更では起点を選ばず、別名を提示して明示選択する", async () => {
    const choose = vi.fn();
    vi.mocked(searchEntities).mockResolvedValue({ items: [{ ...root, kind: "work", event: null, aliases: ["原語名"] }], hasMore: false });
    render(<SearchPanel onChoose={choose} />);
    fireEvent.change(screen.getByLabelText("名前・別名"), { target: { value: "原語名" } });
    fireEvent.change(screen.getByLabelText("検索対象"), { target: { value: "work" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    await screen.findByText("別名：原語名");
    expect(searchEntities).toHaveBeenCalledWith("原語名", expect.any(AbortSignal), "work");
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${root.name} —`) }));
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ kind: "work", event: null, aliases: ["原語名"] }));
  });
  it("種別変更時に旧検索を取消し、遅い旧応答を混ぜない", async () => {
    let resolve!: (value: import("../lib/domain/api").EntitySearchResponse) => void;
    vi.mocked(searchEntities).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<SearchPanel onChoose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("名前・別名"), { target: { value: "対象" } });
    fireEvent.click(screen.getByRole("button", { name: "検索" }));
    const signal = vi.mocked(searchEntities).mock.calls[0][1];
    fireEvent.change(screen.getByLabelText("検索対象"), { target: { value: "organization" } });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ items: [{ ...root, aliases: [], event: null }], hasMore: false }));
    expect(screen.queryByRole("button", { name: new RegExp(`^${root.name} —`) })).toBeNull();
  });
});

import StartExamples from "../components/StartExamples";
import { START_EXAMPLES } from "../lib/client/start-examples";
import demoFixture from "../fixtures/demo.json";
import pilotV1 from "../datasets/pilot-urasawa/v1/data.json";
import pilotV2 from "../datasets/pilot-urasawa/v2/data.json";
import scienceV2 from "../datasets/pilot-science/v2/data.json";
import scienceV1 from "../datasets/pilot-science/v1/data.json";
import { startExampleLabels } from "../lib/i18n/start-examples";

describe("固定の探索開始例", () => {
  it.each(Object.entries({ demo: demoFixture, "pilot-urasawa-v1": pilotV1, "pilot-urasawa-v2": pilotV2, "pilot-science-v1": scienceV1, "pilot-science-v2": scienceV2 }))("%sの入口は実在する凍結Entityだけを参照する", (mode, data) => {
    const entries = START_EXAMPLES[mode as keyof typeof START_EXAMPLES];
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    for (const entry of entries) expect(data.entities.find((entity) => entity.id === entry.id)).toMatchObject(entry);
  });
  it("同名候補を区別し、クリック前は起点選択しない", () => {
    const choose = vi.fn(); render(<StartExamples dataset="demo" onChoose={choose} />);
    expect(choose).not.toHaveBeenCalled();
    const names = screen.getAllByRole("button", { name: /佐藤アキから探索を開始/ });
    expect(names).toHaveLength(2); expect(names[0].getAttribute("aria-label")).not.toBe(names[1].getAttribute("aria-label"));
    fireEvent.click(names[1]); expect(choose).toHaveBeenCalledWith(START_EXAMPLES.demo.at(-1));
    expect(startExampleLabels("en").title).toBe(startExampleLabels("ja-JP").title);
  });
  it("開始例は既存の起点選択で条件を同時解除し、旧通信・旧ページを混在させない", async () => {
    const old = deferred(); vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...page, centerId: page.nodes[1].id });
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.changePredicates(["CONTRIBUTED_TO"], ["SUPERVISION"]));
    act(() => result.current.chooseRoot(root));
    expect(vi.mocked(fetchNeighbors).mock.calls[0].slice(3)).toEqual([["CONTRIBUTED_TO"], ["SUPERVISION"], null, null]);
    act(() => result.current.chooseRoot(page.nodes[1], true));
    expect(vi.mocked(fetchNeighbors).mock.calls[0][2].aborted).toBe(true);
    expect(vi.mocked(fetchNeighbors).mock.calls[1].slice(3)).toEqual([null, null, null, null]);
    expect(result.current.graph.centerId).toBe(page.nodes[1].id);
    expect(result.current.graph.predicates).toBeNull(); expect(result.current.graph.contributionRoles).toBeNull();
    expect(result.current.previous).toBeNull();
    await act(async () => { old.resolve(page); await old.promise; });
    expect(result.current.graph.centerId).toBe(page.nodes[1].id); expect(fetchNeighbors).toHaveBeenCalledTimes(2);
  });
});

describe("組織立場条件のdraft・通信・直前復帰", () => {
  it("別値集合の条件を明示適用し、取消では現在条件を保持する", async () => {
    const { default: RelationFilter } = await import("../components/RelationFilter");
    const onApply = vi.fn();
    render(<RelationFilter value={null} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "組織との関わりの立場を調整" }));
    fireEvent.click(screen.getByRole("radio", { name: "立場を指定する" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Visitor" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" })); expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "見る関係を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "組織との関わりの立場を調整" }));
    expect((screen.getByRole("radio", { name: "立場で絞らない" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "立場を指定する" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Associate professor" }));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(null, null, ["ASSOCIATE_PROFESSOR"], null);
  });
  it("条件変更で旧応答を拒否し、同条件起点と直前復帰へ立場条件を保持する", async () => {
    const old = deferred();
    const heisenberg = scienceV2.entities.find(e => e.id === "1530af15-129d-40bf-a1ca-ce8343dc7491")! as EntitySummary;
    const nbi = scienceV2.entities.find(e => e.id === "8e322435-4318-4ad0-835b-3f71d2537421")! as EntitySummary;
    const visitor = scienceV2.claims.find(c => c.organizationParticipation?.positionId === "VISITOR")!;
    const accepted: NeighborsResponse = { centerId: heisenberg.id, nodes: [heisenberg, nbi], claims: [{ ...visitor, sourceCount: 1, eventParticipation: null } as ClaimSummary], page: { hasMore: false, nextCursor: null } };
    vi.mocked(fetchNeighbors).mockReturnValueOnce(old.promise).mockResolvedValue(accepted);
    const { result } = renderHook(useGraphExplorer);
    act(() => result.current.chooseRoot(heisenberg));
    act(() => result.current.changePredicates(["AFFILIATED_WITH"], null, ["VISITOR"]));
    await waitFor(() => expect(result.current.graph.claims[visitor.id]).toBeDefined());
    expect(vi.mocked(fetchNeighbors).mock.calls[0][2].aborted).toBe(true);
    await act(async () => { old.resolve(page); await old.promise; });
    expect(result.current.graph.centerId).toBe(heisenberg.id); expect(result.current.graph.organizationPositions).toEqual(["VISITOR"]);
    vi.mocked(fetchNeighbors).mockResolvedValue({ ...accepted, centerId: nbi.id });
    act(() => result.current.switchRoot(nbi, "same", null));
    await waitFor(() => expect(result.current.graph.claims[visitor.id]).toBeDefined());
    expect(vi.mocked(fetchNeighbors).mock.calls.at(-1)?.slice(3)).toEqual([["AFFILIATED_WITH"], null, ["VISITOR"], null]);
    act(() => result.current.restorePrevious());
    expect(result.current.graph.centerId).toBe(heisenberg.id); expect(result.current.graph.organizationPositions).toEqual(["VISITOR"]);
    act(() => result.current.switchRoot(nbi, "broad", null)); expect(result.current.graph.organizationPositions).toBeNull();
  });
});
