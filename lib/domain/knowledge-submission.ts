import { z } from "zod";
import { knowledgeEntityContentSchema, knowledgeEvidenceSchema, knowledgeIdSchema, knowledgePinSchema, knowledgeRecordContentSchema, knowledgeSourceContentSchema } from "./knowledge-foundation";

// Drafts may be incomplete in evidence. This does not weaken the public Record
// schema (which still requires at least one source).
const draftRecord = knowledgeRecordContentSchema.safeExtend({ evidence: z.array(knowledgeEvidenceSchema).max(20) });
export const knowledgeSubmissionContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  entities: z.array(z.strictObject({ id: knowledgeIdSchema, content: knowledgeEntityContentSchema })).max(40).default([]),
  entityPins: z.array(knowledgePinSchema).max(40).default([]),
  sources: z.array(z.strictObject({ id: knowledgeIdSchema, content: knowledgeSourceContentSchema })).max(40).default([]),
  items: z.array(z.strictObject({ key: knowledgeIdSchema, record: draftRecord,
    correction: knowledgePinSchema.optional(),
  })).min(1).max(20),
}).superRefine((value, ctx) => {
  for (const [label, ids] of [
    ["対象", [...value.entities.map(e => e.id), ...value.entityPins.map(p => p.id)]],
    ["資料", value.sources.map(s => s.id)], ["項目", value.items.map(i => i.key)],
  ] as const) if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: label + "のIDが重複しています" });
});
export type KnowledgeSubmissionContent = z.infer<typeof knowledgeSubmissionContentSchema>;
export const knowledgeSubmissionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().nonnegative(), content: knowledgeSubmissionContentSchema }),
  z.strictObject({ action: z.literal("submit"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().positive() }),
  z.strictObject({ action: z.literal("cancel"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().positive() }),
]);
export type KnowledgeSubmissionCommand = z.infer<typeof knowledgeSubmissionCommandSchema>;
export type KnowledgeSubmission = {
  id: string; revision: number; version: number; state: "draft" | "queued" | "cancelled";
  content: KnowledgeSubmissionContent; digest: string; createdAt: string; updatedAt: string;
};
