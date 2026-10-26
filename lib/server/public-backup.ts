import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Driver, ManagedTransaction } from "neo4j-driver";
import { fixtureV4Schema } from "../domain/fixture";
import { withdrawalSchema } from "../domain/public-release";
import { claimSummary, citationDetail, entityDetail, sourceDetail } from "./mappers";
import { publicGraph, publicGraphDigest, readPublicGraph, type PublicGraph } from "./public-graph";
import { sha256, stableJson } from "./public-dataset";
import { applyConstraints } from "./seed";
import { graphIdentities, mergeIdentities, readRetainedIdentities, retainedIdentitySchema } from "./public-identities";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.strictObject({ id: z.string().min(1), digest, dataSha256: digest, reason: z.string().min(1), appliedAt: z.iso.datetime() });
const payloadSchema = z.strictObject({
  version: z.literal(1), dataset: z.literal("public-kg"), savedAt: z.iso.datetime(),
  release: z.string().min(1), revision: z.string().min(1), graphDigest: digest,
  fixture: fixtureV4Schema, withdrawals: z.array(withdrawalSchema), receipts: z.array(receiptSchema).min(1),
  externalNodeIds: z.record(z.string(), z.uuidv4()),
  identities: z.array(retainedIdentitySchema).optional(),
});
const backupSchema = z.strictObject({ checksum: digest, payload: payloadSchema });
export type PublicBackup = z.infer<typeof backupSchema>;

// 既知schemaへ逆変換して再構成できることを要求する。未知属性を黙って捨てない。
function graphFixture(graph: PublicGraph) {
  const byLabel = (label: string) => Object.entries(graph.nodes).filter(([, node]) => node.label === label);
  const outgoing = new Map<string, Map<string, string[]>>();
  const citationOwners = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const types = outgoing.get(edge.from) ?? new Map<string, string[]>();
    const targets = types.get(edge.type) ?? [];
    targets.push(edge.to); types.set(edge.type, targets); outgoing.set(edge.from, types);
    if (edge.type === "HAS_CITATION") {
      const owners = citationOwners.get(edge.to) ?? [];
      owners.push(edge.from); citationOwners.set(edge.to, owners);
    }
  }
  const linked = (id: string, type: string) => (outgoing.get(id)?.get(type) ?? []).map(target => graph.nodes[target]);
  const one = (id: string, type: string) => {
    const nodes = linked(id, type);
    if (nodes.length !== 1) throw new Error("Invalid backup connection cardinality");
    return nodes[0].properties;
  };
  return fixtureV4Schema.parse({ schemaVersion: 4,
    entities: byLabel("Entity").map(([key, { properties: props }]) => ({ ...entityDetail(props), createdAt: props.createdAt, updatedAt: props.updatedAt,
      externalIds: linked(key, "HAS_EXTERNAL_ID").map(node => node.properties) })),
    claims: byLabel("Claim").map(([key, { properties: props }]) => {
      const { sourceCount: unused, ...claim } = claimSummary(props, entityDetail(one(key, "SUBJECT")), entityDetail(one(key, "OBJECT")), 0);
      void unused;
      return { ...claim, visibility: props.visibility, createdAt: props.createdAt, updatedAt: props.updatedAt };
    }),
    sources: byLabel("Source").map(([, { properties }]) => sourceDetail(properties)),
    citations: byLabel("Citation").map(([key, { properties }]) => {
      const { source, ...citation } = citationDetail(properties, one(key, "CITES"));
      const claims = citationOwners.get(key) ?? [];
      if (claims.length !== 1) throw new Error("Invalid backup citation owner");
      return { ...citation, claimId: graph.nodes[claims[0]].properties.id, sourceId: source.id };
    }),
  });
}

export function validatePublicBackup(input: unknown): PublicBackup {
  const backup = backupSchema.parse(input), { payload } = backup;
  if (backup.checksum !== sha256(stableJson(payload))) throw new Error("Backup checksum mismatch");
  const graph = publicGraph(payload.fixture, payload.withdrawals);
  if (new Set((payload.identities ?? []).map(row => row.id)).size !== (payload.identities ?? []).length) throw new Error("Duplicate backup identity");
  mergeIdentities(payload.identities ?? [], graphIdentities(graph));
  if (payload.graphDigest !== publicGraphDigest(graph)) throw new Error("Backup graph fingerprint mismatch");
  if (payload.fixture.sources.some(source => source.isDemo)) throw new Error("Demo backup cannot enter public-kg");
  const receipts = new Map(payload.receipts.map(row => [row.id, row]));
  if (receipts.size !== payload.receipts.length || !receipts.has(payload.release)) throw new Error("Invalid backup release history");
  const expected = Object.keys(graph.nodes).filter(key => graph.nodes[key].label === "ExternalIdentifier");
  if (stableJson(expected.sort()) !== stableJson(Object.keys(payload.externalNodeIds).sort()) || new Set(Object.values(payload.externalNodeIds)).size !== expected.length) throw new Error("Invalid backup external IDs");
  const withdrawals = new Set(payload.withdrawals.map(row => row.claimId));
  if (withdrawals.size !== payload.withdrawals.length || payload.fixture.claims.some(claim => (claim.visibility === "hidden") !== withdrawals.has(claim.id))) throw new Error("Invalid backup withdrawals");
  for (const row of payload.withdrawals) if (!receipts.has(row.release) || !payload.fixture.claims.some(claim => claim.id === row.claimId)
    || row.replacementClaimId && (row.replacementClaimId === row.claimId || !payload.fixture.claims.some(claim => claim.id === row.replacementClaimId))) throw new Error("Invalid backup withdrawal references");
  for (const row of payload.withdrawals) {
    const seen = new Set([row.claimId]); let next = row.replacementClaimId;
    while (next) {
      if (seen.has(next)) throw new Error("Replacement cycle in backup");
      seen.add(next); next = payload.withdrawals.find(item => item.claimId === next)?.replacementClaimId ?? null;
    }
  }
  return backup;
}

async function target(tx: ManagedTransaction) {
  const states = (await tx.run("MATCH (s:DatasetState) RETURN properties(s) AS props")).records;
  const graph = await readPublicGraph(tx);
  if (!states.length && !Object.keys(graph.nodes).length) return { revision: "empty", graph };
  if (states.length !== 1 || states[0].get("props").id !== "public-kg") throw new Error("Wrong restore dataset marker");
  const state = states[0].get("props");
  if (!state.release && !Object.keys(graph.nodes).length && Object.keys(state).every(key => ["id", "lockVersion"].includes(key))) return { revision: "empty", graph };
  if (!state.release || state.graphDigest !== publicGraphDigest(graph)) throw new Error("Backup/restore refused: database drift or unmarked database");
  return { revision: String(state.revision ?? `legacy:${state.release}`), release: String(state.release), graph };
}

export async function createPublicBackup(driver: Driver, database: string): Promise<PublicBackup> {
  const guard = driver.session({ database, defaultAccessMode: "READ" });
  try {
    const trial = await guard.run("MATCH (s:FilmBetaState) RETURN count(s) AS n");
    if (trial.records[0].get("n").toNumber() !== 0) throw new Error("Film beta trial cannot be exported as a public KG backup");
  } finally { await guard.close(); }
  const session = driver.session({ database });
  try { return await session.executeRead(async tx => {
    const before = await target(tx);
    if (!before.release) throw new Error("Nothing to back up");
    const fixture = graphFixture(before.graph);
    const withdrawals = Object.values(before.graph.nodes).filter(node => node.label === "Claim" && node.properties.withdrawalReason).map(({ properties: p }) => ({
      claimId: String(p.id), reason: String(p.withdrawalReason), release: String(p.withdrawnInRelease), replacementClaimId: p.replacementClaimId ? String(p.replacementClaimId) : null,
    }));
    if (publicGraphDigest(publicGraph(fixture, withdrawals)) !== publicGraphDigest(before.graph)) throw new Error("Backup would lose unknown data");
    const receipts = (await tx.run("MATCH (r:DatasetRelease) RETURN properties(r) AS props ORDER BY r.id")).records.map(record => record.get("props"));
    const externalNodeIds = Object.fromEntries((await tx.run("MATCH (n:ExternalIdentifier) RETURN n.namespace AS namespace, n.value AS value, n.id AS id")).records.map(row => [`ExternalIdentifier:${stableJson([row.get("namespace"), row.get("value")])}`, row.get("id")]));
    const identities = await readRetainedIdentities(tx);
    if ((await target(tx)).revision !== before.revision) throw new Error("Dataset changed during backup; retry");
    const payload = payloadSchema.parse({ version: 1, dataset: "public-kg", savedAt: new Date().toISOString(), release: before.release, revision: before.revision,
      graphDigest: publicGraphDigest(before.graph), fixture, withdrawals, receipts, externalNodeIds, identities });
    return validatePublicBackup({ payload, checksum: sha256(stableJson(payload)) });
  }, { timeout: 180000 }); } finally { await session.close(); }
}

async function checkRestore(tx: ManagedTransaction, backup: PublicBackup, expectedRevision: string) {
  const current = await target(tx);
  mergeIdentities(await readRetainedIdentities(tx), backup.payload.identities ?? [], graphIdentities(current.graph), graphIdentities(publicGraph(backup.payload.fixture, backup.payload.withdrawals)));
  if (current.revision !== expectedRevision) throw new Error("Restore target revision changed; plan again");
  const receipts = (await tx.run("MATCH (r:DatasetRelease) RETURN properties(r) AS props")).records.map(row => receiptSchema.parse(row.get("props")));
  for (const old of receipts) {
    const incoming = backup.payload.receipts.find(row => row.id === old.id);
    if (incoming && incoming.digest !== old.digest) throw new Error("Conflicting release history");
  }
  return { expectedRevision, fromRelease: current.release ?? null, toRelease: backup.payload.release, nodes: Object.keys(publicGraph(backup.payload.fixture, backup.payload.withdrawals).nodes).length };
}

export async function planPublicRestore(driver: Driver, database: string, input: unknown, expectedRevision: string) {
  const backup = validatePublicBackup(input);
  const session = driver.session({ database });
  try { return await session.executeRead(tx => checkRestore(tx, backup, expectedRevision), { timeout: 60000 }); }
  finally { await session.close(); }
}

export async function restorePublicBackup(driver: Driver, database: string, input: unknown, expectedRevision: string) {
  const backup = validatePublicBackup(input);
  await planPublicRestore(driver, database, backup, expectedRevision);
  await applyConstraints(driver, database);
  const session = driver.session({ database });
  try {
    await session.run("CREATE CONSTRAINT dataset_state_id IF NOT EXISTS FOR (n:DatasetState) REQUIRE n.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT dataset_release_id IF NOT EXISTS FOR (n:DatasetRelease) REQUIRE n.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT dataset_identity_id IF NOT EXISTS FOR (n:DatasetIdentity) REQUIRE n.id IS UNIQUE");
    return await session.executeWrite(async tx => {
      await tx.run("MERGE (s:DatasetState {id:'public-kg'}) SET s.lockVersion=coalesce(s.lockVersion,0)");
      const plan = await checkRestore(tx, backup, expectedRevision);
      const identities = mergeIdentities(await readRetainedIdentities(tx), backup.payload.identities ?? [], graphIdentities(await readPublicGraph(tx)));
      await tx.run("UNWIND $rows AS row MERGE (n:DatasetIdentity {id:row.id}) SET n.digest=row.digest", { rows: identities });
      // 会員DBへ接続しない。公開KGの既知labelだけを、一transactionで復元する。
      await tx.run("MATCH (n) WHERE n:Entity OR n:Claim OR n:Source OR n:Citation OR n:ExternalIdentifier DETACH DELETE n");
      const graph = publicGraph(backup.payload.fixture, backup.payload.withdrawals);
      for (const label of ["Entity", "Claim", "Source", "Citation", "ExternalIdentifier"] as const) {
        const rows = Object.entries(graph.nodes).filter(([, node]) => node.label === label).map(([key, node]) => ({ ...node.properties, ...(label === "ExternalIdentifier" ? { id: backup.payload.externalNodeIds[key] } : {}) }));
        if (rows.length) await tx.run(`UNWIND $rows AS row CREATE (n:${label}) SET n=row`, { rows });
      }
      const sides = { SUBJECT: ["Claim", "Entity"], OBJECT: ["Claim", "Entity"], HAS_CITATION: ["Claim", "Citation"], CITES: ["Citation", "Source"], HAS_EXTERNAL_ID: ["Entity", "ExternalIdentifier"] } as const;
      for (const [type, [from, to]] of Object.entries(sides)) {
        const rows = graph.edges.filter(edge => edge.type === type).map(edge => ({ from: graph.nodes[edge.from].properties.id, to: to === "ExternalIdentifier" ? backup.payload.externalNodeIds[edge.to] : graph.nodes[edge.to].properties.id }));
        if (rows.length) await tx.run(`UNWIND $rows AS row MATCH (s:${from} {id:row.from}), (t:${to} {id:row.to}) CREATE (s)-[:${type}]->(t)`, { rows });
      }
      for (const receipt of backup.payload.receipts) await tx.run("MERGE (r:DatasetRelease {id:$row.id}) ON CREATE SET r=$row", { row: receipt });
      if (publicGraphDigest(await readPublicGraph(tx)) !== backup.payload.graphDigest) throw new Error("Restored graph differs; rolling back");
      const revision = randomUUID();
      await tx.run("MATCH (s:DatasetState {id:'public-kg'}) SET s.release=$release, s.graphDigest=$digest, s.revision=$revision, s.restoredAt=$at, s.backupChecksum=$checksum", {
        release: backup.payload.release, digest: backup.payload.graphDigest, revision, at: new Date().toISOString(), checksum: backup.checksum,
      });
      return { ...plan, revision };
    }, { timeout: 60000 });
  } finally { await session.close(); }
}
