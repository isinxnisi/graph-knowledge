import { afterAll, beforeEach, expect, it } from "vitest";
import { openDatabase } from "../lib/server/neo4j";
import { applyPublicRelease, planPublicRelease } from "../lib/server/public-graph";
import { loadPublicRelease, sha256, type PublicRelease } from "../lib/server/public-dataset";

if (process.env.GRAPH_DATASET !== "public-kg" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695") throw new Error("Use public:integration with its isolated temporary DB");
const { driver, database } = openDatabase();
const run = async (query: string) => {
  const session = driver.session({ database });
  try { return await session.run(query); } finally { await session.close(); }
};
// 更新検証用の全件比較。利用者APIの5秒制限とは別の60秒枠で行う。
async function captureSnapshot() {
  const session = driver.session({ database });
  try {
    return await session.executeRead(async tx => {
      const nodes = await tx.run("MATCH (n) RETURN labels(n) AS labels, properties(n) AS properties ORDER BY n.id");
      const edges = await tx.run("MATCH (s)-[r]->(t) RETURN s.id AS subjectId, type(r) AS type, t.id AS objectId ORDER BY subjectId, type, objectId");
      return { nodes: nodes.records.map(record => record.toObject()), relationships: edges.records.map(record => record.toObject()) };
    }, { timeout: 60000 });
  } finally { await session.close(); }
}
beforeEach(async () => { await run("MATCH (n) DETACH DELETE n"); }, 60000);
afterAll(async () => { await driver.close(); }, 60000);
const next = (release: PublicRelease, id = "test-002"): PublicRelease => {
  const result = structuredClone(release);
  result.manifest.baseRelease = release.manifest.release; result.manifest.release = id;
  result.manifest.reason = "隔離DBでの更新検証";
  return result;
};
const hash = (release: PublicRelease) => { release.manifest.dataSha256 = sha256(JSON.stringify(release.fixture, null, 2) + "\n"); return release; };

it("dry-runは無書込、初回適用と再適用で全属性・接続・外部IDが不変", async () => {
  const release = await loadPublicRelease();
  const before = await captureSnapshot();
  const plan = await planPublicRelease(driver, database, release);
  expect(plan.added).toHaveLength(105); expect(plan.relationshipsAdded).toBe(128);
  expect(await captureSnapshot()).toEqual(before);
  const applied = await applyPublicRelease(driver, database, release);
  expect(applied.unchanged).toBe(false);
  const snapshot = await captureSnapshot();
  expect(await applyPublicRelease(driver, database, release)).toMatchObject({ unchanged: true, added: [], updated: [], relationshipsAdded: 0 });
  expect(await captureSnapshot()).toEqual(snapshot);
}, 60000);

it("表記訂正・新Entity・新ClaimとCitationを追加し、既存IDと根拠を維持", async () => {
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const second = next(first);
  second.fixture.entities[0].description = "名称補助情報の訂正";
  const claim = structuredClone(second.fixture.claims[0]);
  claim.id = "4205b341-26a2-4d90-b5a2-6c6c15bfc0f8";
  second.fixture.claims.push(claim);
  second.manifest.claimOrigins.push({ claimId: claim.id, dataset: "integration-test-only", sourceClaimId: claim.id });
  const citation = structuredClone(second.fixture.citations.find(c => c.claimId === second.fixture.claims[0].id)!);
  citation.id = "ad530b65-f7df-4d13-8d92-a0d8f61d5ac0"; citation.claimId = claim.id; second.fixture.citations.push(citation);
  const entity = structuredClone(second.fixture.entities[0]); entity.id = "2945e177-dfcc-4439-8416-469b274ff4e8"; entity.externalIds = []; second.fixture.entities.push(entity);
  const plan = await planPublicRelease(driver, database, hash(second));
  expect(plan.added).toHaveLength(3); expect(plan.updated).toHaveLength(1);
  expect(await applyPublicRelease(driver, database, second)).toMatchObject({ unchanged: false, relationshipsAdded: 4 });
  const snapshot = await captureSnapshot();
  await applyPublicRelease(driver, database, second);
  expect(await captureSnapshot()).toEqual(snapshot);
  const result = await run("MATCH (e:Entity) RETURN count(e) AS count"); expect(result.records[0].get("count").toNumber()).toBe(19);
}, 60000);

it("意味変更・暗黙削除・base違い・同release差替え・DB直接改変を拒否", async () => {
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const before = await captureSnapshot();
  const changed = next(first); changed.fixture.claims[0].polarity = "denied";
  await expect(applyPublicRelease(driver, database, hash(changed))).rejects.toThrow(/Claim meaning/);
  const removed = next(first); removed.fixture.citations.pop();
  await expect(applyPublicRelease(driver, database, hash(removed))).rejects.toThrow(/Implicit deletion/);
  const wrong = next(first); wrong.manifest.baseRelease = "unknown";
  await expect(applyPublicRelease(driver, database, wrong)).rejects.toThrow(/Base release/);
  const reused = structuredClone(first); reused.manifest.reason += "別内容";
  await expect(applyPublicRelease(driver, database, reused)).rejects.toThrow(/already used/);
  expect(await captureSnapshot()).toEqual(before);
  await run("MATCH (e:Entity) WITH e LIMIT 1 SET e.description='unexpected mutation'");
  await expect(planPublicRelease(driver, database, next(first))).rejects.toThrow(/drift/);
}, 60000);

it("書込途中の制約失敗で全変更がrollbackされ、既存releaseを再適用できる", async () => {
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  await run("CREATE CONSTRAINT test_source_title IF NOT EXISTS FOR (s:Source) REQUIRE s.title IS UNIQUE");
  try {
    const before = await captureSnapshot(), second = next(first);
    second.fixture.entities[0].description = "rollback対象";
    second.fixture.sources.push({ ...second.fixture.sources[0], id: "da841ed0-4a16-41c4-a909-37a16416e1a4" });
    await expect(applyPublicRelease(driver, database, hash(second))).rejects.toThrow();
    expect(await captureSnapshot()).toEqual(before);
    expect((await applyPublicRelease(driver, database, first)).unchanged).toBe(true);
  } finally { await run("DROP CONSTRAINT test_source_title IF EXISTS"); }
}, 60000);

it("同じbaseからの同時更新は片方だけ受理する", async () => {
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const a = next(first, "concurrent-a"), b = next(first, "concurrent-b");
  a.fixture.entities[0].description = "A"; b.fixture.entities[0].description = "B";
  const results = await Promise.allSettled([applyPublicRelease(driver, database, hash(a)), applyPublicRelease(driver, database, hash(b))]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
}, 60000);

it("別datasetの非空DBを取り込まず、元の内容を維持", async () => {
  await run("CREATE (:Entity {id:'old-dataset', name:'keep'})");
  const before = await captureSnapshot();
  await expect(applyPublicRelease(driver, database, await loadPublicRelease())).rejects.toThrow(/unmarked/);
  expect(await captureSnapshot()).toEqual(before);
});
