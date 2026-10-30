import { z } from "zod";
import { DATASET_MODES } from "./dataset";
import { capsuleDocumentSchema, referencesMatchDocument } from "./capsule-document";

// The server accepts content only. Identity, owner, revision and timestamps are
// assigned by the server; local browser records are never uploaded implicitly.
export const MEMBER_CAPSULE_LIMITS = { count: 20, entities: 200, claims: 400, title: 80, note: 4000, bytes: 2_000_000, totalBytes: 64_000_000 } as const;
const ids = (limit: number) => z.array(z.uuidv4().transform(id => id.toLowerCase())).max(limit)
  .refine(values => new Set(values).size === values.length);
export const memberCapsuleContentSchema = z.strictObject({
  dataset: z.enum(DATASET_MODES),
  title: z.string().trim().min(1).max(MEMBER_CAPSULE_LIMITS.title),
  note: z.string().max(MEMBER_CAPSULE_LIMITS.note),
  language: z.literal("ja"),
  entityIds: ids(MEMBER_CAPSULE_LIMITS.entities),
  claimIds: ids(MEMBER_CAPSULE_LIMITS.claims),
  document: capsuleDocumentSchema.optional(),
}).refine(referencesMatchDocument, "Document references do not match");
export type MemberCapsuleContent = z.infer<typeof memberCapsuleContentSchema>;
export const memberCapsuleSchema = z.strictObject({
  id: z.uuidv4(), schemaVersion: z.union([z.literal(1), z.literal(2)]), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), content: memberCapsuleContentSchema,
}).refine(value => value.schemaVersion === (value.content.document ? 2 : 1), "Content schema version mismatch");
export type MemberCapsule = z.infer<typeof memberCapsuleSchema>;
export const memberCreateSchema = z.strictObject({ requestId: z.uuidv4().transform(id => id.toLowerCase()), content: memberCapsuleContentSchema });
export const memberUpdateSchema = z.strictObject({ expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1), requestId: z.uuidv4().optional(), content: memberCapsuleContentSchema });
export const memberDeleteSchema = z.strictObject({ expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
