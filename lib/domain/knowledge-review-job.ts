import {z} from "zod";
import type {KnowledgeSubmission} from "./knowledge-submission";
import {knowledgeReviewInputSchema,type KnowledgeReviewInput} from "./knowledge-review";
export const REVIEW_CONSENT_VERSION="gemini-public-beta-v1";
export const PUBLICATION_CONSENT_VERSION="gemini-publication-beta-v1";
export const REVIEW_STATES=["queued","running","retry","quota","reviewed","needs-changes","declined","attention","cancelled","verifying","source-retry","accepted","published"] as const;
export const knowledgeReviewStatusSchema=z.object({
 revision:z.number().int().positive(),workerAvailable:z.boolean(),
 items:z.array(z.object({publication:z.object({id:z.string(),revision:z.number(),state:z.string(),reason:z.string()}).optional(),key:z.string(),state:z.enum(REVIEW_STATES),reason:z.string(),nextAttemptAt:z.string().nullable(),attempts:z.number().int(),result:z.object({suitability:z.string(),support:z.string(),reason:z.string()}).nullable()})),
});
export type KnowledgeReviewStatus=z.infer<typeof knowledgeReviewStatusSchema>;
export const knowledgeReviewCommandSchema=z.strictObject({action:z.literal("review"),requestId:z.uuidv4(),id:z.uuidv4(),expectedVersion:z.number().int().positive(),consentVersion:z.enum([REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION])});
export function submissionReviewInput(submission:KnowledgeSubmission,key:string,includeBibliography=false):KnowledgeReviewInput{
 const item=submission.content.items.find(i=>i.key===key);if(!item)throw Error("項目がありません");
 const r=item.record;
 const entity=(id:string|null)=>id===null?null:submission.content.entities.find(e=>e.id===id)?.content.name??submission.context?.entities.find(e=>e.id===id)?.content.name??null;
 if(r.subjectId&&!entity(r.subjectId)||r.objectId&&!entity(r.objectId))throw Error("対象の取得版を確認してください");
 const sourceNotes:{title:string;bibliography:string;language:string}[]=[];
 const evidence=r.evidence.map(e=>{
  const source=submission.content.sources.find(s=>s.id===e.source.id&&e.source.revision===1)??submission.context?.sources.find(s=>s.id===e.source.id&&s.revision===e.source.revision);
  if(!source)throw Error("資料の取得版を確認してください");
  sourceNotes.push({title:source.content.title,bibliography:includeBibliography?(submission.content.sources.find(s=>s.id===e.source.id&&e.source.revision===1)?.content.bibliography??''):'',language:source.content.language});
  return {title:source.content.title,locator:e.locator,excerpt:e.excerpt};
 });
 return knowledgeReviewInputSchema.parse({assertion:r.assertion,context:JSON.stringify({sourceNotes,kind:r.kind,from:entity(r.subjectId),to:entity(r.objectId),entityTypes:[r.subjectId,r.objectId].filter(Boolean).map(id=>({name:entity(id),kind:submission.content.entities.find(e=>e.id===id)?.content.kind??submission.context?.entities.find(e=>e.id===id)?.content.kind})),relation:r.relation,polarity:r.polarity,scope:r.scope,times:r.times}),evidence});
}
export const reviewStateLabel=(state:string)=>({queued:"AI確認待ち",running:"AIが確認中",retry:"接続の再試行待ち",quota:"利用枠の再開待ち",reviewed:"AI確認済み・公開前の照合待ち","needs-changes":"根拠・内容の補足が必要",declined:"AIが不適切な投稿と判断",attention:"AI接続の確認待ち",cancelled:"確認を取り消しました",verifying:"原資料を照合中","source-retry":"原資料の再取得待ち",accepted:"受理済み・検索へ反映中",published:"公開しました"}[state]??"AI確認待ち");
