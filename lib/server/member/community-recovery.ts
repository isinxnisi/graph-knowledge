import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {activeMember,memberTransaction} from './operations';
import {MemberError} from './http';
const inputSchema=z.strictObject({readmit:z.boolean().default(false),requestId:z.uuidv4(),expectedRevision:z.number().int().positive(),decision:z.enum(['approve','reject']),reason:z.string().trim().min(1).max(500).optional(),actor:z.string().regex(/^[a-zA-Z0-9_.@-]{1,80}$/),caseReference:z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_./:#-]+$/)});
// Shared CLI / authorized Web service: adjudication is not membership.
export async function decideCommunityRecovery(pool:Pool,raw:z.input<typeof inputSchema>,apply=false,client?:PoolClient){
 const input=inputSchema.parse(raw);
 const run=async(c:PoolClient)=>{
  const seed=(await c.query('SELECT user_id,community_id FROM community_recovery WHERE id=$1',[input.requestId])).rows[0];if(!seed)throw new MemberError(404,'NOT_FOUND');
  await activeMember(c,seed.user_id);
  const community=(await c.query('SELECT status FROM community WHERE id=$1 FOR UPDATE',[seed.community_id])).rows[0];
  const r=(await c.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM community_recovery WHERE id=$1 FOR UPDATE',[input.requestId])).rows[0];
  const m=(await c.query('SELECT * FROM community_member WHERE community_id=$1 AND user_id=$2',[seed.community_id,seed.user_id])).rows[0];
  const hasAdmin=(await c.query("SELECT 1 FROM community_member WHERE community_id=$1 AND status='active' AND role='admin'",[seed.community_id])).rowCount;
  if(r.revision!==input.expectedRevision||r.status!=='pending'||!r.unexpired||community?.status!=='archived'||hasAdmin||!m||m.generation!==r.member_generation||!(m.status==='active'||m.role==='admin'&&['left','removed','suspended'].includes(m.status)))throw new MemberError(409,'RECOVERY_UNAVAILABLE');
  if(input.decision==='approve'&&r.readmission_required&&!input.readmit)throw new MemberError(409,'RECOVERY_READMISSION_REQUIRED');
  if(apply){
   await c.query("UPDATE community_recovery SET status=$2,revision=revision+1,case_reference=$3,decided_by=$4,readmission_approved=$5,expires_at=clock_timestamp()+interval '7 days' WHERE id=$1",[r.id,input.decision==='approve'?'approved':'rejected',input.caseReference,input.actor,input.decision==='approve'&&input.readmit]);
   const action=r.readmission_required&&input.decision==='approve'?'recovery-readmit-approve':'recovery-'+input.decision;
   if(input.reason)await c.query("INSERT INTO community_operation(community_id,action,target_id,operator_id,case_reference,reason) VALUES($1,$2,$3,$4,$5,$6)",[seed.community_id,action,r.id,input.actor,input.caseReference,input.reason]);
   else await c.query("INSERT INTO community_operation(community_id,action,target_id,operator_id,case_reference) VALUES($1,$2,$3,$4,$5)",[seed.community_id,action,r.id,input.actor,input.caseReference]);
  }
  return {requestId:r.id,communityId:r.community_id,userId:r.user_id,revision:r.revision,decision:input.decision,applied:apply,grantsMembership:false,requiresReadmission:r.readmission_required};
 };
 return client?run(client):memberTransaction(pool,run);
}
