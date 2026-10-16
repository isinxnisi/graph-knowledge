import { afterAll, expect, it, vi } from "vitest";
import { openDatabase } from "../lib/server/neo4j";
import { loadPublicRelease, sha256, type PublicRelease } from "../lib/server/public-dataset";
import { applyPublicRelease, planPublicRelease } from "../lib/server/public-graph";
import { getNeighbors, getClaim, getEntityOverview } from "../lib/server/graph";
import { validateFixture } from "../lib/domain/fixture";
vi.mock("server-only", () => ({}));
if (process.env.GRAPH_DATASET !== "public-kg" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695") throw Error("Disposable original-story DB only");
const { driver, database } = openDatabase();
afterAll(async () => {
  await driver.close();
  await (globalThis as typeof globalThis & { graphReadDatabase?: ReturnType<typeof openDatabase> }).graphReadDatabase?.driver.close();
});
async function coldRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt >= 2 || !(error instanceof Error) || error.name !== "Neo4jError" || !/timeout|timed out/i.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
it("隔離した合成ClaimでLIMIT前条件・両方向・cursor・詳細・旧Claim保全を確認", async () => {
  const initial = await loadPublicRelease();
  const subject = "10000000-0000-4000-8000-000000000001", object = "10000000-0000-4000-8000-000000000002";
  const source = { ...initial.fixture.sources[0], id: "10000000-0000-4000-8000-000000000003", title: "隔離検証専用資料", url: "https://example.org/isolated-role-test" };
  const stamp = "2026-10-17T00:00:00Z";
  const claims = [null, "AUTHORSHIP", "ORIGINAL_STORY", "ORIGINAL_STORY", "ORIGINAL_STORY"].map((roleId, i) => ({
    ...initial.fixture.claims[0], id: `20000000-0000-4000-8000-00000000000${i}`, subjectId: subject, objectId: object,
    predicate: "CONTRIBUTED_TO", polarity: "affirmed", period: { from: null, to: null }, visibility: "published", createdAt: stamp, updatedAt: stamp,
    contribution: { roleId, scope: null }, organizationParticipation: null, eventParticipation: null,
  }));
  const fixture = validateFixture({ ...initial.fixture,
    entities: [...initial.fixture.entities, { ...initial.fixture.entities.find(e => e.kind === "person")!, id: subject, name: "隔離原作担当", externalIds: [] }, { ...initial.fixture.entities.find(e => e.kind === "work")!, id: object, name: "隔離漫画作品", externalIds: [] }],
    claims: [...initial.fixture.claims, ...claims], sources: [...initial.fixture.sources, source],
    citations: [...initial.fixture.citations, ...claims.map((c, i) => ({ ...initial.fixture.citations[0], id: `30000000-0000-4000-8000-00000000000${i}`, claimId: c.id, sourceId: source.id, locator: "隔離資料の責任表示", roleEvidence: c.contribution.roleId ? { originalText: c.contribution.roleId === "ORIGINAL_STORY" ? "隔離原作担当 原作" : "隔離原作担当 著", language: "ja" } : null, positionEvidence: null, eventParticipationEvidence: null }))],
  });
  const published: PublicRelease = { fixture, manifest: { ...initial.manifest, release: "isolated-original-story", baseRelease: null, reason: "合成データの隔離検証。人間の候補受入を意味しない。", dataSha256: sha256(JSON.stringify(fixture, null, 2) + "\n"), claimOrigins: [...initial.manifest.claimOrigins, ...claims.map(c => ({ claimId: c.id, dataset: "isolated-test", sourceClaimId: c.id }))] } };
  await applyPublicRelease(driver, database, published);
  const withdrawn = { ...fixture, claims: fixture.claims.map(c => c.id === claims[4].id ? { ...c, visibility: "hidden" as const } : c) };
  const release: PublicRelease = { fixture: withdrawn, manifest: { ...published.manifest, baseRelease: published.manifest.release, release: "isolated-original-story-withdrawal", dataSha256: sha256(JSON.stringify(withdrawn, null, 2) + "\n"), withdrawals: [{ claimId: claims[4].id, reason: "隔離した非公開検証Claim", release: "isolated-original-story-withdrawal", replacementClaimId: null }] } };
  await applyPublicRelease(driver, database, release);
  const plan = await planPublicRelease(driver, database, release);
  expect(plan).toMatchObject({ added: [], updated: [], relationshipsAdded: 0 });
  const first = await coldRead(() => getNeighbors(subject, 1, null, ["CONTRIBUTED_TO"], ["ORIGINAL_STORY"]));
  expect(first.claims.map(c => c.id)).toEqual([claims[2].id]);
  expect(first.page.hasMore).toBe(true);
  const second = await coldRead(() => getNeighbors(subject, 1, first.page.nextCursor, ["CONTRIBUTED_TO"], ["ORIGINAL_STORY"]));
  expect(second.claims.map(c => c.id)).toEqual([claims[3].id]); expect(second.page.hasMore).toBe(false);
  await expect(getNeighbors(subject, 1, first.page.nextCursor, ["CONTRIBUTED_TO"], ["AUTHORSHIP"])).rejects.toThrow();
  const reverse = await coldRead(() => getNeighbors(object, 20, null, ["CONTRIBUTED_TO"], ["ORIGINAL_STORY"]));
  expect(reverse.claims.map(c => c.id)).toEqual([claims[2].id, claims[3].id]);
  const authors = await coldRead(() => getNeighbors(subject, 20, null, ["CONTRIBUTED_TO"], ["AUTHORSHIP"]));
  expect(authors.claims.map(c => c.id)).toEqual([claims[1].id]);
  const broad = await coldRead(() => getNeighbors(subject, 20, null));
  expect(broad.claims.map(c => c.id)).toEqual(claims.slice(0, 4).map(c => c.id));
  const detail = await coldRead(() => getClaim(claims[2].id));
  expect(detail.claim.contribution).toEqual({ roleId: "ORIGINAL_STORY", scope: null });
  expect(detail.claim.citations[0].roleEvidence?.originalText).toBe("隔離原作担当 原作");
  expect(detail.relatedClaimIds).toContain(claims[0].id);
  expect(detail.relatedClaimIds).not.toContain(claims[4].id);
  const overview = await coldRead(() => getEntityOverview(object));
  expect(overview.relations[0].contributionRoles.find(r => r.roleId === "ORIGINAL_STORY")?.counts).toEqual({ affirmed: 2, denied: 0 });
  expect(await applyPublicRelease(driver, database, release)).toMatchObject({ unchanged: true, added: [], updated: [] });
}, 180000);
