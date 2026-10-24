import {createHash} from 'node:crypto';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {assertMemberOrigin,MemberError,memberId,memberInput,memberJson} from './http';
import {memberTransaction,operateMember} from './operations';
import {operateCommunitySafety} from './community-site-safety';
import {decideCommunityRecovery} from './community-recovery';
import {communityPage,pageTime} from './community-pagination';

const reason=z.string().trim().min(1).max(500),revision=z.number().int().positive();
export const siteActionSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('report'),requestId:z.uuidv4(),id:z.uuidv4(),action:z.enum(['inspect','hide-post','unhide-post','suspend-community','resume-community','resolve','dismiss']),expectedRevision:revision,expectedReportRevision:revision,reason}),
 z.strictObject({kind:z.literal('account'),requestId:z.uuidv4(),id:z.uuidv4(),action:z.enum(['suspend-user','resume-user']),expectedState:z.string().min(1).max(100),category:z.enum(['abuse','security','request','correction']),reason}),
 z.strictObject({kind:z.literal('recovery'),requestId:z.uuidv4(),id:z.uuidv4(),action:z.enum(['approve','reject']),expectedRevision:revision,readmit:z.boolean(),reason})
]);
export function isSiteOperator(id:string){const ids=(process.env.SITE_OPERATOR_USER_IDS??'').split(',').map(x=>x.trim()).filter(Boolean);return process.env.SITE_OPERATIONS_ENABLED==='1'&&process.env.COMMUNITY_ENABLED==='1'&&ids.length>0&&ids.every(x=>z.uuidv4().safeParse(x).success)&&ids.includes(id);}
const accountState=(r:QueryResultRow)=>`${r.active}:${r.stamp}`;
export function createSiteOperationsService(pool:Pool,origin:string,owner:(req:Request)=>Promise<{id:string;sessionId:string}>,secret:string){
 async function authorized(c:PoolClient,u:{id:string;sessionId:string}){
  if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');
  const current=await c.query('SELECT u.id FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active=true AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId]);
  if(!current.rowCount)throw new MemberError(401,'UNAUTHENTICATED');
 }
 async function access(req:Request,fn:(c:PoolClient,u:{id:string;sessionId:string})=>Promise<unknown>){
  if(process.env.SITE_OPERATIONS_ENABLED!=='1')throw new MemberError(404,'NOT_FOUND');
  const u=await owner(req);if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');
  return memberTransaction(pool,async c=>{await authorized(c,u);if(!(await c.query("SELECT to_regclass('site_operation_request') AS ready")).rows[0].ready)throw new MemberError(503,'OPERATIONS_UNAVAILABLE');const result=await fn(c,u);await authorized(c,u);return memberJson(result);});
 }
 return {
  read(req:Request,section:string){return access(req,async(c,u)=>{
   const q=new URL(req.url).searchParams;
   if(section==='session')return {operator:true,userId:u.id};
   if(section==='account'){
    const id=memberId(q.get('id')??'');
    const r=(await c.query('SELECT id,active,"createdAt" AS created_at,"updatedAt" AS updated_at,"updatedAt"::text AS stamp FROM "user" WHERE id=$1',[id])).rows[0];if(!r)throw new MemberError(404,'ACCOUNT_NOT_FOUND');
    return {account:{id:r.id,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at,expectedState:accountState(r)}};
   }
   let sql='',values:unknown[]=[],policy='';const time='x.created_at',id='x.id';
   if(section==='reports'){
    const status=q.get('status')??'open';if(!['open','resolved','dismissed','all'].includes(status))throw new MemberError(400,'INVALID_ARGUMENT');policy=status;
    sql=`SELECT x.id AS page_id,${pageTime('x.created_at')},x.id,x.target_kind,x.target_id,x.community_id,x.category,x.status,x.revision AS report_revision,x.created_at,x.expires_at,x.expires_at>clock_timestamp() AS unexpired,c.revision AS community_revision,c.status AS community_status,COALESCE(p.revision,t.revision,c.revision) AS target_revision,p.hidden_by,p.status AS post_status FROM community_report x JOIN community c ON c.id=x.community_id LEFT JOIN community_post p ON x.target_kind='post' AND p.id=x.target_id LEFT JOIN community_thread t ON x.target_kind='thread' AND t.id=x.target_id WHERE ($1='all' OR x.status=$1)`;values=[status];
   }else if(section==='recoveries'){
    const status=q.get('status')??'pending';if(!['pending','approved','rejected','cancelled','consumed','all'].includes(status))throw new MemberError(400,'INVALID_ARGUMENT');policy=status;
    sql=`SELECT x.id AS page_id,${pageTime('x.created_at')},x.id,x.community_id,x.user_id,x.status,x.revision,x.readmission_required,x.created_at,x.expires_at,x.expires_at>clock_timestamp() AS unexpired,c.status AS community_status FROM community_recovery x JOIN community c ON c.id=x.community_id WHERE ($1='all' OR x.status=$1)`;values=[status];
   }else if(section==='history'){
    const target=q.get('target');if(target)memberId(target);policy=target??'all';values=[target??null];
    sql=`SELECT x.id AS page_id,${pageTime('x.created_at')},x.* FROM (
     SELECT id,created_at,'web'::text AS source,operator_id::text AS actor,action,target_kind,target_id,reason,result->>'reportId' AS report_id FROM site_operation_request
     UNION ALL SELECT event_id,created_at,'community-cli',operator_id,action,COALESCE(target_kind,'community'),target_id,reason,report_id::text FROM community_operation WHERE operator_id IS NOT NULL AND operator_id NOT LIKE 'user.%'
     UNION ALL SELECT id,created_at,'member-cli',actor,action,'account',target_id,reason,NULL FROM member_operation WHERE actor NOT LIKE 'user.%'
    ) x WHERE ($1::uuid IS NULL OR x.target_id=$1 OR x.report_id=$1::text)`;
   }else throw new MemberError(404,'NOT_FOUND');
   const page=await communityPage(c,req,secret,'operations-'+section,u.id,policy,sql,values,time,id);
   return {items:page.rows.map(row=>{const r={...row};delete r.page_id;delete r.page_time;return r;}),nextCursor:page.nextCursor,partial:page.partial};
  });},
  act(req:Request){assertMemberOrigin(req,origin);if(!req.headers.has('x-member-user'))throw new MemberError(400,'INVALID_ARGUMENT');return access(req,async(c,u)=>{
   const input=await memberInput(req,siteActionSchema);
   // Lock the request before touching target state. A receipt and the shared
   // service mutation commit together; unknown outcomes are safely retryable.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[u.id+':'+input.requestId]);
   const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
   const receipt=(await c.query('SELECT * FROM site_operation_request WHERE operator_id=$1 AND request_id=$2',[u.id,input.requestId])).rows[0];
   if(receipt&&receipt.payload_hash!==hash)throw new MemberError(409,'REQUEST_REUSED');
   if(receipt&&!(input.kind==='report'&&input.action==='inspect'))return {result:receipt.result,replayed:true};
   const actor='user.'+u.id,caseReference='web.'+input.kind+'.'+input.id;
   let result:Record<string,unknown>;
   if(input.kind==='report'){
    result=await operateCommunitySafety(pool,{reportId:input.id,expectedReportRevision:input.expectedReportRevision,expectedRevision:input.expectedRevision,action:input.action,reason:input.reason,actor,caseReference},true,c,!receipt);
   }else if(input.kind==='recovery'){
    result=await decideCommunityRecovery(pool,{requestId:input.id,expectedRevision:input.expectedRevision,decision:input.action,readmit:input.readmit,reason:input.reason,actor,caseReference},true,c);
   }else{
    // Self suspension would invalidate the executing session midway through
    // its own response. Keep the emergency CLI for that exceptional action.
    if(input.id===u.id)throw new MemberError(409,'SELF_OPERATION_UNAVAILABLE');
    const r=(await c.query('SELECT active,"updatedAt"::text AS stamp FROM "user" WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!r)throw new MemberError(404,'ACCOUNT_NOT_FOUND');
    if(accountState(r)!==input.expectedState||r.active!==(input.action==='suspend-user'))throw new MemberError(409,'ACCOUNT_CHANGED');
    result=await operateMember(pool,{target:input.id,action:input.action,actor,reason:input.category},true,c);
   }
   if(!receipt){
    const keys=new Set(['applied','action','changed','target','reportId','kind','reportRevision','targetRevision','withheld','targetId','revision','communityId','requestId','userId','decision','grantsMembership','requiresReadmission']);
    const safe=Object.fromEntries(Object.entries(result).filter(([key,v])=>keys.has(key)&&(v===null||['string','number','boolean'].includes(typeof v))));
    await c.query('INSERT INTO site_operation_request(operator_id,request_id,payload_hash,action,target_kind,target_id,reason,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[u.id,input.requestId,hash,input.action,input.kind,input.id,input.reason,JSON.stringify(safe)]);
   }
   return {result,replayed:!!receipt};
  });}
 };
}