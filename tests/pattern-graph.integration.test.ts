import { beforeAll, afterAll, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
vi.mock("server-only", () => ({}));
import { executePatternGraph, handlePatternGraph } from "../lib/server/pattern-graph";
import { getNeighbors } from "../lib/server/graph";
import { relationConditionKey, normalizeRelationCondition } from "../lib/domain/relation-conditions";
import { type PatternGraphRequest, type PatternGraphResponse, routeKey } from "../lib/domain/pattern-graph";
import { id, relation } from "./pattern-graph-fixture";
if (process.env.TARGETS_ISOLATED_TEST !== "1" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695") throw Error("Use disposable discovery graph integration harness");
vi.setConfig({ testTimeout: 60000 });
const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!), { maxTransactionRetryTime: 0 });
const run = async (query: string, params: Record<string, unknown> = {}) => { const s = driver.session(); try { return await s.run(query, params); } finally { await s.close(); } };
const signal = () => new AbortController().signal;
const input = (root = 1): PatternGraphRequest => ({ version: 1, dataset: "public-kg", rootId: id(root), relation, revision: null, operation: { type: "page", after: null, requiredWitness: null } });
const pageResult = (r: PatternGraphResponse) => { if (r.operation !== "page") throw Error(); return r; };
const witness = { version: 1, dataset: "public-kg", revision: "r1", conditionKey: relationConditionKey(relation), route: { nodeIds: [id(1), id(101), id(32)], claimIds: [id(2000), id(2001)] } };
const http = (body: unknown) => handlePatternGraph(new Request("http://localhost/api/discovery/paths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
beforeAll(async () => {
  await run("CREATE CONSTRAINT entity_id IF NOT EXISTS FOR(e:Entity) REQUIRE e.id IS UNIQUE");
  await run("CREATE CONSTRAINT claim_id IF NOT EXISTS FOR(c:Claim) REQUIRE c.id IS UNIQUE");
  await run("CREATE (:DatasetState {id:'public-kg',release:'graph-isolated',revision:'r1'})");
  const entities: object[] = [], claims: object[] = [];
  const entity = (n: number, kind: string) => entities.push({ id: id(n), name: `${kind} ${n}`, kind, searchNames: [`${kind} ${n}`] });
  const claim = (n: number, s: number, o: number, more = {}) => claims.push({ id: id(n), predicate: "CONTRIBUTED_TO", polarity: "affirmed", visibility: "published", contributionRoleId: "AUTHORSHIP", subjectId: id(s), objectId: id(o), ...more });
  entity(1, "work"); entity(100, "person"); claim(1000, 100, 1); claim(9999, 100, 1);
  for (let n = 2; n <= 31; n++) { entity(n, "work"); claim(1000 + n, 100, n); }
  entity(32, "work"); entity(101, "person"); claim(2000, 101, 1); claim(2001, 101, 32);
  entity(33, "work"); claim(2002, 101, 33, { polarity: "denied" });
  entity(34, "work"); claim(2003, 101, 34, { visibility: "hidden" });
  entity(40, "work"); entity(140, "person"); claim(2100, 140, 40); // one hop only
  entity(50, "work"); entity(51, "work");
  for (let n = 0; n < 1001; n++) { entity(3000 + n, "person"); claim(3000 + n, 3000 + n, 50); }
  claim(5000, 4000, 51);
  entity(70, "work"); entity(200, "person");
  for (let n = 0; n < 30; n++) claim(6000 + n, 200, 70, { polarity: "denied" });
  for (let n = 0; n < 23; n++) claim(7000 + n, 200, 70);
  await run("UNWIND $rows AS props CREATE(e:Entity) SET e=props", { rows: entities });
  await run("UNWIND $rows AS props MATCH(s:Entity {id:props.subjectId}), (o:Entity {id:props.objectId}) CREATE(c:Claim) SET c=props CREATE(c)-[:SUBJECT]->(s), (c)-[:OBJECT]->(o)", { rows: claims });
}, 60000);
afterAll(async () => {
  await driver.close();
  const shared = globalThis as typeof globalThis & { graphReadDatabase?: { driver: typeof driver } };
  if (shared.graphReadDatabase) { await shared.graphReadDatabase.driver.close(); delete shared.graphReadDatabase; }
});
it("候補外の指定証拠を保持し、並行Claimを増殖させず31経路を重複・欠落なくページングする", async () => {
  const req = { ...input(), revision: "r1", operation: { type: "page", after: null, requiredWitness: witness } };
  const start = performance.now(); const first = pageResult(await executePatternGraph(req, signal())); const coldMs = Math.round(performance.now() - start);
  expect(first.routes).toHaveLength(12); expect(first.requiredRoute).toEqual(witness.route); expect(first.routes.map(routeKey)).not.toContain(routeKey(witness.route));
  expect(first.claims.some(c => c.id === id(9999))).toBe(false); expect(first.claims.every(c => c.polarity === "affirmed")).toBe(true);
  const all = [...first.routes]; let cursor = first.page.nextCursor;
  while (cursor) { const next = pageResult(await executePatternGraph({ ...req, operation: { ...req.operation, after: cursor } }, signal())); all.push(...next.routes); cursor = next.page.nextCursor; }
  expect(all).toHaveLength(31); expect(new Set(all.map(routeKey)).size).toBe(31); expect(all).toContainEqual(witness.route);
  const warmStart = performance.now(); await executePatternGraph(req, signal());
  console.log(JSON.stringify({ scenario: "31-complete-routes", coldMs, warmMs: Math.round(performance.now() - warmStart) }));
});
it("高次数の1,001件目の完全経路を、旧近傍の範囲外から直接取得・再検証する", async () => {
  const start = performance.now(); const result = pageResult(await executePatternGraph(input(50), signal()));
  expect(result.requiredRoute).toEqual({ nodeIds: [50, 4000, 51].map(id), claimIds: [4000, 5000].map(id) }); expect(result.routes).toHaveLength(1);
  const r = await executePatternGraph({ ...input(50), revision: "r1", operation: { type: "restore", routes: [result.requiredRoute!], observedRevision: "r1", candidateBoundary: result.routes[0] } }, signal());
  expect(r.operation).toBe("restore"); expect(r.claims).toHaveLength(2); console.log(JSON.stringify({ scenario: "1001st-graph-route-and-restore", ms: Math.round(performance.now() - start) }));
});
it("restoreは同版の候補境界を別に保持し、空参照を経路不存在とみなさない", async () => {
  const first = pageResult(await executePatternGraph(input(), signal()));
  const req: PatternGraphRequest = { ...input(), revision: "r1", operation: { type: "restore", routes: [witness.route], observedRevision: "r1", candidateBoundary: first.routes.at(-1)! } };
  const result = await executePatternGraph(req, signal());
  expect(result).toMatchObject({ operation: "restore", verifiedRoutes: [witness.route], continuation: { state: "resumable", hasMore: true } });
  expect(result.claims.map(c => c.id).sort()).toEqual(witness.route.claimIds);
  const empty = await executePatternGraph({ ...input(), operation: { type: "restore", routes: [], observedRevision: null, candidateBoundary: null } }, signal());
  expect(empty).toMatchObject({ operation: "restore", verifiedRoutes: [], continuation: { state: "restart" } }); expect(empty.nodes).toHaveLength(1);
  const noMatch = pageResult(await executePatternGraph(input(40), signal())); expect(noMatch).toMatchObject({ match: "not-matched", requiredRoute: null, routes: [] });
});
it("不正証拠・未対応条件・不正cursorを拒否し、1経路でも検証不能なら復元全体を失敗にする", async () => {
  const invalidWitness = { ...witness, route: { ...witness.route, claimIds: [id(1000), id(2001)] } };
  expect((await http({ ...input(), revision: "r1", operation: { type: "page", after: null, requiredWitness: invalidWitness } })).status).toBe(400);
  expect((await http({ ...input(), relation: { ...relation, pattern: { id: "other-works", revision: 2 } } })).status).toBe(400);
  const first = pageResult(await executePatternGraph(input(), signal()));
  expect((await http({ ...input(50), revision: "r1", operation: { type: "page", after: first.page.nextCursor, requiredWitness: null } })).status).toBe(400);
  await run("MATCH(c:Claim {id:$id}) SET c.visibility='hidden'", { id: id(2001) });
  const failed = await http({ ...input(), operation: { type: "restore", routes: [first.routes[0], witness.route], observedRevision: null, candidateBoundary: null } });
  expect(failed.status).toBe(400); expect(await failed.json()).toMatchObject({ error: { reason: "RESTORE_INCOMPLETE" } });
  await run("MATCH(c:Claim {id:$id}) SET c.visibility='published'", { id: id(2001) });
});
it("neighborsの肯否はLIMIT前。省略時の否定記録・旧cursorは維持、新cursorは肯否を束縛する", async () => {
  const old = await getNeighbors(id(70), 20, null); expect(old.claims).toHaveLength(20); expect(old.claims.every(c => c.polarity === "denied")).toBe(true); expect(old.relation).toBeUndefined();
  const adjacent = normalizeRelationCondition({ version: 1, type: "adjacent", predicates: null, traversal: "either", polarity: "affirmed", contributionRoles: null, organizationPositions: null, eventRoles: null });
  if (adjacent.type !== "adjacent") throw Error();
  const first = await getNeighbors(id(70), 20, null, null, null, null, null, "r1", adjacent);
  expect(first.claims).toHaveLength(20); expect(first.claims.every(c => c.polarity === "affirmed")).toBe(true);
  const next = await getNeighbors(id(70), 20, first.page.nextCursor, null, null, null, null, "r1", adjacent); expect(next.claims).toHaveLength(3);
  expect(new Set([...first.claims, ...next.claims].map(c => c.id)).size).toBe(23);
  await expect(getNeighbors(id(70), 20, old.page.nextCursor, null, null, null, null, "r1", adjacent)).rejects.toMatchObject({ status: 400 });
  const all = { ...adjacent, polarity: "all-records" as const };
  expect((await getNeighbors(id(70), 20, old.page.nextCursor, null, null, null, null, "r1", all)).claims.some(c => c.polarity === "denied")).toBe(true);
  await expect(getNeighbors(id(70), 20, first.page.nextCursor, null, null, null, null, "r1", all)).rejects.toMatchObject({ status: 400 });
});
it("公開版変更後は旧証拠・cursorを409にし、明示再検証では継続位置を先頭へ戻す", async () => {
  await run("MATCH(s:DatasetState {id:'public-kg'}) SET s.revision='r2'");
  expect((await http({ ...input(), revision: "r1", operation: { type: "page", after: null, requiredWitness: witness } })).status).toBe(409);
  const restored = await executePatternGraph({ ...input(), operation: { type: "restore", routes: [witness.route], observedRevision: "r1", candidateBoundary: witness.route } }, signal());
  expect(restored).toMatchObject({ revision: "r2", operation: "restore", verifiedRoutes: [witness.route], continuation: { state: "restart" } });
  expect(restored.claims).toHaveLength(2);
  await run("MATCH(s:DatasetState {id:'public-kg'}) SET s.revision='r1'");
});
