import "server-only";
import { z } from "zod";
import { int } from "neo4j-driver";
import { patternGraphRequestSchema, patternGraphResponseSchema, type PatternGraphRequest } from "../domain/pattern-graph";
import { relationConditionKey } from "../domain/relation-conditions";
import { RelationWitnessError, routeRefSchema, patternAcceptsRoot, type RouteRef } from "../domain/relation-patterns";
import { entityDetail, entitySummary } from "./mappers";
import { readRelationTransaction } from "./read-db";
import { readPublicRevision } from "./public-revision";
import { OTHER_WORKS_PAGE, CONTRIBUTOR_WORKS_PAGE, relationQueryParameters, materializeRelationRoutes, verifyRelationWitness, findFirstRelationRoutes, type RelationReadTx } from "./relation-pattern-execution";
import { RelationRequestError, handleRelationPost } from "./relation-http";

const invalid = (reason: "INVALID_REQUEST" | "UNSUPPORTED_CONDITION" | "INVALID_CONDITION" | "INVALID_CURSOR" | "INVALID_WITNESS" | "RESTORE_INCOMPLETE") => new RelationRequestError(400, "INVALID_ARGUMENT", reason, "経路の条件または参照を確認してください。");
export function parsePatternGraph(input: unknown): PatternGraphRequest {
  const parsed = patternGraphRequestSchema.safeParse(input);
  if (!parsed.success) {
    const r = (input as { relation?: { type?: string; version?: number; pattern?: { id?: string; revision?: number }; polarity?: string } })?.relation;
    if (r && (r.type !== "pattern" || r.version !== 1 || r.pattern?.id !== "other-works" || r.pattern.revision !== 1 || r.polarity !== "affirmed")) throw invalid("UNSUPPORTED_CONDITION");
    throw invalid("INVALID_REQUEST");
  }
  return parsed.data;
}
const cursorSchema = z.strictObject({ v: z.literal(1), operation: z.literal("pattern-page"), dataset: z.literal("public-kg"), rootId: z.uuidv4(), conditionKey: z.string().max(2048), revision: z.string().min(1).max(160), person: z.uuidv4(), work: z.uuidv4() });
function encode(input: PatternGraphRequest, revision: string, route: RouteRef) {
  return Buffer.from(JSON.stringify({ v: 1, operation: "pattern-page", dataset: "public-kg", rootId: input.rootId, conditionKey: relationConditionKey(input.relation), revision, person: route.nodeIds[1], work: route.nodeIds[2] })).toString("base64url");
}
async function candidates(tx: RelationReadTx, input: PatternGraphRequest, boundary: { person: string; work: string } | null, take: number) {
  const query=input.version===2?`CALL { ${OTHER_WORKS_PAGE} UNION ${CONTRIBUTOR_WORKS_PAGE} } RETURN nodeIds,claimIds ORDER BY nodeIds[1],nodeIds[2] LIMIT $take`:OTHER_WORKS_PAGE;
  const result = await tx.run(query, { ...relationQueryParameters(input.relation), rootId: input.rootId, afterPerson: boundary?.person ?? null, afterWork: boundary?.work ?? null, take: int(take) });
  return result.records.map(row => routeRefSchema.parse({ nodeIds: row.get("nodeIds"), claimIds: row.get("claimIds") }));
}
async function validateReferences<T>(action: () => Promise<T>, reason: "INVALID_WITNESS" | "RESTORE_INCOMPLETE"): Promise<T> {
  try { return await action(); } catch (e) { if (e instanceof RelationWitnessError) throw invalid(reason); throw e; }
}
export async function executePatternGraph(raw: unknown, signal: AbortSignal) {
  const input = parsePatternGraph(raw);
  if (process.env.GRAPH_DATASET !== "public-kg") throw invalid("UNSUPPORTED_CONDITION");
  return readRelationTransaction(async tx => {
    const revision = await readPublicRevision(tx, input.revision);
    const roots = await tx.run("MATCH(e:Entity {id:$id}) RETURN properties(e) AS entity", { id: input.rootId });
    if (!roots.records.length) throw new RelationRequestError(404, "NOT_FOUND", "ROOT_NOT_FOUND", "対象が見つかりません。");
    const properties = roots.records[0].get("entity"), root = entityDetail(properties);
    if (!patternAcceptsRoot(input.relation,root.kind)) throw invalid("INVALID_CONDITION");
    const base = { version: input.version, dataset: "public-kg", revision, relation: input.relation, root };
    const op = input.operation;
    if (op.type === "page") {
      let boundary: z.infer<typeof cursorSchema> | null = null;
      if (op.after) {
        try { boundary = cursorSchema.parse(JSON.parse(Buffer.from(op.after, "base64url").toString("utf8"))); } catch { throw invalid("INVALID_CURSOR"); }
        if (boundary.rootId !== input.rootId || boundary.conditionKey !== relationConditionKey(input.relation)) throw invalid("INVALID_CURSOR");
        if (boundary.revision !== revision) throw new RelationRequestError(409, "DATASET_CHANGED", "REVISION_CHANGED", "公開版が変わりました。");
      }
      let required: RouteRef | null;
      if (op.requiredWitness) {
        const verified = await validateReferences(() => verifyRelationWitness(tx, input.relation, op.requiredWitness), "INVALID_WITNESS");
        required = verified.witness.route;
      } else required = (await findFirstRelationRoutes(tx, input.relation, [input.rootId],{kind:root.kind,q:"",nameTarget:"subject"})).get(input.rootId) ?? null;
      const rows = required ? await candidates(tx, input, boundary, 13) : [];
      const routes = rows.slice(0, 12), hasMore = rows.length > 12;
      const material = await materializeRelationRoutes(tx, input.relation, [...routes, ...(required ? [required] : [])], revision);
      material.nodes.set(root.id, entitySummary(properties));
      await readPublicRevision(tx, revision); signal.throwIfAborted();
      return patternGraphResponseSchema.parse({ ...base, operation: "page", match: required ? "matched" : "not-matched", requiredRoute: required, routes,
        nodes: [...material.nodes.values()], claims: [...material.claims.values()], page: { hasMore, nextCursor: hasMore ? encode(input, revision, routes.at(-1)!) : null, claimCoverage: "witness-only" } });
    }
    const sameRevision = op.observedRevision === revision && op.candidateBoundary !== null;
    // The boundary may be closed or retained separately. Validate it directly,
    // but only return the requested routes (never substitute a different proof).
    const refs = [...op.routes, ...(sameRevision ? [op.candidateBoundary!] : [])];
    const material = await validateReferences(() => materializeRelationRoutes(tx, input.relation, refs, revision), "RESTORE_INCOMPLETE");
    let continuation: { state: "restart" } | { state: "resumable"; hasMore: boolean; nextCursor: string | null } = { state: "restart" };
    if (sameRevision) {
      const boundary = op.candidateBoundary!;
      const hasMore = (await candidates(tx, input, { person: boundary.nodeIds[1], work: boundary.nodeIds[2] }, 1)).length > 0;
      continuation = { state: "resumable", hasMore, nextCursor: hasMore ? encode(input, revision, boundary) : null };
    }
    const nodeIds = new Set([root.id, ...op.routes.flatMap(r => r.nodeIds)]), claimIds = new Set(op.routes.flatMap(r => r.claimIds));
    material.nodes.set(root.id, entitySummary(properties));
    await readPublicRevision(tx, revision); signal.throwIfAborted();
    return patternGraphResponseSchema.parse({ ...base, operation: "restore", verifiedRoutes: op.routes,
      nodes: [...material.nodes.values()].filter(n => nodeIds.has(n.id)), claims: [...material.claims.values()].filter(c => claimIds.has(c.id)), continuation });
  }, signal);
}
export const handlePatternGraph = (request: Request) => handleRelationPost(request, executePatternGraph);
