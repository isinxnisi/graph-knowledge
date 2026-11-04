import {createMemberTranslationGeneration} from './translation-generation';
import {capsuleSubmissionSelection} from "../../domain/knowledge-submission-selection";
import {captureSubmissionCapsule} from "../../domain/knowledge-submission-capsule";
import {reviewDisclosureForConsent} from "../../domain/knowledge-submission-feedback";
import {captureSubmissionSelection,captureTranslationSelection,resolveSubmissionContext} from "../knowledge-submission-context";
import {submissionIntentIssues} from "../../domain/knowledge-submission-intent";
import {ApiError} from "../http";
import type { Pool } from "pg";
import {ensureAcceptanceSchema} from "../knowledge-acceptance";
import {randomUUID} from "node:crypto";
import {createReviewQueue,reviewEnabledFor} from "../knowledge-review-queue";
import {knowledgeReviewCommandSchema,REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION,submissionReviewInput} from "../../domain/knowledge-review-job";
import {knowledgeReviewRequest,parseKnowledgeReview} from "../../domain/knowledge-review";
import { z } from "zod";
import type { DatasetMode } from "../../domain/dataset";
import { memberCapsuleSchema } from "../../domain/member-capsule";
import { submissionSelectionContextSchema, knowledgeSubmissionCommandSchema, knowledgeSubmissionCaptureSchema,knowledgeSelectionCaptureSchema,knowledgePublicCaptureSchema,knowledgeTranslationCaptureSchema,knowledgeSubmissionContentSchema } from "../../domain/knowledge-submission";
import { capsuleSubmissionCandidates } from "../../domain/knowledge-submission-capsule";
import { createKnowledgeSubmissionService } from "../knowledge-submissions";
import { KnowledgeError,knowledgeDigest } from "../knowledge-foundation";
import { assertMemberOrigin, memberHandle, MemberError, memberId, memberInput, memberJson } from "./http";
import { activeMember, memberTransaction } from "./operations";

export async function knowledgeSubmissionHandle(action:()=>Promise<Response>){
 return memberHandle(async()=>{try{return await action();}catch(e){
  if(e instanceof ApiError)return memberJson({error:{code:e.code,message:e.message}},e.status);
  if(e instanceof KnowledgeError)return memberJson({error:{code:e.code,message:e.message}},e.status);
  if(e instanceof z.ZodError)throw new MemberError(400,"INVALID_ARGUMENT");
  throw e;
 }});
}
export function createMemberKnowledgeSubmissions(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string}>,dataset:DatasetMode){
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset}),reviews=createReviewQueue(pool);
 const generation=createMemberTranslationGeneration(pool,origin,owner);
 let acceptanceReady:Promise<void>|undefined;
 const readyAcceptance=async(id:string)=>{if(reviewEnabledFor(id)&&process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'){acceptanceReady??=ensureAcceptanceSchema(pool).catch(e=>{acceptanceReady=undefined;throw e;});await acceptanceReady;}};
 const enabled=()=>{if(process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=="1")throw new MemberError(404,"NOT_FOUND");};
 return {
  async list(request:Request){enabled();const user=await owner(request);await readyAcceptance(user.id);const submissions=await store.list(user.id);
   if(reviewEnabledFor(user.id)){const counts=(await pool.query(process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?"SELECT s.id,CASE WHEN j.state='published' AND d.result->>'disposition'='existing' THEN 'existing' ELSE j.state END AS state,count(*)::int AS n FROM member_knowledge.submissions s JOIN member_knowledge.review_jobs j ON j.submission_id=s.id AND j.revision=s.current_revision LEFT JOIN member_knowledge.publication_decisions d ON d.job_id=j.id WHERE s.owner_id=$1 GROUP BY s.id,CASE WHEN j.state='published' AND d.result->>'disposition'='existing' THEN 'existing' ELSE j.state END":"SELECT s.id,j.state,count(*)::int AS n FROM member_knowledge.submissions s JOIN member_knowledge.review_jobs j ON j.submission_id=s.id AND j.revision=s.current_revision WHERE s.owner_id=$1 GROUP BY s.id,j.state",[user.id])).rows;for(const value of submissions)Object.assign(value,{reviewCounts:Object.fromEntries(counts.filter(c=>c.id===value.id).map(c=>[c.state,c.n]))});}
   return memberJson({submissions,processing:reviewEnabledFor(user.id)?process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?"publishing-beta":"gemini-beta":"not-connected",reviewDisclosure:reviewDisclosureForConsent(process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?PUBLICATION_CONSENT_VERSION:REVIEW_CONSENT_VERSION),consentVersion:process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?PUBLICATION_CONSENT_VERSION:REVIEW_CONSENT_VERSION});},
  async read(request:Request,id:string){enabled();const user=await owner(request);await readyAcceptance(user.id);return memberJson({submission:await store.get(user.id,memberId(id))});},
  async command(request:Request){
   enabled();assertMemberOrigin(request,origin);
   if(!request.headers.has("x-member-user"))throw new MemberError(400,"INVALID_ARGUMENT");
   const user=await owner(request),input=await memberInput(request,z.unknown(),128_000);
   if(knowledgeReviewCommandSchema.safeParse(input).success){if(!reviewEnabledFor(user.id))throw new MemberError(404,"NOT_FOUND");await readyAcceptance(user.id);const v=knowledgeReviewCommandSchema.parse(input);const saved=await store.get(user.id,v.id);const issues=submissionIntentIssues(saved.content,saved.context);if(issues.length)throw new KnowledgeError(issues.join(" / "),400,"SUBMISSION_TARGET_REQUIRED");if(v.consentVersion!==(process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?PUBLICATION_CONSENT_VERSION:REVIEW_CONSENT_VERSION))throw new MemberError(409,"VERSION_CONFLICT");return memberJson({submission:await reviews.authorize(user.id,input)});}
   const selection=knowledgeSelectionCaptureSchema.safeParse(input);
   const capture=knowledgePublicCaptureSchema.safeParse(input);
   const translation=knowledgeTranslationCaptureSchema.safeParse(input);
   if(selection.success||capture.success||translation.success){
    await readyAcceptance(user.id);
    if(!reviewEnabledFor(user.id)||process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED!=="1")throw new MemberError(404,"NOT_FOUND");
    const requestId=translation.success?translation.data.requestId:selection.success?selection.data.requestId:capture.data!.requestId;
    const prior=await store.replay(user.id,requestId,knowledgeDigest(input));if(prior)return memberJson({submission:prior});
    const picked=translation.success?await captureTranslationSelection(translation.data.target,translation.data.language):selection.success?await captureSubmissionSelection(selection.data.context,selection.data.content):await captureSubmissionSelection({dataset:'public-kg',entityIds:[],claimIds:[],entityPins:[],recordPins:[{id:capture.data!.recordId,revision:capture.data!.recordRevision}]});
    if(translation.success&&translation.data.generationId){
     const text=await generation.queue().draft(user.id,translation.data.target,translation.data.language,translation.data.generationId);
     if(picked.content.items[0].translation!.expectedRevision!==0)throw new KnowledgeError('公開済みの訳文があります。訂正として内容を確認してください',409,'TRANSLATION_EXISTS');
     picked.content.items[0].translation!.text=text;
    }
    if(capture.success)for(const item of picked.content.items)item.operation='correct-record';
    return memberJson({submission:await store.execute(user.id,input,picked)});
   }
   const parsed=z.union([knowledgeSubmissionCommandSchema,knowledgeSubmissionCaptureSchema]).safeParse(input);
   if(!parsed.success)throw new MemberError(400,"INVALID_ARGUMENT");
   if(parsed.data.action==='capture'){
    const v=parsed.data,prior=await store.replay(user.id,v.requestId,knowledgeDigest(input));if(prior)return memberJson({submission:prior});
    const capsule=await memberTransaction(pool,async c=>{await activeMember(c,user.id);const row=(await c.query("SELECT * FROM member_capsule WHERE id=$1 AND owner_user_id=$2 AND dataset=$3 AND (to_jsonb(member_capsule)->>'trashed_at') IS NULL FOR SHARE",[v.capsuleId,user.id,dataset])).rows[0];if(!row)throw new MemberError(404,'NOT_FOUND');if(Number(row.revision)!==v.capsuleRevision)throw new MemberError(409,'VERSION_CONFLICT');return memberCapsuleSchema.parse({id:row.id,schemaVersion:row.schema_version,revision:Number(row.revision),createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),content:row.content});});
    let previous:ReturnType<typeof captureSubmissionCapsule>;try{previous=captureSubmissionCapsule(capsule,v.keys);}catch{throw new KnowledgeError('選択内容を確認してください',400,'INVALID_SELECTION');}
    const document=capsule.content.document!;
    const selected=document.relations.filter(r=>v.keys.includes(r.origin.kind==='knowledge'?r.origin.id:'capsule-relation:'+r.key));
    const selection=selected.length?capsuleSubmissionSelection(document,selected.map(r=>r.key),capsule.content.title):{context:{dataset:'public-kg' as const,entityIds:[],claimIds:[],entityPins:[],recordPins:[] as {id:string;revision:number}[]},content:knowledgeSubmissionContentSchema.parse({...previous.content,schemaVersion:2,attribution:'profile'})};
    if(!selected.length)selection.content.items=[];
    for(const old of previous.sourceCapsule.captured.records.filter(r=>!selected.some(rel=>(rel.origin.kind==='knowledge'?rel.origin.id:'capsule-relation:'+rel.key)===r.id))){
     const baseline=document.knowledge?.snapshot.records.find(r=>r.id===old.id);if(!baseline)throw new KnowledgeError('元の対象をグラフから選び直してください',400,'INVALID_SELECTION');
     selection.context.recordPins!.push({id:baseline.id,revision:baseline.revision});selection.content.items.push({key:old.id,operation:'correct-record',about:{kind:'record',id:old.id,revision:baseline.revision},correction:{id:old.id,revision:baseline.revision},record:old.content});
    }
    const picked=await captureSubmissionSelection(submissionSelectionContextSchema.parse(selection.context),selection.content);
    return memberJson({submission:await store.execute(user.id,input,picked)});
   }
   if(parsed.data.action==='save'){
    const prior=await store.replay(user.id,parsed.data.requestId,knowledgeDigest(input));if(prior)return memberJson({submission:prior});
    const previous=parsed.data.expectedVersion?await store.get(user.id,parsed.data.id):undefined;
    const captured=await resolveSubmissionContext(parsed.data.content,previous?.context);
    return memberJson({submission:await store.execute(user.id,input,{content:parsed.data.content,captured})});
   }
   if(parsed.data.action==='submit'){const saved=await store.get(user.id,parsed.data.id);const issues=submissionIntentIssues(saved.content,saved.context);if(issues.length)throw new KnowledgeError(issues.join(" / "),400,"SUBMISSION_TARGET_REQUIRED");}
   return memberJson({submission:await store.execute(user.id,input)});
  },
  async targets(request:Request){
   enabled();assertMemberOrigin(request,origin);if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');
   const user=await owner(request);await readyAcceptance(user.id);
   const input=await memberInput(request,z.strictObject({content:knowledgeSubmissionContentSchema}),128_000);
   return memberJson({context:await resolveSubmissionContext(input.content)});
  },
  async advice(request:Request){
   enabled();assertMemberOrigin(request,origin);if(!request.headers.has("x-member-user"))throw new MemberError(400,"INVALID_ARGUMENT");
   const user=await owner(request);if(!reviewEnabledFor(user.id))throw new MemberError(404,"NOT_FOUND");
   const input=await memberInput(request,z.strictObject({id:z.uuidv4(),revision:z.number().int().positive(),key:z.string().min(1).max(200)}));
   const saved=await store.get(user.id,input.id);if(saved.revision!==input.revision||saved.state==='cancelled')throw new MemberError(409,"VERSION_CONFLICT");
   await reviews.reserveAdvice(user.id);
   let advice:ReturnType<typeof parseKnowledgeReview>|null=null;
   try{
    const wire=JSON.stringify(knowledgeReviewRequest(submissionReviewInput(saved,input.key)));
    if(Buffer.byteLength(wire)>32000)throw Error("advice-input-too-large");
    const r=await fetch('http://127.0.0.1:8009/v1/systemone',{method:'POST',headers:{'content-type':'application/json','x-request-id':randomUUID()},body:wire,signal:AbortSignal.timeout(15000),redirect:'error'});
    if(r.ok)advice=parseKnowledgeReview(await r.json());
   }catch{/* Optional advice never becomes a workflow decision. */}
   const latest=await store.get(user.id,input.id);if(latest.digest!==saved.digest||latest.state==='cancelled')throw new MemberError(409,"VERSION_CONFLICT");
   return memberJson({digest:saved.digest,key:input.key,available:!!advice,hints:advice?[
    ...(advice.suitability.label==='abuse'?["知識として伝えたい内容が分かるか、表現を見直してもよさそうです。"]:[]),
    ...(advice.support.label!=='supported'?["本文の内容すべてを根拠が支えているか、確認してもよさそうです。"]:[]),
   ]:[],blocking:false});
  },
  async capsule(request:Request){
   enabled();const user=await owner(request),id=memberId(new URL(request.url).searchParams.get("capsuleId")??"");
   return memberTransaction(pool,async c=>{
    await activeMember(c,user.id);
    const row=(await c.query("SELECT * FROM member_capsule WHERE id=$1 AND owner_user_id=$2 AND dataset=$3 AND (to_jsonb(member_capsule)->>'trashed_at') IS NULL FOR SHARE",[id,user.id,dataset])).rows[0];
    if(!row)throw new MemberError(404,"NOT_FOUND");
    const capsule=memberCapsuleSchema.parse({id:row.id,schemaVersion:row.schema_version,revision:Number(row.revision),createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),content:row.content});
    return memberJson({capsule:{id:capsule.id,revision:capsule.revision,title:capsule.content.title},candidates:capsuleSubmissionCandidates(capsule)});
   });
  },
 };
}
