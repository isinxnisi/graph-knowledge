import {describe,expect,it} from "vitest";
import {acknowledgeFeedbackSchema,feedbackSummary,reviewDisclosureForConsent} from "../lib/domain/knowledge-submission-feedback";
import {PUBLICATION_CONSENT_VERSION,REVIEW_CONSENT_VERSION,REVIEW_STATES,reviewStateLabel} from "../lib/domain/knowledge-review-job";
describe("submission feedback meaning",()=>{
 it("a request receipt is not the outcome; actionable results precede pending work",()=>{
  expect(feedbackSummary({queued:2})).toMatchObject({label:"確認待ち",pending:2,needsAction:false});
  expect(feedbackSummary({published:1,"needs-changes":1,running:1})).toMatchObject({label:"一部公開・補足が必要",published:1,pending:1,needsAction:true,tone:"attention"});
  expect(feedbackSummary({attention:1,quota:1},false).label).toBe("処理の確認を待っています");
  expect(feedbackSummary({running:1},false).label).toBe("確認処理の再開待ち");
 });
 it("review-only completion and publication are different, including cancellation",()=>{
  expect(feedbackSummary({reviewed:1},true,"review")).toMatchObject({label:"確認が完了しました・未公開",pending:0,published:0});
  expect(feedbackSummary({reviewed:1},true,"publish")).toMatchObject({label:"原資料の照合待ち",pending:1});
  expect(feedbackSummary({published:1,cancelled:1},true,"publish","ja",true).label).toBe("一部公開・残りは取消済み");
  expect(feedbackSummary({cancelled:1},true,"publish","ja",true).label).toBe("取り消しました");
 });
 it("business-state labels do not hard-code an AI or provider name",()=>{
  for(const state of REVIEW_STATES){expect(reviewStateLabel(state)).not.toMatch(/AI|Gemini/);expect(reviewStateLabel(state,"en")).not.toMatch(/AI|Gemini/);}
 });
 it("consent versions pin purpose, recipient and data policy; unknown consent cannot retarget",()=>{
  const publish=reviewDisclosureForConsent(PUBLICATION_CONSENT_VERSION),review=reviewDisclosureForConsent(REVIEW_CONSENT_VERSION);
  expect(publish).toMatchObject({providerId:"google-gemini",recipient:"Google",purpose:"publish",profileId:"google-gemini-free-publish-v1",dataPolicyId:"google-gemini-free-api-v1"});
  expect(review?.profileId).not.toBe(publish?.profileId);expect(reviewDisclosureForConsent("another-provider-v1")).toBeNull();
 });
 it("an acknowledgement requires a concrete displayed receipt and bounded event cursor",()=>{
  const value={action:"acknowledge",submissionId:"10000000-0000-4000-8000-000000000001",revision:3,throughEventId:"41"};
  expect(acknowledgeFeedbackSchema.safeParse(value).success).toBe(true);
  for(const cursor of ["0","-1","9223372036854775808","4.2",""]){expect(acknowledgeFeedbackSchema.safeParse({...value,throughEventId:cursor}).success).toBe(false);}
 });
});

it("a client consent descriptor cannot silently change the actual recipient profile",async()=>{
 const {createReviewQueue}=await import("../lib/server/knowledge-review-queue");
 const queue=createReviewQueue({} as import("pg").Pool);
 await expect(queue.authorize("00000000-0000-4000-8000-000000000001",{action:"review",id:"10000000-0000-4000-8000-000000000001",requestId:"20000000-0000-4000-8000-000000000001",expectedVersion:1,consentVersion:PUBLICATION_CONSENT_VERSION,profileId:"another-provider-profile"})).rejects.toMatchObject({code:"CONSENT_CHANGED",status:409});
});
