import { z } from "zod";
import { int, type ManagedTransaction } from "neo4j-driver";
import { ApiError } from "./http";

// Operator-only bounds. Frozen datasets and existing cursors retain ID order.
export function neighborRankingConfig(env: Record<string, string | undefined> = process.env) {
  const bound = (key: string, fallback: number, max: number) => {
    const value = env[key] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw Error(`Invalid ${key}`);
    return Number(value);
  };
  const mode = env.GRAPH_NEIGHBOR_ORDER ?? "bounded";
  if (!["bounded", "id"].includes(mode)) throw Error("Invalid GRAPH_NEIGHBOR_ORDER");
  return { enabled: env.GRAPH_DATASET === "public-kg" && mode === "bounded",
    candidates: bound("GRAPH_NEIGHBOR_CANDIDATES", 200, 2000), connections: bound("GRAPH_NEIGHBOR_CONNECTIONS", 50, 100) };
}
const positionSchema = z.strictObject({ round: z.number().int().min(0), rank: z.number().int().min(0), neighbor: z.uuidv4() });
const cursorSchema = z.strictObject({ v: z.literal(7), operation: z.literal("bounded-neighbors"), center: z.uuidv4(),
  condition: z.string().max(2048), revision: z.string().min(1).max(160), candidates: z.number().int(), connections: z.number().int(), position: positionSchema });
export type RankedPosition = z.infer<typeof positionSchema>;
export type RankingScope = { center: string; condition: string; revision: string; candidates: number; connections: number };
export function isRankedCursor(cursor: string | null) {
  if (!cursor || cursor.length > 4096) return false;
  try { return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")).v === 7; } catch { return false; }
}
export function encodeRankedCursor(scope: RankingScope, position: RankedPosition) {
  return Buffer.from(JSON.stringify({ v: 7, operation: "bounded-neighbors", ...scope, position })).toString("base64url");
}
export function decodeRankedCursor(cursor: string, scope: RankingScope): RankedPosition {
  try {
    if (cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
    const value = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (value.center !== scope.center || value.condition !== scope.condition) throw Error();
    if (value.revision !== scope.revision || value.candidates !== scope.candidates || value.connections !== scope.connections)
      throw new ApiError(409, "DATASET_CHANGED", "探索のデータまたは表示順が変わりました。取得し直してください。");
    return value.position;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_ARGUMENT", "cursorが不正、または起点・関係の条件が一致しません。");
  }
}

// The SAME condition applies to both hops. Traversal is currently 'either'.
// Do not count Citations, parallel Claims, the origin, or a self edge as further Entities.
const filter = (c: string) => `${c}.visibility = 'published'
  AND ($predicates IS NULL OR ${c}.predicate IN $predicates)
  AND ($polarity = 'all-records' OR ${c}.polarity = 'affirmed')
  AND ($contributionRoles IS NULL OR ${c}.predicate <> 'CONTRIBUTED_TO' OR ${c}.contributionRoleId IN $contributionRoles)
  AND ($organizationPositions IS NULL OR ${c}.predicate <> 'AFFILIATED_WITH' OR ${c}.organizationPositionId IN $organizationPositions)
  AND ($eventRoles IS NULL OR ${c}.predicate <> 'PARTICIPATED_IN' OR ${c}.eventRoleId IN $eventRoles)`;

export const NEIGHBOR_SCORES = `
MATCH (center:Entity {id: $id})<-[:SUBJECT|OBJECT]-(c:Claim)-[:SUBJECT|OBJECT]->(neighbor:Entity)
WHERE neighbor <> center AND ${filter("c")}
WITH DISTINCT neighbor ORDER BY neighbor.id LIMIT $candidateTake
WITH collect(neighbor) AS candidates
UNWIND range(0, size(candidates) - 1) AS ordinal
WITH candidates[ordinal] AS neighbor, ordinal
CALL (neighbor, ordinal) {
  WITH neighbor, ordinal WHERE ordinal < $candidateLimit
  MATCH (neighbor)<-[:SUBJECT|OBJECT]-(next:Claim)-[:SUBJECT|OBJECT]->(further:Entity)
  WHERE further.id <> $id AND further <> neighbor AND ${filter("next")}
  WITH DISTINCT further LIMIT $connectionTake
  RETURN count(*) AS connections
}
RETURN neighbor.id AS id, connections, ordinal < $candidateLimit AS evaluated`;

// Each neighbor contributes its first Claim before any contributes its second.
// Only page Claims join Citation; all origin Claims remain reachable, even outside
// the scored candidate window. No count of global degree is used as a proxy.
export const RANKED_NEIGHBORS = `
MATCH (center:Entity {id: $id})<-[:SUBJECT|OBJECT]-(c:Claim)
WHERE ${filter("c")}
WITH DISTINCT center, c
MATCH (c)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
WITH c, CASE WHEN subject = center THEN object ELSE subject END AS neighbor
ORDER BY c.id
WITH neighbor, collect(c) AS evidence
WITH neighbor, evidence, coalesce($ranks[neighbor.id], $candidateLimit) AS rank
UNWIND range(0, size(evidence) - 1) AS round
WITH neighbor, rank, round, evidence[round] AS c
WHERE $afterRound IS NULL OR round > $afterRound
  OR (round = $afterRound AND rank > $afterRank)
  OR (round = $afterRound AND rank = $afterRank AND neighbor.id > $afterNeighbor)
WITH c, neighbor, rank, round ORDER BY round, rank, neighbor.id LIMIT $take
MATCH (c)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(source:Source)
RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object,
  count(DISTINCT source) AS sourceCount, round, rank, neighbor.id AS neighbor
ORDER BY round, rank, neighbor`;

export async function rankedNeighbors(tx: ManagedTransaction, params: Record<string, unknown>, config: ReturnType<typeof neighborRankingConfig>, after: RankedPosition | null) {
  const bounds = { candidateTake: int(config.candidates + 1), candidateLimit: int(config.candidates), connectionTake: int(config.connections + 1) };
  const scores = await tx.run(NEIGHBOR_SCORES, { ...params, ...bounds });
  const evaluated = scores.records.filter(r => r.get("evaluated")).map(r => ({ id: r.get("id") as string, count: r.get("connections").toNumber() as number }));
  evaluated.sort((a, b) => Math.min(b.count, config.connections) - Math.min(a.count, config.connections) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ranks = Object.fromEntries(evaluated.map((entry, index) => [entry.id, int(index)]));
  const result = await tx.run(RANKED_NEIGHBORS, { ...params, ...bounds, ranks,
    afterRound: after ? int(after.round) : null, afterRank: after ? int(after.rank) : null, afterNeighbor: after?.neighbor ?? null });
  return { result, ranking: { mode: "bounded" as const, candidateLimit: config.candidates, connectionLimit: config.connections,
    evaluatedCandidates: evaluated.length, unevaluatedCandidates: scores.records.length > config.candidates,
    cappedCandidates: evaluated.filter(e => e.count > config.connections).length } };
}
