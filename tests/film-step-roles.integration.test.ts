import { beforeAll, afterAll, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
import { readFileSync, writeFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { searchDiscoveryTargets, handleTargetSearch } from "../lib/server/discovery-targets";
import { verifyRelationWitness } from "../lib/server/relation-pattern-execution";
import { readRelationTransaction } from "../lib/server/read-db";
import { executePatternGraph } from "../lib/server/pattern-graph";
import { discoveryRelationHref, parseDiscoveryHandoff } from "../lib/client/discovery-relation-navigation";
import { decodeExploration } from "../lib/client/exploration-url";
import { emptyPatternGraph, mergePatternPage, openPatternNode } from "../lib/client/graph-state";
import { captureWorkspace } from "../lib/client/saved-workspace";
import { getClaim } from "../lib/server/graph";
import { claimSummarySchema } from "../lib/domain/api";
import { roleIdSchema } from "../lib/domain/contribution";
import { normalizeRelationCondition, relationConditionKey } from "../lib/domain/relation-conditions";

if (!/^graph-issue40-[a-f0-9]{12}$/.test(process.env.FILM_ISOLATED_TEST ?? "") || process.env.NEO4J_URI !== "bolt://127.0.0.1:" + process.env.FILM_ISOLATED_PORT || process.env.GRAPH_DATASET !== "public-kg") throw Error("Run scripts/test-film-step-roles.py only");
vi.setConfig({ testTimeout: 60000 });
type Fixture = { entities: { id: string; qid: string; name: string; kind: string; description: null }[]; claims: { id: string; candidateId: string; subjectId: string; objectId: string; contribution: { roleId: string }; citations: { id: string; sourceId: string; locator: string; roleEvidence: { originalText: string; language: string } | null }[] }[]; sources: { id: string; runtimeId: string; url: string; title: string }[]; inputs: Record<string, string> };
const fixture: Fixture = JSON.parse(readFileSync("film-fixture.json", "utf8"));
const id = (qid: string) => fixture.entities.find(e => e.qid === qid)!.id;
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic("neo4j", process.env.NEO4J_PASSWORD!), { maxTransactionRetryTime: 0, connectionTimeout: 1000 });
const signal = () => new AbortController().signal;
const run = async (q: string, parameters = {}) => { const s = driver.session(); try { return await s.run(q, parameters); } finally { await s.close(); } };
const relation = (first: string[] | null, second: string[] | null) => ({ version: 1, type: "pattern", pattern: { id: "other-works", revision: 3 }, polarity: "affirmed", contributionRoles: null, stepRoles: [first, second] });
const req = (q: string, rel = relation(["ACTING"], ["DIRECTING"])) => ({ version: 2, dataset: "public-kg", criteria: { q, kind: "work", relation: rel, nameTarget: "subject" }, revision: "issue40-r1", after: null });
const results: unknown[] = [];
beforeAll(async () => {
 let ready = false;
 for (let n = 0; n < 120; n++) { try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
 if (!ready) throw Error("Disposable DB unavailable");
 // Fail closed before any write if this is not the new empty database.
 expect((await run("MATCH(n) RETURN count(n) AS count")).records[0].get("count").toNumber()).toBe(0);
 expect(roleIdSchema.parse("DIRECTING")).toBe("DIRECTING");
 // Inject only this guarded connection; production port guards and transaction logic stay unchanged.
 (globalThis as typeof globalThis & { graphReadDatabase?: { driver: typeof driver; database: string } }).graphReadDatabase = { driver, database: "neo4j" };
 await run("CREATE CONSTRAINT entity_id IF NOT EXISTS FOR(e:Entity) REQUIRE e.id IS UNIQUE");
 await run("CREATE CONSTRAINT claim_id IF NOT EXISTS FOR(c:Claim) REQUIRE c.id IS UNIQUE");
 await run("CREATE CONSTRAINT source_id IF NOT EXISTS FOR(s:Source) REQUIRE s.id IS UNIQUE");
 await run("CREATE (:DatasetState {id:'public-kg',revision:'issue40-r1',release:'unaccepted-research-only'})");
 await run("UNWIND $rows AS props CREATE(e:Entity) SET e=props", { rows: fixture.entities.map(e => ({ id: e.id, name: e.name, kind: e.kind, searchNames: [e.name.toLowerCase()] })) });
 // Published here simulates the read model solely inside the newly created DB.
 const claims = fixture.claims.map(c => ({ id: c.id, subjectId: c.subjectId, objectId: c.objectId, contributionRoleId: c.contribution.roleId, predicate: "CONTRIBUTED_TO", polarity: "affirmed", visibility: "published", createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z" }));
 for (const c of fixture.claims) claimSummarySchema.parse({ id: c.id, subjectId: c.subjectId, objectId: c.objectId, predicate: "CONTRIBUTED_TO", polarity: "affirmed", contribution: { roleId: c.contribution.roleId, scope: null }, period: { from: null, to: null }, sourceCount: c.citations.length, organizationParticipation: null, eventParticipation: null });
 await run("UNWIND $rows AS props MATCH(s:Entity {id:props.subjectId}),(o:Entity {id:props.objectId}) CREATE(c:Claim) SET c=props CREATE(c)-[:SUBJECT]->(s),(c)-[:OBJECT]->(o)", { rows: claims });
 await run("UNWIND $rows AS props CREATE(s:Source) SET s=props", { rows: fixture.sources.map(s => ({ id: s.runtimeId, kind: "web", title: s.title, url: s.url, isDemo: false })) });
 const citations = fixture.claims.flatMap(c => c.citations.map(x => ({ id: x.id, claimId: c.id, sourceId: fixture.sources.find(s => s.id === x.sourceId)!.runtimeId, locator: x.locator, roleOriginalText: x.roleEvidence?.originalText ?? null, roleOriginalLanguage: x.roleEvidence?.language ?? null, stance: "support" })));
 await run("UNWIND $rows AS props MATCH(c:Claim {id:props.claimId}),(s:Source {id:props.sourceId}) CREATE(x:Citation) SET x=props CREATE(c)-[:HAS_CITATION]->(x),(x)-[:CITES]->(s)", { rows: citations });
}, 150000);
afterAll(async () => {
 await driver.close();
 const shared = globalThis as typeof globalThis & { graphReadDatabase?: { driver: typeof driver } };
 if (shared.graphReadDatabase) { await shared.graphReadDatabase.driver.close(); delete shared.graphReadDatabase; }
 writeFileSync("film-results.json", JSON.stringify({ environment: "disposable loopback DB, proposed role overlay", formalAcceptance: false, inputs: fixture.inputs, entityCount: fixture.entities.length, claimCount: fixture.claims.length, results }, null, 2) + "\n");
});
it("保存済み映画の出演→監督を検索し、証拠・URL・Graph・復元へ通す", async () => {
 const start = performance.now();
 const response = await handleTargetSearch(new Request("http://isolated.invalid/api/discovery/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req("Unforgiven")) }));
 expect(response.status).toBe(200);
 const found = await response.json();
 expect(found.items).toHaveLength(1);
 const item = found.items[0], witness = item.match.witness;
 expect(witness.route.nodeIds).toEqual([id("Q104137"), id("Q43203"), id("Q184255")]);
 const material = await readRelationTransaction(tx => verifyRelationWitness(tx, found.criteria.relation, witness), signal());
 expect([...material.claims.values()].map(c => c.contribution?.roleId)).toEqual(expect.arrayContaining(["ACTING", "DIRECTING"]));
 expect([...material.claims.values()].every(c => c.sourceCount === 1 && c.contribution?.scope === null)).toBe(true);
 const params = new URL(discoveryRelationHref({ entity: item.entity, relation: found.criteria.relation, witness, revision: found.revision }), "https://example.invalid").searchParams;
 const workspace = decodeExploration(params.get("s")!, item.entity.id, "public-kg");
 expect(parseDiscoveryHandoff(params.get("match"), workspace)?.witness).toEqual(witness);
 const graphReq = { version: 2, dataset: "public-kg", rootId: item.entity.id, relation: found.criteria.relation, revision: found.revision };
 const page = await executePatternGraph({ ...graphReq, operation: { type: "page", after: null, requiredWitness: witness } }, signal());
 if (page.operation !== "page") throw Error();
 expect(page.routes).toHaveLength(1);
 const graph = mergePatternPage(emptyPatternGraph(page.root, page.relation), page, null);
 expect(Object.keys(graph.claims)).toEqual([witness.route.claimIds[0]]);
 expect(Object.keys(openPatternNode(graph, witness.route.nodeIds[1]).claims).sort()).toEqual([...witness.route.claimIds].sort());
 expect(captureWorkspace("public-kg", "Film research", graph, null).relation).toEqual(found.criteria.relation);
 const restored = await executePatternGraph({ ...graphReq, operation: { type: "restore", routes: page.routes, observedRevision: found.revision, candidateBoundary: page.routes.at(-1) } }, signal());
 if (restored.operation !== "restore") throw Error();
 expect(restored.verifiedRoutes).toEqual(page.routes);
 const named = req("Clint Eastwood");
 const namedResult = await searchDiscoveryTargets({ ...named, criteria: { ...named.criteria, nameTarget: "contributor" } }, signal());
 expect(namedResult.items).toHaveLength(3);
 const absentDirector = req("Morgan Freeman");
 expect((await searchDiscoveryTargets({ ...absentDirector, criteria: { ...absentDirector.criteria, nameTarget: "contributor" } }, signal())).items).toEqual([]);
 results.push({ scenario: "Unforgiven acting to directing", milliseconds: Math.round(performance.now() - start), witness, target: "Million Dollar Baby", restored: true });
});
it("段別条件は共通ORの余分な人物・作品経路を除き、逆の問いは別証拠になる", async () => {
 const shared = { version: 1, type: "pattern", pattern: { id: "other-works", revision: 2 }, polarity: "affirmed", contributionRoles: ["ACTING", "DIRECTING"] };
 const page = await executePatternGraph({ version: 2, dataset: "public-kg", rootId: id("Q104137"), relation: shared, revision: "issue40-r1", operation: { type: "page", after: null, requiredWitness: null } }, signal());
 if (page.operation !== "page") throw Error();
 expect(page.routes).toHaveLength(3); // endpoint pairs, not the prior research's 7 parallel-Claim paths
 const reverse = await searchDiscoveryTargets(req("Unforgiven", relation(["DIRECTING"], ["ACTING"])), signal());
 const proof = reverse.items[0].match;
 if (proof.status !== "matched") throw Error();
 expect(proof.witness.conditionKey).not.toBe(relationConditionKey(normalizeRelationCondition({ ...shared, contributionRoles: null })));
 const exact = await executePatternGraph({ version: 2, dataset: "public-kg", rootId: id("Q104137"), relation: relation(["DIRECTING"], ["ACTING"]), revision: "issue40-r1", operation: { type: "page", after: null, requiredWitness: null } }, signal());
 if (exact.operation !== "page") throw Error();
 expect(new Set(exact.routes.map(r => r.nodeIds[2]))).toEqual(new Set([id("Q184255"), id("Q76479")]));
 results.push({ scenario: "shared OR vs ordered steps", sharedEndpointPairs: 3, actingToDirecting: 1, directingToActing: 2 });
});
it("空集合・否定・非公開・誤方向・改ざん・版変更を拒否し、原表記欠落を補完しない", async () => {
 expect((await searchDiscoveryTargets(req("Unforgiven", relation([], ["DIRECTING"])), signal())).items).toEqual([]);
 const found = await searchDiscoveryTargets(req("Unforgiven"), signal()), match = found.items[0].match;
 if (match.status !== "matched") throw Error();
 const cid = match.witness.route.claimIds[1];
 for (const patch of [{ polarity: "denied" }, { visibility: "hidden" }, { contributionRoleId: null }]) {
  await run("MATCH(c:Claim {id:$id}) SET c += $patch", { id: cid, patch });
  expect((await searchDiscoveryTargets(req("Unforgiven"), signal())).items).toEqual([]);
  await expect(readRelationTransaction(tx => verifyRelationWitness(tx, found.criteria.relation!, match.witness), signal())).rejects.toThrow();
  await run("MATCH(c:Claim {id:$id}) SET c.polarity='affirmed',c.visibility='published',c.contributionRoleId='DIRECTING'", { id: cid });
 }
 await run("MATCH(c:Claim {id:$id})-[a:SUBJECT]->(p),(c)-[b:OBJECT]->(w) DELETE a,b CREATE(c)-[:SUBJECT]->(w),(c)-[:OBJECT]->(p)", { id: cid });
 expect((await searchDiscoveryTargets(req("Unforgiven"), signal())).items).toEqual([]);
 await run("MATCH(c:Claim {id:$id})-[a:SUBJECT]->(w),(c)-[b:OBJECT]->(p) DELETE a,b CREATE(c)-[:SUBJECT]->(p),(c)-[:OBJECT]->(w)", { id: cid });
 await expect(readRelationTransaction(tx => verifyRelationWitness(tx, found.criteria.relation!, { ...match.witness, route: { ...match.witness.route, claimIds: [...match.witness.route.claimIds].reverse() } }), signal())).rejects.toThrow();
 const original = await run("MATCH(c:Claim {id:$id})-[:HAS_CITATION]->(x) RETURN x.roleOriginalText AS term", { id: cid });
 expect(original.records[0].get("term")).toBe("Director");
 const detail = await getClaim(cid, "issue40-r1");
 expect(detail.claim.citations[0].roleEvidence).toEqual({ originalText: "Director", language: "en" });
 expect(detail.claim.citations[0].source.url).toBe("https://catalog.afi.com/Catalog/moviedetails/54369");
 expect(detail.claim.contribution?.roleId).toBe("DIRECTING");
 const missing = await run("MATCH(c:Claim {id:$id})-[:HAS_CITATION]->(x) RETURN x.roleOriginalText AS term", { id: match.witness.route.claimIds[0] });
 expect(missing.records[0].get("term")).toBeNull();
 await run("MATCH(s:DatasetState) SET s.revision='issue40-r2'");
 await expect(searchDiscoveryTargets(req("Unforgiven"), signal())).rejects.toMatchObject({ status: 409 });
 await run("MATCH(s:DatasetState) SET s.revision='issue40-r1'");
 results.push({ scenario: "negative controls", emptyRoles: true, denied: true, hidden: true, noRole: true, wrongDirection: true, tamperedWitness: true, changedRevision: true, missingOriginalPreserved: true });
});

it("合成ストレス用25件も完全判定してページを跨ぎ、別条件のcursorを流用しない", async () => {
 const uid = (n: number) => "40000000-0000-4000-8000-" + String(n).padStart(12, "0");
 const people = uid(900), destination = uid(901);
 await run("CREATE(:Entity {id:$p,kind:'person',name:'Synthetic person',searchNames:['synthetic person']}),(:Entity {id:$w,kind:'work',name:'Synthetic destination',searchNames:['synthetic destination']})", { p: people, w: destination });
 await run("MATCH(p:Entity {id:$p}),(w:Entity {id:$w}) CREATE(c:Claim {id:$c,predicate:'CONTRIBUTED_TO',polarity:'affirmed',visibility:'published',contributionRoleId:'DIRECTING'})-[:SUBJECT]->(p) CREATE(c)-[:OBJECT]->(w)", { p: people, w: destination, c: uid(902) });
 const rows = Array.from({ length: 25 }, (_, i) => ({ id: uid(i), name: "Synthetic origin " + i, cid: uid(100 + i) }));
 await run("UNWIND $rows AS row MATCH(p:Entity {id:$p}) CREATE(w:Entity {id:row.id,kind:'work',name:row.name,searchNames:[toLower(row.name)]}) CREATE(c:Claim {id:row.cid,predicate:'CONTRIBUTED_TO',polarity:'affirmed',visibility:'published',contributionRoleId:'ACTING'})-[:SUBJECT]->(p) CREATE(c)-[:OBJECT]->(w)", { rows, p: people });
 const first = await searchDiscoveryTargets(req("Synthetic origin"), signal());
 expect(first.items).toHaveLength(20); expect(first.page.hasMore).toBe(true);
 const second = await searchDiscoveryTargets({ ...req("Synthetic origin"), after: first.page.nextCursor }, signal());
 expect(second.items).toHaveLength(5); expect(second.page.hasMore).toBe(false);
 expect(new Set([...first.items, ...second.items].map(i => i.entity.id)).size).toBe(25);
 await expect(searchDiscoveryTargets({ ...req("Synthetic origin", relation(["DIRECTING"], ["ACTING"])), after: first.page.nextCursor }, signal())).rejects.toThrow();
 const graphReq = { version: 2, dataset: "public-kg", rootId: destination, relation: relation(["DIRECTING"], ["ACTING"]), revision: "issue40-r1" };
 let after: string | null = null; const routes = [];
 do {
  const page = await executePatternGraph({ ...graphReq, operation: { type: "page", after, requiredWitness: null } }, signal());
  if (page.operation !== "page") throw Error();
  routes.push(...page.routes); after = page.page.nextCursor;
  if (after) await expect(executePatternGraph({ ...graphReq, relation: relation(["ACTING"], ["DIRECTING"]), operation: { type: "page", after, requiredWitness: null } }, signal())).rejects.toThrow();
 } while (after);
 expect(routes).toHaveLength(25);
 expect(new Set(routes.map(r => r.nodeIds[2])).size).toBe(25);
 results.push({ scenario: "synthetic pagination (not film evidence)", targetPages: [20, 5], graphPages: [12, 12, 1], crossConditionCursorRejected: true });
});
