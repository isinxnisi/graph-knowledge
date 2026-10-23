import {createHash, randomUUID} from 'node:crypto';
import type {Pool, PoolClient, QueryResultRow} from 'pg';
import {z} from 'zod';
import {activeMember, memberTransaction} from './operations';
import {MemberError, memberId, memberInput, memberJson} from './http';
import {communityAllowance} from './community-rate';
import {communityPage, pageTime} from './community-pagination';

export const readableCommunityThread = `(t.audience='public' OR EXISTS (
 SELECT 1 FROM community_audience_member a JOIN community_member m
 ON m.community_id=t.community_id AND m.user_id=a.user_id AND m.generation=a.generation AND m.status='active'
 WHERE a.thread_id=t.id AND a.user_id=$2))`;
export const reportKind = z.enum(['community','thread','post']);
const reportInput = z.strictObject({requestId:z.uuidv4(),kind:reportKind,targetId:z.uuidv4(),expectedRevision:z.number().int().positive(),category:z.enum(['spam','harassment','privacy','other']),detail:z.string().trim().min(1).max(500)});
const hideInput = z.strictObject({expectedRevision:z.number().int().positive(),hidden:z.boolean(),reason:z.string().trim().min(1).max(500)});
type Helpers = {
 actor:(req:Request)=>Promise<{id:string}>;
 identity:(req:Request,required?:boolean)=>Promise<{id:string}|null>;
 context:(c:PoolClient,id:string,user:string|null,write?:boolean)=>Promise<QueryResultRow>;
 admin:(row:QueryResultRow)=>void;
 expected:(row:QueryResultRow,n:number)=>void;
 dto:(row:QueryResultRow)=>unknown;
};
const missing=()=>new MemberError(404,'NOT_FOUND');

// Locate only; callers must lock the parent and authorize before returning any content.
export async function safetyTarget(c:PoolClient,kind:z.infer<typeof reportKind>,id:string) {
 if(kind==='community')return (await c.query('SELECT id AS community_id FROM community WHERE id=$1',[id])).rows[0];
 if(kind==='thread')return (await c.query('SELECT community_id,id AS thread_id FROM community_thread WHERE id=$1',[id])).rows[0];
 return (await c.query('SELECT t.community_id,t.id AS thread_id FROM community_post p JOIN community_thread t ON t.id=p.thread_id WHERE p.id=$1',[id])).rows[0];
}
export async function exactSafetyContent(c:PoolClient,kind:z.infer<typeof reportKind>,id:string) {
 if(kind==='community')return (await c.query('SELECT title,description,revision FROM community WHERE id=$1',[id])).rows[0];
 if(kind==='thread')return (await c.query('SELECT title,revision FROM community_thread WHERE id=$1',[id])).rows[0];
 return (await c.query('SELECT body,status,revision,hidden_by FROM community_post WHERE id=$1',[id])).rows[0];
}
export const safetyHash=(row:QueryResultRow)=>createHash('sha256').update(JSON.stringify([row.title??null,row.description??null,row.body??null])).digest('hex');
export async function requireSafetyThread(c:PoolClient,tid:string,uid:string|null) {
 if(!(await c.query(`SELECT t.id FROM community_thread t WHERE t.id=$1 AND ${readableCommunityThread}`,[tid,uid])).rowCount)throw missing();
}
export async function safetyAudit(c:PoolClient,cid:string,action:string,targetId:string,kind:string,reason:string,who:{user?:string,operator?:string,caseReference?:string,report?:string}) {
 await c.query(`INSERT INTO community_operation(community_id,actor_id,operator_id,case_reference,action,target_id,target_kind,reason,report_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[cid,who.user??null,who.operator??null,who.caseReference??null,action,targetId,kind,reason,who.report??null]);
}

export function createCommunitySafety(pool:Pool,h:Helpers,secret:string) {
 return {
  async report(req:Request) {
   const u=await h.actor(req),input=await memberInput(req,reportInput);
   return memberTransaction(pool,async c=>{
    // Serialize this actor's abuse allowance/idempotency across different communities.
    if((await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[u.id])).rows[0]?.active!==true)throw new MemberError(401,'UNAUTHENTICATED');
    const seed=await safetyTarget(c,input.kind,input.targetId);if(!seed)throw missing();
    await h.context(c,seed.community_id,u.id,true);
    if(seed.thread_id)await requireSafetyThread(c,seed.thread_id,u.id);
    const target=await exactSafetyContent(c,input.kind,input.targetId);if(!target||input.kind==='post'&&target.status!=='visible')throw missing();
    h.expected(target,input.expectedRevision);
    const hash=createHash('sha256').update(JSON.stringify(['report',input])).digest('hex');
    const receipt=(await c.query('SELECT hash,result_id FROM community_request WHERE user_id=$1 AND request_id=$2',[u.id,input.requestId])).rows[0];
    if(receipt){if(receipt.hash!==hash)throw new MemberError(409,'REQUEST_CONFLICT');return memberJson({id:receipt.result_id});}
    // Expired reports may be filed again with a fresh, currently authorized
    // target. Do not silently extend the original private inspection window.
    await c.query("UPDATE community_report SET status='dismissed',revision=revision+1 WHERE reporter_id=$1 AND target_kind=$2 AND target_id=$3 AND status='open' AND expires_at<=clock_timestamp()",[u.id,input.kind,input.targetId]);
    if((await c.query("SELECT 1 FROM community_report WHERE reporter_id=$1 AND target_kind=$2 AND target_id=$3 AND status='open'",[u.id,input.kind,input.targetId])).rowCount)throw new MemberError(409,'REPORT_ALREADY_OPEN');
    await communityAllowance(c,u.id,'report');
    const m=(await c.query("SELECT generation FROM community_member WHERE community_id=$1 AND user_id=$2 AND status='active'",[seed.community_id,u.id])).rows[0];
    const id=randomUUID();
    await c.query(`INSERT INTO community_report(id,community_id,target_kind,target_id,target_revision,content_hash,reporter_id,reporter_generation,category,detail)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,seed.community_id,input.kind,input.targetId,target.revision,safetyHash(target),u.id,m?.generation??null,input.category,input.detail]);
    await c.query('INSERT INTO community_request(user_id,request_id,hash,result_id) VALUES($1,$2,$3,$4)',[u.id,input.requestId,hash,id]);
    await safetyAudit(c,seed.community_id,'report',input.targetId,input.kind,input.category,{user:u.id,report:id});
    return memberJson({id},201);
   });
  },
  async reports(req:Request) {
   const u=(await h.identity(req,true))!;
   return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);
    const page=await communityPage(c,req,secret,'reports',u.id,'',`SELECT r.id,r.target_kind,CASE WHEN r.status='open' AND r.expires_at<=clock_timestamp() THEN 'expired' ELSE r.status END AS status,r.revision,r.id AS page_id,${pageTime('r.created_at')} FROM community_report r WHERE r.reporter_id=$1`,[u.id],'r.created_at','r.id');
    // No target title, detail, membership or private parent is recoverable here.
    return memberJson({reports:page.rows.map(r=>({id:r.id,kind:r.target_kind,status:r.status})),nextCursor:page.nextCursor,partial:page.partial});
   });
  },
  async moderatePost(req:Request,rawId:string) {
   const id=memberId(rawId),u=await h.actor(req),input=await memberInput(req,hideInput);
   return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);
    const seed=await safetyTarget(c,'post',id);if(!seed)throw missing();
    const row=await h.context(c,seed.community_id,u.id,true);h.admin(row);
    // Admin status alone never grants access to old cohort conversations.
    await requireSafetyThread(c,seed.thread_id,u.id);
    const p=(await c.query('SELECT * FROM community_post WHERE id=$1 FOR UPDATE',[id])).rows[0];h.expected(p,input.expectedRevision);
    if(p.status==='withdrawn')throw new MemberError(409,'POST_WITHDRAWN');
    if(p.hidden_by==='site')throw new MemberError(403,'SITE_MODERATION_REQUIRED');
    if((p.status==='hidden')===input.hidden)throw new MemberError(409,'COMMUNITY_CHANGED');
    await c.query("UPDATE community_post SET status=$2,hidden_by=$3,community_hidden=$4,hidden_at=CASE WHEN $4 THEN clock_timestamp() ELSE NULL END,revision=revision+1 WHERE id=$1",[id,input.hidden?'hidden':'visible',input.hidden?'community':null,input.hidden]);
    await c.query('UPDATE community SET revision=revision+1 WHERE id=$1',[seed.community_id]);
    await safetyAudit(c,seed.community_id,input.hidden?'post-hide':'post-unhide',id,'post',input.reason,{user:u.id});
    return memberJson({changed:true});
   });
  },
  async safetyLog(req:Request,rawId:string) {
   const id=memberId(rawId),u=(await h.identity(req,true))!;
   return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);const row=await h.context(c,id,u.id);h.admin(row);
    const page=await communityPage(c,req,secret,'safety-log:'+id,u.id,String(row.revision),`SELECT o.*,o.event_id AS page_id,${pageTime('o.created_at')} FROM community_operation o
     WHERE o.community_id=$1 AND o.action IN ('post-hide','post-unhide') AND EXISTS(
      SELECT 1 FROM community_post p JOIN community_thread t ON t.id=p.thread_id WHERE p.id=o.target_id AND ${readableCommunityThread})`,[id,u.id],'o.created_at','o.event_id');
    return memberJson({community:h.dto(row),audit:page.rows.map(r=>({id:String(r.id),action:r.action,targetId:r.target_id,actorId:r.actor_id,reason:r.reason,at:r.created_at.toISOString()})),nextCursor:page.nextCursor,partial:page.partial});
   });
  }
 };
}
