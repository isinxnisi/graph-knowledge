import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import neo4j from "neo4j-driver";
import { roleIdSchema } from "../lib/domain/contribution";
import { fixtureV4Schema } from "../lib/domain/fixture";
import { claimSummarySchema, entitySummarySchema } from "../lib/domain/api";
import { normalizeRelationCondition, relationConditionKey } from "../lib/domain/relation-conditions";
import { validateRelationRoute } from "../lib/domain/relation-patterns";
import { seedFixture } from "../lib/server/seed";
const [mode, directory, destination] = process.argv.slice(2);
assert(["ordinary", "validate", "seed"].includes(mode));
const read = (name: string) => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
const candidate = read("candidate/data.json"), review = read("review/proposed-records.json").records;
if (mode === "ordinary") {
 assert.equal(roleIdSchema.safeParse("ACTING").success, false);
 assert.equal(roleIdSchema.safeParse("DIRECTING").success, false);
 assert.equal(fixtureV4Schema.safeParse(candidate).success, false);
 writeFileSync(destination, JSON.stringify({ ordinaryRuntimeRejectsUnadoptedFilmRoles: true }));
} else {
 const all = fixtureV4Schema.parse(candidate), selected = fixtureV4Schema.parse({ schemaVersion: 4, ...review });
 assert.equal(all.claims.length, 12); assert.equal(selected.claims.length, 2); assert.equal(selected.entities.length, 3);
 assert(selected.claims.every(c => c.visibility === "hidden" && c.contribution?.scope === null));
 assert(selected.citations.every(c => c.roleEvidence && c.stance === "support"));
 const nodeFor = (qid: string) => selected.entities.find(e => e.externalIds.some(x => x.namespace === "wikidata" && x.value === qid))!;
 const root = nodeFor("Q104137"), person = nodeFor("Q43203"), end = nodeFor("Q184255");
 const first = selected.claims.find(c => c.objectId === root.id && c.subjectId === person.id)!;
 const second = selected.claims.find(c => c.objectId === end.id && c.subjectId === person.id)!;
 assert.equal(first.contribution?.roleId, "ACTING"); assert.equal(second.contribution?.roleId, "DIRECTING");
 const relation = normalizeRelationCondition({ version: 1, type: "pattern", pattern: { id: "other-works", revision: 3 }, polarity: "affirmed", contributionRoles: null, stepRoles: [["ACTING"], ["DIRECTING"]] });
 const route = { nodeIds: [root.id, person.id, end.id], claimIds: [first.id, second.id] };
 const nodes = new Map(selected.entities.map(e => [e.id, entitySummarySchema.parse({ id: e.id, name: e.name, kind: e.kind, description: e.description })]));
 const claims = new Map(selected.claims.map(c => {
  const { visibility, createdAt, updatedAt, ...fields } = c; void visibility; void createdAt; void updatedAt;
  return [c.id, claimSummarySchema.parse({ ...fields, sourceCount: selected.citations.filter(x => x.claimId === c.id).length })];
 }));
 validateRelationRoute(relation, root.id, route, nodes, claims);
 if (mode === "seed") {
  assert(/^graph-film41-[a-f0-9]{12}$/.test(process.env.FILM41_CONTAINER ?? ""));
  assert.equal(process.env.NEO4J_URI, "bolt://127.0.0.1:" + process.env.FILM41_DB_PORT);
  assert.equal(process.env.GRAPH_DATASET, "public-kg");
  const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic("neo4j", process.env.NEO4J_PASSWORD!), { connectionTimeout: 1000, maxTransactionRetryTime: 0 });
  try {
   let ready = false;
   for (let n = 0; n < 120; n++) { try { await driver.verifyConnectivity(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
   assert(ready, "New isolated DB unavailable");
   const session = driver.session();
   try { assert.equal((await session.run("MATCH(n) RETURN count(n) AS count")).records[0].get("count").toNumber(), 0, "Refuse a nonempty database"); } finally { await session.close(); }
   // Technical visibility projection exists only in this new disposable database.
   await seedFixture(driver, "neo4j", { ...selected, claims: selected.claims.map(c => ({ ...c, visibility: "published" })) });
   const state = driver.session();
   try { await state.run("CREATE(:DatasetState {id:'public-kg',release:'film41-unaccepted-simulation',revision:'film41-isolated-r1'})"); } finally { await state.close(); }
  } finally { await driver.close(); }
 }
 writeFileSync(destination, JSON.stringify({ schemaValid: true, candidateCounts: { entities: all.entities.length, claims: all.claims.length, sources: all.sources.length, citations: all.citations.length }, recommendedCounts: { entities: 3, claims: 2, sources: 2, citations: 2 }, relation, conditionKey: relationConditionKey(relation), route, rootId: root.id, personId: person.id, endpointId: end.id, noFormalAcceptance: true }, null, 2));
}
