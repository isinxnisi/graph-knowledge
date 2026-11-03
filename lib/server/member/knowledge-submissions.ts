import type { Pool } from "pg";
import {ensureAcceptanceSchema} from "../knowledge-acceptance";
import {knowledgePublicationPreview} from "../knowledge-publication-preview";
import {randomUUID} from "node:crypto";
import {createReviewQueue,reviewEnabledFor} from "../knowledge-review-queue";
import {knowledgeReviewCommandSchema,REVIEW_CONSENT_VERSION,PUBLICATION_CONSENT_VERSION,submissionReviewInput} from "../../domain/knowledge-review-job";
import {knowledgeReviewRequest,parseKnowledgeReview} from "../../domain/knowledge-review";
import { z } from "zod";
import type { DatasetMode } from "../../domain/dataset";
import { memberCapsuleSchema } from "../../domain/member-capsule";
import { knowledgeSubmissionCommandSchema, knowledgeSubmissionCaptureSchema,knowledgePublicCaptureSchema,knowledgeSubmissionContentSchema } from "../../domain/knowledge-submission";
import { capsuleSubmissionCandidates } from "../../domain/knowledge-submission-capsule";
import { createKnowledgeSubmissionService } from "../knowledge-submissions";
import { KnowledgeError,knowledgeDigest } from "../knowledge-foundation";
import { assertMemberOrigin, memberHandle, MemberError, memberId, memberInput, memberJson } from "./http";
import { activeMember, memberTransaction } from "./operations";

export async function knowledgeSubmissionHandle(action:()=>Promise<Response>){
 return memberHandle(async()=>{try{return await action();}catch(e){
  if(e instanceof KnowledgeError)return memberJson({error:{code:e.code,message:e.message}},e.status);
  if(e instanceof z.ZodError)throw new MemberError(400,"INVALID_ARGUMENT");
  throw e;
 }});
}
export function createMemberKnowledgeSubmissions(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string}>,dataset:DatasetMode){
 const store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset}),reviews=createReviewQueue(pool);
 let acceptanceReady:Promise<void>|undefined;
 const readyAcceptance=async(id:string)=>{if(reviewEnabledFor(id)&&process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'){acceptanceReady??=ensureAcceptanceSchema(pool).catch(e=>{acceptanceReady=undefined;throw e;});await acceptanceReady;}};
 const enabled=()=>{if(process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=="1")throw new MemberError(404,"NOT_FOUND");};
 return {
  async list(request:Request){enabled();const user=await owner(request);await readyAcceptance(user.id);const submissions=await store.list(user.id);
   if(reviewEnabledFor(user.id)){const counts=(await pool.query("SELECT s.id,j.state,count(*)::int AS n FROM member_knowledge.submissions s JOIN member_knowledge.review_jobs j ON j.submission_id=s.id AND j.revision=s.current_revision WHERE s.owner_id=$1 GROUP BY s.id,j.state",[user.id])).rows;for(const value of submissions)Object.assign(value,{reviewCounts:Object.fromEntries(counts.filter(c=>c.id===value.id).map(c=>[c.state,c.n]))});}
   return memberJson({submissions,processing:reviewEnabledFor(user.id)?process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?"publishing-beta":"gemini-beta":"not-connected",consentVersion:process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?PUBLICATION_CONSENT_VERSION:REVIEW_CONSENT_VERSION});},
  async read(request:Request,id:string){enabled();const user=await owner(request);await readyAcceptance(user.id);return memberJson({submission:await store.get(user.id,memberId(id))});},
  async command(request:Request){
   enabled();assertMemberOrigin(request,origin);
   if(!request.headers.has("x-member-user"))throw new MemberError(400,"INVALID_ARGUMENT");
   const user=await owner(request),input=await memberInput(request,z.unknown(),128_000);
   if(knowledgeReviewCommandSchema.safeParse(input).success){if(!reviewEnabledFor(user.id))throw new MemberError(404,"NOT_FOUND");await readyAcceptance(user.id);const v=knowledgeReviewCommandSchema.parse(input);if(v.consentVersion!==(process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==='1'?PUBLICATION_CONSENT_VERSION:REVIEW_CONSENT_VERSION))throw new MemberError(409,"VERSION_CONFLICT");return memberJson({submission:await reviews.authorize(user.id,input)});}
   const capture=knowledgePublicCaptureSchema.safeParse(input);
   if(capture.success){
    await readyAcceptance(user.id);
    if(!reviewEnabledFor(user.id)||process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED!=="1")throw new MemberError(404,"NOT_FOUND");
    const prior=await store.replay(user.id,capture.data.requestId,knowledgeDigest(input));if(prior)return memberJson({submission:prior});
    const service=await knowledgePublicationPreview();const {record:dto}=await service.detail({recordId:capture.data.recordId});
    if(dto.record.revision!==capture.data.recordRevision)throw new MemberError(409,"VERSION_CONFLICT");
    const content=knowledgeSubmissionContentSchema.parse({title:dto.record.content.assertion.slice(0,180),entities:[],sources:[],entityPins:dto.entities.map(e=>({id:e.id,revision:e.revision})),sourcePins:dto.sources.map(e=>({id:e.id,revision:e.revision})),items:[{key:dto.record.id,record:dto.record.content,correction:{id:dto.record.id,revision:dto.record.revision}}]});
    return memberJson({submission:await store.execute(user.id,input,{content,captured:{records:[dto.record],entities:dto.entities,sources:dto.sources,...(dto.legacyTyped?{legacyTyped:dto.legacyTyped}:{})}})});
   }
   if(!z.union([knowledgeSubmissionCommandSchema,knowledgeSubmissionCaptureSchema]).safeParse(input).success)throw new MemberError(400,"INVALID_ARGUMENT");
   return memberJson({submission:await store.execute(user.id,input)});
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
