import {createHash, randomUUID} from "node:crypto";
import type {Pool, PoolClient, QueryResultRow} from "pg";
import {z} from "zod";
import type {DatasetMode} from "../../domain/dataset";
import {assertMemberOrigin, MemberError, memberId, memberInput, memberJson} from "./http";
import {memberTransaction} from "./operations";
import {communityAllowance} from "./community-rate";
import {safetyAudit} from "./community-safety";
import type {CommunitySafetyOperation} from "./community-site-safety";

const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tokenHash=(value:string)=>createHash("sha256").update(value).digest("hex");
const inputSchema=z.strictObject({requestId:z.uuidv4(),postId:z.uuidv4(),revision:z.number().int().positive(),expectedRevision:z.number().int().positive(),category:z.enum(["spam","harassment","privacy","other"]),detail:z.string().trim().min(1).max(500)});
const missing=()=>new MemberError(404,"NOT_FOUND");
// Bind inspection to the exact active link publication, never to a newly issued link.
// Only the reported comment is read; no Capsule title, graph or sibling comments.
export async function capsulePostGrant(c:PoolClient,capsuleId:string,postRevision:number,shareId:string|null) {
 if(!shareId)return false;
 return !!(await c.query(`SELECT 1 FROM member_capsule cap JOIN "user" owner ON owner.id=cap.owner_user_id AND owner.active
 JOIN member_capsule_share s ON s.capsule_id=cap.id AND s.id=$3
 JOIN member_capsule_publication p ON p.share_id=s.id AND p.capsule_id=cap.id AND p.revision=$2
 JOIN member_capsule_revision r ON r.capsule_id=p.capsule_id AND r.revision=p.revision AND NOT r.sharing_blocked
 JOIN member_capsule_revision live ON live.capsule_id=s.capsule_id AND live.revision=s.revision AND NOT live.sharing_blocked
 WHERE cap.id=$1 AND cap.trashed_at IS NULL AND NOT cap.sharing_blocked`,[capsuleId,postRevision,shareId])).rowCount;
}
export function createCapsulePostReports(pool:Pool,dataset:DatasetMode,origin:string,authenticate:(r:Request)=>Promise<{id:string}>) {
 return {async reportDiscussionPost(req:Request,rawId:string) {
  assertMemberOrigin(req,origin);
  if(process.env.COMMUNITY_ENABLED!=="1")throw missing();
  if(!req.headers.has("x-member-user"))throw new MemberError(400,"INVALID_ARGUMENT");
  const u=await authenticate(req),id=memberId(rawId),input=await memberInput(req,inputSchema);
  return memberTransaction(pool,async c=>{
   if((await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[u.id])).rows[0]?.active!==true)throw new MemberError(401,"UNAUTHENTICATED");
   const cap=(await c.query('SELECT * FROM member_capsule WHERE id=$1 AND dataset=$2 FOR UPDATE',[id,dataset])).rows[0];if(!cap)throw missing();
   const post=(await c.query('SELECT p.*,u.active FROM member_capsule_post p JOIN "user" u ON u.id=p.author_user_id WHERE p.id=$1 AND p.capsule_id=$2 FOR UPDATE OF p',[input.postId,id])).rows[0];
   if(!post||post.withdrawn_at||post.hidden_at||!post.active)throw missing();
   const share=(await c.query(`SELECT s.id FROM member_capsule_share s
    JOIN member_capsule_publication p ON p.share_id=s.id AND p.capsule_id=s.capsule_id AND p.revision=$2
    JOIN member_capsule_revision r ON r.capsule_id=p.capsule_id AND r.revision=p.revision AND NOT r.sharing_blocked
    WHERE s.capsule_id=$1 AND ($3::boolean OR s.token_hash=$4)`,[id,input.revision,cap.owner_user_id===u.id,tokenHash(req.headers.get('x-capsule-token')??'')])).rows[0];
   if(!await capsulePostGrant(c,id,Number(post.revision),share?.id??null))throw missing();
   if(post.moderation_revision!==input.expectedRevision)throw new MemberError(409,"COMMUNITY_CHANGED");
   const digest=hash(['capsule-post-report',id,input]);
   const receipt=(await c.query('SELECT hash,result_id FROM community_request WHERE user_id=$1 AND request_id=$2',[u.id,input.requestId])).rows[0];
   if(receipt){if(receipt.hash!==digest)throw new MemberError(409,"REQUEST_CONFLICT");return memberJson({id:receipt.result_id});}
   await c.query("UPDATE community_report SET status='dismissed',revision=revision+1 WHERE reporter_id=$1 AND target_kind='capsule-post' AND target_id=$2 AND status='open' AND expires_at<=clock_timestamp()",[u.id,post.id]);
   if((await c.query("SELECT 1 FROM community_report WHERE reporter_id=$1 AND target_kind='capsule-post' AND target_id=$2 AND status='open'",[u.id,post.id])).rowCount)throw new MemberError(409,"REPORT_ALREADY_OPEN");
   await communityAllowance(c,u.id,'report');
   const reportId=randomUUID();
   await c.query(`INSERT INTO community_report(id,target_kind,target_id,target_revision,content_hash,reporter_id,category,detail,target_capsule_id,target_capsule_revision,capsule_share_id)
    VALUES($1,'capsule-post',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[reportId,post.id,post.moderation_revision,hash(post.body),u.id,input.category,input.detail,id,post.revision,share.id]);
   await c.query('INSERT INTO community_request(user_id,request_id,hash,result_id) VALUES($1,$2,$3,$4)',[u.id,input.requestId,digest,reportId]);
   await safetyAudit(c,null,'report',post.id,'capsule-post',input.category,{user:u.id,report:reportId});
   return memberJson({id:reportId},201);
  });
 }};
}

export async function operateCapsulePostReport(c:PoolClient,input:CommunitySafetyOperation,apply:boolean,auditInspection:boolean) {
 const seed=(await c.query("SELECT * FROM community_report WHERE id=$1 AND target_kind='capsule-post'",[input.reportId])).rows[0];if(!seed)throw missing();
 // Same lifecycle order as a writer: user -> Capsule -> post/report.
 if(seed.reporter_id)await c.query('SELECT id FROM "user" WHERE id=$1 FOR SHARE',[seed.reporter_id]);
 await c.query('SELECT id FROM member_capsule WHERE id=$1 FOR UPDATE',[seed.target_capsule_id]);
 const r=(await c.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM community_report WHERE id=$1 FOR UPDATE',[input.reportId])).rows[0];
 if(r.revision!==input.expectedReportRevision)throw new MemberError(409,'REPORT_CHANGED');
 const audit=(action:string)=>safetyAudit(c,null,action,r.target_id,'capsule-post',input.reason,{operator:input.actor,caseReference:input.caseReference,report:r.id});
 if(input.action==='resolve'||input.action==='dismiss') {
  if(r.status!=='open')throw new MemberError(409,'REPORT_CLOSED');
  if(apply){await c.query('UPDATE community_report SET status=$2,revision=revision+1 WHERE id=$1',[r.id,input.action==='resolve'?'resolved':'dismissed']);await audit('report-'+input.action);}
  return {applied:apply,reportId:r.id,action:input.action};
 }
 if(!['inspect','hide-post','unhide-post'].includes(input.action))throw new MemberError(400,'POST_REPORT_REQUIRED');
 const active=r.reporter_id&&(await c.query('SELECT active FROM "user" WHERE id=$1',[r.reporter_id])).rows[0]?.active;
 const permitted=r.status==='open'&&r.unexpired&&active&&await capsulePostGrant(c,r.target_capsule_id,Number(r.target_capsule_revision),r.capsule_share_id);
 const p:QueryResultRow|undefined=permitted?(await c.query('SELECT p.*,u.active FROM member_capsule_post p JOIN "user" u ON u.id=p.author_user_id WHERE p.id=$1 AND p.capsule_id=$2 AND p.revision=$3 FOR UPDATE OF p',[r.target_id,r.target_capsule_id,r.target_capsule_revision])).rows[0]:undefined;
 const intact=!!p&&!p.withdrawn_at&&p.active&&hash(p.body)===r.content_hash;
 if(input.action==='inspect'){
  if(!apply)return {applied:false,reportId:r.id,content:null};
  if(intact&&p!.moderation_revision!==input.expectedRevision)throw new MemberError(409,'COMMUNITY_CHANGED');
  if(auditInspection)await audit(intact?'report-inspect':'report-inspect-withheld');
  return {applied:true,reportId:r.id,kind:'capsule-post',reportRevision:r.revision,targetRevision:intact?p!.moderation_revision:null,
   content:intact?{body:p!.body}:null,authorAccountId:intact?p!.author_user_id:null,category:r.category,detail:intact?r.detail:null,withheld:!intact};
 }
 if(!intact)throw new MemberError(409,'REPORT_CLOSED');
 if(p!.moderation_revision!==input.expectedRevision)throw new MemberError(409,'COMMUNITY_CHANGED');
 const hide=input.action==='hide-post';
 if(hide?!!p!.hidden_at:!p!.hidden_at)throw new MemberError(409,'COMMUNITY_CHANGED');
 if(!hide&&p!.hidden_report_id!==r.id)throw new MemberError(403,'HIDE_CASE_REQUIRED');
 if(apply){await c.query('UPDATE member_capsule_post SET hidden_at=CASE WHEN $2 THEN clock_timestamp() ELSE NULL END,hidden_report_id=CASE WHEN $2 THEN $3::uuid ELSE NULL END,moderation_revision=moderation_revision+1 WHERE id=$1',[p!.id,hide,r.id]);await audit('site-'+input.action);}
 return {applied:apply,reportId:r.id,action:input.action,targetId:r.target_id,revision:p!.moderation_revision};
}
