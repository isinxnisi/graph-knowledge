import { z } from "zod";
import { PREDICATE_KEYS } from "./predicates";
import { roleIdSchema } from "./contribution";
import { organizationPositionSchema } from "./organization-participation";
import { eventRoleSchema } from "./event-participation";
import { matchesClaim } from "./exploration";
import type { ClaimSummary } from "./api";

const values = <T extends z.ZodType<string>>(schema: T) => z.array(schema).max(32).nullable()
  .transform(v => v === null ? null : [...new Set(v)].sort());
export const adjacentRelationSchema = z.strictObject({
  version: z.literal(1), type: z.literal("adjacent"), predicates: values(z.enum(PREDICATE_KEYS)),
  traversal: z.literal("either"), polarity: z.enum(["all-records", "affirmed"]),
  contributionRoles: values(roleIdSchema), organizationPositions: values(organizationPositionSchema), eventRoles: values(eventRoleSchema),
}).superRefine((v, ctx) => {
  for (const [key, predicate] of [["contributionRoles", "CONTRIBUTED_TO"], ["organizationPositions", "AFFILIATED_WITH"], ["eventRoles", "PARTICIPATED_IN"]] as const) {
    if (v[key] !== null && v.predicates !== null && !v.predicates.includes(predicate)) ctx.addIssue({ code: "custom", path: [key], message: "限定の適用先が選択されていません。" });
  }
});
export const otherWorksRelationSchema = z.strictObject({
  version: z.literal(1), type: z.literal("pattern"), pattern: z.strictObject({ id: z.literal("other-works"), revision: z.union([z.literal(1), z.literal(2)]) }),
  polarity: z.literal("affirmed"), contributionRoles: values(roleIdSchema),
});
export const relationConditionSchema = z.discriminatedUnion("type", [adjacentRelationSchema, otherWorksRelationSchema]);
export type RelationCondition = z.infer<typeof relationConditionSchema>;
export type OtherWorksRelation = z.infer<typeof otherWorksRelationSchema>;

// Explicit construction fixes key order; full sets remain distinct from null.
export function normalizeRelationCondition(input: unknown): RelationCondition {
  const v = relationConditionSchema.parse(input);
  return v.type === "pattern"
    ? { version: 1, type: "pattern", pattern: { id: v.pattern.id, revision: v.pattern.revision }, polarity: v.polarity, contributionRoles: v.contributionRoles }
    : { version: 1, type: "adjacent", predicates: v.predicates, traversal: v.traversal, polarity: v.polarity,
      contributionRoles: v.contributionRoles, organizationPositions: v.organizationPositions, eventRoles: v.eventRoles };
}
export const relationConditionKey = (input: RelationCondition) => JSON.stringify(normalizeRelationCondition(input));
export function relationAcceptsClaim(condition: RelationCondition, claim: ClaimSummary) {
  return (condition.polarity === "all-records" || claim.polarity === "affirmed")
    && matchesClaim(claim, condition.type === "pattern" ? ["CONTRIBUTED_TO"] : condition.predicates, condition.contributionRoles,
      condition.type === "adjacent" ? condition.organizationPositions : null, condition.type === "adjacent" ? condition.eventRoles : null);
}
