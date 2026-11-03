/** Provider-neutral outcome rule for server-side submission integration.
 * This is not an authorization capability and does not write any public data.
 * The server must compute these gates inside the acceptance transaction.
 */
export type KnowledgeReviewAdvice = {
  suitability: "legitimate" | "abuse" | "unclear";
  support: "supported" | "unsupported" | "contradicted" | "unclear";
  reason: string;
};
export type KnowledgeReviewGates = {
  requestActive: boolean;
  submittedDigest: string;
  reviewedDigest: string;
  inputValid: boolean;
  referencesAllowed: boolean;
  assessedProfile: boolean;
};
export type KnowledgeReviewOutcome =
  | { action: "accept" }
  | { action: "request-changes"; reason: string }
  | { action: "decline"; reason: string; appealAvailable: true }
  | { action: "wait"; reason: string }
  | { action: "discard"; reason: string };

export function knowledgeReviewOutcome(advice: KnowledgeReviewAdvice | null, gates: KnowledgeReviewGates): KnowledgeReviewOutcome {
  if (!gates.requestActive) return { action: "discard", reason: "投稿が取り消されたか、受付状態が変わりました" };
  if (!/^[a-f0-9]{64}$/.test(gates.submittedDigest) || gates.submittedDigest !== gates.reviewedDigest) return { action: "discard", reason: "確認した内容版と提出内容が一致しません" };
  if (!gates.referencesAllowed) return { action: "discard", reason: "参照先の利用条件が変わりました" };
  if (!gates.inputValid) return { action: "request-changes", reason: "入力項目を確認してください" };
  if (!gates.assessedProfile || !advice) return { action: "wait", reason: "AIによる確認を待っています" };
  if (advice.suitability === "abuse") return { action: "decline", reason: advice.reason, appealAvailable: true };
  if (advice.suitability === "legitimate" && advice.support === "supported") return { action: "accept" };
  return { action: "request-changes", reason: advice.reason };
}
