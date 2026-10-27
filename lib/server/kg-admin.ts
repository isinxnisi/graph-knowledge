import "server-only";
import { int } from "neo4j-driver";
import { z } from "zod";
import { readRelationTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { ApiError } from "./http";
import { analyzeAdminGraph, ADMIN_CLAIM_LIMIT, ADMIN_ENTITY_LIMIT } from "./kg-admin-analysis";
import type { AdminSnapshot } from "../domain/kg-admin";

const entitySchema = z.object({ id: z.uuidv4(), name: z.string().max(2000), kind: z.string().max(80), aliases: z.array(z.string().max(2000)).max(100) });
const claimSchema = z.object({ id: z.uuidv4(), subjectId: z.uuidv4(), objectId: z.uuidv4(), visibility: z.string(), polarity: z.enum(["affirmed", "denied"]), supported: z.boolean() });
export const ADMIN_ENTITIES_QUERY = "MATCH (e:Entity) RETURN e.id AS id, e.name AS name, e.kind AS kind, coalesce(e.aliases, []) AS aliases ORDER BY e.id LIMIT $limit";
export const ADMIN_CLAIMS_QUERY = `MATCH (c:Claim)
OPTIONAL MATCH (c)-[:SUBJECT]->(s:Entity)
OPTIONAL MATCH (c)-[:OBJECT]->(o:Entity)
RETURN c.id AS id, s.id AS subjectId, o.id AS objectId, c.visibility AS visibility, c.polarity AS polarity,
EXISTS { MATCH (c)-[:HAS_CITATION]->(r:Citation {stance:'support'})-[:CITES]->(source:Source) WHERE source.isDemo = false } AS supported
ORDER BY c.id LIMIT $limit`;
let cache: { snapshot: AdminSnapshot; expires: number } | undefined;
let pending: Promise<AdminSnapshot> | undefined;
export async function adminSnapshot(): Promise<AdminSnapshot> {
  if (process.env.GRAPH_DATASET !== "public-kg" || process.env.GRAPH_FILM_BETA === "1") throw new ApiError(503, "SERVICE_UNAVAILABLE", "Management requires the public KG scope");
  // Single flight and bounded transaction: no overlapping full graph scans.
  if (pending) return pending;
  pending = readRelationTransaction(async tx => {
    const revision = await readPublicRevision(tx);
    if (cache && cache.snapshot.revision === revision && cache.expires > Date.now()) return cache.snapshot;
    cache = undefined;
    const counts = (await tx.run("CALL { MATCH (e:Entity) RETURN count(e) AS entities, sum(size(coalesce(e.name,'')) + reduce(n=0, a IN coalesce(e.aliases,[]) | n + size(a))) AS textSize } CALL { MATCH (c:Claim) RETURN count(c) AS claims } RETURN entities, claims, textSize")).records[0];
    const entityCount = counts.get("entities").toNumber(), claimCount = counts.get("claims").toNumber();
    if (entityCount > ADMIN_ENTITY_LIMIT || claimCount > ADMIN_CLAIM_LIMIT || counts.get("textSize").toNumber() > 8_000_000) throw new ApiError(503, "SERVICE_UNAVAILABLE", "KG exceeds analysis capacity; no partial results returned");
    const entities = (await tx.run(ADMIN_ENTITIES_QUERY, { limit: int(ADMIN_ENTITY_LIMIT + 1) })).records.map(r => entitySchema.parse(r.toObject()));
    const claims = (await tx.run(ADMIN_CLAIMS_QUERY, { limit: int(ADMIN_CLAIM_LIMIT + 1) })).records.map(r => claimSchema.parse(r.toObject()));
    if (entities.length !== entityCount || claims.length !== claimCount) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Incomplete or inconsistent KG");
    await readPublicRevision(tx, revision);
    const snapshot = analyzeAdminGraph(entities, claims, revision);
    cache = { snapshot, expires: Date.now() + 60_000 };
    return snapshot;
  }, AbortSignal.timeout(15_000));
  try { return await pending; }
  catch (error) { cache = undefined; throw error; }
  finally { pending = undefined; }
}
