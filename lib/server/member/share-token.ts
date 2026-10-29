import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { DatasetMode } from "../../domain/dataset";

export type CapsuleShareTokenContext = { dataset: DatasetMode; capsuleId: string; shareId: string; revision: number };
export const CAPSULE_SHARE_TOKEN_VERSION = 1;
// Domain separation prevents this bearer from being confused with another use
// of MEMBER_AUTH_SECRET. The fixed JSON tuple is unambiguous; changing any part
// requires a new scheme version. Random shareId provides per-issuance entropy.
const TOKEN_DOMAIN = "plunode/capsule-share-token/v1";
export function deriveCapsuleShareToken(secret: string, context: CapsuleShareTokenContext) {
  if (secret.length < 32 || !Number.isSafeInteger(context.revision) || context.revision < 1) throw new Error("Invalid Capsule share token configuration");
  const message = JSON.stringify([TOKEN_DOMAIN, context.dataset, context.capsuleId, context.shareId, context.revision]);
  return createHmac("sha256", secret).update(message, "utf8").digest("base64url");
}
export const hashCapsuleShareToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function recoverCapsuleShareToken(secret: string, context: CapsuleShareTokenContext, version: number | null, storedHash: string): string | null {
  if (version !== CAPSULE_SHARE_TOKEN_VERSION || !/^[a-f0-9]{64}$/.test(storedHash)) return null;
  const token = deriveCapsuleShareToken(secret, context);
  // Key rotation must not silently change or revoke an already issued link.
  // Only return a reconstruction that matches the existing capability hash.
  return timingSafeEqual(Buffer.from(hashCapsuleShareToken(token), "hex"), Buffer.from(storedHash, "hex")) ? token : null;
}
