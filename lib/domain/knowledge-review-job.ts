import {z} from "zod";
import {submissionReviewEvidence} from "./knowledge-submission-intent";
import type {KnowledgeSubmission} from "./knowledge-submission";
import {knowledgeReviewInputSchema,type KnowledgeReviewInput} from "./knowledge-review";
export const REVIEW_CONSENT_VERSION="gemini-public-beta-v1";
export const PUBLICATION_CONSENT_VERSION="gemini-publication-beta-v1";
export const REVIEW_STATES=["queued","running","retry","quota","reviewed","needs-changes","declined","attention","cancelled","verifying","source-retry","accepted","published"] as const;
export const knowledgeReviewStatusSchema=z.object({
 revision:z.number().int().positive(),workerAvailable:z.boolean(),
 items:z.array(z.object({publication:z.object({id:z.string(),revision:z.number(),state:z.string(),reason:z.string(),disposition:z.enum(["created","updated","existing","theme-linked"]).optional()}).optional(),key:z.string(),state:z.enum(REVIEW_STATES),reason:z.string(),nextAttemptAt:z.string().nullable(),attempts:z.number().int(),result:z.object({suitability:z.string(),support:z.string(),reason:z.string()}).nullable()})),
});
export type KnowledgeReviewStatus=z.infer<typeof knowledgeReviewStatusSchema>;
export const knowledgeReviewCommandSchema=z.strictObject({action:z.literal("review"),requestId:z.uuidv4(),id:z.uuidv4(),expectedVersion:z.number().int().positive(),consentVersion:z.enum([REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION]),profileId:z.string().min(1).max(100).optional()});
export function submissionReviewInput(submission:KnowledgeSubmission,key:string,includeBibliography=false):KnowledgeReviewInput{
 const item=submission.content.items.find(i=>i.key===key);if(!item)throw Error("項目がありません");
 const r=item.record;
 const entity=(id:string|null)=>id===null?null:submission.content.entities.find(e=>e.id===id)?.content.name??submission.context?.entities.find(e=>e.id===id)?.content.name??null;
 if(r.subjectId&&!entity(r.subjectId)||r.objectId&&!entity(r.objectId))throw Error("対象の取得版を確認してください");
 const sourceNotes:{title:string;bibliography:string;language:string;textLanguages?:unknown;quotationLanguage?:unknown}[]=[];
 const evidence=submissionReviewEvidence(item,submission.context).map(e=>{
  const source=submission.content.sources.find(s=>s.id===e.source.id&&e.source.revision===1)??submission.context?.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
  if(!source)throw Error("資料の取得版を確認してください");
  sourceNotes.push({title:source.content.title,bibliography:includeBibliography?(submission.content.sources.find(s=>s.id===e.source.id&&e.source.revision===1)?.content.bibliography??''):'',language:source.content.textLanguages?.document?.tag??"und",textLanguages:source.content.textLanguages,quotationLanguage:e.textLanguages?.excerpt});
  return {title:source.content.title,locator:e.locator,excerpt:e.excerpt};
 });
 return knowledgeReviewInputSchema.parse({assertion:r.assertion,context:JSON.stringify({sourceNotes,operation:item.operation,about:item.about?{...item.about,assertion:submission.context?.records?.find(v=>v.id===item.about!.id)?.content.assertion,title:submission.context?.themes?.find(v=>v.id===item.about!.id)?.content.title}:null,kind:r.kind,textLanguages:r.textLanguages,from:entity(r.subjectId),to:entity(r.objectId),entityTypes:[r.subjectId,r.objectId].filter(Boolean).map(id=>({name:entity(id),kind:submission.content.entities.find(e=>e.id===id)?.content.kind??submission.context?.entities.find(e=>e.id===id)?.content.kind})),relation:r.relation,polarity:r.polarity,scope:r.scope,times:r.times}),evidence});
}
export const reviewStateLabel=(state:string,locale="ja")=>{
 const labels:Record<string,[string,string]>={queued:["確認待ち","Waiting for review"],running:["内容と根拠を確認中","Checking content and sources"],retry:["接続の再試行待ち","Waiting to reconnect"],quota:["順番・利用枠の再開待ち","Waiting for availability"],reviewed:["確認済み・原資料の照合待ち","Reviewed · original source check pending"],"needs-changes":["根拠・内容の補足が必要","Changes or additional sources needed"],declined:["この内容では公開できません","Not accepted for publication"],attention:["確認処理の再開待ち","Waiting for processing to resume"],cancelled:["確認を取り消しました","Review cancelled"],verifying:["原資料を照合中","Checking the original source"],"source-retry":["原資料の再取得待ち","Waiting to retrieve the source again"],accepted:["受理済み・公開へ反映中","Accepted · publishing"],published:["公開しました","Published"]};
 return (labels[state]??labels.queued)[locale==="en"?1:0];
};
