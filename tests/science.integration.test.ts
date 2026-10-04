import { expect, it } from "vitest";
import { assertDatasetTarget, datasetMode } from "../lib/domain/dataset";
import { fixtureCounts } from "../lib/domain/fixture";
import { openDatabase } from "../lib/server/neo4j";
import { loadSciencePilot } from "../lib/server/science-dataset";
import { loadPilot } from "../lib/server/pilot-dataset";
import { loadPilotV2 } from "../lib/server/pilot-v2-dataset";
import { graphCounts, graphSnapshot, loadFixture, seedFixture } from "../lib/server/seed";
import type { EntityOverviewResponse, NeighborsResponse, ClaimResponse, EntitySearchResponse } from "../lib/domain/api";
import ledger from "../datasets/pilot-science/v1/ledger.json";
const base = "http://127.0.0.1:3213";
it("science real DB: frozen seed, mixing rejection, search, both directions, paging, roles and overview", async () => {
  process.loadEnvFile(".env.science");
  expect(datasetMode(process.env.GRAPH_DATASET)).toBe("pilot-science-v1");
  assertDatasetTarget("pilot-science-v1", process.env.NEO4J_URI!);
  const { driver, database } = openDatabase();
  try {
    const fixture = await loadSciencePilot();
    await seedFixture(driver, database, fixture);
    const before = await graphSnapshot(driver, database);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    for (const other of [await loadFixture(), await loadPilot(), await loadPilotV2()]) {
      await expect(seedFixture(driver, database, other)).rejects.toThrow("outside this fixture/dataset");
      expect(await graphSnapshot(driver, database)).toEqual(before);
    }
    const get = async <T>(path: string, status = 200) => {
      const response = await fetch(`${base}${path}`); expect(response.status).toBe(status); return await response.json() as T;
    };
    const id = (ref: string) => ledger.entities.find((e) => e.ref === ref)!.entity.id;
    const search = await get<EntitySearchResponse>("/api/entities?q=University&kind=organization");
    expect(search.items.map((e) => e.kind)).toEqual(["organization", "organization", "organization"]);
    const initial = await get<NeighborsResponse>(`/api/entities/${id("O1")}/neighbors?limit=1`);
    expect(initial.nodes.some((e) => e.id === id("O1"))).toBe(true); expect(initial.claims).toHaveLength(1);
    const pages = [initial];
    while (pages.at(-1)!.page.hasMore) pages.push(await get<NeighborsResponse>(`/api/entities/${id("O1")}/neighbors?limit=1&after=${pages.at(-1)!.page.nextCursor}`));
    expect(new Set(pages.flatMap((p) => p.claims.map((c) => c.id))).size).toBe(3);
    const ordinary = await get<NeighborsResponse>(`/api/entities/${id("O2")}/neighbors`);
    expect(ordinary.claims).toHaveLength(4); expect(ordinary.claims.every((c) => c.objectId === id("O2"))).toBe(true);
    for (const query of ["contributionRoles=SUPERVISION", "contributionRoles=", "predicates=AFFILIATED_WITH&contributionRoles=PRODUCING"]) {
      expect((await get<NeighborsResponse>(`/api/entities/${id("O2")}/neighbors?${query}`)).claims).toEqual(ordinary.claims);
    }
    expect((await get<NeighborsResponse>(`/api/entities/${id("O2")}/neighbors?predicates=CONTRIBUTED_TO`)).claims).toEqual([]);
    for (const ref of ["P2", "O2"]) {
      const overview = await get<EntityOverviewResponse>(`/api/entities/${id(ref)}/overview`);
      expect(overview.scope.dataset).toBe("pilot-science-v1");
      expect(overview.relations).toEqual([{ predicate: "AFFILIATED_WITH", perspective: ref === "O2" ? "object" : "subject", counts: { affirmed: ref === "O2" ? 4 : 2, denied: 0 }, contributionRoles: [] }]);
    }
    for (const candidate of ledger.candidates.slice(0, 8)) {
      const body = await get<ClaimResponse>(`/api/claims/${candidate.claim.id}`);
      expect(body.claim.period).toEqual(candidate.claim.period); expect(body.claim.contribution).toBeNull();
      expect(body.claim.citations).toHaveLength(candidate.evidence.length);
      for (const evidence of candidate.evidence) if (evidence.originalRole) expect(body.claim.citations.some((c) => c.note?.includes(evidence.originalRole!))).toBe(true);
    }
    await get(`/api/claims/${ledger.candidates[8].claim.id}`, 404);
    await get(`/api/entities/${id("O2")}/neighbors?after=${initial.page.nextCursor}`, 400);
    expect(await graphSnapshot(driver, database)).toEqual(before);
  } finally { await driver.close(); }
}, 120000);
