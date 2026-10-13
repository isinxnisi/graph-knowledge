import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dateProperties, partialDateSchema, periodSchema } from "../lib/domain/dates";
import { fixtureCounts, validateFixture } from "../lib/domain/fixture";
import { changeSelectionMode, facetsForPredicates, resolveRelationFacets, resolveRelationSelection, selectionFromPredicates } from "../lib/client/relation-facets";
import { explorationKey, matchesClaim, normalizeContributionRoles, normalizeEventRoles, normalizeOrganizationPositions } from "../lib/domain/exploration";
import { relationFacetLabels } from "../lib/i18n/relation-facets";

describe("relation facetは既存の具体条件へ解決する", () => {
  it.each([
    ["relation.work-production", "CONTRIBUTED_TO"],
    ["relation.organization-involvement", "AFFILIATED_WITH"],
    ["relation.event-participation", "PARTICIPATED_IN"],
  ] as const)("%sは限定を生成せず%sへ解決", (id, predicate) => {
    expect(resolveRelationFacets([id])).toEqual([predicate]);
    expect(explorationKey(resolveRelationFacets([id]))).toBe(explorationKey([predicate]));
  });
  it("複数のOR・順序・重複、三入口全部と全関係、nullと空集合を区別する", () => {
    const values = resolveRelationFacets(["relation.event-participation", "relation.work-production", "relation.organization-involvement", "relation.work-production"]);
    expect(values).toEqual(["AFFILIATED_WITH", "CONTRIBUTED_TO", "PARTICIPATED_IN"]);
    expect(values).not.toBeNull();
    expect(matchesClaim({ predicate: "INFLUENCED_BY" }, values)).toBe(false);
    expect(resolveRelationFacets(null)).toBeNull();
    expect(resolveRelationFacets([])).toEqual([]);
    expect(explorationKey(null)).not.toBe(explorationKey([]));
  });
  it.each(["activity.academic", "candidate.work", "toString", "relation.future"])("未公開・未知ID %sを拒否", id => {
    expect(() => resolveRelationFacets(["relation.work-production", id])).toThrow("Unknown relation facet");
  });
  it("個別指定は完全一致するものだけ逆引きし、影響・アシスタントを丸めない", () => {
    const predicates = ["ASSISTANT_OF", "CONTRIBUTED_TO"] as const;
    expect(facetsForPredicates([...predicates])).toBeNull();
    const selection = selectionFromPredicates([...predicates]);
    expect(selection.mode).toBe("custom");
    expect(resolveRelationSelection(selection)).toEqual(predicates);
    expect(resolveRelationSelection(changeSelectionMode(selection, "facets"))).toEqual([]);
    expect(resolveRelationSelection(changeSelectionMode(selectionFromPredicates(["AFFILIATED_WITH"]), "custom"))).toEqual(["AFFILIATED_WITH"]);
  });
  it("限定の作用先・nullと空集合は既存の意味を保つ", () => {
    const all = resolveRelationFacets(null), onlyEvent = resolveRelationFacets(["relation.event-participation"]);
    const roles = normalizeEventRoles(["CHAIR"], all);
    expect(matchesClaim({ predicate: "AFFILIATED_WITH" }, all, null, null, roles)).toBe(true);
    expect(matchesClaim({ predicate: "AFFILIATED_WITH" }, onlyEvent, null, null, roles)).toBe(false);
    expect(matchesClaim({ predicate: "PARTICIPATED_IN", eventParticipation: null }, onlyEvent, null, null, roles)).toBe(false);
    expect(matchesClaim({ predicate: "PARTICIPATED_IN", eventParticipation: { roleId: "CHAIR" } }, onlyEvent, null, null, roles)).toBe(true);
    expect(matchesClaim({ predicate: "PARTICIPATED_IN", eventParticipation: { roleId: "CHAIR" } }, onlyEvent, null, null, [])).toBe(false);
    const org = resolveRelationFacets(["relation.organization-involvement"]);
    expect(normalizeOrganizationPositions(["VISITOR"], org)).toEqual(["VISITOR"]);
    expect(normalizeContributionRoles(["PRODUCING"], org)).toBeNull();
    expect(normalizeEventRoles(["CHAIR"], org)).toBeNull();
  });
  it("label変更やlocaleは識別・条件から独立する", () => {
    expect(relationFacetLabels("en-US").items["relation.work-production"].name).toBe("Work production involvement");
    expect(relationFacetLabels("ja-JP").items["relation.work-production"].name).toBe("作品制作への関与");
    expect(selectionFromPredicates(["CONTRIBUTED_TO"])).toEqual({ mode: "facets", ids: ["relation.work-production"] });
  });
});

const raw = JSON.parse(readFileSync("fixtures/demo.json", "utf8"));

describe("partial dates", () => {
  it.each(["0001-01-01", "2000-02-29", "2024-02-29", "9999-12-31"])("accepts %s", (value) => {
    expect(partialDateSchema.safeParse({ value, precision: "day" }).success).toBe(true);
  });
  it.each(["0000-01-01", "1900-02-29", "2023-02-29", "2024-04-31", "2024-13-01", "2024-00-01", "2024-01-00"])("rejects %s", (value) => {
    expect(partialDateSchema.safeParse({ value, precision: "day" }).success).toBe(false);
  });
  it("preserves year/month precision without fabricated days", () => {
    expect(dateProperties("validFrom", partialDateSchema.parse({ value: "2001", precision: "year" })))
      .toEqual({ validFromValue: "2001", validFromPrecision: "year" });
    expect(partialDateSchema.safeParse({ value: "2001-01", precision: "year" }).success).toBe(false);
    expect(partialDateSchema.safeParse({ value: "2001-13", precision: "month" }).success).toBe(false);
    expect(partialDateSchema.safeParse({ value: "2001-01", precision: "month" }).success).toBe(true);
    expect(dateProperties("validTo", null)).toEqual({ validToValue: null, validToPrecision: null });
  });
  it("allows overlapping precision bounds and unknown endpoints, rejects definite reversal", () => {
    const year = { value: "2001", precision: "year" };
    expect(periodSchema.safeParse({ from: { value: "2001-12", precision: "month" }, to: year }).success).toBe(true);
    expect(periodSchema.safeParse({ from: year, to: null }).success).toBe(true);
    expect(periodSchema.safeParse({ from: null, to: null }).success).toBe(true);
    expect(periodSchema.safeParse({ from: { value: "2002", precision: "year" }, to: year }).success).toBe(false);
  });
});

describe("demo fixture", () => {
  it("validates expected counts and important scenarios", () => {
    const fixture = validateFixture(raw);
    expect(fixtureCounts(fixture)).toEqual({
      nodes: { Entity: 12, Claim: 15, Source: 5, Citation: 15, ExternalIdentifier: 0 },
      relationships: { SUBJECT: 15, OBJECT: 15, HAS_CITATION: 15, CITES: 15, HAS_EXTERNAL_ID: 0 },
    });
    expect(fixture.entities.filter((e) => e.name === "佐藤アキ")).toHaveLength(2);
    const isolated = fixture.entities.find((e) => e.name === "森ユウ")!;
    expect(fixture.claims.some((c) => c.subjectId === isolated.id || c.objectId === isolated.id)).toBe(false);
    expect(fixture.claims.filter((c) => c.polarity === "denied")).toHaveLength(1);
    expect(fixture.citations.filter((c) => c.claimId === fixture.claims[0].id)).toHaveLength(2);
    expect(fixture.citations.some((c) => c.claimId === fixture.claims[12].id)).toBe(false);
    expect(fixture.sources.every((s) => s.isDemo)).toBe(true);
  });
  it.each([
    ["duplicate IDs", (f: typeof raw) => { f.sources[0].id = f.entities[0].id; }],
    ["missing subject", (f: typeof raw) => { f.claims[0].subjectId = randomUUID(); }],
    ["wrong object kind", (f: typeof raw) => { f.claims[0].objectId = f.entities[8].id; }],
    ["unknown predicate", (f: typeof raw) => { f.claims[0].predicate = "MENTOR_OF"; }],
    ["missing claim", (f: typeof raw) => { f.citations[0].claimId = randomUUID(); }],
    ["missing source", (f: typeof raw) => { f.citations[0].sourceId = randomUUID(); }],
    ["multiple subjects", (f: typeof raw) => { f.claims[0].subjectId = [f.entities[0].id, f.entities[1].id]; }],
    ["multiple citation owners", (f: typeof raw) => { f.citations[0].claimId = [f.claims[0].id, f.claims[1].id]; }],
    ["invalid date", (f: typeof raw) => { f.sources[0].publishedAt = { value: "2010-02-29", precision: "day" }; }],
    ["unsafe URL", (f: typeof raw) => { f.sources[0].url = "javascript:alert(1)"; }],
    ["duplicate external ID", (f: typeof raw) => {
      f.entities[0].externalIds = [{ namespace: "test", value: "same" }];
      f.entities[1].externalIds = [{ namespace: "test", value: "same" }];
    }],
  ])("rejects %s", (_, mutate) => {
    const fixture = structuredClone(raw);
    mutate(fixture);
    expect(() => validateFixture(fixture)).toThrow();
  });
});

it("探索条件の同一性は表示localeから独立している", async () => {
  const { explorationLabels } = await import("../lib/i18n/exploration");
  const { normalizePredicates, predicateKey } = await import("../lib/domain/exploration");
  expect(explorationLabels("ja-JP")).toEqual(explorationLabels("ja"));
  expect(explorationLabels("en").predicates.INFLUENCED_BY).toBe("Was influenced by");
  expect(explorationLabels("fr")).toEqual(explorationLabels("ja"));
  expect(predicateKey(normalizePredicates(["ASSISTANT_OF", "INFLUENCED_BY"]))).toBe(predicateKey(normalizePredicates(["INFLUENCED_BY", "ASSISTANT_OF", "ASSISTANT_OF"])));
});
