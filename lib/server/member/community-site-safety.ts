import {operateCapsulePostReport} from "./capsule-post-reports";
import type {Pool, PoolClient, QueryResultRow} from 'pg';
import {z} from 'zod';
import {memberTransaction} from './operations';
import {MemberError} from './http';
import {requireCapsuleListingAccess} from './community-capsules';
import {exactSafetyContent, requireSafetyThread, safetyAudit, safetyHash, safetyTarget} from './community-safety';

const operatorInput=z.strictObject({
 reportId:z.uuidv4(),expectedReportRevision:z.number().int().positive(),
 action:z.enum(['inspect','block-capsule','hide-post','unhide-post','suspend-community','resume-community','resolve','dismiss']),
 expectedRevision:z.number().int().positive(),
 actor:z.string().regex(/^[a-zA-Z0-9_.@-]{1,80}$/),
 caseReference:z.string().min(1).max(120).regex(/^[a-zA-Z0-9_./:#-]+$/),
 reason:z.string().trim().min(1).max(500)
});
export type CommunitySafetyOperation=z.input<typeof operatorInput>;

// A report is a bounded, expiring purpose; it is not universal private access.
async function mayInspect(c:PoolClient,r:QueryResultRow,community:QueryResultRow) {
 if(r.status!=='open'||!r.unexpired||!r.reporter_id)return false;
 const active=(await c.query('SELECT active FROM "user" WHERE id=$1',[r.reporter_id])).rows[0]?.active;
 if(!active)return false;
 const m=(await c.query("SELECT generation FROM community_member WHERE community_id=$1 AND user_id=$2 AND status='active'",[r.community_id,r.reporter_id])).rows[0];
 if(r.reporter_generation!==null&&m?.generation!==r.reporter_generation)return false;
 if(community.visibility!=='public'&&!m)return false;
 const seed=await safetyTarget(c,r.target_kind,r.target_id);if(!seed)return false;
 if(r.target_kind==='capsule'){try{await requireCapsuleListingAccess(c,r.target_id,r.reporter_id);}catch(e){if(e instanceof MemberError&&e.status===404)return false;throw e;}}
 if(seed.thread_id){try{await requireSafetyThread(c,seed.thread_id,r.reporter_id);}catch(e){if(e instanceof MemberError&&e.status===404)return false;throw e;}}
 return true;
}

// Shared by CLI and the explicitly authenticated site-operations service.
// A community role alone never authorizes these operations.
export async function operateCommunitySafety(pool:Pool,raw:CommunitySafetyOperation,apply=false,client?:PoolClient,auditInspection=true) {
 const input=operatorInput.parse(raw);
 const run=async(c:PoolClient)=>{
  const seed=(await c.query('SELECT community_id,reporter_id,target_kind FROM community_report WHERE id=$1',[input.reportId])).rows[0];
  if(!seed)throw new MemberError(404,'NOT_FOUND');
  if(seed.target_kind==='capsule-post')return operateCapsulePostReport(c,input,apply,auditInspection);
  // Match User -> Community -> Report/Post lifecycle lock order. The read lock
  // makes a queued inspection recheck a committed account suspension/deletion.
  if(seed.reporter_id)await c.query('SELECT id FROM "user" WHERE id=$1 FOR SHARE',[seed.reporter_id]);
  const community=(await c.query('SELECT * FROM community WHERE id=$1 FOR UPDATE',[seed.community_id])).rows[0];
  const r=(await c.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM community_report WHERE id=$1 FOR UPDATE',[input.reportId])).rows[0];
  if(!community||r.revision!==input.expectedReportRevision)throw new MemberError(409,'REPORT_CHANGED');
  const who={operator:input.actor,caseReference:input.caseReference,report:r.id};
  const audit=(action:string,tid:string,kind:string)=>safetyAudit(c,community.id,action,tid,kind,input.reason,who);
  if(input.action==='inspect') {
   if(!apply) return {applied:false,reportId:r.id,content:null};
   const permitted=await mayInspect(c,r,community);
   const target=permitted?await exactSafetyContent(c,r.target_kind,r.target_id):null;
   const intact=target&&target.status!=='withdrawn'&&safetyHash(target)===r.content_hash;
   if(intact&&target.revision!==input.expectedRevision)throw new MemberError(409,'COMMUNITY_CHANGED');
   if(auditInspection)await audit(intact?'report-inspect':'report-inspect-withheld',r.target_id,r.target_kind);
   // Author identity belongs only to this explicitly inspected post, never to
   // the notification, queue, receipt or a withheld/expired inspection.
   const authorAccountId=intact&&r.target_kind==='post'?(await c.query('SELECT author_id FROM community_post WHERE id=$1',[r.target_id])).rows[0]?.author_id??null:null;
   // Never include parent private titles, siblings, roster or reporter identity.
   return {applied:true,reportId:r.id,kind:r.target_kind,reportRevision:r.revision,targetRevision:target?.revision??null,
    content:intact?{title:target.title,description:target.description,body:target.body}:null,
    authorAccountId,category:r.category,detail:intact?r.detail:null,withheld:!intact};
  }
  if(['resolve','dismiss'].includes(input.action)) {
   if(r.status!=='open')throw new MemberError(409,'REPORT_CLOSED');
   if(apply){await c.query('UPDATE community_report SET status=$2,revision=revision+1 WHERE id=$1',[r.id,input.action==='resolve'?'resolved':'dismissed']);await audit('report-'+input.action,r.target_id,r.target_kind);}
   return {applied:apply,reportId:r.id,action:input.action};
  }
  // A closed/expired case cannot authorize new content actions. Suspension
  // restoration may refer to the original case without reopening private access.
  if(input.action!=='resume-community'&&(r.status!=='open'||!r.unexpired))throw new MemberError(409,'REPORT_CLOSED');
  if(input.action==='suspend-community'||input.action==='resume-community') {
   if(community.revision!==input.expectedRevision)throw new MemberError(409,'COMMUNITY_CHANGED');
   const suspend=input.action==='suspend-community';
   if(suspend?community.status==='suspended':community.status!=='suspended')throw new MemberError(409,'COMMUNITY_CHANGED');
   if(!suspend&&(await c.query("SELECT report_id FROM community_operation WHERE community_id=$1 AND action='site-suspend-community' ORDER BY id DESC LIMIT 1",[community.id])).rows[0]?.report_id!==r.id)throw new MemberError(403,'SUSPENSION_CASE_REQUIRED');
   if(apply){
    await c.query("UPDATE community SET suspended_from=CASE WHEN $2 THEN status ELSE NULL END,status=$3,revision=revision+1 WHERE id=$1",[community.id,suspend,suspend?'suspended':'archived']);
    if(suspend){
     await c.query('UPDATE community_member SET admin_offered=false WHERE community_id=$1',[community.id]);
     await c.query("UPDATE community_invitation SET status='revoked',revision=revision+1 WHERE community_id=$1 AND status='pending'",[community.id]);
     await c.query("UPDATE community_recovery SET status='cancelled',revision=revision+1 WHERE community_id=$1 AND status IN ('pending','approved')",[community.id]);
    }
    await audit('site-'+input.action,community.id,'community');
   }
   return {applied:apply,action:input.action,communityId:community.id,revision:community.revision,status:suspend?'suspended':'archived'};
  }
  if(input.action==='block-capsule') {
   if(r.target_kind!=='capsule'||!r.target_capsule_id||!r.target_capsule_revision)throw new MemberError(400,'CAPSULE_REPORT_REQUIRED');
   if(r.target_revision!==input.expectedRevision)throw new MemberError(409,'COMMUNITY_CHANGED');
   const cap=(await c.query('SELECT id FROM member_capsule WHERE id=$1 FOR UPDATE',[r.target_capsule_id])).rows[0];
   if(!cap)throw new MemberError(404,'NOT_FOUND');
   const frozen=(await c.query('SELECT sharing_blocked FROM member_capsule_revision WHERE capsule_id=$1 AND revision=$2 FOR UPDATE',[r.target_capsule_id,r.target_capsule_revision])).rows[0];
   if(!frozen)throw new MemberError(404,'NOT_FOUND');
   if(apply&&!frozen.sharing_blocked){
    await c.query('UPDATE member_capsule_revision SET sharing_blocked=true WHERE capsule_id=$1 AND revision=$2',[r.target_capsule_id,r.target_capsule_revision]);
    await c.query('DELETE FROM member_capsule_share WHERE capsule_id=$1 AND revision=$2',[r.target_capsule_id,r.target_capsule_revision]);
    await c.query('UPDATE community SET revision=revision+1 WHERE id=$1',[community.id]);
    await audit('site-block-capsule',r.target_id,'capsule');
   }
   return {applied:apply,action:input.action,targetId:r.target_id,revision:r.target_revision};
  }
  if(r.target_kind!=='post')throw new MemberError(400,'POST_REPORT_REQUIRED');
  const p=(await c.query('SELECT * FROM community_post WHERE id=$1 FOR UPDATE',[r.target_id])).rows[0];
  if(!p||p.revision!==input.expectedRevision)throw new MemberError(409,'COMMUNITY_CHANGED');
  if(p.status==='withdrawn')throw new MemberError(409,'POST_WITHDRAWN');
  const hide=input.action==='hide-post';
  if(!hide&&p.hidden_by!=='site')throw new MemberError(409,'SITE_HIDDEN_POST_REQUIRED');
  if(!hide&&(await c.query("SELECT report_id FROM community_operation WHERE target_id=$1 AND action='site-hide-post' ORDER BY id DESC LIMIT 1",[p.id])).rows[0]?.report_id!==r.id)throw new MemberError(403,'HIDE_CASE_REQUIRED');
  if(hide&&p.hidden_by==='site')throw new MemberError(409,'COMMUNITY_CHANGED');
  if(apply){
   // Lifting site moderation must not undo a separate community decision.
   const hidden=hide||p.community_hidden;
   await c.query("UPDATE community_post SET status=$2,hidden_by=$3,hidden_at=CASE WHEN $4 THEN COALESCE(hidden_at,clock_timestamp()) ELSE NULL END,revision=revision+1 WHERE id=$1",[p.id,hidden?'hidden':'visible',hide?'site':p.community_hidden?'community':null,hidden]);
   await c.query('UPDATE community SET revision=revision+1 WHERE id=$1',[community.id]);
   await audit('site-'+input.action,p.id,'post');
  }
  return {applied:apply,action:input.action,targetId:p.id,revision:p.revision};
 };
 return client?run(client):memberTransaction(pool,run);
}

// Queue exposes case routing metadata, never private titles/bodies or member
// identities. Exact content requires a separate, audited inspect command.
export async function communityReportQueue(pool:Pool,after?:string) {
 const id=after?z.uuidv4().parse(after):null;
 return memberTransaction(pool,async c=>{
  const result=await c.query(`SELECT r.id,r.target_kind AS kind,r.target_id AS "targetId",r.community_id AS "communityId",
   r.revision AS "reportRevision",c.revision AS "communityRevision",r.category,r.created_at AS "createdAt",
   CASE r.target_kind WHEN 'post' THEN p.revision WHEN 'thread' THEN t.revision WHEN 'capsule' THEN r.target_revision WHEN 'capsule-post' THEN COALESCE((to_jsonb(cp)->>'moderation_revision')::int,r.target_revision) ELSE c.revision END AS "targetRevision",r.expires_at>clock_timestamp() AS unexpired
   FROM community_report r LEFT JOIN community c ON c.id=r.community_id
   LEFT JOIN community_post p ON r.target_kind='post' AND p.id=r.target_id
   LEFT JOIN community_thread t ON r.target_kind='thread' AND t.id=r.target_id
   LEFT JOIN member_capsule_post cp ON r.target_kind='capsule-post' AND cp.id=r.target_id
   WHERE r.status='open' AND ($1::uuid IS NULL OR r.id>$1) ORDER BY r.id LIMIT 51`,[id]);
  return {reports:result.rows.slice(0,50),next:result.rows.length>50?result.rows[49].id:null};
 });
}
