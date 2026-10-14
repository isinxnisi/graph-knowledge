import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { datasetMode, assertDatasetTarget } from "../lib/domain/dataset";
import { fixtureCounts } from "../lib/domain/fixture";
import { openDatabase } from "../lib/server/neo4j";
import { loadPilotV2 } from "../lib/server/pilot-v2-dataset";
import { graphCounts, graphSnapshot, seedFixture } from "../lib/server/seed";
import { contributionProperties } from "../lib/domain/contribution";
import { dateProperties } from "../lib/domain/dates";
import type { EntityOverviewResponse, NeighborsResponse, ClaimResponse } from "../lib/domain/api";
const base = "http://127.0.0.1:3212";
it("v2 seed/real API and isolated synthetic role cases", async () => {
  process.loadEnvFile(".env.pilot-v2");
  expect(datasetMode(process.env.GRAPH_DATASET)).toBe("pilot-urasawa-v2");
  assertDatasetTarget("pilot-urasawa-v2", process.env.NEO4J_URI!);
  const { driver, database } = openDatabase();
  const session = driver.session({ database });
  const marker = randomUUID();
  let before: unknown;
  try {
    const fixture = await loadPilotV2();
    await seedFixture(driver, database, fixture);
    expect(await seedFixture(driver, database, fixture)).toEqual({ nodesCreated: 0, relationshipsCreated: 0 });
    expect(await graphCounts(driver, database)).toEqual(fixtureCounts(fixture));
    await expect(seedFixture(driver, database, { ...fixture, schemaVersion: 1 })).rejects.toThrow();
    before = await graphSnapshot(driver, database);
    const center = randomUUID(), work = randomUUID();
    await session.run("CREATE (p:Entity {id:$center,kind:'person',name:'Role試験人物',description:'専用テスト',aliases:[],searchNames:['role試験人物'],testMarker:$marker}), (w:Entity {id:$work,kind:'work',name:'Role試験作品',description:'専用テスト',aliases:[],searchNames:['role試験作品'],testMarker:$marker})", { center, work, marker });
    const ids = Array.from({ length: 6 }, () => randomUUID()).sort();
    const roleIds = [null, "PRODUCING", "SUPERVISION", "SUPERVISION", "SUPERVISION", "SCRIPT_WRITING"] as const;
    for (let i = 0; i < ids.length; i++) {
      const scope = { kind: "publication" as const, isbn13: i === 4 ? "9784091841612" : "9784091874313", volumeLabel: "第1巻", editionLabel: null, language: "ja" };
      const properties = { id: ids[i], predicate: "CONTRIBUTED_TO", polarity: i >= 3 ? "denied" : "affirmed", visibility: "published", createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-03T09:00:00Z", ...dateProperties("from", null), ...dateProperties("to", null), ...contributionProperties({ roleId: roleIds[i], scope }), testMarker: marker };
      await session.run("MATCH (p:Entity {id:$center}),(w:Entity {id:$work}) CREATE(c:Claim) SET c += $properties CREATE(c)-[:SUBJECT]->(p),(c)-[:OBJECT]->(w)", { center, work, properties });
    }
    await session.run("MATCH(c:Claim {id:$claim}) CREATE(s:Source {id:$source,kind:'web',title:'Role専用架空資料',authors:[],isDemo:true,url:'https://example.invalid/role-test',testMarker:$marker}), (citation:Citation {id:$citation,locator:'テストの役割表記',stance:'support',roleOriginalText:'監修していない（テスト）',roleOriginalLanguage:'ja',testMarker:$marker}) CREATE(c)-[:HAS_CITATION]->(citation),(citation)-[:CITES]->(s)", { claim: ids[3], source: randomUUID(), citation: randomUUID(), marker });
    const get = async (id: string, query: string) => {
      const response = await fetch(`${base}/api/entities/${id}/neighbors?${query}`); expect(response.status).toBe(200); return await response.json() as NeighborsResponse;
    };
    for (const [target, perspective] of [[center, "subject"], [work, "object"]] as const) {
      const response = await fetch(`${base}/api/entities/${target}/overview`); expect(response.status).toBe(200);
      const overview = await response.json() as EntityOverviewResponse;
      expect(overview.scope.dataset).toBe("pilot-urasawa-v2");
      expect(overview.relations).toHaveLength(1);
      expect(overview.relations[0]).toMatchObject({ perspective, counts: { affirmed: 3, denied: 3 } });
      expect(overview.relations[0].contributionRoles).toEqual(expect.arrayContaining([
        { roleId: null, counts: { affirmed: 1, denied: 0 } },
        { roleId: "SUPERVISION", counts: { affirmed: 1, denied: 2 } },
      ]));
    }
    const first = await get(center, "limit=1&contributionRoles=SUPERVISION");
    expect(first.claims.map((c) => c.id)).toEqual([ids[2]]); expect(first.page.hasMore).toBe(true);
    const second = await get(center, `limit=1&contributionRoles=SUPERVISION&after=${first.page.nextCursor}`);
    expect(second.claims[0].id).toBe(ids[3]); expect(second.claims[0].polarity).toBe("denied");
    const third = await get(center, `limit=1&contributionRoles=SUPERVISION&after=${second.page.nextCursor}`);
    expect(third.claims[0].id).toBe(ids[4]); expect(third.page.hasMore).toBe(false);
    expect((await get(work, "contributionRoles=SUPERVISION")).claims).toHaveLength(3);
    expect((await get(center, "contributionRoles=")).claims).toEqual([]);
    expect((await get(center, "contributionRoles=PRODUCING,SCRIPT_WRITING,STORY_CO_CREATION,SUPERVISION")).claims).toHaveLength(5);
    for (const query of [`after=${ids[0]}`, `contributionRoles=PRODUCING&after=${first.page.nextCursor}`, `after=${first.page.nextCursor}`, "contributionRoles=UNKNOWN_ROLE"]) expect((await fetch(`${base}/api/entities/${center}/neighbors?${query}`)).status).toBe(400);
    const detail = await fetch(`${base}/api/claims/${ids[2]}`); expect(detail.status).toBe(200);
    const body = await detail.json() as ClaimResponse;
    expect(body.relatedClaimIds).toEqual(ids.filter((id) => id !== ids[2]));
    expect(body.claim.contribution?.scope?.isbn13).toBe("9784091874313"); expect(body.claim.citations).toEqual([]);
    const deniedDetail = await (await fetch(`${base}/api/claims/${ids[3]}`)).json() as ClaimResponse;
    expect(deniedDetail.claim.polarity).toBe("denied");
    expect(deniedDetail.claim.citations[0].roleEvidence).toEqual({ originalText: "監修していない（テスト）", language: "ja" });
    expect(deniedDetail.claim.citations[0].source.title).toBe("Role専用架空資料");
    await session.run("MATCH(c:Claim {id:$id}) REMOVE c.contributionScopeLanguage", { id: ids[2] });
    expect((await fetch(`${base}/api/claims/${ids[2]}`)).status).toBe(500);
    await session.run("MATCH(c:Claim {id:$id}) SET c.contributionScopeLanguage='ja'", { id: ids[2] });
    for (const claim of fixture.claims.filter((c) => c.contribution?.roleId)) {
      const response = await fetch(`${base}/api/claims/${claim.id}`); expect(response.status).toBe(200);
      const body = await response.json() as ClaimResponse;
      expect(body.claim.contribution).toEqual(claim.contribution); expect(body.claim.citations[0].roleEvidence).not.toBeNull();
      expect(body.relatedClaimIds.length).toBeGreaterThan(0); expect(body.claim.citations[0].source.isDemo).toBe(false);
    }
  } finally {
    await session.run("MATCH(n {testMarker:$marker}) DETACH DELETE n", { marker });
    if (before) expect(await graphSnapshot(driver, database)).toEqual(before);
    await session.close(); await driver.close();
  }
}, 120000);
