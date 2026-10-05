import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { validateFixture, fixtureCounts } from "../lib/domain/fixture";
import { loadScienceV2, prepareScienceV2 } from "../lib/server/science-v2-dataset";
import { matchesClaim, normalizeOrganizationPositions, explorationKey } from "../lib/domain/exploration";
import { claimComparisonKey } from "../lib/domain/qualifications";
import { storedOrganizationParticipation, organizationParticipationSchema } from "../lib/domain/organization-participation";
import { encodeNeighborCursor, decodeNeighborCursor } from "../lib/server/neighbor-cursor";
import { neighborsInput } from "../lib/server/http";
import { claimSummary, citationDetail } from "../lib/server/mappers";
import { checkPositionVocabulary } from "../lib/domain/position-vocabulary";
import { displayRelations } from "../lib/client/graph-presentation";
import { emptyGraph, mergePage, closeExpansion, reopenExpansion } from "../lib/client/graph-state";
import { assertDatasetTarget } from "../lib/domain/dataset";
import { NEIGHBORS_BY_QUALIFICATION } from "../lib/server/queries";
import catalog from "../vocabulary/organization-positions/catalog.json";
import baseline from "../vocabulary/organization-positions/baseline-v1.json";
import v1 from "../datasets/pilot-science/v1/data.json";
import v2 from "../datasets/pilot-science/v2/data.json";
import ledger from "../datasets/pilot-science/v2/ledger.json";
import creationData from "../datasets/pilot-urasawa/v2/data.json";
import eventData from "../datasets/pilot-event/v1/data.json";
import type { ClaimSummary, EntitySummary, NeighborsResponse } from "../lib/domain/api";
const candidate = (positionId: string) => v2.claims.find(c => c.organizationParticipation?.positionId === positionId)!;
const visitor = { ...candidate("VISITOR"), sourceCount: 1, eventParticipation: null } as ClaimSummary;
const professor = { ...candidate("ASSOCIATE_PROFESSOR"), sourceCount: 1, eventParticipation: null } as ClaimSummary;
const broad = { ...v2.claims.find(c => c.id === ledger.candidates[0].baseClaimId)!, sourceCount: 1, eventParticipation: null } as ClaimSummary;
const request = (query: string) => new Request(`http://localhost/api/entities/${visitor.subjectId}/neighbors?${query}`);
describe("二つのtyped限定の境界", () => {
  it("凍結入力のhash、台帳、生成物を検証し既存広いClaimを保持する", async () => {
    const fixture = await loadScienceV2();
    expect(fixtureCounts(fixture).nodes).toEqual({ Entity: 8, Claim: 10, Source: 9, Citation: 11, ExternalIdentifier: 8 });
    expect(fixture.entities).toEqual(v1.entities); expect(fixture.sources).toEqual(v1.sources);
    for (const old of v1.claims) expect(fixture.claims.find(c => c.id === old.id)).toEqual({ ...old, contribution: null, organizationParticipation: null });
    expect(fixture.claims.filter(c => c.organizationParticipation)).toHaveLength(2);
    expect(fixture.claims.every(c => c.polarity === "affirmed")).toBe(true);
    expect(fixture.claims.some(c => c.predicate === "INFLUENCED_BY")).toBe(false);
    expect((await prepareScienceV2()).data).toBe(await readFile("datasets/pilot-science/v2/data.json", "utf8"));
  });
  it.each([{ positionId: "PRODUCING" }, { positionId: "PROFESSOR" }, { positionId: "助教授" }, { positionId: null }, { positionId: ["VISITOR"] }, { positionId: "VISITOR", arbitrary: true }])("自由値・語彙混在・余分な限定を拒否 %j", value => {
    expect(() => organizationParticipationSchema.parse(value)).toThrow();
  });
  it("適用先predicateと原表記の所有Claimを検証する", () => {
    const changed = structuredClone(v2); changed.claims.find(c => c.id === visitor.id)!.predicate = "INFLUENCED_BY";
    expect(() => validateFixture(changed)).toThrow();
    const bad = structuredClone(v2); const citation = bad.citations.find(c => c.positionEvidence)!;
    citation.claimId = broad.id; expect(() => validateFixture(bad)).toThrow();
    expect(storedOrganizationParticipation({}, "AFFILIATED_WITH")).toBeNull();
    expect(() => storedOrganizationParticipation({ organizationPositionId: "VISITOR" }, "CONTRIBUTED_TO")).toThrow();
    expect(() => storedOrganizationParticipation({ organizationPositionId: "PROFESSOR" }, "AFFILIATED_WITH")).toThrow();
  });
  it("独立vocabularyの意味変更・比較欠落を拒否する", () => {
    expect(checkPositionVocabulary(catalog, baseline)).toEqual({ errors: [], warnings: [] });
    const changed = structuredClone(catalog); changed.entries[0].meaning.definition = "雇用全般";
    expect(checkPositionVocabulary(changed, baseline).errors.length).toBeGreaterThan(0);
    changed.entries[0].comparisons = []; expect(checkPositionVocabulary(changed, baseline).errors).toContain("VISITOR: incomplete comparisons");
  });
  it("nullは限定しない命題、検索nullは無条件、空集合は当該predicateだけ空集合", () => {
    expect(matchesClaim(broad, null, null, ["VISITOR"])).toBe(false);
    expect(matchesClaim(visitor, null, null, ["VISITOR"])).toBe(true);
    expect(matchesClaim(professor, null, null, ["VISITOR"])).toBe(false);
    expect(matchesClaim(visitor, null, [], null)).toBe(true);
    expect(matchesClaim(visitor, null, null, [])).toBe(false);
    expect(matchesClaim({ ...visitor, predicate: "INFLUENCED_BY", organizationParticipation: null }, null, null, [])).toBe(true);
    expect(matchesClaim({ ...visitor, predicate: "CONTRIBUTED_TO", organizationParticipation: null, eventParticipation: null, contribution: { roleId: "SUPERVISION", scope: null } }, null, ["SUPERVISION"], [])).toBe(true);
    expect(normalizeOrganizationPositions(["VISITOR", "VISITOR"], null)).toEqual(["VISITOR"]);
    expect(normalizeOrganizationPositions(["VISITOR"], ["CONTRIBUTED_TO"])).toBeNull();
    expect(normalizeOrganizationPositions(["VISITOR", "ASSOCIATE_PROFESSOR"], null)).not.toBeNull();
  });
  it("限定と期間・精度・未指定を比較キーへ含め、否定を別立場へ波及しない", () => {
    expect(claimComparisonKey(visitor)).not.toBe(claimComparisonKey(broad));
    expect(claimComparisonKey(visitor)).not.toBe(claimComparisonKey(professor));
    expect(claimComparisonKey(visitor)).not.toBe(claimComparisonKey({ ...visitor, period: professor.period }));
    expect(claimComparisonKey(visitor)).not.toBe(claimComparisonKey({ ...visitor, period: { from: null, to: null } }));
    const deniedVisitor = { ...visitor, id: professor.id, polarity: "denied" as const }; // 契約検証用の架空否定。実datasetへ投入しない。
    expect(claimComparisonKey(deniedVisitor)).toBe(claimComparisonKey(visitor));
    expect(matchesClaim(deniedVisitor, null, null, ["VISITOR"])).toBe(true);
    expect(matchesClaim(deniedVisitor, null, null, ["ASSOCIATE_PROFESSOR"])).toBe(false);
    const relation = Object.values(displayRelations({ [professor.id]: professor, [visitor.id]: { ...visitor, polarity: "denied" } }))[0];
    expect(relation.label).toContain("肯定・否定あり"); expect(relation.label).not.toContain("異説");
    expect(Object.values(displayRelations({ [visitor.id]: visitor, [professor.id]: professor, [broad.id]: broad }))).toHaveLength(1);
  });
  it("制作限定にも同じ比較キーを用い、刊行物・期間・Roleを独立に区別する", () => {
    const creation: ClaimSummary = { ...visitor, predicate: "CONTRIBUTED_TO", organizationParticipation: null, eventParticipation: null, contribution: { roleId: "SUPERVISION", scope: { kind: "publication", isbn13: "9784091874313", volumeLabel: "第1巻", editionLabel: null, language: "ja" } } };
    expect(claimComparisonKey(creation)).not.toBe(claimComparisonKey({ ...creation, period: professor.period }));
    expect(claimComparisonKey(creation)).not.toBe(claimComparisonKey({ ...creation, contribution: { ...creation.contribution!, roleId: "PRODUCING" } }));
    expect(claimComparisonKey(creation)).not.toBe(claimComparisonKey({ ...creation, contribution: { ...creation.contribution!, scope: null } }));
    const other: ClaimSummary = { ...creation, id: professor.id, polarity: "denied" };
    expect(claimComparisonKey(creation)).toBe(claimComparisonKey(other));
  });
  it("両型の条件をLIMIT前へパラメータ化する", () => {
    expect(NEIGHBORS_BY_QUALIFICATION.indexOf("$organizationPositions")).toBeLessThan(NEIGHBORS_BY_QUALIFICATION.indexOf("LIMIT"));
    expect(NEIGHBORS_BY_QUALIFICATION.indexOf("$contributionRoles")).toBeLessThan(NEIGHBORS_BY_QUALIFICATION.indexOf("LIMIT"));
    expect(neighborsInput(request("organizationPositions=VISITOR,VISITOR"))).toMatchObject({ organizationPositions: ["VISITOR"] });
    expect(neighborsInput(request("predicates=CONTRIBUTED_TO&organizationPositions=VISITOR"))).not.toHaveProperty("organizationPositions");
    for (const query of ["organizationPositions=PRODUCING", "organizationPositions=VISITOR&organizationPositions=VISITOR", "organizationPositions=visitor", "predicates=CONTRIBUTED_TO&organizationPositions=invalid"]) expect(() => neighborsInput(request(query))).toThrow();
  });
  it("v3 cursorを限定・dataset・起点に拘束し、二型の条件を独立に保持する", () => {
    const cursor = encodeNeighborCursor(visitor.subjectId, null, visitor.id, null, "pilot-science-v2", ["VISITOR"]);
    expect(decodeNeighborCursor(cursor, visitor.subjectId, null, null, "pilot-science-v2", ["VISITOR"])).toBe(visitor.id);
    for (const filter of [null, [], ["ASSOCIATE_PROFESSOR"]] as const) expect(() => decodeNeighborCursor(cursor, visitor.subjectId, null, null, "pilot-science-v2", filter === null ? null : [...filter])).toThrow();
    expect(() => decodeNeighborCursor(cursor, visitor.objectId, null, null, "pilot-science-v2", ["VISITOR"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, visitor.subjectId, null, null, "pilot-science-v1", ["VISITOR"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, visitor.subjectId, null, ["SUPERVISION"], "pilot-science-v2", ["VISITOR"])).toThrow();
    expect(explorationKey(null, null, [])).not.toBe(explorationKey(null, null, null));
  });
  it("取得と表示の条件・開閉復元を共有する", () => {
    const nodes = v2.entities.filter(e => [visitor.subjectId, visitor.objectId].includes(e.id)) as EntitySummary[];
    const page: NeighborsResponse = { centerId: visitor.subjectId, nodes, claims: [visitor], page: { hasMore: false, nextCursor: null } };
    const graph = mergePage({ ...emptyGraph(), organizationPositions: ["VISITOR"] }, page);
    expect(Object.keys(graph.claims)).toEqual([visitor.id]);
    expect(() => mergePage(graph, { ...page, claims: [broad] })).toThrow();
    expect(closeExpansion(graph, visitor.subjectId).claims).toEqual({});
    expect(reopenExpansion(closeExpansion(graph, visitor.subjectId), visitor.subjectId).claims).toEqual(graph.claims);
  });
  it("science v2の専用port以外へ書き込ませない", () => {
    expect(() => assertDatasetTarget("pilot-science-v2", "bolt://127.0.0.1:7691")).not.toThrow();
    for (const uri of ["bolt://127.0.0.1:7690", "bolt://remote:7691", "bolt://127.0.0.1:7687"]) expect(() => assertDatasetTarget("pilot-science-v2", uri)).toThrow();
    expect(() => assertDatasetTarget("demo", "bolt://127.0.0.1:7691")).toThrow();
  });
  it("DB破損をAPIの未指定に黙って変換しない", () => {
    const subject = v2.entities.find(e => e.id === visitor.subjectId)! as EntitySummary, object = v2.entities.find(e => e.id === visitor.objectId)! as EntitySummary;
    expect(() => claimSummary({ ...visitor, organizationPositionId: "PROFESSOR" }, subject, object, 1)).toThrow();
    expect(() => citationDetail({ ...v2.citations[0], positionOriginalText: "Visitor" }, v2.sources[0])).toThrow();
  });
});

describe("Phase 16：Claim同一性・命題比較・表示束の境界", () => {
  const qualifiedClaims: [string, ClaimSummary][] = [
    ["制作Role", creationData, "CONTRIBUTED_TO"],
    ["組織立場", v2, "AFFILIATED_WITH"],
    ["Event参加立場", eventData, "PARTICIPATED_IN"],
  ].map(([name, data, predicate]) => {
    const fixture = validateFixture(data);
    const selected = fixture.claims.find(c => c.predicate === predicate &&
      (c.contribution?.roleId || c.organizationParticipation || c.eventParticipation));
    if (!selected) throw new Error(`契約テストの限定Claimがない: ${name}`);
    return [name as string, { ...selected, contribution: selected.contribution ?? null,
      organizationParticipation: selected.organizationParticipation ?? null,
      eventParticipation: selected.eventParticipation ?? null, sourceCount: 1 }];
  });

  it.each(qualifiedClaims)("%s：比較一致でも別UUIDの肯否・根拠件数を保持し、表示束だけを共有する", (_, first) => {
    // 人工的な対照をメモリ内だけに作る。実資料の否定や新しいSourceを認定しない。
    const second: ClaimSummary = { ...first, id: "70000000-0000-4000-8000-000000000001", polarity: "denied", sourceCount: 2 };
    const key = claimComparisonKey(first);
    expect(claimComparisonKey(second)).toBe(key);
    const graphClaims = { [first.id]: first, [second.id]: second };
    const [relation] = Object.values(displayRelations(graphClaims));
    expect(Object.values(displayRelations(graphClaims))).toHaveLength(1);
    expect(relation.claimIds).toEqual([first.id, second.id].sort());
    expect(relation.label).toContain("肯定・否定あり");
    expect(graphClaims[first.id]).toEqual(first);
    expect(graphClaims[second.id]).toEqual(second);
    const separateMeaning: ClaimSummary = { ...second, period: { from: { value: "1900", precision: "year" }, to: null } };
    expect(claimComparisonKey(separateMeaning)).not.toBe(key);
    // 別命題比較キーでもSPOの表示IDは変わらず、個々のClaimへ戻れる。
    const [otherRelation] = Object.values(displayRelations({ [first.id]: first, [second.id]: separateMeaning }));
    expect(otherRelation.id).toBe(relation.id);
    expect(otherRelation.claimIds).toEqual(relation.claimIds);
  });

  it("刊行物の表示文言は比較対象を変えず、構造化した言語・未指定scopeは区別する", () => {
    const creation = qualifiedClaims[0][1];
    const contribution = creation.contribution!;
    const scope = contribution.scope!;
    expect(scope).not.toBeNull();
    const translatedLabel: ClaimSummary = { ...creation, contribution: { ...contribution,
      scope: { ...scope, volumeLabel: "Volume 1", editionLabel: "表示用の版名" } } };
    expect(claimComparisonKey(translatedLabel)).toBe(claimComparisonKey(creation));
    const differentLanguage: ClaimSummary = { ...creation, contribution: { ...contribution,
      scope: { ...scope, language: "en" } } };
    expect(claimComparisonKey(differentLanguage)).not.toBe(claimComparisonKey(creation));
    expect(claimComparisonKey({ ...creation, contribution: { ...contribution, scope: null } })).not.toBe(claimComparisonKey(creation));
  });
});
