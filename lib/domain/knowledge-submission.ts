import { z } from "zod";
import {knowledgeReviewStatusSchema,type KnowledgeReviewStatus} from "./knowledge-review-job";
import { knowledgeEntityContentSchema, knowledgeEvidenceSchema, knowledgeIdSchema, knowledgePinSchema, knowledgeRecordContentSchema, knowledgeSourceContentSchema } from "./knowledge-foundation";

// Drafts may be incomplete in evidence. This does not weaken the public Record
// schema (which still requires at least one source).
const draftRecord = knowledgeRecordContentSchema.safeExtend({ evidence: z.array(knowledgeEvidenceSchema).max(20) });
export const knowledgeSubmissionContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  entities: z.array(z.strictObject({ id: knowledgeIdSchema, content: knowledgeEntityContentSchema })).max(40).default([]),
  entityPins: z.array(knowledgePinSchema).max(40).default([]),
  sourcePins: z.array(knowledgePinSchema).max(80).default([]),
  sources: z.array(z.strictObject({ id: knowledgeIdSchema, content: knowledgeSourceContentSchema })).max(40).default([]),
  items: z.array(z.strictObject({ key: knowledgeIdSchema, record: draftRecord,
    correction: knowledgePinSchema.optional(),
  })).min(1).max(20),
}).superRefine((value, ctx) => {
  for (const [label, ids] of [
    ["対象", [...value.entities.map(e => e.id), ...value.entityPins.map(p => p.id)]],
    ["資料", value.sources.map(s => s.id)], ["項目", value.items.map(i => i.key)],
  ] as const) if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: label + "のIDが重複しています" });
  const editions=[...value.sourcePins,...value.sources.map(s=>({id:s.id,revision:1}))].map(p=>JSON.stringify([p.id,p.revision]));
  if(new Set(editions).size!==editions.length)ctx.addIssue({code:"custom",message:"資料版の参照が重複しています"});
});
export type KnowledgeSubmissionContent = z.infer<typeof knowledgeSubmissionContentSchema>;
export const knowledgeSubmissionCaptureSchema = z.strictObject({ action: z.literal("capture"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.literal(0), capsuleId: z.uuidv4(), capsuleRevision: z.number().int().positive(), keys: z.array(knowledgeIdSchema).min(1).max(20).refine(keys => new Set(keys).size === keys.length) });
export const knowledgeSubmissionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().nonnegative(), content: knowledgeSubmissionContentSchema }),
  z.strictObject({ action: z.literal("submit"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().positive() }),
  z.strictObject({ action: z.literal("cancel"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().positive() }),
]);
export type KnowledgeSubmissionCommand = z.infer<typeof knowledgeSubmissionCommandSchema>;
export const knowledgeSubmissionSchema = z.object({
 review:knowledgeReviewStatusSchema.optional(), id: z.uuidv4(), revision: z.number().int().positive(), version: z.number().int().positive(), state: z.enum(["draft","queued","cancelled"]), content: knowledgeSubmissionContentSchema, digest: z.string(), createdAt: z.string(), updatedAt: z.string(), context: z.object({entities:z.array(z.object({id:z.string(),content:knowledgeEntityContentSchema})),sources:z.array(z.object({id:z.string(),revision:z.number(),content:knowledgeSourceContentSchema}))}).optional(), origin: z.object({ capsuleId: z.uuidv4(), capsuleRevision: z.number().int().positive(), title: z.string(), keys: z.array(z.string()) }).nullable().optional(),
});
export type KnowledgeSubmission = {
  review?:KnowledgeReviewStatus; id: string; revision: number; version: number; state: "draft" | "queued" | "cancelled";
  context?: {entities:{id:string;content:z.infer<typeof knowledgeEntityContentSchema>}[];sources:{id:string;revision:number;content:z.infer<typeof knowledgeSourceContentSchema>}[]};
  origin?: { capsuleId: string; capsuleRevision: number; title: string; keys: string[] } | null;
  content: KnowledgeSubmissionContent; digest: string; createdAt: string; updatedAt: string;
};
