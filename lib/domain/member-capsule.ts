import { z } from "zod";
import { DATASET_MODES } from "./dataset";

// The server accepts content only. Identity, owner, revision and timestamps are
// assigned by the server; local browser records are never uploaded implicitly.
export const MEMBER_CAPSULE_LIMITS = { count: 10, entities: 30, claims: 60, title: 80, note: 4000, bytes: 32_000 } as const;
const ids = (limit: number) => z.array(z.uuidv4().transform(id => id.toLowerCase())).max(limit)
  .refine(values => new Set(values).size === values.length);
export const memberCapsuleContentSchema = z.strictObject({
  dataset: z.enum(DATASET_MODES),
  title: z.string().trim().min(1).max(MEMBER_CAPSULE_LIMITS.title),
  note: z.string().max(MEMBER_CAPSULE_LIMITS.note),
  language: z.literal("ja"),
  entityIds: ids(MEMBER_CAPSULE_LIMITS.entities).min(1),
  claimIds: ids(MEMBER_CAPSULE_LIMITS.claims),
});
export type MemberCapsuleContent = z.infer<typeof memberCapsuleContentSchema>;
export const memberCapsuleSchema = z.strictObject({
  id: z.uuidv4(), schemaVersion: z.literal(1), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), content: memberCapsuleContentSchema,
});
export type MemberCapsule = z.infer<typeof memberCapsuleSchema>;
export const memberCreateSchema = z.strictObject({ requestId: z.uuidv4().transform(id => id.toLowerCase()), content: memberCapsuleContentSchema });
export const memberUpdateSchema = z.strictObject({ expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1), content: memberCapsuleContentSchema });
export const memberDeleteSchema = z.strictObject({ expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
