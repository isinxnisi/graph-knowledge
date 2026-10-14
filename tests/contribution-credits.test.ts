import { execFileSync } from "node:child_process";
import { beforeAll, expect, it } from "vitest";
import { loadPublicRelease, type PublicRelease } from "../lib/server/public-dataset";
import { planPublicGraph, publicGraph } from "../lib/server/public-graph";
import { displayRelations, relationId } from "../lib/client/graph-presentation";
import { claimSummarySchema } from "../lib/domain/api";
import { matchesClaim, normalizeContributionRoles } from "../lib/domain/exploration";
import { claimComparisonKey } from "../lib/domain/qualifications";

let base: PublicRelease, next: PublicRelease;
beforeAll(async () => {
  execFileSync("python3", ["scripts/prepare-contribution-credits.py", "--check"]);
  base = await loadPublicRelease("datasets/public-kg/releases/20261014-pluto-001");
  next = await loadPublicRelease("datasets/public-kg/releases/20261014-credits-001");
}, 45000);
const summary = (c: PublicRelease["fixture"]["claims"][number]) => claimSummarySchema.parse({ ...Object.fromEntries(Object.entries(c).filter(([key]) => !["visibility", "createdAt", "updatedAt"].includes(key))), sourceCount: 1 });

it("既存知識・UUIDを保持し10限定Claimと根拠だけを追加する", () => {
  for (const field of ["entities", "claims", "sources", "citations"] as const)
    for (const row of base.fixture[field]) expect(next.fixture[field].find(x => x.id === row.id)).toEqual(row);
  expect(next.fixture.claims.length - base.fixture.claims.length).toBe(10);
  expect(next.fixture.sources.length - base.fixture.sources.length).toBe(5);
  expect(next.fixture.citations.length - base.fixture.citations.length).toBe(10);
  const plan = planPublicGraph(publicGraph(base.fixture), publicGraph(next.fixture));
  expect(plan.updated).toEqual([]); expect(plan.added).toHaveLength(25); expect(plan.relationshipsAdded).toBe(40);
}, 30000);

it("著者7・作1・作画2を区別し、刊行物9件と原語を保つ", () => {
  const old = new Set(base.fixture.claims.map(c => c.id));
  const added = next.fixture.claims.filter(c => !old.has(c.id));
  expect(added.filter(c => c.contribution?.roleId === "AUTHORSHIP")).toHaveLength(7);
  expect(added.filter(c => c.contribution?.roleId === "CREATION")).toHaveLength(1);
  expect(added.filter(c => c.contribution?.roleId === "DRAWING")).toHaveLength(2);
  expect(added.filter(c => c.contribution?.scope)).toHaveLength(9);
  for (const c of added) {
    expect(c.period).toEqual({ from: null, to: null });
    const citation = next.fixture.citations.find(x => x.claimId === c.id)!;
    expect(citation.roleEvidence?.language).toBe("ja");
    expect(citation.roleEvidence?.originalText).toBeTruthy();
    expect(citation.locator).toBeTruthy();
  }
});

it("広いClaimと限定Claimを同じ線へまとめ、内部構成より具体語を先に表示する", () => {
  const map = Object.fromEntries(next.fixture.claims.map(c => [c.id, summary(c)]));
  const relations = displayRelations(map);
  expect(Object.keys(relations)).toHaveLength(Object.keys(displayRelations(Object.fromEntries(base.fixture.claims.map(c => [c.id, summary(c)])))).length);
  const old = new Set(base.fixture.claims.map(c => c.id));
  for (const c of next.fixture.claims.filter(c => !old.has(c.id))) {
    const rel = relations[relationId(c)];
    expect(rel.claimIds.length).toBeGreaterThanOrEqual(2);
    expect(rel.label).toContain({ AUTHORSHIP: "著者", CREATION: "作", DRAWING: "作画" }[c.contribution!.roleId as "AUTHORSHIP" | "CREATION" | "DRAWING"]);
    expect(rel.label).not.toContain("指定なし");
    const broad = base.fixture.claims.find(x => x.subjectId === c.subjectId && x.objectId === c.objectId && x.predicate === c.predicate)!;
    expect(claimComparisonKey(broad)).not.toBe(claimComparisonKey(c));
  }
});

it("新Role条件も未指定を含めず、他predicateには作用せず、Role同士を推論しない", () => {
  const credit = summary(next.fixture.claims.find(c => c.contribution?.roleId === "AUTHORSHIP")!);
  expect(matchesClaim(credit, null, ["AUTHORSHIP"])).toBe(true);
  expect(matchesClaim(credit, null, ["DRAWING"])).toBe(false);
  expect(matchesClaim({ ...credit, contribution: { roleId: null, scope: credit.contribution!.scope } }, null, ["AUTHORSHIP"])).toBe(false);
  expect(matchesClaim({ ...credit, predicate: "AFFILIATED_WITH", contribution: null }, null, ["DRAWING"])).toBe(true);
  expect(normalizeContributionRoles(["DRAWING", "AUTHORSHIP", "DRAWING"], null)).toEqual(["AUTHORSHIP", "DRAWING"]);
});
