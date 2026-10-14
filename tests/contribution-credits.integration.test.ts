import { afterAll, expect, it, vi } from "vitest";
import { openDatabase } from "../lib/server/neo4j";
import { loadPublicRelease, sha256, type PublicRelease } from "../lib/server/public-dataset";
import { applyPublicRelease, planPublicRelease } from "../lib/server/public-graph";
import { getNeighbors, getClaim, getEntityOverview, searchEntities } from "../lib/server/graph";
vi.mock("server-only", () => ({}));
if (process.env.GRAPH_DATASET !== "public-kg" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695") throw Error("Isolated credits DB only");
const { driver, database } = openDatabase();
afterAll(async () => {
  await driver.close();
  await (globalThis as typeof globalThis & { graphReadDatabase?: ReturnType<typeof openDatabase> }).graphReadDatabase?.driver.close();
});
// Warm each cold Cypher read shape under the unchanged 5-second API timeout.
// Only a startup transaction timeout can retry, at most twice; assertions never retry.
async function coldRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt >= 2 || !(error instanceof Error) || error.name !== "Neo4jError" || !/timeout|timed out/i.test(error.message)) throw error;
      console.warn("Isolated cold query timed out; retrying readiness read under the same API limit");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
it("実資料の新Roleを隔離DBへ追加しLIMIT前条件・根拠・比較・冪等性を確認", async () => {
  // Keep exact real Entity/Claim/Citation contents for all original three domains
  // and the PLUTO additions. Rebuilding thousands of unrelated affiliations is
  // not part of this Role slice; full release immutability is checked by unit/plan.
  const initial = await loadPublicRelease();
  const fullBase = await loadPublicRelease("datasets/public-kg/releases/20261014-pluto-001");
  const fullNext = await loadPublicRelease("datasets/public-kg/releases/20261014-credits-001");
  const baseIds = new Set([...initial.fixture.claims.map(c => c.id), ...fullBase.manifest.claimOrigins.filter(o => o.dataset === "pluto-expansion-v1").map(o => o.claimId)]);
  const oldCitationIds = new Set([...initial.fixture.citations.map(c => c.id), ...fullBase.fixture.citations.filter(c => fullBase.manifest.claimOrigins.some(o => o.claimId === c.claimId && o.dataset === "pluto-expansion-v1")).map(c => c.id)]);
  const project = (release: PublicRelease, withCredits: boolean): PublicRelease => {
    const added = new Set(withCredits ? release.manifest.claimOrigins.filter(o => o.dataset === "contribution-credits-v1").map(o => o.claimId) : []);
    const claims = release.fixture.claims.filter(c => baseIds.has(c.id) || added.has(c.id));
    const citations = release.fixture.citations.filter(c => oldCitationIds.has(c.id) || added.has(c.claimId));
    const entityIds = new Set([...initial.fixture.entities.map(e => e.id), ...claims.flatMap(c => [c.subjectId, c.objectId])]);
    const sourceIds = new Set(citations.map(c => c.sourceId));
    const fixture = { ...release.fixture, entities: release.fixture.entities.filter(e => entityIds.has(e.id)), claims, citations, sources: release.fixture.sources.filter(x => sourceIds.has(x.id)) };
    return { fixture, manifest: { ...release.manifest, baseRelease: withCredits ? fullBase.manifest.release : null, reason: "隔離した実資料部分GraphのRole検証。公開artifactは不変。", dataSha256: sha256(JSON.stringify(fixture, null, 2) + "\n"), claimOrigins: release.manifest.claimOrigins.filter(o => baseIds.has(o.claimId) || added.has(o.claimId)) } };
  };
  const base = project(fullBase, false), next = project(fullNext, true);
  await applyPublicRelease(driver, database, base);
  console.log("Isolated current real-data slice ready");
  const plan = await planPublicRelease(driver, database, next);
  expect(plan.updated).toEqual([]); expect(plan.added).toHaveLength(25); expect(plan.relationshipsAdded).toBe(40);
  await applyPublicRelease(driver, database, next);
  console.log("10 credit-qualified Claims applied");
  expect(await applyPublicRelease(driver, database, next)).toMatchObject({ unchanged: true, added: [], updated: [], relationshipsAdded: 0 });
  console.log("Reapply unchanged; checking actual read APIs");
  const urasawa = next.fixture.entities.find(e => e.name === "浦沢直樹")!.id;
  const draw = await coldRead(() => getNeighbors(urasawa, 1, null, ["CONTRIBUTED_TO"], ["DRAWING"]));
  expect(draw.claims).toHaveLength(1);
  expect(draw.claims[0].contribution?.roleId).toBe("DRAWING");
  const artwork = await coldRead(() => getClaim(draw.claims[0].id));
  expect(artwork.claim.citations[0].roleEvidence?.originalText).toBe("画: 浦沢直樹");
  expect(artwork.relatedClaimIds).toHaveLength(1);
  expect(artwork.relatedClaimIds).not.toContain(artwork.claim.id);
  expect(artwork.claim.contribution?.scope?.isbn13).toBe("9784091921116");
  const authors: string[] = []; let cursor: string | null = null;
  do {
    const page = await coldRead(() => getNeighbors(urasawa, 1, cursor, ["CONTRIBUTED_TO"], ["AUTHORSHIP"]));
    expect(page.claims).toHaveLength(1);
    expect(page.claims[0].contribution?.roleId).toBe("AUTHORSHIP");
    authors.push(page.claims[0].id); cursor = page.page.nextCursor;
  } while (cursor);
  expect(new Set(authors).size).toBe(6);
  const creation = await coldRead(() => getNeighbors(urasawa, 20, null, null, ["CREATION"]));
  expect(creation.claims.filter(c => c.predicate === "CONTRIBUTED_TO")).toHaveLength(1);
  expect(creation.claims.some(c => c.predicate === "INFLUENCED_BY")).toBe(true);
  const broad = await coldRead(() => getNeighbors(urasawa, 20, null));
  expect(broad.claims).toHaveLength(17);
  const search = await coldRead(() => searchEntities("浦沢直樹", 20, ["person"]));
  expect(search.items.some(e => e.id === urasawa)).toBe(true);
  const pluto = next.fixture.entities.find(e => e.name === "PLUTO")!.id;
  const overview = await coldRead(() => getEntityOverview(pluto));
  expect(overview.relations.find(r => r.predicate === "CONTRIBUTED_TO")!.contributionRoles.some(r => r.roleId === "AUTHORSHIP")).toBe(true);
}, 300000);
