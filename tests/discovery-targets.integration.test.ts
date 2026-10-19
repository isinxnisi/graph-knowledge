import { beforeAll, afterAll, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
import { mkdirSync, writeFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { searchDiscoveryTargets, parseTargetSearch, targetEntitiesQuery, handleTargetSearch } from "../lib/server/discovery-targets";
import { verifyRelationWitness, relationQueryParameters, firstWitnessQuery } from "../lib/server/relation-pattern-execution";
import { readRelationTransaction } from "../lib/server/read-db";
import * as readDb from "../lib/server/read-db";
import { discoverEntities } from "../lib/server/discovery-search";
import { PATH_NEIGHBORS } from "../lib/server/discovery-paths";
import { readPublicRevision } from "../lib/server/public-revision";
import { executePatternGraph } from "../lib/server/pattern-graph";
import { handleSubjectMatches } from "../lib/server/discovery-subject-matches";
import type { TargetSearchRequest } from "../lib/domain/discovery-targets";

if (process.env.TARGETS_ISOLATED_TEST !== "1" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695" || process.env.GRAPH_DATASET !== "public-kg") throw Error("Use discovery:targets:integration, with its disposable DB only");
// Multi-request scenarios; the harness uses the existing 3200 10s DB setting.
vi.setConfig({ testTimeout: 60000 });
const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!), { maxTransactionRetryTime: 0 });
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const signal = () => new AbortController().signal;
const pattern = { version: 1, type: "pattern", pattern: { id: "other-works", revision: 1 }, polarity: "affirmed", contributionRoles: null } as const;
const adjacent = { version: 1, type: "adjacent", predicates: ["CONTRIBUTED_TO"], traversal: "either", polarity: "all-records", contributionRoles: null, organizationPositions: null, eventRoles: null };
const input = (q = "", relation: unknown = pattern) => parseTargetSearch({ version: 1, dataset: "public-kg", criteria: { q, kind: "work", relation }, revision: null, after: null });
const run = async (query: string, params: Record<string, unknown> = {}) => { const s = driver.session(); try { return await s.run(query, params); } finally { await s.close(); } };
const metrics: unknown[] = [];
const v2=(q:string,kind:"person"|"work",nameTarget:"subject"|"contributor"="subject",roles:string[]|null=null)=>({version:2,dataset:"public-kg",criteria:{q,kind,nameTarget,relation:{...pattern,pattern:{id:"other-works",revision:2},contributionRoles:roles}},revision:"r1",after:null});
beforeAll(async () => {
  // All write operations are behind the explicit disposable-DB guard above.
  await run("CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE");
  await run("CREATE CONSTRAINT claim_id IF NOT EXISTS FOR (c:Claim) REQUIRE c.id IS UNIQUE");
  await run("CREATE (:DatasetState {id:'public-kg',release:'isolated-targets',revision:'r1'})");
  const entities: { id: string; kind: string; name: string; searchNames: string[] }[] = [];
  const claims: { id: string; subjectId: string; objectId: string; visibility: string; predicate: string; polarity: string; contributionRoleId?: string; validFromValue?: string; validFromPrecision?: string }[] = [];
  const entity = (n: number, kind: string, name: string) => entities.push({ id: id(n), kind, name, searchNames: [name.toLowerCase()] });
  const claim = (n: number, s: number, o: number, extra = {}) => claims.push({ id: id(n), subjectId: id(s), objectId: id(o), visibility: "published", predicate: "CONTRIBUTED_TO", polarity: "affirmed", ...extra });
  entity(500, "person", "Bulk contributor");
  for (let n = 0; n < 51; n++) { entity(n, "work", n < 2 ? "Duplicate name" : `Bulk ${String(n).padStart(2, "0")}`); claim(2000 + n, 500, n, { contributionRoleId: "AUTHORSHIP" }); }
  entity(100, "work", "High degree root"); entity(101, "work", "High degree end");
  for (let n = 0; n < 1001; n++) { entity(10000 + n, "person", `Degree ${n}`); claim(3000 + n, 10000 + n, 100, { contributionRoleId: "DRAWING" }); }
  claim(5000, 11000, 101, { contributionRoleId: "DRAWING", validFromValue: "2000", validFromPrecision: "year" });
  for (const [root, label, extra] of [[120, "Dead end", null], [130, "Denied end", { polarity: "denied" }], [140, "Hidden end", { visibility: "hidden" }]] as const) {
    entity(root, "work", label + " root"); entity(root + 500, "person", label + " person"); claim(root + 6000, root + 500, root);
    if (extra) { entity(root + 1, "work", label + " other"); claim(root + 7000, root + 500, root + 1, extra); }
  }
  entity(150, "work", "Reverse root"); entity(151, "work", "Reverse end"); entity(650, "person", "Reverse person");
  claim(6150, 150, 650); claim(7150, 650, 151);
  for (const root of [160, 170]) {
    entity(root, "work", `Role ${root} root`); entity(root + 1, "work", `Role ${root} end`); entity(root + 500, "person", `Role ${root} person`);
    claim(root + 6000, root + 500, root, { contributionRoleId: "DRAWING" }); claim(root + 7000, root + 500, root + 1, { contributionRoleId: "AUTHORSHIP" });
  }
  claim(9170, 670, 170, { contributionRoleId: "AUTHORSHIP", polarity: "denied" });
  entity(180, "work", "Unconnected");
  for (let n = 0; n < 25; n++) { entity(700 + n, "work", `A dead ${n}`); entity(1200 + n, "person", `A person ${n}`); claim(8000 + n, 1200 + n, 700 + n); }
  entity(900, "organization", "Institution"); entity(901, "event", "Meeting"); entity(902, "person", "Visitor");
  claim(9900, 902, 900, { predicate: "AFFILIATED_WITH", organizationPositionId: "VISITOR" });
  claim(9901, 902, 901, { predicate: "PARTICIPATED_IN", eventRoleId: "CHAIR", polarity: "denied" });
  claim(9902, 902, 901, { predicate: "PARTICIPATED_IN" });
  await run("UNWIND $entities AS props CREATE (e:Entity) SET e=props", { entities });
  await run("MATCH(e:Entity {kind:'event'}) SET e.eventGranularity='occurrence'");
  await run("UNWIND $claims AS props MATCH (s:Entity {id:props.subjectId}), (o:Entity {id:props.objectId}) CREATE (c:Claim) SET c=props CREATE (c)-[:SUBJECT]->(s), (c)-[:OBJECT]->(o)", { claims });
  const example = input("High degree root");
  const explainStart = performance.now();
  const explained = await run("EXPLAIN " + targetEntitiesQuery(example), { ...relationQueryParameters(example.criteria.relation!), q: example.criteria.q, kind: "work", afterId: null, afterName: null, afterRank: null });
  metrics.push({ scenario: "isolated-query-plan", milliseconds: Math.round(performance.now() - explainStart), plan: explained.summary.plan });
}, 60000);
afterAll(async () => {
  mkdirSync("test-results", { recursive: true }); writeFileSync("test-results/discovery-targets-isolated.json", JSON.stringify(metrics, null, 2));
  await driver.close();
  const shared = globalThis as typeof globalThis & { graphReadDatabase?: { driver: typeof driver } }; if (shared.graphReadDatabase) { await shared.graphReadDatabase.driver.close(); delete shared.graphReadDatabase; }
});
it("完全パターンだけを返し、旧GETの一段検索・否定を含む意味は変わらない", async () => {
  const result = await searchDiscoveryTargets(input("Dead end"), signal()); expect(result.items).toEqual([]);
  for (const q of ["Denied end", "Hidden end", "Reverse"]) expect((await searchDiscoveryTargets(input(q), signal())).items).toEqual([]);
  expect((await discoverEntities({ q: "dead end", kind: "work", predicates: ["CONTRIBUTED_TO"] })).items.map(e => e.id)).toContain(id(120));
  expect((await searchDiscoveryTargets(input("Denied end root", adjacent), signal())).items).toHaveLength(1);
  expect((await searchDiscoveryTargets(input("Unconnected", null), signal())).items[0].match).toEqual({ status: "unconstrained" });
  expect((await searchDiscoveryTargets(input("Unconnected", adjacent), signal())).items).toEqual([]);
});
it("高次数の1001件目にしかない完全経路を取得し、同revisionの元Claimで再検証する", async () => {
  const bounded = await run(PATH_NEIGHBORS, { ids: [id(100)], predicates: ["CONTRIBUTED_TO"], roles: null, take: neo4j.int(21) });
  expect(bounded.records.map(r => r.get("claim").id)).not.toContain(id(4000));
  const times: number[] = [];
  for (let n = 0; n < 6; n++) {
    const start = performance.now(); const result = await searchDiscoveryTargets(input("High degree root"), signal()); times.push(Math.round(performance.now() - start));
    expect(result.items).toHaveLength(1); const match = result.items[0].match; if (match.status !== "matched") throw Error("Missing witness");
    expect(match.witness.route).toEqual({ nodeIds: [100, 11000, 101].map(id), claimIds: [4000, 5000].map(id) });
    const material = await readRelationTransaction(tx => verifyRelationWitness(tx, result.criteria.relation!, match.witness), signal());
    expect(material.claims.get(id(5000))).toMatchObject({ polarity: "affirmed", contribution: { roleId: "DRAWING" }, period: { from: { value: "2000" } } });
  }
  const request = input("High degree root");
  const profiled = await run("PROFILE " + targetEntitiesQuery(request), { ...relationQueryParameters(request.criteria.relation!), q: request.criteria.q, kind: "work", afterId: null, afterName: null, afterRank: null });
  const hits = (p: { dbHits: number; children?: unknown[] }): number => p.dbHits + (p.children ?? []).reduce<number>((sum, c) => sum + hits(c as typeof p), 0);
  if (!profiled.summary.profile) throw Error("Missing query profile");
  const proofProfile = await run("PROFILE " + firstWitnessQuery(request.criteria.relation!), { ...relationQueryParameters(request.criteria.relation!), rootIds: [id(100)] });
  if (!proofProfile.summary.profile) throw Error("Missing witness profile");
  const m = { scenario: "1001st-neighbor", milliseconds: times, targetDbHits: hits(profiled.summary.profile), witnessDbHits: hits(proofProfile.summary.profile) }; metrics.push(m); console.log(JSON.stringify(m));
}, 30000);
it("Roleは各段の同じ肯定Claimに必要で、別Roleや否定のRoleと合成しない", async () => {
  for (const role of ["AUTHORSHIP", "DRAWING"]) expect((await searchDiscoveryTargets(input("Role 160", { ...pattern, contributionRoles: [role] }), signal())).items).toEqual([]);
  expect((await searchDiscoveryTargets(input("Role 160", { ...pattern, contributionRoles: ["AUTHORSHIP", "DRAWING"] }), signal())).items).toHaveLength(2);
  expect((await searchDiscoveryTargets(input("Role 170", { ...pattern, contributionRoles: ["AUTHORSHIP"] }), signal())).items).toEqual([]);
  expect((await searchDiscoveryTargets(input("", { ...pattern, contributionRoles: [] }), signal())).items).toEqual([]);
});
it("一段の組織立場・Event役割も同一Claimへ限定し、一般参加の肯定をCHAIRに合成しない", async () => {
  const org = parseTargetSearch({ ...input(), criteria: { q: "Institution", kind: "organization", relation: { ...adjacent, predicates: ["AFFILIATED_WITH"], organizationPositions: ["VISITOR"] } } });
  expect((await searchDiscoveryTargets(org, signal())).items).toHaveLength(1);
  const meeting = parseTargetSearch({ ...input(), criteria: { q: "Meeting", kind: "event", relation: { ...adjacent, predicates: ["PARTICIPATED_IN"], eventRoles: ["CHAIR"], polarity: "affirmed" } } });
  expect((await searchDiscoveryTargets(meeting, signal())).items).toEqual([]);
  const all = { ...meeting, criteria: { ...meeting.criteria, relation: { ...meeting.criteria.relation!, polarity: "all-records" } } };
  expect((await searchDiscoveryTargets(all, signal())).items).toHaveLength(1);
});
it("複数ページの対象が重複・欠落せず、同名でもUUIDで安定し、名前条件も保持する", async () => {
  const all: string[] = []; let after: string | null = null; let pages = 0;
  do { const req: TargetSearchRequest = { ...input(), after, revision: after ? "r1" : null }; const result = await searchDiscoveryTargets(req, signal()); all.push(...result.items.map(i => i.entity.id)); after = result.page.nextCursor; pages++; } while (after);
  expect(new Set(all).size).toBe(all.length); expect(all).toHaveLength(57); expect(pages).toBe(3);
  expect(all).toContain(id(100)); expect(all).not.toContain(id(120));
  const named = await searchDiscoveryTargets(input("　Ｂｕｌｋ　"), signal()); expect(named.criteria.q).toBe("bulk"); expect(named.items.every(i => i.entity.name.startsWith("Bulk"))).toBe(true);
});
it("実DBのtransaction timeoutを503として返し、正常な0件へ変換しない", async () => {
  const replacement = vi.spyOn(readDb, "readRelationTransaction").mockImplementation(async action => {
    const session = driver.session({ defaultAccessMode: "READ" }); const tx = session.beginTransaction({ timeout: 1 });
    // A real running query crosses the DB monitor interval; a 100ms idle
    // transaction can finish before Neo4j's periodic timeout monitor runs.
    try { await tx.run("UNWIND range(1, 100000000) AS n RETURN sum(n)"); return await action(tx); }
    finally { await tx.rollback().catch(() => {}); await session.close(); }
  });
  try {
    const response = await handleTargetSearch(new Request("http://localhost/api/discovery/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input()) }));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: { reason: "UNCONFIRMED" } });
  } finally { replacement.mockRestore(); }
});
it("証拠の改ざん・非公開化・公開版の変更を再検証で拒否する", async () => {
  const result = await searchDiscoveryTargets(input("High degree root"), signal()); const match = result.items[0].match; if (match.status !== "matched") throw Error("Missing witness");
  await expect(readRelationTransaction(tx => verifyRelationWitness(tx, result.criteria.relation!, { ...match.witness, route: { ...match.witness.route, claimIds: [id(3000), id(5000)] } }), signal())).rejects.toThrow();
  await run("MATCH(c:Claim {id:$id}) SET c.visibility='hidden'", { id: id(5000) });
  await expect(readRelationTransaction(tx => verifyRelationWitness(tx, result.criteria.relation!, match.witness), signal())).rejects.toThrow();
  await run("MATCH(c:Claim {id:$id}) SET c.visibility='published'", { id: id(5000) });
  await run("MATCH(s:DatasetState {id:'public-kg'}) SET s.revision='r2'");
  const response = await handleTargetSearch(new Request("http://localhost/api/discovery/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input(), revision: "r1" }) }));
  expect(response.status).toBe(409);
  await expect(readRelationTransaction(tx => verifyRelationWitness(tx, result.criteria.relation!, match.witness), signal())).rejects.toMatchObject({ status: 409 });
  await run("MATCH(s:DatasetState {id:'public-kg'}) SET s.revision='r1'");
  await readRelationTransaction(tx => readPublicRevision(tx, "r1"), signal());
});
it("v2は中央人物・関連人物名の作品を完全判定し、同じ人物の証拠を直接再検証する",async()=>{
 const start=performance.now();
 const people=await searchDiscoveryTargets(v2("Bulk contributor","person"),signal());
 expect(people.items.map(i=>i.entity.id)).toEqual([id(500)]);
 const match=people.items[0].match;if(match.status!=="matched")throw Error();
 expect(match.witness).toMatchObject({version:2,subjectId:id(500),subjectPosition:"contributor",route:{nodeIds:[id(0),id(500),id(1)]}});
 await readRelationTransaction(tx=>verifyRelationWitness(tx,people.criteria.relation!,match.witness),signal());
 const works=await searchDiscoveryTargets(v2("Degree 1000","work","contributor",["DRAWING"]),signal());
 expect(new Set(works.items.map(i=>i.entity.id))).toEqual(new Set([id(100),id(101)]));
 for(const item of works.items){if(item.match.status!=="matched")throw Error();expect(item.match.witness.route.nodeIds[1]).toBe(id(11000));}
 expect((await searchDiscoveryTargets(v2("Role 170 person","work","contributor",["AUTHORSHIP"]),signal())).items).toEqual([]);
 expect((await searchDiscoveryTargets(v2("Dead end person","person"),signal())).items).toEqual([]);
 await expect(readRelationTransaction(tx=>verifyRelationWitness(tx,people.criteria.relation!,{...match.witness,matchContext:{q:"Other person",kind:"person",nameTarget:"subject"}}),signal())).rejects.toThrow();
 metrics.push({scenario:"v2-person-and-related-name",milliseconds:Math.round(performance.now()-start)});
});
it("人物Graphは作品対を二乗生成せずページング・証拠保持・復元できる",async()=>{
 const result=await searchDiscoveryTargets(v2("Bulk contributor","person"),signal()),item=result.items[0];if(item.match.status!=="matched")throw Error();
 const req={version:2,dataset:"public-kg",rootId:id(500),relation:result.criteria.relation,revision:"r1"};
 let after:string|null=null;const ends:string[]=[];let first;const times=[];
 do{const start=performance.now();const page=await executePatternGraph({...req,operation:{type:"page",after,requiredWitness:item.match.witness}},signal());times.push(Math.round(performance.now()-start));if(page.operation!=="page")throw Error();first??=page;
 ends.push(...page.routes.map(r=>r.nodeIds[2]));after=page.page.nextCursor;}while(after);
 expect(ends.length).toBe(50);expect(new Set(ends).size).toBe(50);
 const restored=await executePatternGraph({...req,operation:{type:"restore",routes:first!.routes,observedRevision:"r1",candidateBoundary:first!.routes.at(-1)}},signal());
 expect(restored.operation).toBe("restore");metrics.push({scenario:"v2-contributor-pages",milliseconds:times});
});
it("B方式は到達経路と独立した候補自身の完全条件を一括照合する",async()=>{
 const response=await handleSubjectMatches(new Request("http://localhost/api/discovery/subject-matches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,ids:[id(500),id(100),id(120),id(900)],relation:v2("","work").criteria.relation,revision:"r1"})}));
 expect(response.status).toBe(200);const body=await response.json();
 expect(body.items.find((i:{entity:{id:string}})=>i.entity.id===id(500)).status).toBe("matched");
 expect(body.items.find((i:{entity:{id:string}})=>i.entity.id===id(120)).status).toBe("not-matched");
 expect(body.items.find((i:{entity:{id:string}})=>i.entity.id===id(900)).status).toBe("incompatible");
});
