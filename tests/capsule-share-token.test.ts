import { describe, expect, it } from "vitest";
import { CAPSULE_SHARE_TOKEN_VERSION, deriveCapsuleShareToken, hashCapsuleShareToken, recoverCapsuleShareToken, type CapsuleShareTokenContext } from "../lib/server/member/share-token";

const secret = "test-only-capsule-sharing-secret-123456789";
const context: CapsuleShareTokenContext = { dataset: "demo", capsuleId: "11111111-1111-4111-8111-111111111111", shareId: "22222222-2222-4222-8222-222222222222", revision: 3 };
describe("Capsule所有者向けの限定リンク再取得", () => {
  it("固定v1 tupleの独立HMAC検算値と一致し、43文字のbearerを再現する", () => {
    // Independently computed with Python hmac.new(..., hashlib.sha256).
    expect(deriveCapsuleShareToken(secret, context)).toBe("OGJ5pJ24SrvsiiO9d2VyoeFcc5_dcAd9LdNk0nAuhdc");
    expect(CAPSULE_SHARE_TOKEN_VERSION).toBe(1);
    expect(deriveCapsuleShareToken(secret, context)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("dataset・Capsule・発行ID・版・鍵が異なると同じtokenを作らない", () => {
    const token = deriveCapsuleShareToken(secret, context);
    const variants: CapsuleShareTokenContext[] = [
      { ...context, dataset:"public-kg" }, { ...context, capsuleId:context.shareId },
      { ...context, shareId:context.capsuleId }, { ...context, revision:4 },
    ];
    for (const value of variants) expect(deriveCapsuleShareToken(secret,value)).not.toBe(token);
    expect(deriveCapsuleShareToken(secret+"-rotated",context)).not.toBe(token);
  });
  it("stored hashが一致したscheme1だけを返し、旧scheme・不正hash・鍵変更ではURLを捏造しない", () => {
    const token=deriveCapsuleShareToken(secret,context), hash=hashCapsuleShareToken(token);
    expect(recoverCapsuleShareToken(secret,context,1,hash)).toBe(token);
    expect(recoverCapsuleShareToken(secret,context,null,hash)).toBeNull();
    expect(recoverCapsuleShareToken(secret,context,2,hash)).toBeNull();
    for (const bad of ["", "0".repeat(64), hash+"0", "g".repeat(64)]) expect(recoverCapsuleShareToken(secret,context,1,bad)).toBeNull();
    expect(recoverCapsuleShareToken(secret+"-rotated",context,1,hash)).toBeNull();
  });
  it("弱い未設定鍵と非整数の版を受け付けない", () => {
    expect(()=>deriveCapsuleShareToken("",context)).toThrow();
    for(const revision of [0,1.5,Number.MAX_SAFE_INTEGER+1]) expect(()=>deriveCapsuleShareToken(secret,{...context,revision})).toThrow();
  });
});
