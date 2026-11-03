import {appealPublicSchema} from "./knowledge-appeal";
import {z} from "zod";
import {REVIEW_STATES,REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION} from "./knowledge-review-job";

export const reviewDisclosureSchema=z.object({profileId:z.string(),providerId:z.literal("google-gemini"),recipient:z.string(),serviceName:z.string(),dataPolicyId:z.string(),notice:z.string(),consentVersion:z.enum([REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION]),purpose:z.enum(["review","publish"])});
export type ReviewDisclosure=z.infer<typeof reviewDisclosureSchema>;
// A consent version names a recipient and data policy, not only some UI text.
// Another provider must get a distinct version/profile and an evaluated sender.
export function reviewDisclosureForConsent(version:string):ReviewDisclosure|null {
 const purpose=version===PUBLICATION_CONSENT_VERSION?"publish":version===REVIEW_CONSENT_VERSION?"review":null;
 return purpose?{profileId:`google-gemini-free-${purpose}-v1`,providerId:"google-gemini",recipient:"Google",serviceName:"Google Gemini",dataPolicyId:"google-gemini-free-api-v1",notice:"無料APIでは、送信内容がGoogleのサービス改善に利用される場合があります。",consentVersion:version as ReviewDisclosure["consentVersion"],purpose}:null;
}
export const notificationSummarySchema=z.object({unreadCount:z.number().int().nonnegative(),submissionIds:z.array(z.uuidv4()).max(200)});
export type SubmissionNotificationSummary=z.infer<typeof notificationSummarySchema>;
export const feedbackItemSchema=z.object({appeal:appealPublicSchema.optional(),key:z.string(),assertion:z.string(),state:z.enum(REVIEW_STATES),reason:z.string(),nextAttemptAt:z.string().nullable(),publication:z.object({id:z.string(),revision:z.number().int().positive(),state:z.string(),reason:z.string()}).optional()});
export const feedbackReceiptSchema=z.object({revision:z.number().int().positive(),submittedAt:z.string(),title:z.string(),digest:z.string(),current:z.boolean(),cancelled:z.boolean(),workerAvailable:z.boolean(),items:z.array(feedbackItemSchema).max(20),eventCursor:z.string().nullable(),unread:z.boolean(),disclosure:reviewDisclosureSchema.nullable()});
export type FeedbackReceipt=z.infer<typeof feedbackReceiptSchema>;
export const submissionFeedbackSchema=z.object({receipts:z.array(z.object({revision:z.number().int().positive(),submittedAt:z.string(),title:z.string(),itemCount:z.number().int().nonnegative(),unread:z.boolean()})).max(100),receipt:feedbackReceiptSchema.nullable()});
export type SubmissionFeedback=z.infer<typeof submissionFeedbackSchema>;
const cursor=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(v=>/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n);
export const acknowledgeFeedbackSchema=z.strictObject({action:z.literal("acknowledge"),submissionId:z.uuidv4(),revision:z.number().int().positive(),throughEventId:cursor});
export const feedbackPendingStates=new Set<string>(["queued","running","retry","quota","verifying","source-retry","accepted"]);
export function feedbackSummary(counts:Record<string,number>,workerAvailable=true,purpose:"review"|"publish"="publish",locale="ja",cancelled=false){
 const t=(ja:string,en:string)=>locale==="en"?en:ja,n=(state:string)=>counts[state]??0;
 const total=Object.values(counts).reduce((sum,value)=>sum+value,0),published=n("published"),changes=n("needs-changes"),declined=n("declined"),attention=n("attention"),pending=[...feedbackPendingStates].reduce((sum,state)=>sum+n(state),0)+(purpose==="publish"?n("reviewed"):0);
 let label:string,tone:"neutral"|"attention"|"success"="neutral";
 if(changes){label=published?t("一部公開・補足が必要","Partly published · changes needed"):t("補足が必要です","Changes needed");tone="attention";}
 else if(declined){label=published?t("一部公開・公開できない項目があります","Partly published · some items not accepted"):t("公開できない項目があります","Some items were not accepted");tone="attention";}
 else if(attention){label=t("処理の確認を待っています","Processing needs attention");tone="attention";}
 else if(pending){
  if(published)label=t("一部公開・残りを確認中","Partly published · checking remaining items");
  else if(!workerAvailable)label=t("確認処理の再開待ち","Waiting for processing to resume");
  else if(n("running")||n("verifying"))label=t("内容と根拠を確認中","Checking the content and sources");
  else if(n("accepted"))label=t("公開へ反映中","Publishing");
  else if(n("quota"))label=t("順番・利用枠の再開待ち","Waiting for availability");
  else if(n("retry")||n("source-retry"))label=t("接続の再試行待ち","Waiting to reconnect");
  else if(n("reviewed"))label=t("原資料の照合待ち","Waiting to check the original source");
  else label=t("確認待ち","Waiting for review");
 }
 else if(published){label=published===total?t("公開しました","Published"):t("一部公開・残りは取消済み","Partly published · remaining items cancelled");tone="success";}
 else if(n("reviewed")){label=t("確認が完了しました・未公開","Review completed · not published");tone="success";}
 else if(cancelled||n("cancelled"))label=t("取り消しました","Cancelled");
 else label=t("確認の依頼が未完了です","Review has not been requested");
 return {label,tone,total,published,changes,declined,attention,pending,needsAction:changes+declined+attention>0};
}
export function feedbackCounts(items:FeedbackReceipt["items"]){return items.reduce<Record<string,number>>((counts,item)=>({...counts,[item.state]:(counts[item.state]??0)+1}),{});}
