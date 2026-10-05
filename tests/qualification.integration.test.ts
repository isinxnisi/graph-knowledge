import { expect, it } from "vitest";
import { loadScienceV2 } from "../lib/server/science-v2-dataset";
import { loadSciencePilot } from "../lib/server/science-dataset";
import { loadPilotV2 } from "../lib/server/pilot-v2-dataset";
import { graphCounts, graphSnapshot, seedFixture } from "../lib/server/seed";
import { openDatabase } from "../lib/server/neo4j";
import { assertDatasetTarget, datasetMode } from "../lib/domain/dataset";
import { fixtureCounts } from "../lib/domain/fixture";
import type { ClaimResponse, NeighborsResponse, EntityOverviewResponse } from "../lib/domain/api";
import ledger from "../datasets/pilot-science/v2/ledger.json";
const base = "http://127.0.0.1:3214";
it("科学v2実DB: 独立2限定、両方向、LIMIT前条件、cursor、凍結Claim、根拠、集計、混在拒否、冪等性", async () => {
  process.loadEnvFile(".env.science-v2");
  expect(datasetMode(process.env.GRAPH_DATASET)).toBe("pilot-science-v2"); assertDatasetTarget("pilot-science-v2", process.env.NEO4J_URI!);
  const { driver, database } = openDatabase();
  try {
    const fixture = await loadScienceV2();
    await seedFixture(driver, database, fixture);
    const before = await graphSnapshot(driver, database);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    for (const other of [await loadSciencePilot(), await loadPilotV2()]) {
      await expect(seedFixture(driver, database, other)).rejects.toThrow("outside this fixture/dataset");
      expect(await graphSnapshot(driver, database)).toEqual(before);
    }
    const get = async <T>(path: string, status = 200) => { const response = await fetch(`${base}${path}`); expect(response.status).toBe(status); return await response.json() as T; };
    const visitor = fixture.claims.find(c => c.organizationParticipation?.positionId === "VISITOR")!;
    const professor = fixture.claims.find(c => c.organizationParticipation?.positionId === "ASSOCIATE_PROFESSOR")!;
    const neighborPath = (id = visitor.subjectId) => `/api/entities/${id}/neighbors`;
    const broad = await get<NeighborsResponse>(neighborPath()); expect(broad.claims).toHaveLength(4);
    expect(broad.claims.find(c => c.id === ledger.candidates[0].baseClaimId)?.organizationParticipation).toBeNull();
    for (const positionId of ["VISITOR", "ASSOCIATE_PROFESSOR"]) for (const id of [visitor.subjectId, visitor.objectId]) {
      const result = await get<NeighborsResponse>(`${neighborPath(id)}?limit=1&organizationPositions=${positionId}`);
      expect(result.claims).toHaveLength(1); expect(result.claims[0].organizationParticipation?.positionId).toBe(positionId);
      expect(result.page.hasMore).toBe(false); expect(result.nodes).toHaveLength(2);
    }
    for (const query of ["contributionRoles=", "contributionRoles=SUPERVISION", "predicates=AFFILIATED_WITH&contributionRoles=PRODUCING"]) expect((await get<NeighborsResponse>(`${neighborPath()}?${query}`)).claims).toEqual(broad.claims);
    const filter = "organizationPositions=ASSOCIATE_PROFESSOR,VISITOR";
    const first = await get<NeighborsResponse>(`${neighborPath()}?${filter}&limit=1`); expect(first.page.hasMore).toBe(true);
    const second = await get<NeighborsResponse>(`${neighborPath()}?${filter}&limit=1&after=${first.page.nextCursor}`);
    expect(second.page.hasMore).toBe(false); expect(new Set([...first.claims, ...second.claims].map(c => c.id)).size).toBe(2);
    await get(`${neighborPath()}?organizationPositions=VISITOR&after=${first.page.nextCursor}`, 400);
    await get(`${neighborPath(visitor.objectId)}?${filter}&after=${first.page.nextCursor}`, 400);
    await get(`${neighborPath()}?after=${first.page.nextCursor}`, 400);
    for (const query of ["organizationPositions=PROFESSOR", "organizationPositions=PRODUCING", "organizationPositions=VISITOR&organizationPositions=VISITOR"]) await get(`${neighborPath()}?${query}`, 400);
    expect((await get<NeighborsResponse>(`${neighborPath()}?organizationPositions=`)).claims).toEqual([]);
    expect((await get<NeighborsResponse>(`${neighborPath()}?predicates=CONTRIBUTED_TO&organizationPositions=VISITOR`)).claims).toEqual([]);
    for (const claim of [visitor, professor]) {
      const result = await get<ClaimResponse>(`/api/claims/${claim.id}`);
      expect(result.claim.period).toEqual(claim.period); expect(result.claim.organizationParticipation).toEqual(claim.organizationParticipation);
      expect(result.claim.sourceCount).toBe(1); expect(result.claim.citations).toHaveLength(1);
      expect(result.claim.citations[0].positionEvidence?.language).toBe("en"); expect(result.claim.citations[0].source.id).toBe(ledger.sourceId);
      expect(result.relatedClaimIds).toHaveLength(2); expect(result.relatedClaimIds).toContain(ledger.candidates[0].baseClaimId);
    }
    const session = driver.session({ database });
    try {
      await session.run("MATCH (c:Claim {id: $id}) SET c.organizationPositionId = $invalid", { id: visitor.id, invalid: "PROFESSOR" });
      await get(`/api/claims/${visitor.id}`, 500);
      await get(`/api/entities/${visitor.objectId}/overview`, 500);
    } finally {
      await session.run("MATCH (c:Claim {id: $id}) SET c.organizationPositionId = $position", { id: visitor.id, position: "VISITOR" });
      await session.close();
    }
    const overview = await get<EntityOverviewResponse>(`/api/entities/${visitor.objectId}/overview`);
    expect(overview.scope.dataset).toBe("pilot-science-v2");
    expect(overview.relations).toHaveLength(1);
    expect(overview.relations[0]).toMatchObject({ predicate: "AFFILIATED_WITH", perspective: "object", counts: { affirmed: 6, denied: 0 }, contributionRoles: [], eventRoles: [] });
    expect(overview.relations[0].organizationPositions).toHaveLength(3);
    expect(overview.relations[0].organizationPositions).toEqual(expect.arrayContaining([
      { positionId: null, counts: { affirmed: 4, denied: 0 } },
      { positionId: "VISITOR", counts: { affirmed: 1, denied: 0 } },
      { positionId: "ASSOCIATE_PROFESSOR", counts: { affirmed: 1, denied: 0 } },
    ]));
    expect(await graphSnapshot(driver, database)).toEqual(before);
  } finally { await driver.close(); }
}, 120000);
