import {communityAllowance} from './community-rate';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {activeMember,memberTransaction} from './operations';
import {MemberError,memberId,memberInput,memberJson} from './http';
import {communityPage,pageTime} from './community-pagination';
type Helpers={
 actor:(req:Request)=>Promise<{id:string}>;
 identity:(req:Request,required?:boolean)=>Promise<{id:string}|null>;
 context:(c:PoolClient,id:string,user:string|null,write?:boolean)=>Promise<QueryResultRow>;
 admin:(row:QueryResultRow)=>void;writable:(row:QueryResultRow)=>void;
 expected:(row:QueryResultRow,n:number)=>void;
 dto:(r:QueryResultRow)=>unknown;
 bump:(c:PoolClient,id:string,user:string,action:string,target?:string)=>Promise<void>;
};
const revision=z.number().int().positive();
const inviteInput=z.strictObject({expectedRevision:revision,userId:z.uuidv4(),days:z.number().int().min(1).max(30).default(7),readmission:z.boolean().default(false)});
const decisionInput=z.strictObject({expectedRevision:revision});
const notFound=()=>new MemberError(404,'NOT_FOUND');
const changed=()=>new MemberError(409,'INVITATION_CHANGED');
const inviteValid=`i.status='pending' AND i.expires_at>clock_timestamp() AND c.status='active'
 AND EXISTS(SELECT 1 FROM community_member im JOIN "user" iu ON iu.id=im.user_id WHERE im.community_id=i.community_id AND im.user_id=i.issuer_id AND im.status='active' AND im.role='admin' AND im.generation=i.issuer_generation AND iu.active)
 AND COALESCE((SELECT generation FROM community_member tm WHERE tm.community_id=i.community_id AND tm.user_id=i.target_id),0)=i.target_generation`;
const invitationDto=(r:QueryResultRow)=>({id:r.id,communityId:r.community_id,title:r.title_allowed?r.title:null,targetId:r.target_id,revision:r.revision,status:r.status==='pending'?(r.valid?'pending':r.expired?'expired':'unavailable'):r.status,expiresAt:new Date(r.expires_at).toISOString(),readmission:r.readmission});
export function createCommunityContinuity(pool:Pool,h:Helpers,secret:string){
 return {
  async invitationSummary(req:Request){
   const u=(await h.identity(req,true))!;return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);
    const result=await c.query(`SELECT count(*)::int AS count FROM community_invitation i JOIN community c ON c.id=i.community_id WHERE i.target_id=$1 AND ${inviteValid} AND NOT EXISTS(SELECT 1 FROM community_member m WHERE m.community_id=i.community_id AND m.user_id=i.target_id AND m.status='active') AND (i.readmission OR NOT EXISTS(SELECT 1 FROM community_member m WHERE m.community_id=i.community_id AND m.user_id=i.target_id AND m.status IN ('removed','suspended')))`,[u.id]);
    return memberJson({pendingCount:result.rows[0].count});
   });
  },
  async invitations(req:Request,rawCid?:string){
   const u=(await h.identity(req,true))!;return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);let policy='',cid:string|undefined,community:unknown;
    if(rawCid){cid=memberId(rawCid);const row=await h.context(c,cid,u.id);h.admin(row);policy=String(row.revision);community=h.dto(row);}
    const page=await communityPage(c,req,secret,cid?'sent:'+cid:'invitations',u.id,policy,
     `SELECT i.*,c.title,(${inviteValid} OR (c.status<>'suspended' AND EXISTS(SELECT 1 FROM community_member vm WHERE vm.community_id=c.id AND vm.user_id=$2 AND vm.status='active'))) AS title_allowed,(${inviteValid}) AS valid,i.expires_at<=clock_timestamp() AS expired,i.id AS page_id,${pageTime('i.created_at')} FROM community_invitation i JOIN community c ON c.id=i.community_id WHERE ${cid?'i.community_id=$1':'i.target_id=$1'}`,[cid??u.id,u.id],'i.created_at','i.id');
    return memberJson({community,invitations:page.rows.map(invitationDto),nextCursor:page.nextCursor,partial:page.partial});
   });
  },
  async invite(req:Request,rawCid:string){
   const cid=memberId(rawCid),u=await h.actor(req),input=await memberInput(req,inviteInput);
   return memberTransaction(pool,async c=>{
    for(const uid of [...new Set([u.id,input.userId])].sort()){try{await activeMember(c,uid);}catch(e){if(uid!==u.id&&e instanceof MemberError&&e.status===401)throw new MemberError(400,'TARGET_UNAVAILABLE');throw e;}}const row=await h.context(c,cid,u.id,true);h.admin(row);h.writable(row);h.expected(row,input.expectedRevision);
    const target=(await c.query('SELECT active FROM "user" WHERE id=$1',[input.userId])).rows[0];if(!target?.active||input.userId===u.id)throw new MemberError(400,'TARGET_UNAVAILABLE');
    const prior=(await c.query('SELECT * FROM community_member WHERE community_id=$1 AND user_id=$2',[cid,input.userId])).rows[0];
    if(prior?.status==='active')throw new MemberError(409,'ALREADY_MEMBER');
    if(['removed','suspended'].includes(prior?.status)&&!input.readmission)throw new MemberError(409,'READMISSION_REQUIRED');
    await communityAllowance(c,u.id,'invitation');
    await c.query("UPDATE community_invitation SET status='revoked',revision=revision+1 WHERE community_id=$1 AND target_id=$2 AND status='pending'",[cid,input.userId]);
    const issuer=(await c.query('SELECT generation FROM community_member WHERE community_id=$1 AND user_id=$2',[cid,u.id])).rows[0];
    const id=randomUUID();await c.query("INSERT INTO community_invitation(id,community_id,target_id,issuer_id,issuer_generation,target_generation,expires_at,readmission) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+$7*interval '1 day',$8)",[id,cid,input.userId,u.id,issuer.generation,prior?.generation??0,input.days,input.readmission]);
    await h.bump(c,cid,u.id,'invite',id);return memberJson({id},201);
   });
  },
  async decideInvitation(req:Request,rawId:string,action:'accept'|'decline'|'revoke'){
   const id=memberId(rawId),u=await h.actor(req),input=await memberInput(req,decisionInput);
   return memberTransaction(pool,async c=>{
    await activeMember(c,u.id);const seed=(await c.query('SELECT community_id,target_id FROM community_invitation WHERE id=$1',[id])).rows[0];if(!seed)throw notFound();
    // Serialize with all membership changes before evaluating the invitation.
    const row=(await c.query('SELECT * FROM community WHERE id=$1 FOR UPDATE',[seed.community_id])).rows[0];if(!row||row.status==='suspended')throw notFound();
    if(action==='revoke'){if((await h.context(c,row.id,u.id,true)).role!=='admin')throw notFound();}
    else if(seed.target_id!==u.id)throw notFound();
    const i=(await c.query(`SELECT i.*,(${inviteValid}) AS valid FROM community_invitation i JOIN community c ON c.id=i.community_id WHERE i.id=$1 FOR UPDATE OF i`,[id])).rows[0];
    if(i.revision!==input.expectedRevision)throw changed();
    if(i.status!=='pending')throw changed();
    if(action==='accept'){
     if(!i.valid)throw new MemberError(409,'INVITATION_UNAVAILABLE');
     const m=(await c.query('SELECT * FROM community_member WHERE community_id=$1 AND user_id=$2',[row.id,u.id])).rows[0];
     if(m?.status==='active'||(['removed','suspended'].includes(m?.status)&&!i.readmission))throw changed();
     await c.query("INSERT INTO community_member(community_id,user_id,role,status) VALUES($1,$2,'member','active') ON CONFLICT(community_id,user_id) DO UPDATE SET status='active',role='member',generation=community_member.generation+1,admin_offered=false",[row.id,u.id]);
     await c.query("UPDATE community_invitation SET status='revoked',revision=revision+1 WHERE community_id=$1 AND target_id=$2 AND status='pending' AND id<>$3",[row.id,u.id,id]);
     await c.query("UPDATE community_recovery SET status='cancelled',revision=revision+1 WHERE community_id=$1 AND user_id=$2 AND status IN ('pending','approved')",[row.id,u.id]);
    }
    await c.query('UPDATE community_invitation SET status=$2,revision=revision+1 WHERE id=$1',[id,action==='accept'?'accepted':action==='decline'?'declined':'revoked']);
    await h.bump(c,row.id,u.id,'invitation-'+action,id);return memberJson({changed:true,communityId:action==='accept'?row.id:undefined});
   });
  },
  async participation(req:Request){
   const u=(await h.identity(req,true))!;return memberTransaction(pool,async c=>{await activeMember(c,u.id);
    const page=await communityPage(c,req,secret,'participation',u.id,'',`SELECT m.*,c.id AS page_id,c.title,c.visibility,c.status AS community_status,c.status='archived' AND NOT EXISTS(SELECT 1 FROM community_member a WHERE a.community_id=c.id AND a.status='active' AND a.role='admin') AS orphan FROM community_member m JOIN community c ON c.id=m.community_id WHERE m.user_id=$1`,[u.id],null,'c.id',false);
    return memberJson({participation:page.rows.map(r=>({communityId:r.community_id,title:r.community_status!=='suspended'&&(r.visibility==='public'||r.status==='active')?r.title:null,status:r.status,role:r.role,canRequestRecovery:r.orphan&&(r.status==='active'||r.role==='admin'&&['left','removed','suspended'].includes(r.status))})),nextCursor:page.nextCursor,partial:page.partial});
   });
  },
  async recoveries(req:Request){const u=(await h.identity(req,true))!;return memberTransaction(pool,async c=>{await activeMember(c,u.id);const page=await communityPage(c,req,secret,'recoveries',u.id,'',`SELECT r.id,r.community_id,r.status,r.revision,r.readmission_required,r.expires_at,r.expires_at>clock_timestamp() AS unexpired,r.id AS page_id,${pageTime('r.created_at')} FROM community_recovery r WHERE r.user_id=$1`,[u.id],'r.created_at','r.id');return memberJson({recoveries:page.rows.map(r=>({id:r.id,communityId:r.community_id,readmissionRequired:r.readmission_required,status:!r.unexpired&&['pending','approved'].includes(r.status)?'expired':r.status,revision:r.revision})),nextCursor:page.nextCursor,partial:page.partial});});},
  async requestRecovery(req:Request,rawCid:string){const cid=memberId(rawCid),u=await h.actor(req);await memberInput(req,z.strictObject({}));return memberTransaction(pool,async c=>{await activeMember(c,u.id);const row=(await c.query('SELECT * FROM community WHERE id=$1 FOR UPDATE',[cid])).rows[0];const m=(await c.query('SELECT * FROM community_member WHERE community_id=$1 AND user_id=$2',[cid,u.id])).rows[0];if(!row||row.status!=='archived'||!m||!(m.status==='active'||m.role==='admin'&&['left','removed','suspended'].includes(m.status)))throw notFound();
   if((await c.query("SELECT 1 FROM community_member WHERE community_id=$1 AND role='admin' AND status='active'",[cid])).rowCount)throw new MemberError(409,'ADMIN_PRESENT');
   await c.query("UPDATE community_recovery SET status='cancelled',revision=revision+1 WHERE community_id=$1 AND user_id=$2 AND status IN ('pending','approved') AND expires_at<=clock_timestamp()",[cid,u.id]);
   const old=(await c.query("SELECT id FROM community_recovery WHERE community_id=$1 AND user_id=$2 AND status IN ('pending','approved')",[cid,u.id])).rows[0];if(old)return memberJson({id:old.id});
   const id=randomUUID();await c.query('INSERT INTO community_recovery(id,community_id,user_id,member_generation,readmission_required) VALUES($1,$2,$3,$4,$5)',[id,cid,u.id,m.generation,['removed','suspended'].includes(m.status)]);await h.bump(c,cid,u.id,'recovery-request',id);return memberJson({id},201);
  });},
  async acceptRecovery(req:Request,rawId:string,action:'accept'|'cancel'){
   const id=memberId(rawId),u=await h.actor(req),input=await memberInput(req,decisionInput);return memberTransaction(pool,async c=>{await activeMember(c,u.id);const seed=(await c.query('SELECT community_id FROM community_recovery WHERE id=$1 AND user_id=$2',[id,u.id])).rows[0];if(!seed)throw notFound();const row=(await c.query('SELECT * FROM community WHERE id=$1 FOR UPDATE',[seed.community_id])).rows[0];const r=(await c.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM community_recovery WHERE id=$1 FOR UPDATE',[id])).rows[0];if(r.revision!==input.expectedRevision||!['pending','approved'].includes(r.status))throw changed();
    if(action==='accept'){
     const m=(await c.query('SELECT * FROM community_member WHERE community_id=$1 AND user_id=$2',[row.id,u.id])).rows[0];
     if(r.status!=='approved'||r.readmission_required&&!r.readmission_approved||!r.unexpired||row.status!=='archived'||!m||m.generation!==r.member_generation||!(m.status==='active'||m.role==='admin'&&['left','removed','suspended'].includes(m.status))||(await c.query("SELECT 1 FROM community_member WHERE community_id=$1 AND role='admin' AND status='active'",[row.id])).rowCount)throw new MemberError(409,'RECOVERY_UNAVAILABLE');
     // Continuing members retain their valid audience; readmission starts a new generation.
     await c.query("UPDATE community_member SET role='admin',generation=generation+CASE WHEN status='active' THEN 0 ELSE 1 END,status='active',admin_offered=false WHERE community_id=$1 AND user_id=$2",[row.id,u.id]);
     await c.query("UPDATE community_recovery SET status='cancelled',revision=revision+1 WHERE community_id=$1 AND status IN ('pending','approved') AND id<>$2",[row.id,id]);
    }
    await c.query('UPDATE community_recovery SET status=$2,revision=revision+1 WHERE id=$1',[id,action==='accept'?'consumed':'cancelled']);await h.bump(c,row.id,u.id,'recovery-'+action,id);return memberJson({changed:true});
   });
  }
 };
}
