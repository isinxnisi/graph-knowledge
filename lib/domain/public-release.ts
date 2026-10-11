import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const publicManifestSchema = z.strictObject({
  dataset: z.literal("public-kg"), release: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),
  baseRelease: z.string().min(1).nullable(), reason: z.string().trim().min(1), dataSha256: digest,
  inputs: z.array(z.strictObject({ dataset: z.string().min(1), file: z.string().min(1), sha256: digest })).min(1),
  claimOrigins: z.array(z.strictObject({ claimId: z.uuidv4(), dataset: z.string().min(1), sourceClaimId: z.uuidv4() })),
});
