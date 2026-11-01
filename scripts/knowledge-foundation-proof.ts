/** Explicit isolated U1 proof. Never connects to main/beta/member/prod databases. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import neo4j, { type Driver } from "neo4j-driver";
import { adaptLegacyKnowledge, legacyDigest } from "../lib/domain/knowledge-legacy";
import type { KnowledgeSnapshot, KnowledgeActor } from "../lib/domain/knowledge-foundation";
import { createKnowledgeFoundationService, ensureKnowledgeFoundationSchema, knowledgeDigest } from "../lib/server/knowledge-foundation";

const root = process.cwd();
const out = path.join(root, ".local/issue75/knowledge-proof");
const container = "plunode-issue75-p0-neo4j";
const label = "plunode.issue75.p0=knowledge-proof";
const neoVolume = "plunode-issue75-p0-neo4j-data";
const neoImage = "sha256:da584bdd8f0d2bdcf3dbd0e5232db1547d17d1b6daba12308322ceceeae47d69";
const pgContainer = "plunode-issue75-postgres";
const operator: KnowledgeActor = { kind: "operator", id: "issue75-legacy-proof" };
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const docker = (args: string[], input?: Buffer) => execFileSync("docker", args, { input, maxBuffer: 64 * 1024 * 1024 });
const identifier = (v: string) => '"' + v.replaceAll('"', '""') + '"';
const command = (action: string, fields: Record<string, unknown>) => ({ action, requestId: randomUUID(), ...fields });

async function fingerprint(pool: Pool, includeKnowledge = true) {
  const tables = (await pool.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema' ORDER BY schemaname,tablename")).rows;
  const result: Record<string, { rows: number; sha256: string }> = {};
  for (const { schemaname, tablename } of tables) {
    if (!includeKnowledge && schemaname === "knowledge75") continue;
    const rows = (await pool.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${identifier(schemaname)}.${identifier(tablename)} t`)).rows[0].rows as unknown[];
    result[`${schemaname}.${tablename}`] = { rows: rows.length, sha256: knowledgeDigest(rows) };
  }
  return result;
}

async function startNeo4j() {
  const secretPath = path.join(out, "neo4j-private.json");
  let cfg: { password: string; containerId?: string };
  try { cfg = JSON.parse(await readFile(secretPath, "utf8")); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    cfg = { password: randomBytes(24).toString("hex") };
    await writeFile(secretPath, JSON.stringify(cfg), { mode: 0o600 });
  }
  const existing = docker(["ps", "-aq", "--filter", `name=^/${container}$`]).toString().trim();
  if (existing) {
    const actual = JSON.parse(docker(["inspect", "--format", "{{json .Config.Labels}}", container]).toString());
    assert.equal(actual["plunode.issue75.p0"], "knowledge-proof", "Refusing a foreign container");
    assert.equal(docker(["inspect", "--format", "{{.Id}}", container]).toString().trim(), cfg.containerId, "Container identity changed");
    docker(["start", container]);
  } else {
    const volumes = docker(["volume", "ls", "-q", "--filter", `name=^${neoVolume}$`]).toString().trim();
    if (volumes) {
      const labels = JSON.parse(docker(["volume", "inspect", "--format", "{{json .Labels}}", neoVolume]).toString());
      assert.equal(labels?.["plunode.issue75.p0"], "knowledge-proof", "Refusing a foreign volume");
    } else docker(["volume", "create", "--label", label, neoVolume]);
    // Password is passed only in a private env file, not in process argv/logs.
    const envPath = path.join(out, "neo4j-private.env");
    await writeFile(envPath, `NEO4J_AUTH=neo4j/${cfg.password}\nNEO4J_server_memory_heap_initial__size=192m\nNEO4J_server_memory_heap_max__size=256m\nNEO4J_server_memory_pagecache_size=128m\n`, { mode: 0o600 });
    cfg.containerId = docker(["run", "-d", "--name", container, "--label", label, "--memory", "768m", "--cpus", "1",
      "--publish", "127.0.0.1:7698:7687", "--env-file", envPath,
      "--mount", `type=volume,src=${neoVolume},dst=/data`, neoImage]).toString().trim();
    await writeFile(secretPath, JSON.stringify(cfg), { mode: 0o600 });
  }
  const driver = neo4j.driver("bolt://127.0.0.1:7698", neo4j.auth.basic("neo4j", cfg.password), { connectionAcquisitionTimeout: 5000, maxConnectionPoolSize: 2 });
  let connected = false;
  // First boot on a CPU-limited proof container can exceed a minute.
  for (let i = 0; i < 240; i++) {
    try { await driver.verifyConnectivity(); connected = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  if (!connected) {
    await driver.close();
    assert.equal(docker(["inspect", "--format", "{{.Id}}", container]).toString().trim(), cfg.containerId);
    docker(["stop", "--time", "30", container]);
    throw new Error("Isolated Neo4j did not become ready; own container stopped and retained");
  }
  return { driver, containerId: cfg.containerId };
}

/** One generation is immutable. Activation is in the same commit as completion. */
async function project(driver: Driver, generation: string, snapshot: KnowledgeSnapshot, legacy: ReturnType<typeof adaptLegacyKnowledge>["legacyLinks"], fail = false) {
  const digest = knowledgeDigest(snapshot);
  const session = driver.session({ database: "neo4j" });
  try {
    await session.executeWrite(async tx => {
      const previous = (await tx.run("MATCH (g:KnowledgeP0Generation {id:$generation}) RETURN g.sha AS sha", { generation })).records[0];
      if (previous) { assert.equal(previous.get("sha"), digest, "Generation ID has different content"); return; }
      await tx.run("CREATE (:KnowledgeP0Generation {id:$generation,sha:$digest,completed:false})", { generation, digest });
      await tx.run("UNWIND $rows AS row CREATE (:KnowledgeP0Entity {generation:$generation,id:row.id,revision:row.revision,content:row.content})", {
        generation, rows: snapshot.entities.map(e => ({ id: e.id, revision: neo4j.int(e.revision), content: JSON.stringify(e.content) })),
      });
      await tx.run("UNWIND $rows AS row CREATE (:KnowledgeP0Source {generation:$generation,id:row.id,revision:row.revision,content:row.content})", {
        generation, rows: snapshot.sources.map(s => ({ id: s.id, revision: neo4j.int(s.revision), content: JSON.stringify(s.content) })),
      });
      await tx.run("UNWIND $rows AS row CREATE (:KnowledgeP0Record {generation:$generation,id:row.id,revision:row.revision,content:row.content,legacySha:row.legacySha,legacyPayload:row.legacyPayload})", {
        generation, rows: snapshot.records.map(r => { const l = legacy.find(l => l.recordId === r.id); return { id: r.id, revision: neo4j.int(r.revision), content: JSON.stringify(r.content), legacySha: l?.sha256 ?? null, legacyPayload: l ? JSON.stringify(l.payload) : null }; }),
      });
      for (const [side, rel] of [["subjectId", "SUBJECT"], ["objectId", "OBJECT"]] as const) {
        await tx.run(`UNWIND $rows AS row MATCH (r:KnowledgeP0Record {generation:$generation,id:row.id}),(e:KnowledgeP0Entity {generation:$generation,id:row.entityId}) CREATE (r)-[:${rel}]->(e)`, {
          generation, rows: snapshot.records.filter(r => r.content[side]).map(r => ({ id: r.id, entityId: r.content[side] })),
        });
      }
      await tx.run("UNWIND $rows AS row MATCH (r:KnowledgeP0Record {generation:$generation,id:row.recordId}),(s:KnowledgeP0Source {generation:$generation,id:row.sourceId,revision:row.sourceRevision}) CREATE (r)-[:CITES {id:row.id,locator:row.locator,excerpt:row.excerpt,stance:row.stance}]->(s)", {
        generation, rows: snapshot.records.flatMap(r => r.content.evidence.map(e => ({ recordId: r.id, sourceId: e.source.id, sourceRevision: neo4j.int(e.source.revision), id: e.id, locator: e.locator, excerpt: e.excerpt, stance: e.stance }))),
      });
      const counts = (await tx.run("MATCH (r:KnowledgeP0Record {generation:$generation}) OPTIONAL MATCH (r)-[c:CITES]->() RETURN count(DISTINCT r) AS records,count(c) AS citations", { generation })).records[0];
      assert.equal(counts.get("records").toNumber(), snapshot.records.length);
      assert.equal(counts.get("citations").toNumber(), snapshot.records.reduce((n, r) => n + r.content.evidence.length, 0));
      if (fail) throw new Error("INTENTIONAL_PROJECTION_FAILURE");
      await tx.run("MATCH (g:KnowledgeP0Generation {id:$generation}) SET g.completed=true MERGE (a:KnowledgeP0Control {id:'active'}) SET a.generation=$generation", { generation });
    });
  } finally { await session.close(); }
  return digest;
}
async function graphRead(driver: Driver, generation?: string) {
  const s = driver.session({ database: "neo4j", defaultAccessMode: neo4j.session.READ });
  try {
    const active = (await s.run("MATCH (a:KnowledgeP0Control {id:'active'}) RETURN a.generation AS generation")).records[0]?.get("generation") as string;
    const actual = generation ?? active;
    const rows = (await s.run("MATCH (r:KnowledgeP0Record {generation:$generation}) RETURN r.id AS id,r.revision AS revision,r.content AS content,r.legacyPayload AS legacyPayload,r.legacySha AS legacySha ORDER BY r.id", { generation: actual })).records;
    const edges = (await s.run("MATCH (r:KnowledgeP0Record {generation:$generation})-[:SUBJECT]->(s:KnowledgeP0Entity) MATCH (r)-[:OBJECT]->(o:KnowledgeP0Entity) RETURN r.id AS id,s.id AS subjectId,o.id AS objectId ORDER BY r.id", { generation: actual })).records;
    return { active, rows: rows.map(r => ({ id: r.get("id") as string, revision: r.get("revision").toNumber() as number, content: JSON.parse(r.get("content")), legacyPayload: JSON.parse(r.get("legacyPayload")), legacySha: r.get("legacySha") as string })), edges: edges.map(e => e.toObject()) };
  } finally { await s.close(); }
}
function sampleSnapshot(snapshot: KnowledgeSnapshot, ids: Set<string>): KnowledgeSnapshot {
  const records = snapshot.records.filter(r => ids.has(r.id));
  const entityIds = new Set(records.flatMap(r => [r.content.subjectId, r.content.objectId]));
  const sourcePins = new Set(records.flatMap(r => r.content.evidence.map(e => `${e.source.id}@${e.source.revision}`)));
  return { schemaVersion: 1, initialView: "graph", records, entities: snapshot.entities.filter(e => entityIds.has(e.id)), sources: snapshot.sources.filter(s => sourcePins.has(`${s.id}@${s.revision}`)), mappings: snapshot.mappings.filter(m => ids.has(m.id)) };
}

async function main() {
  assert(process.argv.includes("--run-isolated"), "Explicit --run-isolated is required");
  const url = new URL(process.env.THEME_DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55475"); assert.equal(url.pathname, "/plunode_theme75");
  await mkdir(out, { recursive: true, mode: 0o700 }); await chmod(out, 0o700);
  const started = performance.now();
  const pool = new Pool({ connectionString: url.href, max: 2 });
  let restoredPool: Pool | undefined, driver: Driver | undefined, ownedId: string | undefined;
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), source: "six-real-published-claims", mainBetaProductionUntouched: true };
  try {
    const oldState = await fingerprint(pool, false);
    const migration = await ensureKnowledgeFoundationSchema(pool);
    const service = createKnowledgeFoundationService(pool);
    const sampleBytes = await readFile(path.join(root, "docs/research/issue75-foundation/legacy-sample.json"));
    const sample = JSON.parse(sampleBytes.toString());
    const originalPath = "/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime/datasets/public-kg/releases/publication-8b0b1d67656a15c7e505ba1f/data.json";
    assert.equal(sample.provenance.sourceDataPath, originalPath);
    const originalBytes = await readFile(originalPath);
    assert.equal(sha(originalBytes), sample.provenance.sourceDataSha256);
    assert.equal(sha(await readFile(path.join(path.dirname(originalPath), "manifest.json"))), sample.provenance.sourceManifestSha256);
    const original = JSON.parse(originalBytes.toString());
    for (const kind of ["entities", "claims", "sources", "citations"] as const) {
      const byId = new Map((original[kind] as { id: string }[]).map(item => [item.id, item]));
      for (const item of sample.fixture[kind] as { id: string }[]) assert.deepEqual(item, byId.get(item.id), "Sample differs from the actual published artifact");
    }
    const adapted = adaptLegacyKnowledge(sample.fixture, sample.provenance);
    const { warnings, ...bundle } = adapted;
    for (const l of bundle.legacyLinks) assert.equal(l.sha256, knowledgeDigest(l.payload), "Hash contracts differ");
    const seed = { requestId: "504dcb31-5e8c-4de5-a696-ff122a9c6ed9", action: "create-bundle", ...bundle, reason: "公開済みKG6件の固定版を独立U1実証へ取り込む" };
    const first = await service.execute(operator, seed);
    assert.deepEqual(await service.execute(operator, seed), first, "Resubmission must return the original receipt");
    assert.deepEqual(await fingerprint(pool, false), oldState, "The old theme75 data changed");
    const before = await fingerprint(pool);
    assert.equal((await ensureKnowledgeFoundationSchema(pool)).applied, false);
    assert.deepEqual(await fingerprint(pool), before, "Repeated migration changed rows");
    const dump = docker(["exec", pgContainer, "pg_dump", "-U", "theme75", "-d", "plunode_theme75", "-Fc"]);
    await writeFile(path.join(out, "knowledge-after-import.dump"), dump, { mode: 0o600 });
    const restoreName = "plunode_knowledge75_restore_" + Date.now();
    docker(["exec", pgContainer, "createdb", "-U", "theme75", restoreName]);
    docker(["exec", "-i", pgContainer, "pg_restore", "-U", "theme75", "-d", restoreName, "--no-owner", "--no-privileges", "--exit-on-error"], dump);
    const restoredUrl = new URL(url); restoredUrl.pathname = "/" + restoreName;
    restoredPool = new Pool({ connectionString: restoredUrl.href, max: 2 });
    const restoredBefore = await fingerprint(restoredPool);
    assert.deepEqual(restoredBefore, before, "Restored DB differs from the dump source");
    assert.equal((await ensureKnowledgeFoundationSchema(restoredPool)).applied, false);
    assert.deepEqual(await fingerprint(restoredPool), restoredBefore, "Migration replay changed restored rows");
    await restoredPool.query("UPDATE knowledge75.migrations SET checksum=$1 WHERE name='001-records.sql'", ["0".repeat(64)]);
    await assert.rejects(() => ensureKnowledgeFoundationSchema(restoredPool!), /checksum/);
    await restoredPool.query("UPDATE knowledge75.migrations SET checksum=$1 WHERE name='001-records.sql'", [migration.checksum]);
    assert.equal((await ensureKnowledgeFoundationSchema(restoredPool)).applied, false);
    const restoreService = createKnowledgeFoundationService(restoredPool);
    const ids = new Set(adapted.records.map(r => r.id));
    const initial = sampleSnapshot(await restoreService.publicSnapshot(), ids);
    assert.equal(initial.records.length, 6);
    const neo = await startNeo4j(); driver = neo.driver; ownedId = neo.containerId;
    const run = randomUUID();
    const gen1 = run + "-original", gen2 = run + "-corrected", gen3 = run + "-hidden", gen4 = run + "-failed", gen5 = run + "-rebuilt";
    await project(driver, gen1, initial, adapted.legacyLinks);
    const originalGraph = await graphRead(driver);
    assert.equal(originalGraph.rows.length, 6);
    for (const row of originalGraph.rows) {
      assert.equal(row.legacySha, legacyDigest(row.legacyPayload));
      assert.deepEqual(row.content, initial.records.find(r => r.id === row.id)!.content);
      const record = initial.records.find(r => r.id === row.id)!;
      assert.deepEqual(originalGraph.edges.find(e => e.id === row.id), { id: row.id, subjectId: record.content.subjectId, objectId: record.content.objectId });
    }
    const target = initial.records[0];
    await restoreService.execute(operator, command("correct", { kind: "record", id: target.id, expectedRevision: target.revision, content: { ...target.content, assertion: target.content.assertion + "（隔離DBの訂正実証）" }, reason: "復元先だけの訂正実証" }));
    const corrected = sampleSnapshot(await restoreService.publicSnapshot(), ids);
    await project(driver, gen2, corrected, adapted.legacyLinks);
    assert.equal((await graphRead(driver)).rows.find(r => r.id === target.id)!.revision, target.revision + 1);
    assert.deepEqual((await graphRead(driver, gen1)).rows, originalGraph.rows, "Previous generation changed");
    const legacyLink = await restoreService.legacyLink(operator, sample.provenance.dataset, target.id);
    assert(legacyLink && typeof legacyLink === "object" && "importedRevision" in legacyLink);
    assert.equal(legacyLink.importedRevision, 1, "Legacy link moved to the correction");
    const status = (await restoreService.list(operator)).statuses.find(s => s.kind === "record" && s.id === target.id)!;
    await restoreService.execute(operator, command("set-visibility", { kind: "record", id: target.id, expectedStatusRevision: status.revision, visibility: "hidden", reason: "復元先だけの非表示実証" }));
    const hidden = sampleSnapshot(await restoreService.publicSnapshot(), ids);
    assert.equal(hidden.records.length, 5);
    await project(driver, gen3, hidden, adapted.legacyLinks);
    const hiddenGraph = await graphRead(driver);
    assert.equal(hiddenGraph.rows.length, 5);
    assert(!hiddenGraph.rows.some(r => r.id === target.id));
    await project(driver, gen3, hidden, adapted.legacyLinks);
    assert.deepEqual(await graphRead(driver), hiddenGraph, "Repeated projection changed the generation");
    await assert.rejects(() => project(driver!, gen4, hidden, adapted.legacyLinks, true), /INTENTIONAL/);
    assert.deepEqual(await graphRead(driver), hiddenGraph, "Failed generation replaced active data");
    assert.equal((await graphRead(driver, gen4)).rows.length, 0, "Failed transaction left partial rows");
    await project(driver, gen5, hidden, adapted.legacyLinks);
    assert.deepEqual((await graphRead(driver)).rows, hiddenGraph.rows, "Rebuild differs from canonical PG data");
    assert.deepEqual(await fingerprint(pool), before, "Proof changed the source DB after import");
    report.completed = true;
    report.legacy = { sampleSha256: sha(sampleBytes), sourceDataSha256: sample.provenance.sourceDataSha256, claimIds: [...ids], entities: adapted.entities.length, records: 6, sources: adapted.sources.length, citations: adapted.records.reduce((n, r) => n + r.content.evidence.length, 0), warnings, sampleComparedToPublishedPackage: true, immutableLinks: true, typedPayloadRoundTrip: true, oldTheme75Unchanged: true, idempotentImport: true };
    report.database = { migration, repeatedUnchanged: true, checksumMismatchRejected: true, restoredDatabase: restoreName, dumpSha256: sha(dump), dumpBytes: dump.length, sourceFingerprint: before, restoredFingerprint: restoredBefore, restoredExactly: true, correctionsOnlyInRestoredDatabase: true };
    report.projection = { image: neoImage, container, generations: { original: gen1, corrected: gen2, hidden: gen3, rejected: gen4, rebuilt: gen5 }, originalRecords: 6, hiddenRecords: 5, oldGenerationPreserved: true, failedActivationPreservesActive: true, repeatUnchanged: true, rebuiltFromPg: true, legacyLinkStaysAtRevision1: true };
    report.durationMs = Math.round(performance.now() - started);
  } finally {
    if (driver) await driver.close();
    if (ownedId) {
      assert.equal(docker(["inspect", "--format", "{{.Id}}", container]).toString().trim(), ownedId);
      docker(["stop", "--time", "30", container]);
      report.neo4jStoppedAndRetained = true;
    }
    if (restoredPool) await restoredPool.end();
    await pool.end();
    await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  }
  console.log(JSON.stringify({ completed: report.completed, report: path.relative(root, path.join(out, "report.json")), durationMs: report.durationMs, neo4jStoppedAndRetained: report.neo4jStoppedAndRetained }));
}
main().catch(error => { console.error(JSON.stringify({ completed: false, errorType: error?.constructor?.name, message: error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[private connection]") : "Unexpected proof error" })); process.exitCode = 1; });
