import { describe, expect, it } from "vitest";
import { mkdir, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import ledgerInput from "../datasets/pilot-event/v1/ledger.json";
import catalog from "../vocabulary/event-participation-roles/catalog.json";
import baseline from "../vocabulary/event-participation-roles/baseline-v1.json";
import { checkEventRoleVocabulary } from "../lib/domain/event-role-vocabulary";
import { eventMetadataSchema, eventParticipationSchema, storedEventMetadata, storedEventParticipation, eventProperties } from "../lib/domain/event-participation";
import { readEventLedger, prepareEventPilot } from "../lib/server/event-dataset";
import { validateFixture, fixtureCounts } from "../lib/domain/fixture";
import { normalizeEventRoles, matchesClaim, explorationKey } from "../lib/domain/exploration";
import { claimComparisonKey, invalidQualificationFields } from "../lib/domain/qualifications";
import { encodeNeighborCursor, decodeNeighborCursor } from "../lib/server/neighbor-cursor";
import { neighborsInput, searchInput } from "../lib/server/http";
import { NEIGHBORS_BY_EVENT } from "../lib/server/queries";
import { displayRelations } from "../lib/client/graph-presentation";
import { START_EXAMPLES } from "../lib/client/start-examples";
import { emptyGraph, mergePage, closeExpansion, reopenExpansion } from "../lib/client/graph-state";
import { assertDatasetTarget } from "../lib/domain/dataset";
import type { ClaimSummary, EntitySummary, NeighborsResponse } from "../lib/domain/api";
const proposed = ledgerInput.candidates;
const chairCandidate = proposed.find(c => c.eventParticipation)!;
const broadCandidate = proposed.find(c => c.ref === "E01" && !c.eventParticipation)!;
const claim = (c: typeof proposed[number]): ClaimSummary => ({ id: c.claimId, subjectId: c.subjectId, objectId: c.objectId, predicate: "PARTICIPATED_IN", polarity: "affirmed", period: { from: null, to: null }, contribution: null, organizationParticipation: null, eventParticipation: c.eventParticipation as ClaimSummary["eventParticipation"], sourceCount: c.citations.length });
const chair = claim(chairCandidate), broad = claim(broadCandidate);
const request = (q: string) => new Request(`http://localhost/api/entities/${chair.subjectId}/neighbors?${q}`);
describe("第三のtyped限定と参加／招待の境界", () => {
  it("Event開始例は候補台帳／凍結scienceのEntityと一致する", async () => {
    const base = JSON.parse(await readFile("datasets/pilot-science/v2/data.json", "utf8"));
    const entities = [...base.entities, ...ledgerInput.entities];
    for (const example of START_EXAMPLES["pilot-event-v1"]) {
      const entity = entities.find(e => e.id === example.id);
      expect(entity).toBeDefined();
      expect(example).toEqual({ id: entity.id, kind: entity.kind, name: entity.name, description: entity.description });
    }
  });
  it("資料参照・凍結版を確認するが、未受入の生成は拒否する", async () => {
    const { ledger } = await readEventLedger();
    expect(ledger.excluded.ref).toBe("E02"); expect(ledger.candidates.map(c => c.ref)).not.toContain("E02");
    const directory = await mkdtemp(join(tmpdir(), "event-pending-"));
    try {
      await writeFile(`${directory}/ledger.json`, JSON.stringify({ ...ledger, humanAcceptance: { ...ledger.humanAcceptance, decision: "pending", reviewer: null, decidedAt: null, reference: null } }));
      await expect(prepareEventPilot(directory)).rejects.toThrow("explicit human acceptance");
      const invited = { ...ledger, candidates: ledger.candidates.map((c, i) => i === 0 ? { ...c, ref: "E02" } : c) };
      await writeFile(`${directory}/ledger.json`, JSON.stringify(invited));
      await expect(readEventLedger(directory)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true }); }
  });
  it("生成器の受入ゲート後の処理をテスト専用の模擬承認で検証する（実台帳を書き換えない）", async () => {
    const directory = await mkdtemp(join(tmpdir(), "event-generator-test-"));
    const before = await readFile("datasets/pilot-event/v1/ledger.json", "utf8");
    try {
      const simulated = { ...ledgerInput, humanAcceptance: { ...ledgerInput.humanAcceptance, decision: "accepted", reviewer: "test-only-simulated-human", decidedAt: "2026-10-05", reference: "validator test; not factual acceptance" } };
      await writeFile(`${directory}/ledger.json`, JSON.stringify(simulated));
      const result = await prepareEventPilot(directory);
      expect(fixtureCounts(result.fixture).nodes).toEqual({ Entity: 10, Claim: 13, Source: 11, Citation: 15, ExternalIdentifier: 8 });
      const event = result.fixture.entities.find(e => e.kind === "event")!;
      expect(event.event?.period.from?.value).toBe("1927-10-24");
      expect(result.fixture.claims.filter(c => c.predicate === "PARTICIPATED_IN").every(c => c.period.from === null && c.period.to === null)).toBe(true);
      const dirac = proposed.find(c => c.ref === "E03")!;
      expect(result.fixture.citations.find(c => c.claimId === dirac.claimId)!.note).not.toContain("議長参加");
      const other = await prepareEventPilot(directory); expect(other.data).toBe(result.data);
      const wrongOwner = structuredClone(result.fixture); wrongOwner.citations.find(c => c.eventParticipationEvidence)!.claimId = broad.id;
      expect(() => validateFixture(wrongOwner)).toThrow();
      const wrongPredicate = structuredClone(result.fixture); wrongPredicate.claims.find(c => c.eventParticipation)!.predicate = "AFFILIATED_WITH";
      expect(() => validateFixture(wrongPredicate)).toThrow();
      const missingEvent = structuredClone(result.fixture); missingEvent.entities.find(e => e.kind === "event")!.event = null;
      expect(() => validateFixture(missingEvent)).toThrow();
      simulated.candidates[0].period = { from: { value: "1927-10-24", precision: "day" }, to: null } as never;
      await writeFile(`${directory}/ledger.json`, JSON.stringify(simulated));
      await expect(prepareEventPilot(directory)).rejects.toThrow("reviewed narrow evidence");
    } finally { await rm(directory, { recursive: true }); }
    expect(await readFile("datasets/pilot-event/v1/ledger.json", "utf8")).toBe(before);
  });
  it.each(["INVITED", "ATTENDEE", "VISITOR", "PRODUCING", "HONORARY_CHAIR", "chair"])("未知値／招待／他domain立場を拒否 %s", roleId => {
    expect(() => eventParticipationSchema.parse({ roleId })).toThrow();
  });
  it("自由payloadとseriesを拒否し、DB破損も未指定に変換しない", () => {
    expect(() => eventParticipationSchema.parse({ roleId: "CHAIR", arbitrary: true })).toThrow();
    expect(() => eventMetadataSchema.parse({ granularity: "series", period: broad.period })).toThrow();
    const legacyEvent = Object.fromEntries(Object.entries(ledgerInput.entities.find(e => e.kind === "event")!).filter(([key]) => key !== "event"));
    expect(() => validateFixture({ schemaVersion: 1, entities: [legacyEvent], claims: [], sources: [], citations: [] })).toThrow("schemaVersion 4");
    expect(() => storedEventParticipation({ eventRoleId: "INVITED" }, "PARTICIPATED_IN")).toThrow();
    expect(() => storedEventParticipation({ eventRoleId: "CHAIR" }, "AFFILIATED_WITH")).toThrow();
    expect(storedEventParticipation({}, "PARTICIPATED_IN")).toBeNull();
    expect(() => storedEventMetadata({ kind: "event" })).toThrow();
    expect(() => storedEventMetadata({ kind: "work", eventGranularity: "occurrence" })).toThrow();
    const metadata = ledgerInput.entities.find(e => e.kind === "event")!.event!;
    expect(storedEventMetadata({ kind: "event", ...eventProperties(metadata as never) })).toEqual(metadata);
    expect(invalidQualificationFields({ ...chair, predicate: "CONTRIBUTED_TO" })).toEqual(["eventParticipation"]);
  });
  it("null／空集合／CHAIR全enum指定を区別し、他の二用途へ作用しない", () => {
    expect(normalizeEventRoles(["CHAIR", "CHAIR"], null)).toEqual(["CHAIR"]); // all enum still excludes unqualified
    expect(normalizeEventRoles(["CHAIR"], ["AFFILIATED_WITH"])).toBeNull();
    expect(matchesClaim(broad, null, null, null, null)).toBe(true);
    expect(matchesClaim(broad, null, null, null, ["CHAIR"])).toBe(false);
    expect(matchesClaim(chair, null, [], [], ["CHAIR"])).toBe(true);
    expect(matchesClaim(chair, null, null, null, [])).toBe(false);
    expect(matchesClaim({ ...chair, predicate: "AFFILIATED_WITH", eventParticipation: null, organizationParticipation: { positionId: "VISITOR" } }, null, [], ["VISITOR"], [])).toBe(true);
    expect(matchesClaim({ ...chair, predicate: "CONTRIBUTED_TO", eventParticipation: null, contribution: { roleId: "SUPERVISION", scope: null } }, null, ["SUPERVISION"], [], [])).toBe(true);
    expect(() => normalizeEventRoles(["INVITED"] as never, ["AFFILIATED_WITH"])).toThrow();
  });
  it("条件不適用でも未知値を先に拒否し、三条件をLIMIT前へ置く", () => {
    expect(() => neighborsInput(request("predicates=AFFILIATED_WITH&eventRoles=INVITED"))).toThrow();
    for (const query of ["eventRoles=CHAIR&eventRoles=CHAIR", "eventRoles=VISITOR", "eventRoles=chair"]) expect(() => neighborsInput(request(query))).toThrow();
    expect(neighborsInput(request("eventRoles=CHAIR,CHAIR"))).toMatchObject({ eventRoles: ["CHAIR"] });
    expect(neighborsInput(request("eventRoles="))).toMatchObject({ eventRoles: [] });
    for (const param of ["$eventRoles", "$organizationPositions", "$contributionRoles"]) expect(NEIGHBORS_BY_EVENT.indexOf(param)).toBeLessThan(NEIGHBORS_BY_EVENT.indexOf("LIMIT"));
    expect(searchInput(new Request("http://localhost/api/entities?q=Solvay&kind=event"))).toMatchObject({ kinds: ["event"] });
  });
  it("肯否は限定された命題に掛かり、比較キー／UUID／表示束を区別する", () => {
    const denied = { ...chair, id: broad.id, polarity: "denied" as const }; // 架空契約テストのみ
    expect(claimComparisonKey(denied)).toBe(claimComparisonKey(chair));
    expect(claimComparisonKey(chair)).not.toBe(claimComparisonKey(broad));
    expect(claimComparisonKey(chair)).not.toBe(claimComparisonKey({ ...chair, period: { from: { value: "1927", precision: "year" }, to: null } }));
    const relation = Object.values(displayRelations({ [chair.id]: chair, [broad.id]: broad }));
    expect(relation).toHaveLength(1); expect(relation[0].claimIds).toHaveLength(2); expect(relation[0].label).toContain("会議議長");
    expect(Object.values(displayRelations({ [chair.id]: broad, [broad.id]: denied }))[0].label).toContain("肯定・否定あり");
  });
  it("cursor v4へ三条件・dataset・起点を拘束する", () => {
    const cursor = encodeNeighborCursor(chair.subjectId, null, chair.id, ["SUPERVISION"], "pilot-event-v1", ["VISITOR"], ["CHAIR"]);
    expect(decodeNeighborCursor(cursor, chair.subjectId, null, ["SUPERVISION"], "pilot-event-v1", ["VISITOR"], ["CHAIR"])).toBe(chair.id);
    for (const eventRoles of [null, []]) expect(() => decodeNeighborCursor(cursor, chair.subjectId, null, ["SUPERVISION"], "pilot-event-v1", ["VISITOR"], eventRoles)).toThrow();
    expect(() => decodeNeighborCursor(cursor, chair.objectId, null, ["SUPERVISION"], "pilot-event-v1", ["VISITOR"], ["CHAIR"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, chair.subjectId, null, null, "pilot-event-v1", ["VISITOR"], ["CHAIR"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, chair.subjectId, null, ["SUPERVISION"], "pilot-event-v1", null, ["CHAIR"])).toThrow();
    expect(() => decodeNeighborCursor(cursor, chair.subjectId, null, ["SUPERVISION"], "pilot-science-v2", ["VISITOR"], ["CHAIR"])).toThrow();
    expect(explorationKey(null, null, null, [])).not.toBe(explorationKey(null));
  });
  it("条件付き受理・開閉・復元を第三型でも共有する", () => {
    const nodes = ledgerInput.entities.map(e => ({ id: e.id, kind: e.kind, name: e.name, description: e.description })) as EntitySummary[];
    const page: NeighborsResponse = { centerId: chair.subjectId, nodes, claims: [chair], page: { hasMore: false, nextCursor: null } };
    const graph = mergePage({ ...emptyGraph(), eventRoles: ["CHAIR"] }, page);
    expect(() => mergePage(graph, { ...page, claims: [broad] })).toThrow();
    const closed = closeExpansion(graph, chair.subjectId); expect(closed.claims).toEqual({});
    expect(reopenExpansion(closed, chair.subjectId).claims).toEqual(graph.claims);
  });
  it("語彙の意味変更と招待混入を拒否し、専用DBだけを許可する", () => {
    expect(checkEventRoleVocabulary(catalog, baseline).errors).toEqual([]);
    const changed = structuredClone(catalog); changed.entries[0].meaning.definition += "招待者も含める";
    expect(checkEventRoleVocabulary(changed, baseline).errors.length).toBeGreaterThan(0);
    expect(() => assertDatasetTarget("pilot-event-v1", "bolt://127.0.0.1:7692")).not.toThrow();
    for (const uri of ["bolt://127.0.0.1:7691", "bolt://remote:7692"]) expect(() => assertDatasetTarget("pilot-event-v1", uri)).toThrow();
    expect(() => assertDatasetTarget("demo", "bolt://127.0.0.1:7692")).toThrow();
  });
});


it("第三型のcatalogとbaselineを同時に書き換えても信頼済みGit版で拒否する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "event-vocabulary-git-"));
  const eventPaths = ["vocabulary/event-participation-roles/catalog.json", "vocabulary/event-participation-roles/baseline-v1.json"];
  const paths = [...Object.keys(ledgerInput.base.files), ledgerInput.research.file, "datasets/pilot-event/v1/ledger.json", "vocabulary/organization-positions/catalog.json", "vocabulary/organization-positions/baseline-v1.json", ...eventPaths];
  try {
    await Promise.all(paths.map(async path => { const destination = join(directory, path); await mkdir(dirname(destination), { recursive: true }); await copyFile(path, destination); }));
    const git = (args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
    git(["init", "-q"]); git(["add", "."]); git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "test baseline"]);
    const check = () => execFileSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/check-qualifications.ts"), "--base-ref", "HEAD"], { cwd: directory, stdio: "pipe" });
    expect(check().toString()).toContain("3独立型");
    const changed = structuredClone(catalog); changed.entries[0].meaning.definition += "テスト専用の意味変更";
    await Promise.all(eventPaths.map(path => writeFile(join(directory, path), JSON.stringify(changed))));
    expect(() => check()).toThrow(/使用済みEvent/);
  } finally { await rm(directory, { recursive: true }); }
}, 15000);
