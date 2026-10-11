import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { openDatabase } from "../lib/server/neo4j";
import { applyPublicRelease, planPublicRelease } from "../lib/server/public-graph";
import { loadPublicRelease, sha256, type PublicRelease } from "../lib/server/public-dataset";

vi.mock("server-only", () => ({}));

if (process.env.GRAPH_DATASET !== "public-kg" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695") throw new Error("Use public:integration with its isolated temporary DB");
const { driver, database } = openDatabase();
const run = async (query: string, params: Record<string, unknown> = {}) => {
  const session = driver.session({ database });
  try { return await session.run(query, params); } finally { await session.close(); }
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

it("明示撤回・新UUID差替え、旧参照の根拠保持とcursor/新規枝の版失効", async () => {
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const { getNeighbors, getClaim, getEntityOverview } = await import("../lib/server/graph");
  const original = first.fixture.claims.find(claim => claim.predicate === "PARTICIPATED_IN")!;
  // 撤回根拠を持たない通常のhiddenは、旧参照救済の対象にしない。
  await run("MATCH (c:Claim {id:$id}) SET c.visibility='hidden'", { id: original.id });
  await expect(getClaim(original.id)).rejects.toMatchObject({ status: 404 });
  await run("MATCH (c:Claim {id:$id}) SET c.visibility='published'", { id: original.id });
  const oldPage = await getNeighbors(original.objectId, 1, null);
  expect(oldPage.page.hasMore).toBe(true); expect(oldPage.revision).toBeTruthy();
  const second = next(first, "withdrawal-002");
  const replacement = { ...original, id: "2a9d8790-a855-4ea6-9e1e-56c04e194f24" };
  second.fixture.claims.push(replacement);
  second.manifest.claimOrigins.push({ claimId: replacement.id, dataset: "integration-test-only", sourceClaimId: replacement.id });
  second.fixture.claims.find(claim => claim.id === original.id)!.visibility = "hidden";
  second.manifest.withdrawals = [{ claimId: original.id, reason: "隔離DBのみの差替え試験。実在資料の再判定ではない。", release: second.manifest.release, replacementClaimId: replacement.id }];
  await applyPublicRelease(driver, database, hash(second));
  expect((await run("MATCH (c:Claim {id:$id}) RETURN c.withdrawalReason AS reason", { id: original.id })).records[0].get("reason")).toEqual(second.manifest.withdrawals[0].reason);
  const withdrawn = await getClaim(original.id);
  expect(withdrawn.claim.withdrawal?.reason).toEqual(second.manifest.withdrawals[0].reason);
  expect(withdrawn.claim.withdrawal?.release).toEqual(second.manifest.release);
  expect(withdrawn.claim.withdrawal?.replacementClaimId).toBe(replacement.id);
  expect(withdrawn.claim.citations.length).toBeGreaterThan(0);
  expect(withdrawn.claim.period).toEqual(original.period);
  await expect(getClaim(original.id, oldPage.revision)).rejects.toMatchObject({ status: 409, code: "DATASET_CHANGED" });
  const page = await getNeighbors(original.objectId, 50, null);
  expect(page.claims.map(claim => claim.id)).not.toContain(original.id);
  expect(page.claims.map(claim => claim.id)).toContain(replacement.id);
  expect((await getEntityOverview(original.objectId)).relations.reduce((sum, row) => sum + row.counts.affirmed, 0)).toBe(3);
  await expect(getNeighbors(original.objectId, 1, oldPage.page.nextCursor)).rejects.toMatchObject({ status: 409 });
  await expect(getNeighbors(original.subjectId, 20, null, null, null, null, null, oldPage.revision)).rejects.toMatchObject({ status: 409 });
  const snapshot = await captureSnapshot();
  expect((await applyPublicRelease(driver, database, second)).unchanged).toBe(true);
  expect(await captureSnapshot()).toEqual(snapshot);
  const changed = next(second, "withdrawal-003"); changed.manifest.withdrawals![0].reason = "理由の黙った上書き";
  await expect(applyPublicRelease(driver, database, changed)).rejects.toThrow(/Claim meaning/);
  const { createPublicBackup, restorePublicBackup } = await import("../lib/server/public-backup");
  const backup = await createPublicBackup(driver, database);
  await run("MATCH (n) DETACH DELETE n");
  await restorePublicBackup(driver, database, backup, "empty");
  expect((await run("MATCH (c:Claim {id:$id}) RETURN c.withdrawalReason AS reason", { id: original.id })).records[0].get("reason")).toEqual(second.manifest.withdrawals[0].reason);
  expect((await getClaim(original.id)).claim.withdrawal).toEqual(withdrawn.claim.withdrawal);
  expect((await getNeighbors(original.objectId, 50, null)).claims.map(claim => claim.id)).not.toContain(original.id);
}, 60000);

it("KGだけをbackup/restoreし、外部Node UUID・根拠・撤回を復元、復旧後も旧cursorは失効", async () => {
  const { createPublicBackup, restorePublicBackup, planPublicRestore } = await import("../lib/server/public-backup");
  const { getNeighbors } = await import("../lib/server/graph");
  const { Client } = await import("pg");
  const connectionString = process.env.PUBLIC_BACKUP_PG_TEST_URL;
  if (!connectionString || new URL(connectionString).port !== "55433") throw new Error("Use disposable restore PostgreSQL");
  const member = new Client({ connectionString }); await member.connect();
  try {
  await member.query("CREATE TABLE member_restore_canary (id text PRIMARY KEY, content text NOT NULL)");
  await member.query("INSERT INTO member_restore_canary VALUES ('before','KG backupより前の会員保存')");
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const root = first.fixture.claims.find(claim => claim.predicate === "PARTICIPATED_IN")!.objectId;
  const page = await getNeighbors(root, 1, null);
  const backup = await createPublicBackup(driver, database);
  const before = await captureSnapshot();
  await member.query("INSERT INTO member_restore_canary VALUES ('after','KG backupより後の会員保存')");
  const memberBefore = (await member.query("SELECT * FROM member_restore_canary ORDER BY id")).rows;
  const second = next(first, "backup-002"); second.fixture.entities[0].description = "復旧で戻す訂正";
  await applyPublicRelease(driver, database, hash(second));
  const updated = (await getNeighbors(root, 1, null)).revision!;
  expect((await planPublicRestore(driver, database, backup, updated)).toRelease).toBe(first.manifest.release);
  const result = await restorePublicBackup(driver, database, backup, updated);
  expect(result.revision).not.toBe(backup.payload.revision); expect(result.revision).not.toBe(updated);
  const after = await captureSnapshot();
  const knowledge = (snapshot: Awaited<ReturnType<typeof captureSnapshot>>) => snapshot.nodes.filter(row => !row.labels.some((label: string) => label.startsWith("Dataset")));
  expect(knowledge(after)).toEqual(knowledge(before)); expect(after.relationships).toEqual(before.relationships);
  expect((await createPublicBackup(driver, database)).payload.receipts).toHaveLength(2);
  await expect(getNeighbors(root, 1, page.page.nextCursor)).rejects.toMatchObject({ status: 409 });
  await expect(restorePublicBackup(driver, database, backup, updated)).rejects.toThrow(/revision changed/);
  expect((await member.query("SELECT * FROM member_restore_canary ORDER BY id")).rows).toEqual(memberBefore);
  expect((await getNeighbors(root, 50, null)).claims).toHaveLength(3);
  expect((await applyPublicRelease(driver, database, first)).unchanged).toBe(true);
  // 復旧前に使ったrelease IDを別内容や再適用へ使い回さない。
  await expect(applyPublicRelease(driver, database, second)).rejects.toThrow(/Base release/);
  } finally { await member.end(); }
}, 60000);

it("改変backup・別dataset復旧を無書込で拒否し、空の専用DBへ復元できる", async () => {
  const { createPublicBackup, restorePublicBackup, planPublicRestore } = await import("../lib/server/public-backup");
  await applyPublicRelease(driver, database, await loadPublicRelease());
  const backup = await createPublicBackup(driver, database);
  const before = await captureSnapshot();
  const corrupt = structuredClone(backup); corrupt.payload.fixture.entities[0].name = "改変";
  await expect(restorePublicBackup(driver, database, corrupt, backup.payload.revision)).rejects.toThrow(/checksum/);
  expect(await captureSnapshot()).toEqual(before);
  await run("MATCH (n) DETACH DELETE n");
  await run("CREATE (:Entity {id:'foreign', name:'untouched'})");
  await expect(planPublicRestore(driver, database, backup, "empty")).rejects.toThrow(/marker/);
  await run("MATCH (n) DETACH DELETE n");
  const result = await restorePublicBackup(driver, database, backup, "empty");
  expect(result.nodes).toBe(105);
  expect((await createPublicBackup(driver, database)).payload.fixture).toEqual(backup.payload.fixture);
}, 60000);

it("復元途中の制約失敗でKGとrevisionをrollbackし、既存探索を維持", async () => {
  const { createPublicBackup, restorePublicBackup } = await import("../lib/server/public-backup");
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const backup = await createPublicBackup(driver, database);
  // 有効なKG backupだが、対象DB固有の制約に衝突する場合を作る。
  backup.payload.fixture.sources[1].title = backup.payload.fixture.sources[0].title;
  backup.payload.graphDigest = (await import("../lib/server/public-graph")).publicGraphDigest((await import("../lib/server/public-graph")).publicGraph(backup.payload.fixture));
  backup.checksum = sha256((await import("../lib/server/public-dataset")).stableJson(backup.payload));
  await run("CREATE CONSTRAINT restore_source_title IF NOT EXISTS FOR (s:Source) REQUIRE s.title IS UNIQUE");
  try {
    const before = await captureSnapshot();
    await expect(restorePublicBackup(driver, database, backup, backup.payload.revision)).rejects.toThrow();
    expect(await captureSnapshot()).toEqual(before);
  } finally { await run("DROP CONSTRAINT restore_source_title IF EXISTS"); }
}, 60000);

it("復旧で消えたUUIDを別の意味やNode型へ再利用できず、指紋は次のbackupにも残る", async () => {
  const { createPublicBackup, restorePublicBackup } = await import("../lib/server/public-backup");
  const first = await loadPublicRelease(); await applyPublicRelease(driver, database, first);
  const backup = await createPublicBackup(driver, database);
  const second = next(first, "identity-002");
  const addition = { ...second.fixture.claims[0], id: "b1787230-3e0a-4687-8a5f-af642c160211" };
  second.fixture.claims.push(addition);
  second.manifest.claimOrigins.push({ claimId: addition.id, dataset: "integration-test-only", sourceClaimId: addition.id });
  await applyPublicRelease(driver, database, hash(second));
  const currentBackup = await createPublicBackup(driver, database);
  await restorePublicBackup(driver, database, backup, currentBackup.payload.revision);
  const restoredBackup = await createPublicBackup(driver, database);
  expect(restoredBackup.payload.identities!.some(row => row.id === `Claim:${addition.id}`)).toBe(true);
  const third = next(first, "identity-003");
  third.fixture.claims.push({ ...addition, polarity: addition.polarity === "affirmed" ? "denied" : "affirmed" });
  third.manifest.claimOrigins.push({ claimId: addition.id, dataset: "integration-test-only", sourceClaimId: addition.id });
  await expect(applyPublicRelease(driver, database, hash(third))).rejects.toThrow(/identity.*meaning/);
  const differentType = next(first, "identity-004");
  differentType.fixture.entities.push({ ...first.fixture.entities[0], id: addition.id, externalIds: [] });
  await expect(applyPublicRelease(driver, database, hash(differentType))).rejects.toThrow(/UUID.*type/);
  await run("MATCH (n) DETACH DELETE n");
  await restorePublicBackup(driver, database, restoredBackup, "empty");
  await expect(applyPublicRelease(driver, database, third)).rejects.toThrow(/identity.*meaning/);
}, 60000);
