// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GraphPath from "../components/GraphPath";
import { shortestVisiblePath } from "../lib/client/graph-path";
import { displayRelations, relationId } from "../lib/client/graph-presentation";
import type { ClaimSummary, EntitySummary } from "../lib/domain/api";

afterEach(cleanup);
const nodes: Record<string, EntitySummary> = Object.fromEntries(["a", "b", "c", "d"].map(id =>
  [id, { id, name: id.toUpperCase(), kind: "person", description: null }]));
const claim = (id: string, subjectId: string, objectId: string, polarity: ClaimSummary["polarity"] = "affirmed"): ClaimSummary => ({
  id, subjectId, objectId, predicate: "INFLUENCED_BY", polarity, period: { from: null, to: null },
  contribution: null, organizationParticipation: null, eventParticipation: null, sourceCount: 0,
});
const relations = (...claims: ClaimSummary[]) => displayRelations(Object.fromEntries(claims.map(c => [c.id, c])));

describe("表示中の最短経路", () => {
  it("逆向きの線と循環を辿り、直接の線が増えると短い経路を選ぶ", () => {
    const ab = claim("ab", "a", "b"), cb = claim("cb", "c", "b"), cd = claim("cd", "c", "d");
    const edges = relations(cd, cb, ab, claim("loop", "b", "b"));
    const before = structuredClone(edges);
    expect(shortestVisiblePath(nodes, edges, "a", "d")).toEqual([
      { fromId: "a", toId: "b", relationId: relationId(ab) },
      { fromId: "b", toId: "c", relationId: relationId(cb) },
      { fromId: "c", toId: "d", relationId: relationId(cd) },
    ]);
    const direct = claim("direct", "a", "d");
    expect(shortestVisiblePath(nodes, { ...edges, ...relations(direct) }, "a", "d")).toEqual([
      { fromId: "a", toId: "d", relationId: relationId(direct) },
    ]);
    expect(edges).toEqual(before);
  });
  it("同じ長さの複数経路と並行関係の選択は入力順やlabelに依存しない", () => {
    const claims = [claim("ab", "a", "b"), claim("bd", "b", "d"), claim("ac", "a", "c"), claim("cd", "c", "d"),
      { ...claim("parallel", "a", "b"), predicate: "ASSISTANT_OF" as const }];
    const expected = shortestVisiblePath(nodes, relations(...claims), "a", "d");
    const translated = Object.fromEntries(Object.entries(relations(...claims.reverse())).map(([id, value]) => [id, { ...value, label: "別の表示言語" }]));
    expect(shortestVisiblePath(nodes, translated, "a", "d")).toEqual(expected);
    expect(expected).toHaveLength(2);
    expect(expected?.[0].relationId).toBe(relationId(claims[0]));
  });
  it("同じ対象は0歩、孤立・未表示端点・非表示の線は経路なし", () => {
    const edges = relations(claim("ab", "a", "b"), claim("bc", "b", "c"));
    expect(shortestVisiblePath(nodes, edges, "a", "a")).toEqual([]);
    expect(shortestVisiblePath(nodes, edges, "a", "d")).toBeNull();
    expect(shortestVisiblePath(nodes, edges, "missing", "missing")).toBeNull();
    expect(shortestVisiblePath({ a: nodes.a, c: nodes.c }, edges, "a", "c")).toBeNull();
    expect(shortestVisiblePath(nodes, {}, "a", "c")).toBeNull();
  });
  it("否定や肯否混在を経路から除かず、RelationのClaim集合を維持する", () => {
    const ab = claim("ab", "a", "b"), bc = claim("bc", "b", "c", "denied");
    const edges = relations(ab, { ...ab, id: "ab-denied", polarity: "denied" }, bc);
    expect(shortestVisiblePath(nodes, edges, "a", "c")).toHaveLength(2);
    expect(edges[relationId(ab)].claimIds).toEqual(["ab", "ab-denied"]);
    expect(edges[relationId(ab)].polarity).toBe("mixed");
  });
});

describe("経路から根拠を読むUI", () => {
  it("向き・肯否を保ち、対応するRelation全体を開く", () => {
    const ab = claim("ab", "a", "b"), cb = claim("cb", "c", "b", "denied");
    const onRelation = vi.fn();
    render(<GraphPath nodes={nodes} relations={relations(ab, { ...ab, id: "denied", polarity: "denied" }, cb)} rootId="a" targetId="c" onRelation={onRelation} />);
    fireEvent.click(screen.getByText("表示中の最短経路（2関係）"));
    expect(screen.getByText(/直接の関係・因果関係/)).toBeDefined();
    expect(screen.getByText(/実際に操作した履歴ではありません/)).toBeDefined();
    expect(screen.getByText("→ 影響を受けた / 肯定・否定あり →")).toBeDefined();
    expect(screen.getByText("← 影響を受けた / （否定） ←")).toBeDefined();
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);
    expect(onRelation).toHaveBeenCalledExactlyOnceWith(relationId(cb));
  });
  it("Graph更新に追従し、消えた線を開く操作を残さない", () => {
    const ab = claim("ab", "a", "b"), bc = claim("bc", "b", "c");
    const props = { nodes, rootId: "a", targetId: "c", onRelation: vi.fn() };
    const { rerender } = render(<GraphPath {...props} relations={relations(ab, bc)} />);
    fireEvent.click(screen.getByText("表示中の最短経路（2関係）"));
    rerender(<GraphPath {...props} relations={relations(ab, bc, claim("ac", "a", "c"))} />);
    expect(screen.getByText("表示中の最短経路（1関係）")).toBeDefined();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    rerender(<GraphPath {...props} relations={relations(ab)} />);
    expect(screen.getByText(/表示中のGraph内には経路がありません/)).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<GraphPath {...props} targetId="a" relations={relations(ab)} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("同名対象を区別し、構造化済みの具体語を保持する", () => {
    const entities = { a: { ...nodes.a, name: "同名", description: "漫画家" }, b: { ...nodes.b, name: "同名", description: "作品" } };
    const contribution: ClaimSummary = { ...claim("ab", "a", "b"), predicate: "CONTRIBUTED_TO", contribution: { roleId: "SCRIPT_WRITING", scope: null } };
    render(<GraphPath nodes={entities} relations={relations(contribution)} rootId="a" targetId="b" onRelation={vi.fn()} />);
    fireEvent.click(screen.getByText("表示中の最短経路（1関係）"));
    expect(screen.getByText("同名 / 漫画家")).toBeDefined();
    expect(screen.getByText("同名 / 作品")).toBeDefined();
    expect(screen.getByText(/制作.*脚本/)).toBeDefined();
  });
});
