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
    expect(overview.relations).toEqual([{ predicate: "PARTICIPATED_IN", perspective: "object", counts: { affirmed: 3, denied: 1 }, contributionRoles: [] }]);
    const session = driver.session({ database });
    try {
      await session.run("MATCH (c:Claim {id:$id}) SET c.eventRoleId=$invalid", { id: ids.chair, invalid: "INVITED" });
      await get(`/api/claims/${ids.chair}`, 500);
    } finally {
      await session.run("MATCH (c:Claim {id:$id}) SET c.eventRoleId='CHAIR'", { id: ids.chair }); await session.close();
    }
    expect(await graphSnapshot(driver, database)).toEqual(before);
  } finally { await driver.close(); }
}, 120000);

const accepted = (await readEventLedger()).ledger.humanAcceptance.decision === "accepted";
it.skipIf(!accepted)("受入済みEvent実資料dataset: 凍結版・冪等性・参加3Claimと2接続を確認", async () => {
  Object.assign(process.env, parseEnv(await readFile(".env.event", "utf8")));
  expect(process.env.GRAPH_DATASET).toBe("pilot-event-v1");
  const { driver, database } = openDatabase();
  try {
    const fixture = await loadEventPilot();
    await seedFixture(driver, database, fixture);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    const event = fixture.entities.find(e => e.kind === "event")!;
    const response = await fetch(`http://127.0.0.1:3215/api/entities/${event.id}/neighbors`);
    expect(response.status).toBe(200); const page = await response.json() as NeighborsResponse;
    expect(page.nodes).toHaveLength(3); expect(page.claims).toHaveLength(3);
    expect(page.claims.every(c => c.period.from === null && c.period.to === null)).toBe(true);
  } finally { await driver.close(); }
}, 120000);
