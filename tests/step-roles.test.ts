import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeRelationCondition, relationConditionKey, relationAcceptsClaim, relationConditionSchema } from "../lib/domain/relation-conditions";
import { validateRelationRoute, matchWitnessSchema, patternAcceptsRoot } from "../lib/domain/relation-patterns";
import { relationQueryParameters, OTHER_WORKS_EXISTS, OTHER_WORKS_PAGE, firstWitnessQuery } from "../lib/server/relation-pattern-execution";
import { targetSearchRequestSchema } from "../lib/domain/discovery-targets";
import { discoveryRelationHref, parseDiscoveryHandoff } from "../lib/client/discovery-relation-navigation";
import { decodeExploration } from "../lib/client/exploration-url";
import { emptyPatternGraph, mergePatternPage, openPatternNode } from "../lib/client/graph-state";
import { captureWorkspace, workspaceSchema } from "../lib/client/saved-workspace";
import { relationSummary } from "../lib/i18n/relation-condition";
import { page, route, relation as legacy } from "./pattern-graph-fixture";

const input = { ...legacy, pattern: { id: "other-works", revision: 3 }, stepRoles: [["AUTHORSHIP"], ["DRAWING"]] };
const condition = normalizeRelationCondition(input);
const r = route(100, 2), base = page([r]);
const claims = base.claims.map((c, i) => ({ ...c, contribution: { roleId: i === 0 ? "AUTHORSHIP" as const : "DRAWING" as const, scope: null } }));
const nodes = new Map(base.nodes.map(n => [n.id, n]));
const records = new Map(claims.map(c => [c.id, c]));

it("段別Roleを正規化し、段順・null・空集合と旧条件の意味を保存する", () => {
 expect(normalizeRelationCondition({ ...input, stepRoles: [["DRAWING", "AUTHORSHIP", "AUTHORSHIP"], []] })).toMatchObject({ stepRoles: [["AUTHORSHIP", "DRAWING"], []] });
 expect(relationConditionKey(legacy)).toBe(JSON.stringify(legacy));
 expect(relationConditionKey(condition)).not.toBe(relationConditionKey(normalizeRelationCondition({ ...input, stepRoles: [["DRAWING"], ["AUTHORSHIP"]] })));
 for (const invalid of [{ ...input, stepRoles: undefined }, { ...input, contributionRoles: ["DRAWING"] }, { ...input, stepRoles: [null] }, { ...input, pattern: { id: "other-works", revision: 2 } }, { ...input, pattern: { id: "other-works", revision: 4 } }, { ...input, stepRoles: [["UNAPPROVED_ROLE"], null] }]) expect(relationConditionSchema.safeParse(invalid).success).toBe(false);
 expect(relationConditionSchema.safeParse({ ...input, stepRoles: [null, []] }).success).toBe(true);
});
it("両段を別々の元Claimで検証し、逆段・否定・Roleなしを合成しない", () => {
 expect(validateRelationRoute(condition, r.nodeIds[0], r, nodes, records)).toEqual(r);
 const reversed = normalizeRelationCondition({ ...input, stepRoles: [["DRAWING"], ["AUTHORSHIP"]] });
 expect(() => validateRelationRoute(reversed, r.nodeIds[0], r, nodes, records)).toThrow();
 expect(relationAcceptsClaim(condition, claims[0])).toBe(false);
 expect(relationAcceptsClaim(condition, claims[0], 0)).toBe(true);
 expect(relationAcceptsClaim(condition, { ...claims[0], polarity: "denied" }, 0)).toBe(false);
 expect(relationAcceptsClaim(condition, { ...claims[0], contribution: { roleId: null, scope: null } }, 0)).toBe(false);
 expect(relationAcceptsClaim(normalizeRelationCondition({ ...input, stepRoles: [null, []] }), claims[0], 0)).toBe(true);
 expect(relationAcceptsClaim(normalizeRelationCondition({ ...input, stepRoles: [null, []] }), claims[1], 1)).toBe(false);
 expect(() => validateRelationRoute(condition, r.nodeIds[1], r, nodes, records)).toThrow();
 expect(patternAcceptsRoot(condition, "person")).toBe(false);
});
it("存在判定・証拠選択・ページの全Cypherが段別パラメーターを使用する", () => {
 expect(relationQueryParameters(condition)).toMatchObject({ firstRoles: ["AUTHORSHIP"], secondRoles: ["DRAWING"], roles: null });
 expect(relationQueryParameters({ ...legacy, contributionRoles: ["DRAWING"] })).toMatchObject({ firstRoles: ["DRAWING"], secondRoles: ["DRAWING"] });
 for (const q of [OTHER_WORKS_EXISTS, OTHER_WORKS_PAGE, firstWitnessQuery(condition)]) {
  expect(q).toContain("a.contributionRoleId IN $firstRoles"); expect(q).toContain("b.contributionRoleId IN $secondRoles");
 }
});
it("v2検索から証拠付きURL・Graph・保存を往復し、旧形式へ縮退しない", () => {
 const req = { version: 2, dataset: "public-kg", criteria: { q: "", kind: "work", nameTarget: "subject", relation: condition }, revision: "r1", after: null };
 expect(targetSearchRequestSchema.safeParse(req).success).toBe(true);
 expect(targetSearchRequestSchema.safeParse({ ...req, version: 1 }).success).toBe(false);
 expect(targetSearchRequestSchema.safeParse({ ...req, criteria: { ...req.criteria, kind: "person" } }).success).toBe(false);
 const witness = matchWitnessSchema.parse({ version: 2, dataset: "public-kg", revision: "r1", conditionKey: relationConditionKey(condition), route: r, subjectId: base.root.id, subjectPosition: "work", matchContext: { q: "", kind: "work", nameTarget: "subject" } });
 const url = new URL(discoveryRelationHref({ entity: base.root, relation: condition, witness, revision: "r1" }), "https://example.invalid");
 const saved = decodeExploration(url.searchParams.get("s")!, base.root.id, "public-kg");
 expect(saved.relation).toEqual(condition);
 expect(parseDiscoveryHandoff(url.searchParams.get("match"), saved)?.witness).toEqual(witness);
 expect(workspaceSchema.safeParse({ ...saved, version: 2 }).success).toBe(false);
 if (condition.type !== "pattern") throw Error();
 const graph = mergePatternPage(emptyPatternGraph(base.root, condition), { ...base, version: 2, relation: condition, claims }, null);
 expect(Object.keys(graph.claims)).toEqual([r.claimIds[0]]);
 expect(Object.keys(openPatternNode(graph, r.nodeIds[1]).claims).sort()).toEqual([...r.claimIds].sort());
 expect(captureWorkspace("public-kg", "Steps", graph, null).relation).toEqual(condition);
 expect(relationSummary(condition, "ja")).toContain("起点作品側: 著者");
 expect(relationSummary(condition, "ja")).toContain("別作品側: 作画");
});
