import "server-only";
import { z } from "zod";
import { int } from "neo4j-driver";
import { targetSearchRequestSchema, targetSearchResponseSchema, targetCriteriaKey, type TargetSearchRequest, type TargetSearchResponse } from "../domain/discovery-targets";
import { relationConditionKey } from "../domain/relation-conditions";
import { entityDetail } from "./mappers";
import { readRelationTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { relationExists, relationQueryParameters, findFirstRelationRoutes, materializeRelationRoutes } from "./relation-pattern-execution";
import { ApiError } from "./http";
import { RelationRequestError as TargetSearchError, handleRelationPost } from "./relation-http";
export { RelationRequestError as TargetSearchError } from "./relation-http";
const invalid = (reason: "INVALID_REQUEST" | "INVALID_CONDITION" | "UNSUPPORTED_CONDITION" | "INVALID_CURSOR" = "INVALID_REQUEST") => new TargetSearchError(400, "INVALID_ARGUMENT", reason, "対象検索の条件が不正または未対応です。");

export function parseTargetSearch(input: unknown): TargetSearchRequest {
  const parsed = targetSearchRequestSchema.safeParse(input);
  if (!parsed.success) {
    const relation = (input as { criteria?: { relation?: { type?: string; version?: number; pattern?: { id?: string; revision?: number }; traversal?: string; polarity?: string } } })?.criteria?.relation;
    if (relation && (relation.version !== 1 || !["adjacent", "pattern"].includes(relation.type ?? "") || relation.type === "pattern" && (relation.pattern?.id !== "other-works" || ![1, 2, 3].includes(relation.pattern.revision!) || relation.polarity !== "affirmed") || relation.type === "adjacent" && relation.traversal !== "either")) throw invalid("UNSUPPORTED_CONDITION");
    throw invalid(parsed.error.issues.some(i => i.path.includes("criteria")) ? "INVALID_CONDITION" : "INVALID_REQUEST");
  }
  return parsed.data;
}
const cursorSchema = z.strictObject({ v: z.literal(4), operation: z.literal("target-match"), dataset: z.literal("public-kg"), revision: z.string().min(1).max(160), criteriaKey: z.string().max(2048),
  rank: z.number().int().min(0).max(1), name: z.string().max(2000), id: z.uuidv4() });
export function targetEntitiesQuery(input: TargetSearchRequest) {
  return `MATCH (e:Entity)
 WHERE ${input.criteria.relation?.type==="pattern"?(input.criteria.kind==="person"?"e.kind = 'person'":"e.kind = 'work'"):"($kind IS NULL OR e.kind = $kind)"} AND ($q = '' OR any(name IN e.searchNames WHERE name CONTAINS $q))
 ${input.criteria.relation ? `AND ${relationExists(input.criteria.relation,input.criteria.kind,input.version===2&&input.criteria.nameTarget==="contributor")}` : ""}
 WITH e, CASE WHEN $q <> '' AND $q IN e.searchNames THEN 0 ELSE 1 END AS rank
 WHERE $afterId IS NULL OR rank > $afterRank OR (rank = $afterRank AND (e.name > $afterName OR (e.name = $afterName AND e.id > $afterId)))
 RETURN properties(e) AS entity, rank ORDER BY rank, e.name, e.id LIMIT 21`;
}
export async function searchDiscoveryTargets(raw: unknown, signal: AbortSignal): Promise<TargetSearchResponse> {
  const input = parseTargetSearch(raw);
  if (process.env.GRAPH_DATASET !== "public-kg") throw invalid("UNSUPPORTED_CONDITION");
  const criteriaKey = targetCriteriaKey(input.criteria);
  let after: z.infer<typeof cursorSchema> | null = null;
  if (input.after) {
    try { after = cursorSchema.parse(JSON.parse(Buffer.from(input.after, "base64url").toString("utf8"))); } catch { throw invalid("INVALID_CURSOR"); }
    if (after.criteriaKey !== criteriaKey || input.revision === null) throw invalid("INVALID_CURSOR");
  }
  return readRelationTransaction(async tx => {
    const revision = await readPublicRevision(tx, input.revision);
    if (after && after.revision !== revision) throw new ApiError(409, "DATASET_CHANGED", "公開版が変わりました。先頭から検索してください。");
    const relation = input.criteria.relation;
    const related=input.version===2&&input.criteria.nameTarget==="contributor";
    const rows = await tx.run(targetEntitiesQuery(input), { ...(relation ? relationQueryParameters(relation) : {}), q: related?"":input.criteria.q, relatedQ:related?input.criteria.q:"", kind: input.criteria.kind,
      afterId: after?.id ?? null, afterName: after?.name ?? null, afterRank: after ? int(after.rank) : null });
    const entities = rows.records.slice(0, 20).map(r => entityDetail(r.get("entity")));
    const context={q:input.criteria.q,kind:input.criteria.kind,nameTarget:input.version===2?input.criteria.nameTarget:"subject"};
    const routes = relation ? await findFirstRelationRoutes(tx, relation, entities.map(e => e.id),context) : new Map();
    await readPublicRevision(tx, revision);
    if (relation && entities.some(e => !routes.has(e.id))) throw new Error("Matching target has no witness");
    if (relation) {
      await materializeRelationRoutes(tx, relation, [...routes.values()], revision);
      await readPublicRevision(tx, revision);
    }
    signal.throwIfAborted();
    const last = entities.at(-1), hasMore = rows.records.length > 20;
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ v: 4, operation: "target-match", dataset: "public-kg", revision, criteriaKey,
      rank: rows.records[19].get("rank").toNumber(), name: last.name, id: last.id })).toString("base64url") : null;
    return targetSearchResponseSchema.parse({ version: input.version, dataset: "public-kg", revision, criteria: input.criteria,
      items: entities.map(entity => ({ entity, match: relation ? { status: "matched", witness: { version: input.version, dataset: "public-kg", revision, conditionKey: relationConditionKey(relation), route: routes.get(entity.id),...(input.version===2?{subjectId:entity.id,subjectPosition:relation.type==="pattern"?(entity.kind==="person"?"contributor":"work"):"endpoint",matchContext:context}:{}) } } : { status: "unconstrained" } })),
      page: { limit: 20, hasMore, nextCursor, total: { status: "not-counted" } } });
  }, signal);
}

export const handleTargetSearch = (request: Request) => handleRelationPost(request, searchDiscoveryTargets);
