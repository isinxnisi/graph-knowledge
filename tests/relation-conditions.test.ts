import { describe, expect, it } from "vitest";
import { PREDICATE_KEYS } from "../lib/domain/predicates";
import { CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { normalizeRelationCondition, relationConditionKey, relationAcceptsClaim } from "../lib/domain/relation-conditions";
import { validateRelationRoute } from "../lib/domain/relation-patterns";
import { targetSearchRequestSchema, targetSearchResponseSchema } from "../lib/domain/discovery-targets";
import type { ClaimSummary, EntitySummary } from "../lib/domain/api";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pattern = { version: 1, type: "pattern", pattern: { id: "other-works", revision: 1 }, polarity: "affirmed", contributionRoles: null } as const;
const adjacent = { version: 1, type: "adjacent", predicates: null, traversal: "either", polarity: "all-records", contributionRoles: null, organizationPositions: null, eventRoles: null } as const;
const claim = (n: number, object: number, extra: Partial<ClaimSummary> = {}): ClaimSummary => ({ id: id(n), subjectId: id(1), objectId: id(object), predicate: "CONTRIBUTED_TO", polarity: "affirmed", contribution: null, organizationParticipation: null, eventParticipation: null, period: { from: null, to: null }, sourceCount: 1, ...extra });
describe("共通関係条件v1", () => {
  it("canonical keyはproperty順／重複に依存せず、明示集合を無条件にしない", () => {
    const a = normalizeRelationCondition({ ...adjacent, predicates: [...PREDICATE_KEYS].reverse(), contributionRoles: ["DRAWING", "AUTHORSHIP", "DRAWING"] });
    expect(a).toMatchObject({ predicates: [...PREDICATE_KEYS].sort(), contributionRoles: ["AUTHORSHIP", "DRAWING"] });
    expect(relationConditionKey(a)).toBe(relationConditionKey({ ...a, contributionRoles: ["DRAWING", "AUTHORSHIP"] }));
    expect(relationConditionKey(a)).not.toBe(relationConditionKey(normalizeRelationCondition(adjacent)));
  });
  it.each([{}, { ...pattern, polarity: "all-records" }, { ...pattern, pattern: { id: "institution-bridge", revision: 1 } }, { ...pattern, pattern: { id: "other-works", revision: 99 } }, { ...pattern, stepRoles: [] }, { ...adjacent, traversal: "outgoing" }, { ...adjacent, predicates: ["AFFILIATED_WITH"], contributionRoles: [] }, { ...pattern, contributionRoles: ["WRITER"] }])("未知／未対応／不適合条件を拒否する: %j", input => { expect(() => normalizeRelationCondition(input)).toThrow(); });
  it("null・空集合・全Roleを区別し、他predicateの限定へ転用しない", () => {
    const unqualified = claim(100, 0), drawing = claim(101, 0, { contribution: { roleId: "DRAWING", scope: null } });
    expect(relationAcceptsClaim(normalizeRelationCondition(pattern), unqualified)).toBe(true);
    for (const roles of [[], [...CONTRIBUTION_ROLE_IDS]]) expect(relationAcceptsClaim(normalizeRelationCondition({ ...pattern, contributionRoles: roles }), unqualified)).toBe(false);
    expect(relationAcceptsClaim(normalizeRelationCondition({ ...pattern, contributionRoles: [...CONTRIBUTION_ROLE_IDS] }), drawing)).toBe(true);
    const affiliation = claim(103, 3, { predicate: "AFFILIATED_WITH" });
    expect(relationAcceptsClaim(normalizeRelationCondition({ ...adjacent, contributionRoles: [] }), affiliation)).toBe(true);
    expect(relationAcceptsClaim(normalizeRelationCondition(pattern), { ...drawing, polarity: "denied" })).toBe(false);
    expect(relationAcceptsClaim(normalizeRelationCondition(adjacent), { ...drawing, polarity: "denied" })).toBe(true);
  });
  it("正規方向・Role・肯否・全段・非再訪を元Claimで検証する", () => {
    const condition = normalizeRelationCondition({ ...pattern, contributionRoles: ["DRAWING", "AUTHORSHIP"] });
    const nodes = new Map<number, EntitySummary>([0, 1, 2].map(n => [n, { id: id(n), kind: n === 1 ? "person" : "work", name: String(n), description: null }]));
    const indexed = new Map([...nodes.values()].map(n => [n.id, n]));
    const a = claim(100, 0, { contribution: { roleId: "DRAWING", scope: null } }), b = claim(101, 2, { contribution: { roleId: "AUTHORSHIP", scope: null } });
    const route = { nodeIds: [0, 1, 2].map(id), claimIds: [a.id, b.id] };
    expect(validateRelationRoute(condition, id(0), route, indexed, new Map([a, b].map(c => [c.id, c])))).toEqual(route);
    for (const changed of [{ ...b, polarity: "denied" as const }, { ...b, subjectId: b.objectId, objectId: b.subjectId }, { ...b, contribution: null }]) expect(() => validateRelationRoute(condition, id(0), route, indexed, new Map([a, changed].map(c => [c.id, c])))).toThrow();
    expect(() => validateRelationRoute(condition, id(0), { ...route, nodeIds: [id(0), id(1), id(0)] }, indexed, new Map())).toThrow();
  });
  it("空欄を正規化し、patternのkindを解決、他条件を削除しない", () => {
    const input = { version: 1, dataset: "public-kg", criteria: { q: "　ＡＢＣ　", kind: null, relation: pattern }, revision: null, after: null };
    expect(targetSearchRequestSchema.parse(input).criteria).toMatchObject({ q: "abc", kind: "work" });
    expect(() => targetSearchRequestSchema.parse({ ...input, criteria: { ...input.criteria, kind: "person" } })).toThrow();
    expect(() => targetSearchRequestSchema.parse({ ...input, around: id(0) })).toThrow();
    expect(() => targetSearchRequestSchema.parse({ ...input, criteria: { ...input.criteria, q: "x".repeat(101) } })).toThrow();
  });
  it("証拠のrevision・条件・root・形の不一致を応答検証で拒否する", () => {
    const condition = normalizeRelationCondition(pattern);
    const response = { version: 1, dataset: "public-kg", revision: "r1", criteria: { q: "", kind: "work", relation: condition },
      items: [{ entity: { id: id(0), kind: "work", name: "Root", description: null, aliases: [], event: null }, match: { status: "matched", witness: { version: 1, dataset: "public-kg", revision: "r1", conditionKey: relationConditionKey(condition), route: { nodeIds: [0, 1, 2].map(id), claimIds: [100, 101].map(id) } } } }],
      page: { limit: 20, hasMore: false, nextCursor: null, total: { status: "not-counted" } } };
    expect(targetSearchResponseSchema.parse(response)).toEqual(response);
    for (const extra of [{ revision: "r2" }, { conditionKey: "wrong" }, { route: { nodeIds: [3, 1, 2].map(id), claimIds: [100, 101].map(id) } }]) expect(() => targetSearchResponseSchema.parse({ ...response, items: [{ ...response.items[0], match: { status: "matched", witness: { ...response.items[0].match.witness, ...extra } } }] })).toThrow();
  });
});
