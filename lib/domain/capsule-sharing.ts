import { z } from "zod";
import { memberCapsuleSchema } from "./member-capsule";

export const SHARED_REVISION_LIMIT = 50;
export const capsuleShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const capsuleShareSchema = z.strictObject({
  id: z.uuidv4(), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), createdAt: z.iso.datetime(),
});
export type CapsuleShare = z.infer<typeof capsuleShareSchema>;
export const capsuleShareStatusSchema = z.object({ share: capsuleShareSchema.nullable() });
export const capsuleShareIssueSchema = z.strictObject({
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expectedShareId: z.uuidv4().nullable(),
});
export const capsuleShareRevokeSchema = z.strictObject({ expectedShareId: z.uuidv4() });
export const capsuleShareIssuedSchema = z.object({ share: capsuleShareSchema, token: capsuleShareTokenSchema });
export const sharedCapsuleSchema = z.object({ capsule: memberCapsuleSchema });
