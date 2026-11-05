import {entityCorrectionSchema} from './knowledge-entity-correction';
import { z } from "zod";
import {knowledgeTextTargetSchema,translationProposalSchema,knowledgeTranslationVersionSchema} from "./knowledge-translation";
import {knowledgeTextLanguageSchema} from "./knowledge-language";
import {knowledgeReviewStatusSchema,type KnowledgeReviewStatus} from "./knowledge-review-job";
import { knowledgeEntityContentSchema, knowledgeEvidenceSchema, knowledgeIdSchema, knowledgePinSchema, knowledgeRecordContentSchema, knowledgeSourceContentSchema, knowledgeThemeContentSchema } from "./knowledge-foundation";

// Incomplete private input must be saveable. Public acceptance validates every
// used Entity, Source, and Record against the strict publication schemas again.
const draftEntity=z.strictObject({...knowledgeEntityContentSchema.shape,name:z.string().trim().max(200)});
const draftSource=z.strictObject({...knowledgeSourceContentSchema.shape,title:z.string().trim().max(300),url:z.string().max(2000).nullable().default(null)});
const draftEvidence=z.strictObject({...knowledgeEvidenceSchema.shape,locator:z.string().trim().max(1000)});
const draftRecord = z.strictObject({...knowledgeRecordContentSchema.shape,assertion:z.string().trim().max(4000),evidence:z.array(draftEvidence).max(20)});
export const submissionOperationSchema=z.enum(["create-entity","create-relation","add-information","add-evidence","correct-record","correct-entity","translate-text"]);
export const submissionAboutSchema=z.strictObject({kind:z.enum(["entity","record","theme"]),id:knowledgeIdSchema,revision:z.number().int().positive()});
export const submissionLegacySchema=z.strictObject({revision:z.string().min(1).max(200),entityIds:z.array(knowledgeIdSchema).max(40),claimIds:z.array(knowledgeIdSchema).max(20)});
export const submissionSelectionContextSchema=z.strictObject({dataset:z.literal("public-kg"),revision:z.string().min(1).max(200).optional(),entityIds:z.array(knowledgeIdSchema).max(40).default([]),claimIds:z.array(knowledgeIdSchema).max(20).default([]),entityPins:z.array(knowledgePinSchema).max(40).default([]),recordPins:z.array(knowledgePinSchema).max(20).default([]),themePin:knowledgePinSchema.optional()});
export const knowledgeSubmissionContentSchema = z.strictObject({
  schemaVersion:z.literal(2).optional(), attribution:z.enum(["profile","anonymous"]).optional(),legacy:submissionLegacySchema.optional(),
  title: z.string().trim().min(1).max(200),
  entities: z.array(z.strictObject({ id: knowledgeIdSchema, content: draftEntity })).max(40).default([]),
  entityPins: z.array(knowledgePinSchema).max(40).default([]),
  sourcePins: z.array(knowledgePinSchema).max(80).default([]),
  sources: z.array(z.strictObject({ id: knowledgeIdSchema, content: draftSource })).max(40).default([]),
  items: z.array(z.strictObject({ key: knowledgeIdSchema, record: draftRecord,
    entityCorrection:entityCorrectionSchema.optional(),translation:translationProposalSchema.optional(), correction: knowledgePinSchema.optional(), operation:submissionOperationSchema.optional(),about:submissionAboutSchema.optional(),themes:z.array(knowledgePinSchema).max(8).optional(),
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
export const knowledgeSelectionCaptureSchema=z.strictObject({action:z.literal("capture-selection"),requestId:z.uuidv4(),id:z.uuidv4(),expectedVersion:z.literal(0),context:submissionSelectionContextSchema,content:knowledgeSubmissionContentSchema.optional()});
export const knowledgeSubmissionContextSchema=z.object({texts:z.array(z.object({target:knowledgeTextTargetSchema,text:z.string(),hash:z.string(),language:knowledgeTextLanguageSchema.optional(),content:z.unknown(),translation:knowledgeTranslationVersionSchema.nullable()})).optional(),entities:z.array(z.object({id:z.string(),revision:z.number().int().positive().optional(),content:knowledgeEntityContentSchema})),sources:z.array(z.object({id:z.string(),revision:z.number().int().positive(),content:knowledgeSourceContentSchema})),records:z.array(z.object({id:z.string(),revision:z.number().int().positive(),content:knowledgeRecordContentSchema,createdAt:z.string().optional(),reason:z.string().optional()})).optional(),themes:z.array(z.object({id:z.string(),revision:z.number().int().positive(),content:knowledgeThemeContentSchema})).optional(),legacy:z.object({revision:z.string(),entities:z.array(z.object({id:z.string(),revision:z.string(),content:knowledgeEntityContentSchema.optional(),payload:z.unknown(),sha256:z.string()})),records:z.array(z.object({id:z.string(),revision:z.string(),content:knowledgeRecordContentSchema.optional(),payload:z.unknown(),sha256:z.string()}))}).optional()}).passthrough();
export type KnowledgeSubmissionContext=z.infer<typeof knowledgeSubmissionContextSchema>;
export const knowledgeSubmissionCaptureSchema = z.strictObject({ action: z.literal("capture"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.literal(0), capsuleId: z.uuidv4(), capsuleRevision: z.number().int().positive(), keys: z.array(knowledgeIdSchema).min(1).max(20).refine(keys => new Set(keys).size === keys.length) });
export const knowledgeTranslationCaptureSchema=z.strictObject({action:z.literal("capture-translation"),requestId:z.uuidv4(),id:z.uuidv4(),expectedVersion:z.literal(0),target:knowledgeTextTargetSchema,language:translationProposalSchema.shape.language,generationId:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export const knowledgePublicCaptureSchema=z.strictObject({action:z.literal("capture-public"),requestId:z.uuidv4(),id:z.uuidv4(),expectedVersion:z.literal(0),recordId:knowledgeIdSchema,recordRevision:z.number().int().positive()});
export const knowledgeSubmissionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().nonnegative(), content: knowledgeSubmissionContentSchema }),
  z.strictObject({ action: z.literal("submit"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().positive() }),
  z.strictObject({ action: z.literal("cancel"), requestId: z.uuidv4(), id: z.uuidv4(), expectedVersion: z.number().int().positive() }),
]);
export type KnowledgeSubmissionCommand = z.infer<typeof knowledgeSubmissionCommandSchema>;
export const knowledgeSubmissionSchema = z.object({
 review:knowledgeReviewStatusSchema.optional(), id: z.uuidv4(), revision: z.number().int().positive(), version: z.number().int().positive(), state: z.enum(["draft","queued","cancelled"]), content: knowledgeSubmissionContentSchema, digest: z.string(), createdAt: z.string(), updatedAt: z.string(), context:knowledgeSubmissionContextSchema.optional(), origin: z.object({ capsuleId: z.uuidv4(), capsuleRevision: z.number().int().positive(), title: z.string(), keys: z.array(z.string()) }).nullable().optional(),
});
export type KnowledgeSubmission = {
  review?:KnowledgeReviewStatus; id: string; revision: number; version: number; state: "draft" | "queued" | "cancelled";
  context?: KnowledgeSubmissionContext;
  origin?: { capsuleId: string; capsuleRevision: number; title: string; keys: string[] } | null;
  content: KnowledgeSubmissionContent; digest: string; createdAt: string; updatedAt: string;
};
