import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { expect, it } from "vitest";
import { eventContractFixture, EVENT_TEST_IDS as ids } from "./fixtures/event-contract";
import { openDatabase } from "../lib/server/neo4j";
import { graphCounts, graphSnapshot, seedFixture } from "../lib/server/seed";
import { fixtureCounts } from "../lib/domain/fixture";
import { readEventLedger, loadEventPilot } from "../lib/server/event-dataset";
import type { NeighborsResponse, EntityOverviewResponse, ClaimResponse, EntityResponse } from "../lib/domain/api";
import { decodeNeighborCursor } from "../lib/server/neighbor-cursor";

it("人工実DB: 三用途の限定、LIMIT前条件、参加／招待、開催期間、肯否、根拠集計、cursor、冪等性", async () => {
  Object.assign(process.env, { GRAPH_DATASET: "demo", NEO4J_URI: "bolt://127.0.0.1:7693", NEO4J_USER: "neo4j", NEO4J_PASSWORD: "local-event-contract-test", NEO4J_DATABASE: "neo4j" });
  const { driver, database } = openDatabase();
  try {
    const fixture = eventContractFixture();
    await seedFixture(driver, database, fixture);
    const before = await graphSnapshot(driver, database);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    const get = async <T>(path: string, status = 200) => { const response = await fetch(`http://127.0.0.1:3216${path}`); expect(response.status, path).toBe(status); return await response.json() as T; };
    const path = (id: string, query = "") => `/api/entities/${id}/neighbors?${query}`;
    const period = (await get<EntityResponse>(`/api/entities/${ids.event}`)).entity.event!;
    expect(period.granularity).toBe("occurrence"); expect(period.period.from?.value).toBe("2020-01-01");
    for (const center of [ids.person, ids.event]) {
      const result = await get<NeighborsResponse>(path(center, "predicates=PARTICIPATED_IN&eventRoles=CHAIR&limit=1"));
      expect(result.claims[0].id).toBe(ids.chair); expect(result.claims[0].period).toEqual({ from: null, to: null });
      expect(result.claims[0].sourceCount).toBe(1); expect(result.page.hasMore).toBe(true);
      const second = await get<NeighborsResponse>(path(center, `predicates=PARTICIPATED_IN&eventRoles=CHAIR&limit=1&after=${result.page.nextCursor}`));
      expect(second.claims[0].id).toBe(ids.deniedChair); expect(second.claims[0].polarity).toBe("denied"); expect(second.page.hasMore).toBe(false);
      await get(path(center, `predicates=PARTICIPATED_IN&after=${result.page.nextCursor}`), 400);
      await get(path(center === ids.event ? ids.person : ids.event, `predicates=PARTICIPATED_IN&eventRoles=CHAIR&after=${result.page.nextCursor}`), 400);
      await get(path(center, `predicates=PARTICIPATED_IN&eventRoles=&after=${result.page.nextCursor}`), 400);
    }
    const all = await get<NeighborsResponse>(path(ids.person)); expect(all.claims).toHaveLength(5);
    const scoped = await get<NeighborsResponse>(path(ids.person, "contributionRoles=SUPERVISION&organizationPositions=VISITOR&eventRoles=CHAIR"));
    expect(scoped.claims.map(c => c.id)).toEqual([ids.chair, ids.deniedChair, ids.creation, ids.affiliation]);
    expect((await get<NeighborsResponse>(path(ids.person, "eventRoles="))).claims.map(c => c.id)).toEqual([ids.creation, ids.affiliation]);
    expect((await get<NeighborsResponse>(path(ids.person, "contributionRoles=&organizationPositions=&eventRoles=CHAIR"))).claims.map(c => c.id)).toEqual([ids.chair, ids.deniedChair]);
    const cursor = (await get<NeighborsResponse>(path(ids.person, "eventRoles=CHAIR&limit=1"))).page.nextCursor!;
    for (const query of [`eventRoles=CHAIR&organizationPositions=VISITOR&after=${cursor}`, `eventRoles=CHAIR&contributionRoles=SUPERVISION&after=${cursor}`, "eventRoles=INVITED", "predicates=AFFILIATED_WITH&eventRoles=INVITED"]) await get(path(ids.person, query), 400);
    expect(() => decodeNeighborCursor(cursor, ids.person, null, null, "pilot-event-v1", null, ["CHAIR"])).toThrow();
    const detail = await get<ClaimResponse>(`/api/claims/${ids.chair}`);
    expect(detail.claim.eventParticipation).toEqual({ roleId: "CHAIR" }); expect(detail.claim.citations).toHaveLength(2);
    expect(detail.claim.citations[0].eventParticipationEvidence).toEqual({ originalText: "Chair", language: "en" });
    expect(detail.relatedClaimIds).toEqual([ids.broad, ids.deniedChair]);
    expect((await get<ClaimResponse>(`/api/claims/${ids.broad}`)).claim.eventParticipation).toBeNull();
    const overview = await get<EntityOverviewResponse>(`/api/entities/${ids.event}/overview`);
    expect(overview.relations).toHaveLength(1);
    expect(overview.relations[0]).toMatchObject({ predicate: "PARTICIPATED_IN", perspective: "object", counts: { affirmed: 3, denied: 1 }, contributionRoles: [], organizationPositions: [] });
    expect(overview.relations[0].eventRoles).toHaveLength(2);
    expect(overview.relations[0].eventRoles).toEqual(expect.arrayContaining([
      { roleId: null, counts: { affirmed: 2, denied: 0 } },
      { roleId: "CHAIR", counts: { affirmed: 1, denied: 1 } },
    ]));
    const session = driver.session({ database });
    try {
      await session.run("MATCH (c:Claim {id:$id}) SET c.eventRoleId=$invalid", { id: ids.chair, invalid: "INVITED" });
      await get(`/api/claims/${ids.chair}`, 500);
      await get(`/api/entities/${ids.event}/overview`, 500);
    } finally {
      await session.run("MATCH (c:Claim {id:$id}) SET c.eventRoleId='CHAIR'", { id: ids.chair }); await session.close();
    }
    expect(await graphSnapshot(driver, database)).toEqual(before);
  } finally { await driver.close(); }
}, 120000);

const accepted = (await readEventLedger()).ledger.humanAcceptance.decision === "accepted";
it.skipIf(!accepted)("受入済みEvent実資料dataset: 狭い意味・期間・三条件・根拠・cursor・冪等性を確認", async () => {
  Object.assign(process.env, parseEnv(await readFile(".env.event", "utf8")));
  expect(process.env.GRAPH_DATASET).toBe("pilot-event-v1");
  const { driver, database } = openDatabase();
  try {
    const fixture = await loadEventPilot();
    await seedFixture(driver, database, fixture);
    const before = await graphSnapshot(driver, database);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    const event = fixture.entities.find(e => e.kind === "event")!;
    const { ledger } = await readEventLedger();
    const chair = ledger.candidates.find(c => c.eventParticipation)!;
    const broad = ledger.candidates.find(c => c.ref === "E01" && !c.eventParticipation)!;
    const dirac = ledger.candidates.find(c => c.ref === "E03")!;
    const get = async <T>(path: string, status = 200) => {
      const response = await fetch(`http://127.0.0.1:3215${path}`);
      expect(response.status, path).toBe(status); return await response.json() as T;
    };
    const path = (id: string, query = "") => `/api/entities/${id}/neighbors?${query}`;
    const entity = (await get<EntityResponse>(`/api/entities/${event.id}`)).entity;
    expect(entity.event).toEqual(event.event);
    expect(entity.event?.period).toEqual({ from: { value: "1927-10-24", precision: "day" }, to: { value: "1927-10-29", precision: "day" } });
    const page = await get<NeighborsResponse>(path(event.id));
    expect(page.nodes).toHaveLength(3); expect(page.claims).toHaveLength(3);
    expect(page.claims.every(c => c.period.from === null && c.period.to === null)).toBe(true);
    for (const center of [event.id, chair.subjectId]) {
      const filtered = await get<NeighborsResponse>(path(center, "eventRoles=CHAIR&limit=1"));
      expect(filtered.claims.map(c => c.id)).toEqual([chair.claimId]); // 広いClaimが先でもLIMIT前に絞る
      expect(filtered.page.hasMore).toBe(false);
      expect((await get<NeighborsResponse>(path(center, "contributionRoles=&organizationPositions=&eventRoles=CHAIR"))).claims).toEqual(filtered.claims);
    }
    const diracPage = await get<NeighborsResponse>(path(dirac.subjectId));
    expect(diracPage.claims).toHaveLength(3);
    expect((await get<NeighborsResponse>(path(dirac.subjectId, "eventRoles=CHAIR"))).claims.map(c => c.predicate)).toEqual(["AFFILIATED_WITH", "AFFILIATED_WITH"]);
    expect((await get<NeighborsResponse>(path(dirac.subjectId, "contributionRoles=SUPERVISION"))).claims).toEqual(diracPage.claims);
    expect((await get<NeighborsResponse>(path(dirac.subjectId, "organizationPositions=&eventRoles="))).claims).toEqual([]);
    expect((await get<NeighborsResponse>(path(dirac.subjectId, "organizationPositions=&contributionRoles=&eventRoles=CHAIR"))).claims).toEqual([]);
    for (const candidate of [broad, chair, dirac]) {
      const detail = await get<ClaimResponse>(`/api/claims/${candidate.claimId}`);
      expect(detail.claim.eventParticipation).toEqual(candidate.eventParticipation);
      expect(detail.claim.period).toEqual({ from: null, to: null });
      expect(detail.claim.polarity).toBe("affirmed");
      expect(detail.claim.citations).toHaveLength(candidate.citations.length);
      expect(detail.claim.sourceCount).toBe(candidate.citations.length);
      for (const citation of candidate.citations) {
        const actual = detail.claim.citations.find(c => c.id === citation.id)!;
        expect(actual.locator).toBe(citation.locator);
        expect(actual.eventParticipationEvidence).toEqual(citation.eventParticipationEvidence);
        expect(actual.source.id).toBe(ledger.sources.find(s => s.ref === citation.sourceRef)!.id);
        expect(actual.source.isDemo).toBe(false);
      }
      expect(detail.relatedClaimIds).toEqual(candidate.ref === "E01" ? [candidate.claimId === chair.claimId ? broad.claimId : chair.claimId] : []);
    }
    const first = await get<NeighborsResponse>(path(event.id, "limit=1"));
    expect(first.page.hasMore).toBe(true);
    expect(decodeNeighborCursor(first.page.nextCursor!, event.id, null, null, "pilot-event-v1")).toBe(first.claims[0].id);
    await get(path(event.id, `eventRoles=CHAIR&after=${first.page.nextCursor}`), 400);
    await get(path(dirac.subjectId, `after=${first.page.nextCursor}`), 400);
    const second = await get<NeighborsResponse>(path(event.id, `limit=1&after=${first.page.nextCursor}`));
    const third = await get<NeighborsResponse>(path(event.id, `limit=1&after=${second.page.nextCursor}`));
    expect(new Set([...first.claims, ...second.claims, ...third.claims].map(c => c.id)).size).toBe(3);
    expect(third.page.hasMore).toBe(false);
    const overview = await get<EntityOverviewResponse>(`/api/entities/${event.id}/overview`);
    expect(overview.scope.dataset).toBe("pilot-event-v1");
    expect(overview.relations).toHaveLength(1);
    expect(overview.relations[0]).toMatchObject({ predicate: "PARTICIPATED_IN", perspective: "object", counts: { affirmed: 3, denied: 0 }, contributionRoles: [], organizationPositions: [] });
    expect(overview.relations[0].eventRoles).toHaveLength(2);
    expect(overview.relations[0].eventRoles).toEqual(expect.arrayContaining([
      { roleId: null, counts: { affirmed: 2, denied: 0 } },
      { roleId: "CHAIR", counts: { affirmed: 1, denied: 0 } },
    ]));
    expect(fixture.claims.filter(c => c.predicate === "PARTICIPATED_IN")).toHaveLength(3);
    expect(fixture.claims.every(c => c.polarity === "affirmed")).toBe(true); // 欠席からdeniedを捏造しない
    expect(await graphSnapshot(driver, database)).toEqual(before);
  } finally { await driver.close(); }
}, 120000);
