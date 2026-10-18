import { describe, expect, it } from "vitest";
import demo from "../fixtures/demo.json";
import catalog from "../vocabulary/contribution-roles/catalog.json";
import baseline from "../vocabulary/contribution-roles/baseline-v1.json";
import reviews from "../vocabulary/contribution-roles/reviews.json";
import { CONTRIBUTION_ROLE_IDS, contributionProperties, contributionSchema, storedContribution } from "../lib/domain/contribution";
import { checkRoleVocabulary } from "../lib/domain/role-vocabulary";
import { claimSummarySchema } from "../lib/domain/api";
import { validateFixture } from "../lib/domain/fixture";
import { matchesClaim, explorationKey } from "../lib/domain/exploration";
import { claimComparisonKey } from "../lib/domain/qualifications";
import { neighborsInput } from "../lib/server/http";
import { encodeNeighborCursor, decodeNeighborCursor } from "../lib/server/neighbor-cursor";
import { emptyGraph, mergePage, closeExpansion, reopenExpansion } from "../lib/client/graph-state";
import { captureWorkspace } from "../lib/client/saved-workspace";
import { encodeExploration, decodeExploration } from "../lib/client/exploration-url";
import { displayRelations } from "../lib/client/graph-presentation";

const contribution = { roleId: "ORIGINAL_STORY" as const, scope: { kind: "publication" as const, isbn13: "9784088811840", volumeLabel: "第1巻", editionLabel: null, language: "ja" } };
const claim = claimSummarySchema.parse({ ...Object.fromEntries(Object.entries(demo.claims[0]).filter(([key]) => !["visibility", "createdAt", "updatedAt"].includes(key))), predicate: "CONTRIBUTED_TO", contribution, organizationParticipation: null, eventParticipation: null, sourceCount: 1 });
const oldRoles = CONTRIBUTION_ROLE_IDS.filter(id => id !== "ORIGINAL_STORY");

describe("原作担当の限定は旧Role・無限定と別命題", () => {
  it("保存・APIで保持し、旧Roleへの推論や別predicateへの流用を行わない", () => {
    expect(contributionSchema.parse(contribution)).toEqual(contribution);
    expect(storedContribution(contributionProperties(contribution), "CONTRIBUTED_TO")).toEqual(contribution);
    expect(() => storedContribution(contributionProperties(contribution), "INFLUENCED_BY")).toThrow();
    expect(matchesClaim(claim, null, ["ORIGINAL_STORY"])).toBe(true);
    expect(matchesClaim(claim, null, [...oldRoles])).toBe(false);
    for (const roleId of [...oldRoles, null]) {
      const other = { ...claim, contribution: { ...contribution, roleId } };
      expect(matchesClaim(other, null, ["ORIGINAL_STORY"])).toBe(false);
      expect(claimComparisonKey(other)).not.toBe(claimComparisonKey(claim));
    }
    expect(storedContribution({}, "CONTRIBUTED_TO")).toEqual({ roleId: null, scope: null });
    expect(explorationKey(null, [...oldRoles])).not.toBe(explorationKey(null, null));
  });
  it("条件queryと公開cursorを新Role・revisionに拘束する", () => {
    expect(neighborsInput(new Request("http://localhost/api/neighbors?contributionRoles=ORIGINAL_STORY"))).toMatchObject({ contributionRoles: ["ORIGINAL_STORY"] });
    const revision = "original-story-test";
    const cursor = encodeNeighborCursor(claim.subjectId, null, claim.id, ["ORIGINAL_STORY"], "public-kg", null, null, revision);
    expect(decodeNeighborCursor(cursor, claim.subjectId, null, ["ORIGINAL_STORY"], "public-kg", null, null, revision)).toBe(claim.id);
    expect(() => decodeNeighborCursor(cursor, claim.subjectId, null, ["AUTHORSHIP"], "public-kg", null, null, revision)).toThrow();
    expect(() => decodeNeighborCursor(cursor, claim.subjectId, null, ["ORIGINAL_STORY"], "public-kg", null, null, "changed")).toThrow();
  });
  it("Graphは同じSPOへまとめ、保存URL・閉じる復帰はRole条件を保持する", () => {
    const broad = { ...claim, id: demo.claims[1].id, contribution: { roleId: null, scope: null } };
    const relations = Object.values(displayRelations({ [claim.id]: claim, [broad.id]: broad }));
    expect(relations).toHaveLength(1);
    expect(relations[0].claimIds).toHaveLength(2);
    expect(relations[0].label).toContain("原作（漫画制作）");
    const graph = mergePage({ ...emptyGraph(), contributionRoles: ["ORIGINAL_STORY"] }, { centerId: claim.subjectId, nodes: validateFixture(demo).entities, claims: [claim], page: { hasMore: false, nextCursor: null } });
    const closed = closeExpansion(graph, claim.subjectId);
    expect(closed.claims).toEqual({});
    expect(reopenExpansion(closed, claim.subjectId).claims).toEqual(graph.claims);
    const saved = captureWorkspace("public-kg", "原作条件", graph, null);
    expect(decodeExploration(encodeExploration(saved), claim.subjectId, "public-kg").relation.contributionRoles).toEqual(["ORIGINAL_STORY"]);
    const old = captureWorkspace("public-kg", "従来7Role", { ...graph, contributionRoles: [...oldRoles] }, null);
    expect(decodeExploration(encodeExploration(old), claim.subjectId, "public-kg").relation.contributionRoles).toEqual([...oldRoles].sort());
  });
});

it("過去の承認票を維持し、新Role側の7比較と固定baselineを検証する", () => {
  expect(checkRoleVocabulary(catalog, baseline, reviews).errors).toEqual([]);
  const previous = { ...catalog, entries: catalog.entries.filter(e => e.id !== "ORIGINAL_STORY") };
  expect(checkRoleVocabulary(catalog, previous, reviews).errors).toEqual([]);
  const incomplete = structuredClone(reviews);
  const review = incomplete.find(r => r.targetId === "ORIGINAL_STORY")!;
  review.comparisons = review.comparisons.filter(c => c.roleId !== "DRAWING");
  expect(checkRoleVocabulary(catalog, previous, incomplete).errors.join()).toContain("incomplete role review");
  // Backdating cannot remove comparisons with the already deployed baseline.
  review.reviewedAt = "2026-10-01";
  expect(checkRoleVocabulary(catalog, previous, incomplete).errors.join()).toContain("incomplete role review");
});
