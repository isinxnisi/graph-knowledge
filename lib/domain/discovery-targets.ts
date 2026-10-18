import { z } from "zod";
import { entityDetailSchema } from "./api";
import { ENTITY_KINDS } from "./predicates";
import { normalizeSearch } from "./search";
import { relationConditionSchema, normalizeRelationCondition, relationConditionKey } from "./relation-conditions";
import { matchWitnessSchema } from "./relation-patterns";

export const TARGET_PAGE_SIZE = 20;
export const targetCriteriaSchema = z.strictObject({ q: z.string().transform(normalizeSearch).refine(q => [...q].length <= 100), kind: z.enum(ENTITY_KINDS).nullable(), relation: relationConditionSchema.nullable() })
  .superRefine((c, ctx) => { if (c.relation?.type === "pattern" && c.kind !== null && c.kind !== "work") ctx.addIssue({ code: "custom", path: ["kind"], message: "このパターンには作品が必要です。" }); })
  .transform(c => ({ q: c.q, kind: c.relation?.type === "pattern" ? "work" as const : c.kind, relation: c.relation === null ? null : normalizeRelationCondition(c.relation) }));
export const publicRevisionSchema = z.string().regex(/^[a-zA-Z0-9:._-]{1,160}$/);
export const targetSearchRequestSchema = z.strictObject({ version: z.literal(1), dataset: z.literal("public-kg"), criteria: targetCriteriaSchema,
  revision: publicRevisionSchema.nullable(), after: z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/).nullable() });
export type TargetSearchRequest = z.infer<typeof targetSearchRequestSchema>;
export type TargetCriteria = z.infer<typeof targetCriteriaSchema>;
export const targetCriteriaKey = (c: TargetCriteria) => JSON.stringify(targetCriteriaSchema.parse(c));
export const targetSearchResponseSchema = z.strictObject({ version: z.literal(1), dataset: z.literal("public-kg"), revision: publicRevisionSchema,
  criteria: targetCriteriaSchema, items: z.array(z.strictObject({ entity: entityDetailSchema, match: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("matched"), witness: matchWitnessSchema }), z.strictObject({ status: z.literal("unconstrained") }),
  ]) })).max(TARGET_PAGE_SIZE), page: z.strictObject({ limit: z.literal(20), hasMore: z.boolean(), nextCursor: z.string().min(1).max(4096).nullable(), total: z.strictObject({ status: z.literal("not-counted") }) }),
}).superRefine((r, ctx) => {
  const ids = r.items.map(i => i.entity.id);
  if (new Set(ids).size !== ids.length || r.page.hasMore !== (r.page.nextCursor !== null) || r.page.hasMore && r.items.length !== 20) ctx.addIssue({ code: "custom", message: "Invalid target page" });
  for (const item of r.items) {
    if (r.criteria.kind && item.entity.kind !== r.criteria.kind) ctx.addIssue({ code: "custom", message: "Invalid target kind" });
    if (r.criteria.relation === null) { if (item.match.status !== "unconstrained") ctx.addIssue({ code: "custom", message: "Unexpected witness" }); }
    else if (item.match.status !== "matched" || item.match.witness.revision !== r.revision || item.match.witness.conditionKey !== relationConditionKey(r.criteria.relation)
      || item.match.witness.route.nodeIds[0] !== item.entity.id || item.match.witness.route.claimIds.length !== (r.criteria.relation.type === "pattern" ? 2 : 1)) ctx.addIssue({ code: "custom", message: "Invalid target witness" });
  }
});
export type TargetSearchResponse = z.infer<typeof targetSearchResponseSchema>;
