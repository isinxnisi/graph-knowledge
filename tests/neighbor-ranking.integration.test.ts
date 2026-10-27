import { beforeAll, afterAll, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/read-db", () => ({ readTransaction: async (action: (tx: unknown) => Promise<unknown>) => {
  const session = driver.session({ defaultAccessMode: "READ" });
  try { return await session.executeRead(action, { timeout: 10000 }); } finally { await session.close(); }
} }));
import { getNeighbors } from "../lib/server/graph";
import { NEIGHBOR_SCORES, RANKED_NEIGHBORS } from "../lib/server/neighbor-ranking";
import { NEIGHBORS } from "../lib/server/queries";
import { type RelationCondition } from "../lib/domain/relation-conditions";
if (!/^graph-neighbor-ranking-test-\d+$/.test(process.env.RANKING_TEST_CONTAINER ?? "") || !/^bolt:\/\/127\.0\.0\.1:\d+$/.test(process.env.RANKING_TEST_URI ?? "")) throw Error("Use disposable ranking harness");
const driver = neo4j.driver(process.env.RANKING_TEST_URI!, neo4j.auth.basic("neo4j", process.env.RANKING_TEST_PASSWORD!), { maxTransactionRetryTime: 0 });
const run = async (q: string, params = {}) => { const s = driver.session(); try { return await s.run(q, params); } finally { await s.close(); } };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const relation: RelationCondition = { version: 1, type: "adjacent", traversal: "either", polarity: "affirmed", predicates: ["CONTRIBUTED_TO"], contributionRoles: ["AUTHORSHIP"], organizationPositions: null, eventRoles: null };
const entities: Record<string, unknown>[] = [], claims: Record<string, unknown>[] = [];
let serial = 10000;
const entity = (n: number, kind: string) => entities.push({ id: id(n), kind, name: `${kind} ${n}` });
const claim = (s: number, o: number, extra = {}) => claims.push({ id: id(serial++), subject: id(s), object: id(o), predicate: "CONTRIBUTED_TO", contributionRoleId: "AUTHORSHIP", polarity: "affirmed", visibility: "published", ...extra });
const page = (after: string | null = null, condition = relation, root = 1) => getNeighbors(id(root), 20, after, null, null, null, null, "ranking-r1", condition);
beforeAll(async () => {
  await run("CREATE CONSTRAINT ranking_entity_id IF NOT EXISTS FOR(e:Entity) REQUIRE e.id IS UNIQUE");
  await run("CREATE CONSTRAINT ranking_claim_id IF NOT EXISTS FOR(c:Claim) REQUIRE c.id IS UNIQUE");
  await run("CREATE (:DatasetState {id:'public-kg',release:'ranking-test',revision:'ranking-r1'})");
  entity(1, "work");
  for (let n = 2; n < 1104; n++) { entity(n, "person"); claim(n, 1); }
  for (let n = 2000; n < 3100; n++) entity(n, "work");
  for (let n = 2; n < 1104; n++) for (let j = 0; j < (n === 2 ? 60 : n === 3 ? 55 : n % 4); j++) claim(n, 2000 + j);
  for (let j = 0; j < 30; j++) claim(2, 1); // parallel evidence never eats the first 20 slots
  for (let j = 0; j < 65; j++) claim(4, 2000 + j, { contributionRoleId: "ILLUSTRATION" });
  for (let j = 0; j < 70; j++) claim(5, 2000 + j, { polarity: "denied" });
  for (let j = 0; j < 80; j++) claim(6, 2000 + j, { visibility: "hidden" });
  entity(4000, "organization"); entity(4001, "event");
  claim(2, 4000, { predicate: "AFFILIATED_WITH", contributionRoleId: null, organizationPositionId: "ASSOCIATE_PROFESSOR" });
  claim(2, 4001, { predicate: "PARTICIPATED_IN", contributionRoleId: null, eventRoleId: "CHAIR" });
  await run("UNWIND $rows AS props CREATE(e:Entity) SET e=props", { rows: entities });
  await run("UNWIND $rows AS props MATCH(s:Entity {id:props.subject}), (o:Entity {id:props.object}) CREATE(c:Claim) SET c=props CREATE(c)-[:SUBJECT]->(s), (c)-[:OBJECT]->(o)", { rows: claims });
}, 60000);
afterAll(async () => { await driver.close(); delete process.env.GRAPH_NEIGHBOR_ORDER; });

it("本番規模・高次数のcold/warm・並行・追加取得を比較し、全証拠を欠落・重複なく返す", async () => {
  const measure = async (mode: string) => {
    process.env.GRAPH_NEIGHBOR_ORDER = mode;
    const start = performance.now(); const first = await page(); const coldMs = performance.now() - start;
    const warm: number[] = [];
    for (let n = 0; n < 3; n++) { const t = performance.now(); await page(); warm.push(performance.now() - t); }
    const t = performance.now(); const next = await page(first.page.nextCursor); const additionalMs = performance.now() - t;
    const concurrentStart = performance.now(); await Promise.all(Array.from({ length: 4 }, () => page()));
    const concurrentMs = performance.now() - concurrentStart;
    expect(Math.max(coldMs, additionalMs, concurrentMs, ...warm)).toBeLessThan(10000);
    console.log(JSON.stringify({ mode, candidates: process.env.GRAPH_NEIGHBOR_CANDIDATES ?? "1000", nodes: entities.length, claims: claims.length, coldMs, warm, additionalMs, concurrent4Ms: concurrentMs }));
    return { first, next };
  };
  const legacy = await measure("id");
  process.env.GRAPH_NEIGHBOR_CANDIDATES = "1000"; await measure("bounded");
  process.env.GRAPH_NEIGHBOR_CANDIDATES = "200"; const ranked = await measure("bounded");
  expect(ranked.first.claims).toHaveLength(20);
  expect(new Set(ranked.first.claims.map(c => c.subjectId)).size).toBe(20);
  expect(ranked.first.claims.slice(0, 2).map(c => c.subjectId)).toEqual([id(2), id(3)]);
  expect(ranked.first.ranking).toMatchObject({ evaluatedCandidates: 200, unevaluatedCandidates: true, cappedCandidates: 2 });
  // Old cursor continues old ordering even after operator enables ranking.
  expect((await page(legacy.first.page.nextCursor)).claims).toEqual(legacy.next.claims);
  const all = [...ranked.first.claims]; let cursor = ranked.first.page.nextCursor;
  while (cursor) { const p = await page(cursor); all.push(...p.claims); cursor = p.page.nextCursor; }
  const expected = claims.filter(c => c.object === id(1)).map(c => c.id).sort();
  expect(all.map(c => c.id).sort()).toEqual(expected); expect(new Set(all.map(c => c.id)).size).toBe(expected.length);
}, 60000);

it("条件によって順位が変わり、否定・Role・未評価と0件を混同しない", async () => {
  const allRoles = { ...relation, contributionRoles: null };
  expect((await page(null, allRoles)).claims.slice(0, 3).map(c => c.subjectId)).toEqual([id(2), id(3), id(4)]);
  const allRecords = { ...allRoles, polarity: "all-records" as const };
  expect((await page(null, allRecords)).claims.slice(0, 4).map(c => c.subjectId)).toEqual([id(2), id(3), id(4), id(5)]);
  const emptyRoles = await page(null, { ...relation, contributionRoles: [] });
  expect(emptyRoles.claims).toHaveLength(0);
  expect((await page(null, { ...relation, predicates: null, contributionRoles: null, organizationPositions: [], eventRoles: [] }, 2)).claims.every(c => c.predicate === "CONTRIBUTED_TO")).toBe(true);
  const first = await page();
  await expect(page(first.page.nextCursor, allRoles)).rejects.toMatchObject({ status: 400 });
  process.env.GRAPH_NEIGHBOR_CANDIDATES = "2";
  await expect(page(first.page.nextCursor)).rejects.toMatchObject({ status: 409 });
  const small = await page(); expect(small.ranking?.evaluatedCandidates).toBe(2);
  delete process.env.GRAPH_NEIGHBOR_CANDIDATES;
}, 60000);

it("PROFILEでページ制限前のDB仕事量を記録（読み取りのみ）", async () => {
  const params = { id: id(1), predicates: null, polarity: "all-records", contributionRoles: null, organizationPositions: null, eventRoles: null,
    after: null, take: neo4j.int(21), candidateTake: neo4j.int(1001), candidateLimit: neo4j.int(1000), connectionTake: neo4j.int(51), ranks: {}, afterRound: null, afterRank: null, afterNeighbor: null };
  for (const [name, query] of [["legacy", NEIGHBORS], ["scores", NEIGHBOR_SCORES], ["ranked-page", RANKED_NEIGHBORS]]) {
    const result = await run(`PROFILE ${query}`, params);
    const visits: { op: string; hits: number; rows: number }[] = [];
    const walk = (p: typeof result.summary.profile) => { if (!p) return; visits.push({ op: p.operatorType, hits: p.dbHits, rows: p.rows }); p.children?.forEach(walk); };
    walk(result.summary.profile);
    console.log(JSON.stringify({ profile: name, dbHits: visits.reduce((s, p) => s + p.hits, 0), plan: visits }));
  }
});
it("保存互換: 初回から従来順を指定し、新cursorとの混在と設定切替を拒否する", async () => {
  delete process.env.GRAPH_NEIGHBOR_CANDIDATES;
  const ordered = await getNeighbors(id(1), 20, null, null, null, null, null, "ranking-r1", relation, "id");
  expect(ordered.ranking).toBeUndefined();
  expect(ordered.claims.map(c => c.id)).toEqual(claims.filter(c => c.object === id(1)).map(c => String(c.id)).sort().slice(0, 20));
  const ranked = await page(); expect(ranked.ranking?.candidateLimit).toBe(200);
  await expect(getNeighbors(id(1), 20, ranked.page.nextCursor, null, null, null, null, "ranking-r1", relation, "id")).rejects.toMatchObject({ status: 409 });
  process.env.GRAPH_NEIGHBOR_ORDER = "id";
  await expect(page(ranked.page.nextCursor)).rejects.toMatchObject({ status: 409 });
  delete process.env.GRAPH_NEIGHBOR_ORDER;
  const params = { id: id(1), predicates: null, polarity: "all-records", contributionRoles: null, organizationPositions: null, eventRoles: null, candidateTake: neo4j.int(201), candidateLimit: neo4j.int(200), connectionTake: neo4j.int(51) };
  const result = await run(`PROFILE ${NEIGHBOR_SCORES}`, params);
  let hits = 0; const walk = (p: typeof result.summary.profile) => { if (p) { hits += p.dbHits; p.children?.forEach(walk); } }; walk(result.summary.profile);
  console.log(JSON.stringify({ profile: "scores-200", dbHits: hits, rows: result.records.length }));
}, 60000);
