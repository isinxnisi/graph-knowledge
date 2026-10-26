import { z } from "zod";
import { entityDetailSchema } from "./api";
import { ENTITY_KINDS } from "./predicates";
import { normalizeSearch } from "./search";
import { relationConditionSchema, normalizeRelationCondition, relationConditionKey } from "./relation-conditions";
import { matchWitnessSchema, witnessSubjectId } from "./relation-patterns";

export const TARGET_PAGE_SIZE = 20;
export const targetCriteriaSchema = z.strictObject({ q: z.string().transform(normalizeSearch).refine(q => [...q].length <= 100), kind: z.enum(ENTITY_KINDS).nullable(), relation: relationConditionSchema.nullable() })
  .superRefine((c, ctx) => { if (c.relation?.type === "pattern" && c.kind !== null && c.kind !== "work") ctx.addIssue({ code: "custom", path: ["kind"], message: "このパターンには作品が必要です。" }); })
  .transform(c => ({ q: c.q, kind: c.relation?.type === "pattern" ? "work" as const : c.kind, relation: c.relation === null ? null : normalizeRelationCondition(c.relation) }));
export const publicRevisionSchema = z.string().regex(/^[a-zA-Z0-9:._-]{1,160}$/);
export const targetCriteriaV2Schema=z.strictObject({q:z.string().transform(normalizeSearch).refine(q=>[...q].length<=100),kind:z.enum(ENTITY_KINDS).nullable(),relation:relationConditionSchema.nullable(),nameTarget:z.enum(["subject","contributor"])}).superRefine((c,ctx)=>{
 if(c.relation?.type==="pattern"&&(!["work","person"].includes(c.kind??"work")||c.relation.pattern.revision!==2&&c.kind==="person"))ctx.addIssue({code:"custom",path:["kind"],message:"この関係の対象位置は作品・制作担当者です。"});
 if(c.nameTarget==="contributor"&&!(c.relation?.type==="pattern"&&c.relation.pattern.revision!==1&&(c.kind===null||c.kind==="work")))ctx.addIssue({code:"custom",path:["nameTarget"],message:"制作担当者名は作品を探す場合に指定できます。"});
}).transform(c=>({...c,kind:c.relation?.type==="pattern"?(c.kind??"work"):c.kind,relation:c.relation===null?null:normalizeRelationCondition(c.relation)}));
export const anyTargetCriteriaSchema=z.union([targetCriteriaSchema,targetCriteriaV2Schema]);
const targetSearchV1RequestSchema = z.strictObject({ version: z.literal(1), dataset: z.literal("public-kg"), criteria: targetCriteriaSchema,
  revision: publicRevisionSchema.nullable(), after: z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/).nullable() });
export const targetSearchRequestSchema=z.union([targetSearchV1RequestSchema.refine(r=>r.criteria.relation?.type!=="pattern"||r.criteria.relation.pattern.revision===1),targetSearchV1RequestSchema.extend({version:z.literal(2),criteria:targetCriteriaV2Schema})]);
export type TargetSearchRequest = z.infer<typeof targetSearchRequestSchema>;
export type TargetCriteria = z.infer<typeof anyTargetCriteriaSchema>;
export const targetCriteriaKey = (c: TargetCriteria) => JSON.stringify(anyTargetCriteriaSchema.parse(c));
export const targetSearchResponseSchema = z.strictObject({ version: z.union([z.literal(1),z.literal(2)]), dataset: z.literal("public-kg"), revision: publicRevisionSchema,
  criteria: anyTargetCriteriaSchema, items: z.array(z.strictObject({ entity: entityDetailSchema, match: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("matched"), witness: matchWitnessSchema }), z.strictObject({ status: z.literal("unconstrained") }),
  ]) })).max(TARGET_PAGE_SIZE), page: z.strictObject({ limit: z.literal(20), hasMore: z.boolean(), nextCursor: z.string().min(1).max(4096).nullable(), total: z.strictObject({ status: z.literal("not-counted") }) }),
}).superRefine((r, ctx) => {
  if((r.version===2)!==("nameTarget" in r.criteria))ctx.addIssue({code:"custom",message:"Invalid criteria version"});
  const ids = r.items.map(i => i.entity.id);
  if (new Set(ids).size !== ids.length || r.page.hasMore !== (r.page.nextCursor !== null) || r.page.hasMore && r.items.length !== 20) ctx.addIssue({ code: "custom", message: "Invalid target page" });
  for (const item of r.items) {
    if(r.version===1&&item.match.status==="matched"&&item.match.witness.version!==1)ctx.addIssue({code:"custom",message:"Invalid witness version"});
    if (r.criteria.kind && item.entity.kind !== r.criteria.kind) ctx.addIssue({ code: "custom", message: "Invalid target kind" });
    if (r.criteria.relation === null) { if (item.match.status !== "unconstrained") ctx.addIssue({ code: "custom", message: "Unexpected witness" }); }
    else if (item.match.status !== "matched" || item.match.witness.revision !== r.revision || item.match.witness.conditionKey !== relationConditionKey(r.criteria.relation)
      || witnessSubjectId(item.match.witness) !== item.entity.id || item.match.witness.route.claimIds.length !== (r.criteria.relation.type === "pattern" ? 2 : 1)) ctx.addIssue({ code: "custom", message: "Invalid target witness" });
    if(r.version===2&&item.match.status==="matched"&&(item.match.witness.version!==2||JSON.stringify(item.match.witness.matchContext)!==JSON.stringify({q:r.criteria.q,kind:r.criteria.kind,nameTarget:"nameTarget" in r.criteria?r.criteria.nameTarget:"subject"})))ctx.addIssue({code:"custom",message:"Invalid match context"});
  }
});
export type TargetSearchResponse = z.infer<typeof targetSearchResponseSchema>;
