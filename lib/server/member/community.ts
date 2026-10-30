import {publicProfileImage} from "../../domain/profile-image";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import type { DatasetMode } from "../../domain/dataset";
import {createCommunityCapsules,pinPublicCapsuleListings} from "./community-capsules";
import {publicProfilesEnabled} from "./public-profiles";
import {createCommunitySafety,readableCommunityThread,safetyAudit} from './community-safety';
import {communityAllowance} from './community-rate';
import {createCommunityContinuity} from "./community-continuity";
import {communityPage,pageTime} from "./community-pagination";
import { activeMember, memberTransaction } from "./operations";
import { assertMemberOrigin, MemberError, memberId, memberInput, memberJson } from "./http";

const createSchema = z.strictObject({ requestId:z.uuidv4(), title:z.string().trim().min(1).max(100), description:z.string().trim().max(1000), visibility:z.enum(["public","members"]) });
const revisionSchema = z.strictObject({ expectedRevision:z.number().int().positive() });
const threadSchema = z.strictObject({ requestId:z.uuidv4(), expectedRevision:z.number().int().positive(), title:z.string().trim().min(1).max(120), body:z.string().trim().min(1).max(2000), audience:z.enum(["public","cohort"]) });
const postSchema = z.strictObject({ requestId:z.uuidv4(), expectedRevision:z.number().int().positive(), body:z.string().trim().min(1).max(2000) });
const settingsSchema = revisionSchema.extend({ title:z.string().trim().min(1).max(100), description:z.string().trim().max(1000), visibility:z.enum(["public","members"]) });
const memberSchema = revisionSchema.extend({ userId:z.uuidv4() });
type Owner = (request:Request)=>Promise<{id:string}>;
async function writeMember(c:PoolClient,id:string){if((await c.query('SELECT active FROM "user" WHERE id=$1 FOR UPDATE',[id])).rows[0]?.active!==true)throw new MemberError(401,'UNAUTHENTICATED');}
async function publicAuthors(c:PoolClient, rows:QueryResultRow[]) {
 if(!publicProfilesEnabled())return new Map<string,QueryResultRow>();
 const ids=[...new Set(rows.map(p=>p.author_id).filter(Boolean))];
 const result=await c.query('SELECT p.user_id,p.handle,p.display_name,p.icon,to_jsonb(p) AS profile_data,u.image AS provider_image FROM public_profile p JOIN "user" u ON u.id=p.user_id WHERE p.user_id=ANY($1::uuid[]) AND u.active=true',[ids]);
 return new Map(result.rows.map(p=>[p.user_id,p]));
}
async function withCreators(c:PoolClient,rows:QueryResultRow[],field:string):Promise<QueryResultRow[]> {
 const authors=await publicAuthors(c,rows.map(r=>({author_id:r[field]})));
 return rows.map(r=>{const p=authors.get(r[field]);return {...r,creator:p?{handle:p.handle,displayName:p.display_name,icon:p.icon,...(p.profile_data.official?{official:true}:{}),imageUrl:publicProfileImage(p.icon,p.provider_image)}:null};});
}
const denied=()=>new MemberError(404,"NOT_FOUND");
const stale=()=>new MemberError(409,"COMMUNITY_CHANGED");
const communityDto=(r:QueryResultRow)=>({id:r.id,title:r.title,description:r.description,visibility:r.visibility,status:r.status,revision:r.revision,role:r.role??null,adminOffered:r.admin_offered??false,membershipGeneration:r.generation??null,lastAdmin:r.last_admin??false,...(r.creator!==undefined?{creator:r.creator}:{})});


export function createCommunityService(pool:Pool, origin:string, owner:Owner, secret:string, dataset:DatasetMode = "demo") {
  async function identity(req:Request, required=false) {
    try { return await owner(req); }
    catch(e) { if(!required && e instanceof MemberError && e.status===401 && !req.headers.has('x-member-user'))return null; throw e; }
  }
  async function actor(req:Request) {
    assertMemberOrigin(req,origin);
    if(!req.headers.has('x-member-user'))throw new MemberError(400,'EXPECTED_USER_REQUIRED');
    return (await identity(req,true))!;
  }
  async function context(c:PoolClient,id:string,userId:string|null,write=false) {
    const row=(await c.query(`SELECT * FROM community WHERE id=$1 FOR ${write?'UPDATE':'SHARE'}`,[id])).rows[0];
    if(!row || row.status==='suspended')throw denied();
    const m=userId?(await c.query("SELECT role,admin_offered,generation FROM community_member WHERE community_id=$1 AND user_id=$2 AND status='active'",[id,userId])).rows[0]:null;
    if(row.visibility!=='public'&&!m)throw denied();
    const last_admin=m?.role==='admin'&&Number((await c.query("SELECT count(*) FROM community_member WHERE community_id=$1 AND status='active' AND role='admin'",[id])).rows[0].count)===1;
    return {...row,...m,last_admin};
  }
  function writable(c:QueryResultRow){if(c.status!=='active')throw new MemberError(409,'COMMUNITY_ARCHIVED');}
  function member(c:QueryResultRow){if(!c.role)throw new MemberError(403,'MEMBERSHIP_REQUIRED');}
  function admin(c:QueryResultRow){if(c.role!=='admin')throw new MemberError(403,'ADMIN_REQUIRED');}
  function expected(c:QueryResultRow,n:number){if(c.revision!==n)throw stale();}
  async function bump(c:PoolClient,id:string,uid:string,action:string,target?:string){await c.query('UPDATE community SET revision=revision+1 WHERE id=$1',[id]);await c.query('INSERT INTO community_operation(community_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',[id,uid,action,target??null]);}
  async function receipt(c:PoolClient,uid:string,requestId:string,value:unknown){const hash=createHash('sha256').update(JSON.stringify(value)).digest('hex');const old=(await c.query('SELECT hash,result_id FROM community_request WHERE user_id=$1 AND request_id=$2',[uid,requestId])).rows[0];if(old&&old.hash!==hash)throw new MemberError(409,'REQUEST_CONFLICT');return {hash,id:old?.result_id as string|undefined};}
  async function saveReceipt(c:PoolClient,uid:string,rid:string,hash:string,id:string){await c.query('INSERT INTO community_request(user_id,request_id,hash,result_id) VALUES($1,$2,$3,$4)',[uid,rid,hash,id]);}
  async function cohort(c:PoolClient,threadId:string,cid:string){await c.query("INSERT INTO community_audience_member(thread_id,user_id,generation) SELECT $1,user_id,generation FROM community_member WHERE community_id=$2 AND status='active' ON CONFLICT DO NOTHING",[threadId,cid]);}
  const capsuleService = createCommunityCapsules(pool,{actor,identity,context,writable,member,expected},secret,dataset);
  return {
    ...capsuleService,
    ...createCommunitySafety(pool,{actor,identity,context,admin,expected,dto:communityDto},secret),
    ...createCommunityContinuity(pool,{actor,identity,context,admin,writable,expected,bump,dto:async(row,c)=>communityDto((await withCreators(c,[row],"created_by"))[0])},secret),
    async list(req:Request){const user=await identity(req);const mine=new URL(req.url).searchParams.get('mine')==='1';if(mine&&!user)throw new MemberError(401,'UNAUTHENTICATED');return memberTransaction(pool,async c=>{if(user)await activeMember(c,user.id);
      const page=await communityPage(c,req,secret,'directory:'+mine,user?.id??null,'',`SELECT c.*,m.role,m.admin_offered,c.id AS page_id,${pageTime('c.created_at')} FROM community c LEFT JOIN community_member m ON m.community_id=c.id AND m.user_id=$1 AND m.status='active' WHERE c.status<>'suspended' AND (c.visibility='public' OR m.user_id IS NOT NULL) AND (NOT $2::boolean OR m.user_id IS NOT NULL)`,[user?.id??null,mine],'c.created_at','c.id');
      return memberJson({communities:(await withCreators(c,page.rows,"created_by")).map(communityDto),nextCursor:page.nextCursor,partial:page.partial});});},
    async create(req:Request){const user=await actor(req),input=await memberInput(req,createSchema);return memberTransaction(pool,async c=>{await writeMember(c,user.id);const r=await receipt(c,user.id,input.requestId,['create',input]);if(r.id)return memberJson({community:communityDto(await context(c,r.id,user.id))});const count=await c.query("SELECT count(*) FROM community_member WHERE user_id=$1 AND role='admin' AND status='active'",[user.id]);if(Number(count.rows[0].count)>=20)throw new MemberError(422,'COMMUNITY_LIMIT');await communityAllowance(c,user.id,'createHour');await communityAllowance(c,user.id,'createDay');const id=randomUUID();await c.query('INSERT INTO community(id,title,description,visibility,created_by) VALUES($1,$2,$3,$4,$5)',[id,input.title,input.description,input.visibility,user.id]);await c.query("INSERT INTO community_member(community_id,user_id,role,status) VALUES($1,$2,'admin','active')",[id,user.id]);await saveReceipt(c,user.id,input.requestId,r.hash,id);return memberJson({community:communityDto(await context(c,id,user.id))},201);});},
    async read(req:Request,rawId:string){const id=memberId(rawId),user=await identity(req);return memberTransaction(pool,async c=>{if(user)await activeMember(c,user.id);const row=await context(c,id,user?.id??null);
      const page=await communityPage(c,req,secret,'threads:'+id,user?.id??null,String(row.revision),`SELECT t.id,t.title,t.audience,t.closed,t.revision,t.author_id,(SELECT count(*)::int FROM community_post p WHERE p.thread_id=t.id) AS post_count,(SELECT max(created_at) FROM community_post p WHERE p.thread_id=t.id) AS updated_at,t.id AS page_id,${pageTime('t.created_at')} FROM community_thread t WHERE t.community_id=$1 AND ${readableCommunityThread}`,[id,user?.id??null],'t.created_at','t.id');
      const people=row.role==='admin'?await communityPage(c,req,secret,'members',user!.id,id+':'+row.revision,`SELECT m.user_id AS id,m.user_id AS author_id,u.name,m.role,m.admin_offered,m.user_id AS page_id FROM community_member m JOIN "user" u ON u.id=m.user_id WHERE m.community_id=$1 AND m.status='active'`,[id],null,'m.user_id',false):null;
      return memberJson({community:communityDto((await withCreators(c,[row],"created_by"))[0]),threads:(await withCreators(c,page.rows,"author_id")).map(({id,title,audience,closed,revision,post_count,updated_at,creator})=>({id,title,audience,closed,revision,postCount:post_count,updatedAt:updated_at,creator})),nextCursor:page.nextCursor,partial:page.partial,members:people?(await withCreators(c,people.rows,"id")).map(({id,name,role,admin_offered,creator})=>({id,name:creator?.displayName??name,role,admin_offered,creator})):[],membersCursor:people?.nextCursor??null,membersPartial:people?.partial??false});});},
    async change(req:Request,rawId:string,action:string){const id=memberId(rawId),user=await actor(req);const input=await memberInput(req,action==='settings'?settingsSchema:['remove','offer-admin','demote-admin','cancel-admin-offer'].includes(action)?memberSchema:revisionSchema);return memberTransaction(pool,async c=>{await activeMember(c,user.id);const row=await context(c,id,user.id,true);expected(row,input.expectedRevision);
      if(action==='join'){writable(row);if(row.visibility!=='public')throw denied();if(row.role)throw stale();const prior=(await c.query('SELECT status FROM community_member WHERE community_id=$1 AND user_id=$2',[id,user.id])).rows[0];if(prior?.status==='removed'||prior?.status==='suspended')throw new MemberError(403,'REJOIN_BLOCKED');await c.query("INSERT INTO community_member(community_id,user_id,role,status) VALUES($1,$2,'member','active') ON CONFLICT(community_id,user_id) DO UPDATE SET status='active',role='member',generation=community_member.generation+1,admin_offered=false",[id,user.id]);}
      else if(action==='leave'){member(row);await c.query("UPDATE community_member SET status='left',generation=generation+1,admin_offered=false WHERE community_id=$1 AND user_id=$2",[id,user.id]);await archiveWithoutAdmin(c,id);}
      else if(action==='accept-admin'){writable(row);member(row);if(!row.admin_offered)throw new MemberError(403,'ADMIN_OFFER_REQUIRED');await c.query("UPDATE community_member SET role='admin',admin_offered=false WHERE community_id=$1 AND user_id=$2",[id,user.id]);}
      else {admin(row);if(action==='archive'||action==='reopen'){await c.query('UPDATE community SET status=$2 WHERE id=$1',[id,action==='archive'?'archived':'active']);}
        else if(action==='settings'){const v=settingsSchema.parse(input);if(row.visibility==='public'&&v.visibility==='members'){await pinPublicCapsuleListings(c,id);const tids=await c.query("SELECT id FROM community_thread WHERE community_id=$1 AND audience='public' ORDER BY id",[id]);for(const t of tids.rows)await cohort(c,t.id,id);await c.query("UPDATE community_thread SET audience='cohort',revision=revision+1 WHERE community_id=$1 AND audience='public'",[id]);}await c.query('UPDATE community SET title=$2,description=$3,visibility=$4 WHERE id=$1',[id,v.title,v.description,v.visibility]);}
        else if(['remove','offer-admin','demote-admin','cancel-admin-offer'].includes(action)){const v=memberSchema.parse(input);if(v.userId===user.id&&action!=='demote-admin')throw new MemberError(400,'USE_LEAVE');const target=(await c.query("SELECT role FROM community_member WHERE community_id=$1 AND user_id=$2 AND status='active'",[id,v.userId])).rows[0];if(!target)throw denied();if(action==='remove')await c.query("UPDATE community_member SET status='removed',generation=generation+1,admin_offered=false WHERE community_id=$1 AND user_id=$2",[id,v.userId]);else if(action==='offer-admin'){writable(row);await c.query('UPDATE community_member SET admin_offered=true WHERE community_id=$1 AND user_id=$2',[id,v.userId]);}else if(action==='cancel-admin-offer')await c.query('UPDATE community_member SET admin_offered=false WHERE community_id=$1 AND user_id=$2',[id,v.userId]);else {await c.query("UPDATE community_member SET role='member',admin_offered=false WHERE community_id=$1 AND user_id=$2",[id,v.userId]);await archiveWithoutAdmin(c,id);}}
        else throw denied();}
      if(['leave','remove','demote-admin'].includes(action)){const target=action==='leave'?user.id:memberSchema.parse(input).userId;await invalidateCommunityGrants(c,id,target);}
      await bump(c,id,user.id,action);return memberJson({changed:true});});},
    async createThread(req:Request,rawId:string){const id=memberId(rawId),user=await actor(req),input=await memberInput(req,threadSchema);return memberTransaction(pool,async c=>{await writeMember(c,user.id);const row=await context(c,id,user.id,true);writable(row);member(row);const r=await receipt(c,user.id,input.requestId,['thread',id,input]);if(r.id){const visible=await c.query(`SELECT t.id FROM community_thread t WHERE t.id=$1 AND ${readableCommunityThread}`,[r.id,user.id]);if(!visible.rowCount)throw denied();return memberJson({id:r.id});}expected(row,input.expectedRevision);if(row.visibility==='members'&&input.audience==='public')throw new MemberError(400,'PUBLIC_THREAD_NOT_ALLOWED');await communityAllowance(c,user.id,'thread');await communityAllowance(c,user.id,'post');const tid=randomUUID();await c.query('INSERT INTO community_thread(id,community_id,author_id,title,audience) VALUES($1,$2,$3,$4,$5)',[tid,id,user.id,input.title,input.audience]);if(input.audience==='cohort')await cohort(c,tid,id);await c.query('INSERT INTO community_post(thread_id,author_id,body) VALUES($1,$2,$3)',[tid,user.id,input.body]);await saveReceipt(c,user.id,input.requestId,r.hash,tid);return memberJson({id:tid},201);});},
    async thread(req:Request,rawId:string){const id=memberId(rawId),user=await identity(req);return memberTransaction(pool,async c=>{if(user)await activeMember(c,user.id);const seed=(await c.query('SELECT community_id FROM community_thread WHERE id=$1',[id])).rows[0];if(!seed)throw denied();const row=await context(c,seed.community_id,user?.id??null);const t=(await c.query(`SELECT t.* FROM community_thread t WHERE t.id=$1 AND ${readableCommunityThread}`,[id,user?.id??null])).rows[0];if(!t)throw denied();const page=await communityPage(c,req,secret,'posts:'+id,user?.id??null,row.revision+':'+t.revision,`SELECT p.id,p.body,p.status,p.author_id,p.revision,p.hidden_by,u.name,p.id AS page_id,${pageTime('p.created_at')} FROM community_post p LEFT JOIN "user" u ON u.id=p.author_id WHERE p.thread_id=$1`,[id],'p.created_at','p.id',false,new URL(req.url).searchParams.has('post')?memberId(new URL(req.url).searchParams.get('post')!):undefined);const authors=await publicAuthors(c,page.rows);return memberJson({community:communityDto((await withCreators(c,[row],"created_by"))[0]),thread:{id:t.id,title:t.title,revision:t.revision,closed:t.closed,audience:t.audience,creator:(await withCreators(c,[t],"author_id"))[0].creator},capsules:await capsuleService.threadCapsules(c,id,user?.id??null),posts:page.rows.map(p=>({id:p.id,createdAt:p.page_time,status:p.status,revision:p.revision,hiddenBy:p.hidden_by,canWithdraw:p.author_id===user?.id&&p.status!=='withdrawn',body:p.status==='visible'?p.body:'',...{name:p.status==='visible'?(authors.get(p.author_id)?.display_name??null):null,author:p.status==='visible'&&authors.has(p.author_id)?{handle:authors.get(p.author_id)!.handle,icon:authors.get(p.author_id)!.icon,...(authors.get(p.author_id)!.profile_data.official?{official:true}:{}),imageUrl:publicProfileImage(authors.get(p.author_id)!.icon,authors.get(p.author_id)!.provider_image)}:null}})),nextCursor:page.nextCursor,partial:page.partial});});},
    async post(req:Request,rawId:string){const id=memberId(rawId),user=await actor(req),input=await memberInput(req,postSchema);return memberTransaction(pool,async c=>{await writeMember(c,user.id);const seed=(await c.query('SELECT community_id FROM community_thread WHERE id=$1',[id])).rows[0];if(!seed)throw denied();const row=await context(c,seed.community_id,user.id,true);writable(row);member(row);const t=(await c.query(`SELECT t.* FROM community_thread t WHERE t.id=$1 AND ${readableCommunityThread} FOR UPDATE`,[id,user.id])).rows[0];if(!t)throw denied();if(t.closed)throw new MemberError(409,'THREAD_CLOSED');expected(t,input.expectedRevision);const r=await receipt(c,user.id,input.requestId,['post',id,input]);if(r.id)return memberJson({id:r.id});await communityAllowance(c,user.id,'post');const pid=randomUUID();await c.query('INSERT INTO community_post(id,thread_id,author_id,body) VALUES($1,$2,$3,$4)',[pid,id,user.id,input.body]);await saveReceipt(c,user.id,input.requestId,r.hash,pid);return memberJson({id:pid},201);});},
    async closeThread(req:Request,rawId:string){const id=memberId(rawId),user=await actor(req),input=await memberInput(req,revisionSchema.extend({closed:z.boolean()}));return memberTransaction(pool,async c=>{await activeMember(c,user.id);const seed=(await c.query('SELECT community_id FROM community_thread WHERE id=$1',[id])).rows[0];if(!seed)throw denied();const row=await context(c,seed.community_id,user.id,true);admin(row);const t=(await c.query(`SELECT t.* FROM community_thread t WHERE t.id=$1 AND ${readableCommunityThread} FOR UPDATE`,[id,user.id])).rows[0];if(!t)throw denied();expected(t,input.expectedRevision);await c.query('UPDATE community_thread SET closed=$2,revision=revision+1 WHERE id=$1',[id,input.closed]);await bump(c,seed.community_id,user.id,'thread-close',id);return memberJson({changed:true});});},
    async ownPosts(req:Request){const user=(await identity(req,true))!;return memberTransaction(pool,async c=>{
      await activeMember(c,user.id);
      // A LEFT JOIN preserves the author's withdrawal history after losing
      // access, while withholding all conversation identifiers and titles.
      const readable=readableCommunityThread.replaceAll('$2','$1');
      const page=await communityPage(c,req,secret,'own-posts',user.id,'',`SELECT p.id,p.body,p.status,t.id AS thread_id,t.title AS thread_title,place.title AS community_title,p.id AS page_id,${pageTime('p.created_at')} FROM community_post p LEFT JOIN community_thread t ON t.id=p.thread_id AND ${readable} AND EXISTS(SELECT 1 FROM community c WHERE c.id=t.community_id AND c.status<>'suspended' AND (c.visibility='public' OR EXISTS(SELECT 1 FROM community_member m WHERE m.community_id=c.id AND m.user_id=$1 AND m.status='active'))) LEFT JOIN community place ON place.id=t.community_id WHERE p.author_id=$1`,[user.id],'p.created_at','p.id');
      return memberJson({posts:page.rows.map(p=>({id:p.id,status:p.status,createdAt:p.page_time,body:p.status==='visible'?p.body:'',readable:!!p.thread_id,...(p.thread_id?{threadId:p.thread_id,threadTitle:p.thread_title,communityTitle:p.community_title}:{})})),nextCursor:page.nextCursor,partial:page.partial});
    });},
    async withdraw(req:Request,rawId:string){
     const user=await actor(req),id=memberId(rawId);await memberInput(req,z.strictObject({}));
     return memberTransaction(pool,async c=>{
      await activeMember(c,user.id);
      const seed=(await c.query('SELECT t.community_id FROM community_post p JOIN community_thread t ON t.id=p.thread_id WHERE p.id=$1 AND p.author_id=$2',[id,user.id])).rows[0];if(!seed)throw denied();
      // Own withdrawal remains possible after leaving or site suspension, but
      // follows Community -> Post order to serialize with moderation.
      await c.query('SELECT id FROM community WHERE id=$1 FOR UPDATE',[seed.community_id]);
      const result=await c.query("UPDATE community_post SET body='',status='withdrawn',revision=revision+1 WHERE id=$1 AND author_id=$2 AND status<>'withdrawn' RETURNING id",[id,user.id]);
      if(result.rowCount){await c.query('UPDATE community SET revision=revision+1 WHERE id=$1',[seed.community_id]);await safetyAudit(c,seed.community_id,'post-withdraw',id,'post','author request',{user:user.id});}
      return memberJson({changed:true});
     });
    }
  };
}
export async function archiveWithoutAdmin(c:PoolClient,id:string){await c.query("UPDATE community SET status='archived' WHERE id=$1 AND status='active' AND NOT EXISTS(SELECT 1 FROM community_member WHERE community_id=$1 AND status='active' AND role='admin')",[id]);}
// Runs inside existing account lifecycle transaction, after the User row lock.
// Old databases without C1 remain valid; no automatic migration.
export async function revokeCommunityMember(c:PoolClient,uid:string,erase=false){
 if(!(await c.query("SELECT to_regclass('community') AS table_name")).rows[0].table_name)return;
 const continuity=(await c.query("SELECT to_regclass('community_invitation') AS present")).rows[0].present;
 const ids=(await c.query("SELECT c.id FROM community c WHERE EXISTS(SELECT 1 FROM community_member m WHERE m.community_id=c.id AND m.user_id=$1)"+(continuity?" OR EXISTS(SELECT 1 FROM community_invitation i WHERE i.community_id=c.id AND (i.target_id=$1 OR i.issuer_id=$1) AND i.status='pending')":'')+" ORDER BY c.id FOR UPDATE",[uid])).rows;
 for(const row of ids){await invalidateCommunityGrants(c,row.id,uid);await c.query("UPDATE community_member SET status='suspended',generation=generation+1,admin_offered=false WHERE community_id=$1 AND user_id=$2",[row.id,uid]);await archiveWithoutAdmin(c,row.id);await c.query('UPDATE community SET revision=revision+1 WHERE id=$1',[row.id]);}
 if(erase){
  if((await c.query("SELECT to_regclass('community_capsule_listing') AS ready")).rows[0].ready)await c.query("UPDATE community_capsule_listing SET description='',status='withdrawn',thread_id=NULL,revision=revision+1 WHERE owner_user_id=$1",[uid]);
  const safety=(await c.query("SELECT to_regclass('community_report') AS present")).rows[0].present;
  if(safety)await c.query("UPDATE community_operation SET reason='[withdrawn]' WHERE actor_id=$1 AND reason<>''",[uid]);
  if(safety)await c.query("UPDATE community_report SET detail='[withdrawn]',status='dismissed',revision=revision+1 WHERE reporter_id=$1",[uid]);
  await c.query("UPDATE community_post SET body='',status='withdrawn',"+(safety?"revision=revision+1,":"")+"author_id=NULL WHERE author_id=$1",[uid]);
  await c.query("UPDATE community_thread SET title='[withdrawn]',author_id=NULL,revision=revision+1 WHERE author_id=$1",[uid]);
 }
}

export async function invalidateCommunityGrants(c:PoolClient,cid:string,uid:string){
 if(!(await c.query("SELECT to_regclass('community_invitation') AS present")).rows[0].present)return;
 await c.query("UPDATE community_invitation SET status='revoked',revision=revision+1 WHERE community_id=$1 AND (target_id=$2 OR issuer_id=$2) AND status='pending'",[cid,uid]);
 await c.query("UPDATE community_recovery SET status='cancelled',revision=revision+1 WHERE community_id=$1 AND user_id=$2 AND status IN ('pending','approved')",[cid,uid]);
}
