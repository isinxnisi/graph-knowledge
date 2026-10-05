import rawLedgerV2 from "../datasets/pilot-urasawa/v2/ledger.json";
import { pilotV2LedgerSchema, preparePilotV2 } from "../lib/server/pilot-v2-dataset";
import { describe, expect, it } from "vitest";
import { contributionSchema, storedContribution, contributionProperties, comparisonCategory, contributionOf } from "../lib/domain/contribution";
import { matchesClaim, normalizeContributionRoles, explorationKey } from "../lib/domain/exploration";
import { encodeNeighborCursor, decodeNeighborCursor } from "../lib/server/neighbor-cursor";
import { neighborsInput } from "../lib/server/http";
import { validateFixture } from "../lib/domain/fixture";
import { displayRelations } from "../lib/client/graph-presentation";
import { checkRoleVocabulary, roleCatalogSchema } from "../lib/domain/role-vocabulary";
import roleTemplate from "../vocabulary/contribution-roles/TEMPLATE.json";
import { vocabularyHash } from "../lib/domain/vocabulary";
import roles from "../vocabulary/contribution-roles/catalog.json";
import baseline from "../vocabulary/contribution-roles/baseline-v1.json";
import demo from "../fixtures/demo.json";
import type { ClaimSummary } from "../lib/domain/api";
const ledgerV2 = pilotV2LedgerSchema.parse(rawLedgerV2);
const scope = { kind: "publication" as const, isbn13: "9784091874313", volumeLabel: "第1巻", editionLabel: null, language: "ja" };
const contribution = { roleId: "SUPERVISION" as const, scope };
const claim: ClaimSummary = { ...validateFixture(demo).claims[0], predicate: "CONTRIBUTED_TO" as const, contribution, organizationParticipation: null, eventParticipation: null, sourceCount: 1 };
const center = demo.entities[0].id, after = demo.claims[0].id;
describe("制作限定の意味と厳格な保存境界", () => {
  it("旧版の欠損は限定なしであり、全Role・全巻を補完しない", () => {
    expect(contributionOf({ predicate: "CONTRIBUTED_TO" })).toEqual({ roleId: null, scope: null });
    expect(storedContribution({}, "CONTRIBUTED_TO")).toEqual({ roleId: null, scope: null });
    expect(storedContribution(contributionProperties(contribution), "CONTRIBUTED_TO")).toEqual(contribution);
    expect(matchesClaim({ ...claim, contribution: { roleId: null, scope: null } }, null, ["SUPERVISION"])).toBe(false);
  });
  it.each([
    { roleId: ["SUPERVISION"], scope }, { roleId: "DRAWING", scope },
    { roleId: "SUPERVISION", scope: { ...scope, isbn13: "9784091874314" } },
    { roleId: "SUPERVISION", scope: { ...scope, language: "invalid_language" } },
    { roleId: "SUPERVISION", scope: { ...scope, kind: "whole-work" } },
    { roleId: "SUPERVISION", scope: { ...scope, unexpected: true } },
  ])("未知Role・配列・不正刊行物を拒否する %j", (value) => expect(() => contributionSchema.parse(value)).toThrow());
  it("DBの部分破損と他predicateへの限定を拒否する", () => {
    expect(() => storedContribution({ contributionScopeIsbn13: scope.isbn13 }, "CONTRIBUTED_TO")).toThrow();
    expect(() => storedContribution(contributionProperties(contribution), "INFLUENCED_BY")).toThrow();
  });
  it("v1のJSONを変更せず検証し、v2の端点・限定整合も検証する", () => {
    expect(validateFixture(demo)).toEqual(demo);
    const value = { ...demo, schemaVersion: 2, claims: demo.claims.map((c) => ({ ...c, contribution: c.predicate === "CONTRIBUTED_TO" ? { roleId: null, scope: null } : null })), citations: demo.citations.map((c) => ({ ...c, roleEvidence: null })) };
    expect(validateFixture(value).schemaVersion).toBe(2);
    value.claims[0].contribution = { roleId: null, scope: null };
    expect(() => validateFixture(value)).toThrow();
  });
  it("比較候補はRoleとISBNで区分し、期間・肯否を対立判定しない", () => {
    expect(comparisonCategory(claim, claim)).toBe("same");
    expect(comparisonCategory(claim, { ...claim, contribution: { ...contribution, roleId: "PRODUCING" } })).toBe("role");
    expect(comparisonCategory(claim, { ...claim, contribution: { ...contribution, scope: { ...scope, isbn13: "9784091841612" } } })).toBe("scope");
    expect(comparisonCategory(claim, { ...claim, contribution: { roleId: null, scope: null } })).toBe("unstructured");
  });
});
describe("Role条件・cursor・表示", () => {
  it("全4Roleも無条件ではない。他predicateにRole条件を掛けない", () => {
    expect(normalizeContributionRoles(["SUPERVISION", "SUPERVISION"], null)).toEqual(["SUPERVISION"]);
    expect(normalizeContributionRoles(["SUPERVISION"], ["ASSISTANT_OF"])).toBeNull();
    expect(matchesClaim({ ...claim, predicate: "INFLUENCED_BY" }, null, [])).toBe(true);
    expect(matchesClaim(claim, null, [])).toBe(false);
    expect(explorationKey(null, ["SUPERVISION"])).not.toBe(explorationKey(null, null));
  });
  it("Roleのqueryを検証する", () => {
    expect(neighborsInput(new Request("http://localhost/api/neighbors?" + ("contributionRoles=SUPERVISION,SUPERVISION")))).toMatchObject({ contributionRoles: ["SUPERVISION"] });
    expect(() => neighborsInput(new Request("http://localhost/api/neighbors?" + ("contributionRoles=DRAWING")))).toThrow();
    expect(() => neighborsInput(new Request("http://localhost/api/neighbors?" + ("contributionRoles=SUPERVISION&contributionRoles=PRODUCING")))).toThrow();
  });
  it("v2 cursorを起点・条件・datasetへ拘束し、旧cursorを拒否する", () => {
    const cursor = encodeNeighborCursor(center, null, after, ["SUPERVISION"], "pilot-urasawa-v2");
    expect(decodeNeighborCursor(cursor, center, null, ["SUPERVISION"], "pilot-urasawa-v2")).toBe(after);
    for (const dataset of ["demo", "pilot-urasawa-v1"] as const) expect(() => decodeNeighborCursor(cursor, center, null, ["SUPERVISION"], dataset)).toThrow();
    expect(() => decodeNeighborCursor(cursor, center, null, ["PRODUCING"], "pilot-urasawa-v2")).toThrow();
    expect(() => decodeNeighborCursor(cursor, demo.entities[1].id, null, ["SUPERVISION"], "pilot-urasawa-v2")).toThrow();
    expect(() => decodeNeighborCursor(after, center, null, null, "pilot-urasawa-v2")).toThrow();
    const unfiltered = encodeNeighborCursor(center, null, after, null, "pilot-urasawa-v2");
    expect(decodeNeighborCursor(unfiltered, center, null, null, "pilot-urasawa-v2")).toBe(after);
    expect(encodeNeighborCursor(center, null, after, null, "demo")).toBe(after);
  });
  it("別Role・別scopeの肯否を1Relationの記述的表示にし、根拠文字列から推定しない", () => {
    const denied = { ...claim, id: demo.claims[1].id, polarity: "denied" as const, contribution: { ...contribution, roleId: "SCRIPT_WRITING" as const, scope: { ...scope, isbn13: "9784091841612" } } };
    const result = Object.values(displayRelations({ [claim.id]: claim, [denied.id]: denied }));
    expect(result).toHaveLength(1); expect(result[0].claimIds).toHaveLength(2);
    expect(result[0].label).toContain("脚本・監修"); expect(result[0].label).toContain("肯定・否定あり"); expect(result[0].label).not.toContain("異説"); expect(result[0].label).not.toContain("ISBN");
  });
  it("Role意味契約の黙った変更、Role間同義、比較欠落を拒否する", () => {
    expect(checkRoleVocabulary(roles, baseline, []).errors).toEqual([]);
    const changed = structuredClone(roles); changed.entries[0].meaning.definition += "変更";
    expect(checkRoleVocabulary(changed, baseline, []).errors.join()).toContain("review");
    const missing = structuredClone(roles); missing.entries[0].comparisons = [];
    expect(checkRoleVocabulary(missing, baseline, []).errors.join()).toContain("comparison");
    const same = structuredClone(roles); same.entries[0].comparisons[0].relation = "same";
    expect(checkRoleVocabulary(same, baseline, []).errors.join()).toContain("alias");
  });
});

it("v2受入待ち候補を生成せず、人間判断が空のacceptedを拒否する", async () => {
  const prepared = await preparePilotV2();
  const accepted = ledgerV2.candidates.filter((candidate) => candidate.acceptance.decision === "accepted");
  expect(prepared.fixture.claims).toHaveLength(9 + accepted.length);
  expect(prepared.fixture.claims.filter((claim) => claim.contribution?.roleId)).toHaveLength(accepted.length);
  const invalid = structuredClone(ledgerV2); invalid.candidates[0].acceptance.decision = "accepted"; invalid.candidates[0].acceptance.reviewer = null; invalid.candidates[0].acceptance.reviewedAt = null;
  expect(() => pilotV2LedgerSchema.parse(invalid)).toThrow();
});

it("Role承認票も対象・比較・未記入・意味変更を検証する", () => {
  const changed = roleCatalogSchema.parse(structuredClone(roles)); changed.entries[0].translations.ja.aliases.push("スクリプト担当");
  const review = { ...roleTemplate, targetId: changed.entries[0].id, beforeHash: vocabularyHash(roles.entries[0]), afterHash: vocabularyHash(changed.entries[0]), status: "approved", reviewer: "Test Reviewer", reviewedAt: "2026-10-03", outcome: "alias", motivation: "同じRoleの表示別名", evidenceExample: "脚本担当の原表記", counterexample: "原作は別概念", predicateRationale: "制作への関与の限定", rationale: "意味を保つ別名", comparisons: roles.entries.filter((entry) => entry.id !== changed.entries[0].id).map((entry) => ({ roleId: entry.id, relation: "distinct", rationale: "既存Roleとは別の制作役割" })), impacts: { claims: "意味不変", conditions: "ID不変", translations: "別名追加", presentation: "件数不変" } };
  expect(checkRoleVocabulary(changed, baseline, [review]).errors).toEqual([]);
  expect(checkRoleVocabulary(changed, baseline, [{ ...review, rationale: "TBD" }]).errors.join()).toContain("unfinished");
  expect(checkRoleVocabulary(changed, baseline, [{ ...review, change: "meaning-change" }]).errors.join()).toContain("review");
  expect(checkRoleVocabulary(changed, baseline, [{ ...review, comparisons: [] }]).errors.join()).toContain("incomplete");
});
