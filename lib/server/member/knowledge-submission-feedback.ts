import {knowledgePublishingEnabled,knowledgeCapability} from "../knowledge-deployment";
import {readAppeal} from "./knowledge-appeals";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import {acknowledgeFeedbackSchema,reviewDisclosureForConsent,submissionFeedbackSchema} from "../../domain/knowledge-submission-feedback";
import {PUBLICATION_CONSENT_VERSION,REVIEW_CONSENT_VERSION} from "../../domain/knowledge-review-job";
import {KnowledgeError} from "../knowledge-foundation";
import {assertMemberOrigin,MemberError,memberId,memberInput,memberJson} from "./http";
import {activeMember,memberTransaction} from "./operations";

export function currentReviewDisclosure(){return reviewDisclosureForConsent(knowledgePublishingEnabled()?PUBLICATION_CONSENT_VERSION:REVIEW_CONSENT_VERSION)!;}
export async function ensureSubmissionFeedbackSchema(pool:Pool){
 const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/024-knowledge-submission-feedback.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='024-knowledge-submission-feedback.sql'")).rows[0]?.checksum!==checksum)throw new KnowledgeError('結果通知用の明示migrationが必要です',503,'MIGRATION_REQUIRED');
}
const stamp=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
export async function submissionNotificationSummary(c:Pool|PoolClient,ownerId:string){
 const rows=(await c.query(`WITH unread AS (SELECT DISTINCT e.submission_id FROM member_knowledge.feedback_events e
 JOIN member_knowledge.submissions s ON s.id=e.submission_id
 JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=s.current_revision
 LEFT JOIN member_knowledge.feedback_seen seen ON seen.submission_id=e.submission_id AND seen.revision=e.revision
 WHERE s.owner_id=$1 AND COALESCE(r.source_capsule->>'kind','')<>'operator-api' AND e.id>COALESCE(seen.through_event_id,0))
 SELECT submission_id,count(*) OVER() AS total FROM unread ORDER BY submission_id LIMIT 200`,[ownerId])).rows;
 return {unreadCount:Number(rows[0]?.total??0),submissionIds:rows.map(row=>row.submission_id as string)};
}
export function createMemberSubmissionFeedback(pool:Pool,origin:string,owner:(request:Request)=>Promise<{id:string}>){
 let ready:Promise<void>|undefined;
 const enabled=()=>{if(process.env.KNOWLEDGE_SUBMISSIONS_ENABLED!=='1'||!knowledgeCapability('submissions',origin))throw new MemberError(404,'NOT_FOUND');};
 const ensure=()=>ready??=ensureSubmissionFeedbackSchema(pool).catch(e=>{ready=undefined;throw e;});
 const withOwner=async<T>(id:string,run:(c:PoolClient)=>Promise<T>)=>{await ensure();return memberTransaction(pool,async c=>{await activeMember(c,id);return run(c);});};
 return {
  async read(request:Request){
   enabled();const user=await owner(request);if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');
   const query=new URL(request.url).searchParams,id=query.get('submissionId');
   if(!id)return memberJson(await withOwner(user.id,c=>submissionNotificationSummary(c,user.id)));
   const submissionId=memberId(id),rawRevision=query.get('revision');
   if(rawRevision!==null&&!/^[1-9]\d{0,8}$/.test(rawRevision))throw new MemberError(400,'INVALID_ARGUMENT');
   return memberJson(await withOwner(user.id,async c=>{
    const target=(await c.query('SELECT id FROM member_knowledge.submissions WHERE id=$1 AND owner_id=$2',[submissionId,user.id])).rows[0];if(!target)throw new MemberError(404,'NOT_FOUND');
    const summaries=(await c.query(`SELECT r.revision,r.submitted_at,v.content->>'title' AS title,jsonb_array_length(v.content->'items') AS item_count,
      EXISTS(SELECT 1 FROM member_knowledge.feedback_events e WHERE e.submission_id=r.submission_id AND e.revision=r.revision AND e.id>COALESCE(seen.through_event_id,0)) AS unread
     FROM member_knowledge.submission_receipts r JOIN member_knowledge.submission_revisions v ON v.submission_id=r.submission_id AND v.revision=r.revision
     LEFT JOIN member_knowledge.feedback_seen seen ON seen.submission_id=r.submission_id AND seen.revision=r.revision
     WHERE r.submission_id=$1 ORDER BY r.revision DESC LIMIT 100`,[submissionId])).rows;
    const receipts=summaries.map(row=>({revision:Number(row.revision),submittedAt:stamp(row.submitted_at),title:row.title,itemCount:Number(row.item_count),unread:!!row.unread}));
    const revision=rawRevision===null?receipts[0]?.revision:Number(rawRevision);
    if(revision===undefined)return {receipts,receipt:null};
    if(!receipts.some(row=>row.revision===revision))throw new MemberError(404,'NOT_FOUND');
    // The displayed jobs, their publications and each notification cursor come
    // from one PostgreSQL snapshot. An unseen later outcome cannot be acked by
    // a cursor read after the displayed result.
    const rows=(await c.query(`SELECT r.content,r.digest,receipt.submitted_at,s.current_revision,s.state AS submission_state,
      j.id AS job_id,j.item_key,j.state,j.reason,j.not_before,j.consent_version,j.consent_profile_id,
      source.not_before AS source_not_before,d.command AS publication_command,d.result AS publication_result,d.state AS publication_state,d.reason AS publication_reason,
      event.cursor,COALESCE(seen.through_event_id,0)::text AS seen_cursor,
      EXISTS(SELECT 1 FROM member_knowledge.review_projects WHERE heartbeat_at>clock_timestamp()-interval '45 seconds') AS worker_available
     FROM member_knowledge.submissions s JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=$3
     JOIN member_knowledge.submission_receipts receipt ON receipt.submission_id=r.submission_id AND receipt.revision=r.revision
     LEFT JOIN member_knowledge.review_jobs j ON j.submission_id=r.submission_id AND j.revision=r.revision
     LEFT JOIN member_knowledge.source_checks source ON source.job_id=j.id
     LEFT JOIN member_knowledge.publication_decisions d ON d.job_id=j.id
     LEFT JOIN member_knowledge.feedback_seen seen ON seen.submission_id=r.submission_id AND seen.revision=r.revision
     LEFT JOIN LATERAL (SELECT max(e.id)::text AS cursor FROM member_knowledge.feedback_events e WHERE e.job_id=j.id) event ON true
     WHERE s.id=$1 AND s.owner_id=$2 ORDER BY j.created_at,j.item_key`,[submissionId,user.id,revision])).rows;
    const seed=rows[0];if(!seed)throw new MemberError(404,'NOT_FOUND');
    const content=z.object({title:z.string(),items:z.array(z.object({key:z.string(),operation:z.string().optional(),translation:z.object({text:z.string()}).optional(),record:z.object({assertion:z.string()})}))}).parse(seed.content);
    let eventCursor:string|null=null;
    for(const row of rows)if(row.cursor&&(eventCursor===null||BigInt(row.cursor)>BigInt(eventCursor)))eventCursor=row.cursor;
    const sorted=rows.filter(row=>row.job_id).sort((a,b)=>content.items.findIndex(item=>item.key===a.item_key)-content.items.findIndex(item=>item.key===b.item_key));
    const descriptor=sorted[0]?reviewDisclosureForConsent(sorted[0].consent_version):null;
    const disclosure=descriptor&&sorted.every(row=>row.consent_profile_id===descriptor.profileId)?descriptor:null;
    const appealsReady=(await c.query("SELECT to_regclass('member_knowledge.appeals') AS ready")).rows[0]?.ready;
    const appealMap=new Map<string,Awaited<ReturnType<typeof readAppeal>>>();
    if(appealsReady)for(const a of (await c.query("SELECT id,job_id FROM member_knowledge.appeals WHERE job_id=ANY($1::uuid[])",[sorted.map(row=>row.job_id)])).rows)appealMap.set(a.job_id,await readAppeal(c,a.id));
    const items=sorted.map(row=>({...((appealMap.get(row.job_id))?{appeal:appealMap.get(row.job_id)}:{}),key:row.item_key,kind:content.items.find(item=>item.key===row.item_key)?.operation==='translate-text'?'translation':'record',assertion:content.items.find(item=>item.key===row.item_key)?.translation?.text??content.items.find(item=>item.key===row.item_key)?.record.assertion??'',state:row.state,reason:row.reason,
     nextAttemptAt:['retry','quota','source-retry'].includes(row.state)?stamp(row.state==='source-retry'?row.source_not_before??row.not_before:row.not_before):null,
     ...(row.publication_command?{publication:{kind:row.publication_command.action==='accept-translation'?'translation':'record',id:row.publication_result?.id??row.publication_command.record?.id,revision:row.publication_result?.revision??(row.publication_command.expectedRevision??0)+1,state:row.publication_state,reason:row.publication_reason??'',...(row.publication_result?.disposition?{disposition:row.publication_result.disposition}:{})}}:{})}));
    return submissionFeedbackSchema.parse({receipts,receipt:{revision,submittedAt:stamp(seed.submitted_at),title:content.title,digest:seed.digest,current:Number(seed.current_revision)===revision,cancelled:seed.submission_state==='cancelled',workerAvailable:!!seed.worker_available,items,eventCursor,unread:eventCursor!==null&&BigInt(eventCursor)>BigInt(seed.seen_cursor),disclosure}});
   }));
  },
  async acknowledge(request:Request){
   enabled();assertMemberOrigin(request,origin);if(!request.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');
   const user=await owner(request),command=await memberInput(request,acknowledgeFeedbackSchema,2048);
   return memberJson(await withOwner(user.id,async c=>{
    const exists=(await c.query(`SELECT 1 FROM member_knowledge.feedback_events e JOIN member_knowledge.submissions s ON s.id=e.submission_id
     WHERE e.id=$1 AND e.submission_id=$2 AND e.revision=$3 AND s.owner_id=$4`,[command.throughEventId,command.submissionId,command.revision,user.id])).rowCount===1;
    if(!exists)throw new MemberError(404,'NOT_FOUND');
    await c.query(`INSERT INTO member_knowledge.feedback_seen(submission_id,revision,through_event_id) VALUES($1,$2,$3)
     ON CONFLICT(submission_id,revision) DO UPDATE SET through_event_id=GREATEST(member_knowledge.feedback_seen.through_event_id,EXCLUDED.through_event_id),seen_at=CASE WHEN EXCLUDED.through_event_id>member_knowledge.feedback_seen.through_event_id THEN clock_timestamp() ELSE member_knowledge.feedback_seen.seen_at END`,[command.submissionId,command.revision,command.throughEventId]);
    return submissionNotificationSummary(c,user.id);
   }));
  },
 };
}
