import type { Pool } from "pg";
import {randomUUID} from "node:crypto";
import {createReviewQueue,reviewEnabledFor} from "../knowledge-review-queue";
import {knowledgeReviewCommandSchema,REVIEW_CONSENT_VERSION,submissionReviewInput} from "../../domain/knowledge-review-job";
import {knowledgeReviewRequest,parseKnowledgeReview} from "../../domain/knowledge-review";
import { z } from "zod";
import type { DatasetMode } from "../../domain/dataset";
import { memberCapsuleSchema } from "../../domain/member-capsule";
import { knowledgeSubmissionCommandSchema, knowledgeSubmissionCaptureSchema } from "../../domain/knowledge-submission";
import { capsuleSubmissionCandidates } from "../../domain/knowledge-submission-capsule";
import { createKnowledgeSubmissionService } from "../knowledge-submissions";
import { KnowledgeError } from "../knowledge-foundation";
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
 const enabled=()=>{if(process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=="1")throw new MemberError(404,"NOT_FOUND");};
 return {
  async list(request:Request){enabled();const user=await owner(request);return memberJson({submissions:await store.list(user.id),processing:reviewEnabledFor(user.id)?"gemini-beta":"not-connected",consentVersion:REVIEW_CONSENT_VERSION});},
  async read(request:Request,id:string){enabled();const user=await owner(request);return memberJson({submission:await store.get(user.id,memberId(id))});},
  async command(request:Request){
   enabled();assertMemberOrigin(request,origin);
   if(!request.headers.has("x-member-user"))throw new MemberError(400,"INVALID_ARGUMENT");
   const user=await owner(request),input=await memberInput(request,z.unknown(),128_000);
   if(knowledgeReviewCommandSchema.safeParse(input).success){if(!reviewEnabledFor(user.id))throw new MemberError(404,"NOT_FOUND");return memberJson({submission:await reviews.authorize(user.id,input)});}
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
