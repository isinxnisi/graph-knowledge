import { describe, expect, it } from "vitest";
import { knowledgeReviewOutcome, type KnowledgeReviewAdvice, type KnowledgeReviewGates } from "../lib/domain/knowledge-review-outcome";

const valid: KnowledgeReviewGates = { requestActive: true, submittedDigest: "a".repeat(64), reviewedDigest: "a".repeat(64), inputValid: true, referencesAllowed: true, assessedProfile: true };
const ordinary: KnowledgeReviewAdvice = { suitability: "legitimate", support: "supported", reason: "提出内容を資料が支持しています" };
describe("automatic knowledge review disposition", () => {
  it("automatically accepts a normal reviewed record without a human approval gate", () => {
    expect(knowledgeReviewOutcome(ordinary, valid)).toEqual({ action: "accept" });
  });
  it("automatically requests clarification rather than sending every incomplete item to operators", () => {
    for (const support of ["unsupported", "contradicted", "unclear"] as const) expect(knowledgeReviewOutcome({ ...ordinary, support }, valid)).toMatchObject({ action: "request-changes" });
    expect(knowledgeReviewOutcome({ ...ordinary, suitability: "unclear" }, valid)).toMatchObject({ action: "request-changes" });
  });
  it("declines abuse with an appeal path instead of publishing it", () => {
    expect(knowledgeReviewOutcome({ ...ordinary, suitability: "abuse" }, valid)).toMatchObject({ action: "decline", appealAvailable: true });
  });
  it("does not publish stale or cancelled submissions even after a positive AI result", () => {
    expect(knowledgeReviewOutcome(ordinary, { ...valid, requestActive: false }).action).toBe("discard");
    expect(knowledgeReviewOutcome(ordinary, { ...valid, reviewedDigest: "b".repeat(64) }).action).toBe("discard");
    expect(knowledgeReviewOutcome(ordinary, { ...valid, submittedDigest: "not-a-digest", reviewedDigest: "not-a-digest" }).action).toBe("discard");
  });
  it("keeps current authorization and structural validation outside model control", () => {
    expect(knowledgeReviewOutcome(ordinary, { ...valid, referencesAllowed: false }).action).toBe("discard");
    expect(knowledgeReviewOutcome(ordinary, { ...valid, inputValid: false }).action).toBe("request-changes");
  });
  it("waits for outages or unassessed replacements without silently accepting through Kev", () => {
    expect(knowledgeReviewOutcome(null, valid).action).toBe("wait");
    expect(knowledgeReviewOutcome(ordinary, { ...valid, assessedProfile: false }).action).toBe("wait");
  });
});
