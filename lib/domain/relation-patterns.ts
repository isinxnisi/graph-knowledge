import { z } from "zod";
import { resolvePathPreset } from "./discovery-path-presets";
import { PREDICATES } from "./predicates";
import { relationAcceptsClaim, type RelationCondition } from "./relation-conditions";
import type { ClaimSummary, EntitySummary } from "./api";
import { normalizeSearch } from "./search";

// Reuse the registered geometry, not the legacy all-records execution policy.
export const OTHER_WORKS_PATTERN = resolvePathPreset({ id: "other-works", revision: 1 });
const uuid = z.uuidv4().transform(v => v.toLowerCase());
export const routeRefSchema = z.strictObject({ nodeIds: z.array(uuid).min(2).max(3), claimIds: z.array(uuid).min(1).max(2) })
  .refine(r => r.nodeIds.length === r.claimIds.length + 1 && new Set(r.nodeIds).size === r.nodeIds.length && new Set(r.claimIds).size === r.claimIds.length);
export type RouteRef = z.infer<typeof routeRefSchema>;
export const matchContextSchema = z.strictObject({ q:z.string().max(100).transform(normalizeSearch), kind:z.enum(["person","work","organization","event"]).nullable(), nameTarget:z.enum(["subject","contributor"]) });
const witnessFields={dataset:z.literal("public-kg"),revision:z.string().min(1).max(160),conditionKey:z.string().max(2048),route:routeRefSchema};
export const matchWitnessSchema = z.discriminatedUnion("version",[
 z.strictObject({version:z.literal(1),...witnessFields}),
 z.strictObject({version:z.literal(2),...witnessFields,subjectId:uuid,subjectPosition:z.enum(["work","contributor","endpoint"]),matchContext:matchContextSchema}),
]);
export type MatchWitness = z.infer<typeof matchWitnessSchema>;
export const witnessSubjectId=(w:MatchWitness)=>w.version===1?w.route.nodeIds[0]:w.subjectId;
export const patternAcceptsRoot=(condition:RelationCondition,kind:string)=>condition.type==="pattern"&&(kind==="work"||condition.pattern.revision===2&&kind==="person");
export const routeOwnedBy=(condition:RelationCondition,route:RouteRef,id:string)=>route.nodeIds[0]===id||condition.type==="pattern"&&condition.pattern.revision===2&&route.nodeIds[1]===id;

export class RelationWitnessError extends Error {}
export function validateRelationRoute(condition: RelationCondition, rootId: string, input: unknown, nodes: ReadonlyMap<string, EntitySummary>, claims: ReadonlyMap<string, ClaimSummary>): RouteRef {
  const route = routeRefSchema.parse(input);
  const kinds = condition.type === "pattern" ? OTHER_WORKS_PATTERN.kinds : null;
  if (!(condition.type==="pattern"&&condition.pattern.revision===2?route.nodeIds[0]===rootId||route.nodeIds[1]===rootId:route.nodeIds[0]===rootId) || route.claimIds.length !== (kinds ? 2 : 1)) throw new RelationWitnessError("Invalid witness geometry");
  route.nodeIds.forEach((id, i) => { if (!nodes.has(id) || kinds && nodes.get(id)!.kind !== kinds[i]) throw new RelationWitnessError("Invalid witness entity"); });
  route.claimIds.forEach((id, step) => {
    const c = claims.get(id), from = route.nodeIds[step], to = route.nodeIds[step + 1];
    if (!c || !relationAcceptsClaim(condition, c, step as 0 | 1) || !([c.subjectId, c.objectId].includes(from) && [c.subjectId, c.objectId].includes(to))) throw new RelationWitnessError("Invalid witness claim");
    const definition = PREDICATES[c.predicate];
    if (nodes.get(c.subjectId)?.kind !== definition.subjectKind || nodes.get(c.objectId)?.kind !== definition.objectKind) throw new RelationWitnessError("Invalid canonical endpoint");
    if (kinds && (c.subjectId !== route.nodeIds[1] || c.objectId !== route.nodeIds[step === 0 ? 0 : 2])) throw new RelationWitnessError("Invalid canonical direction");
  });
  return route;
}
