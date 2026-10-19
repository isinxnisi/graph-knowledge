import { z } from "zod";
import { entityDetailSchema, entitySummarySchema, claimSummarySchema } from "./api";
import { publicRevisionSchema } from "./discovery-targets";
import { otherWorksRelationSchema } from "./relation-conditions";
import { routeRefSchema, matchWitnessSchema, validateRelationRoute, witnessSubjectId, patternAcceptsRoot, type RouteRef } from "./relation-patterns";

export const routeKey = (route: RouteRef) => route.nodeIds.join(":");
const cursor = z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/).nullable();
export const patternGraphRequestSchema = z.strictObject({
  version: z.union([z.literal(1),z.literal(2)]), dataset: z.literal("public-kg"), rootId: z.uuidv4().transform(v => v.toLowerCase()),
  relation: otherWorksRelationSchema, revision: publicRevisionSchema.nullable(),
  operation: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("page"), after: cursor, requiredWitness: matchWitnessSchema.nullable() }),
    z.strictObject({ type: z.literal("restore"), routes: z.array(routeRefSchema).max(100), observedRevision: publicRevisionSchema.nullable(), candidateBoundary: routeRefSchema.nullable() }),
  ]),
}).superRefine((r, ctx) => {
  const op = r.operation;
  const refs = op.type === "page" ? (op.requiredWitness ? [op.requiredWitness.route] : []) : [...op.routes, ...(op.candidateBoundary ? [op.candidateBoundary] : [])];
  if (r.version===1&&r.relation.pattern.revision!==1||refs.some(p => !(p.nodeIds[0]===r.rootId||r.version===2&&r.relation.pattern.revision===2&&p.nodeIds[1]===r.rootId) || p.claimIds.length !== 2)
    || op.type === "restore" && new Set(op.routes.map(routeKey)).size !== op.routes.length
    || op.type === "page" && (op.after !== null && r.revision === null || op.requiredWitness && (witnessSubjectId(op.requiredWitness)!==r.rootId||r.revision === null || r.revision !== op.requiredWitness.revision))) ctx.addIssue({ code: "custom", message: "Invalid route request" });
});
export type PatternGraphRequest = z.infer<typeof patternGraphRequestSchema>;
const base = z.strictObject({ version: z.union([z.literal(1),z.literal(2)]), dataset: z.literal("public-kg"), revision: publicRevisionSchema,
  relation: otherWorksRelationSchema, root: entityDetailSchema, nodes: z.array(entitySummarySchema).max(203), claims: z.array(claimSummarySchema).max(202) });
export const patternGraphResponseSchema = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("page"), match: z.enum(["matched", "not-matched"]), requiredRoute: routeRefSchema.nullable(), routes: z.array(routeRefSchema).max(12),
    page: z.strictObject({ hasMore: z.boolean(), nextCursor: cursor, claimCoverage: z.literal("witness-only") }) }),
  base.extend({ operation: z.literal("restore"), verifiedRoutes: z.array(routeRefSchema).max(100), continuation: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("restart") }), z.strictObject({ state: z.literal("resumable"), hasMore: z.boolean(), nextCursor: cursor }),
  ]) }),
]).superRefine((r, ctx) => {
  try {
    if (!patternAcceptsRoot(r.relation,r.root.kind)||r.version===1&&r.relation.pattern.revision!==1) throw Error();
    const nodes = new Map(r.nodes.map(n => [n.id, n])), claims = new Map(r.claims.map(c => [c.id, c]));
    if (nodes.size !== r.nodes.length || claims.size !== r.claims.length || !nodes.has(r.root.id)) throw Error();
    const routes = r.operation === "page" ? [...r.routes, ...(r.requiredRoute ? [r.requiredRoute] : [])] : r.verifiedRoutes;
    const candidateRoutes = r.operation === "page" ? r.routes : r.verifiedRoutes;
    if (new Set(candidateRoutes.map(routeKey)).size !== candidateRoutes.length) throw Error();
    for (const route of routes) validateRelationRoute(r.relation, r.root.id, route, nodes, claims);
    const nodeIds = new Set([r.root.id, ...routes.flatMap(p => p.nodeIds)]), claimIds = new Set(routes.flatMap(p => p.claimIds));
    if (nodeIds.size !== nodes.size || claimIds.size !== claims.size || [...nodes.keys()].some(id => !nodeIds.has(id)) || [...claims.keys()].some(id => !claimIds.has(id))) throw Error();
    const page = r.operation === "page" ? r.page : r.continuation.state === "resumable" ? r.continuation : null;
    if (page && page.hasMore !== (page.nextCursor !== null)) throw Error();
    if (r.operation === "page" && ((r.match === "matched") !== (r.requiredRoute !== null) || r.match === "not-matched" && (r.routes.length || r.page.hasMore) || r.page.hasMore && r.routes.length !== 12)) throw Error();
  } catch { ctx.addIssue({ code: "custom", message: "Invalid complete pattern graph" }); }
});
export type PatternGraphResponse = z.infer<typeof patternGraphResponseSchema>;
