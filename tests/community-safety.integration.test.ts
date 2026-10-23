import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startMemberOidc} from './support/member-oidc';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {operateCommunitySafety,communityReportQueue} from '../lib/server/member/community-site-safety';
import {operateMember} from '../lib/server/member/operations';
vi.mock('server-only',()=>({}));
import {memberRuntime} from '../lib/server/member/runtime';
import * as authRoute from '../app/api/auth/[...all]/route';
import * as route from '../app/api/communities/[[...path]]/route';
const origin='http://127.0.0.1:3221';
function request(path: string, cookie = "", method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}${path}`, { method, headers: { cookie, origin, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function jar() {
  const cookies = new Map<string, string>();
  return {
    receive(response: Response) {
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";")[0];
        const index = pair.indexOf("=");
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
    },
    get value() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
  };
}
async function login(identity: string, mode = "valid") {
  const cookies = jar();
  const start = await authRoute.POST(request("/api/auth/sign-in/social", "", "POST", { provider: "fixture", callbackURL: "/", disableRedirect: true }));
  expect(start.status).toBe(200);
  cookies.receive(start);
  const authorization = new URL((await start.json()).url);
  authorization.searchParams.set("fixture_identity", identity);
  authorization.searchParams.set("fixture_mode", mode);
  const consent = await fetch(authorization, { redirect: "manual" });
  expect(consent.status).toBe(302);
  const callback = await authRoute.GET(request(new URL(consent.headers.get("location")!).pathname + new URL(consent.headers.get("location")!).search, cookies.value));
  cookies.receive(callback);
  return { cookies, callback };
}

let issuer:Awaited<ReturnType<typeof startMemberOidc>>;
type Person={cookie:string,id:string};let a:Person,b:Person,d:Person;
async function person(name:string){const x=await login(name);const r=await memberRuntime().service.profile(request('/api/member/profile',x.cookies.value));return {cookie:x.cookies.value,id:(await r.json()).user.id};}
const call=(path:string,who?:Person,body?:unknown)=>{const req=request('/api/communities'+path,who?.cookie??'',body===undefined?'GET':'POST',body,who?{'x-member-user':who.id}:{});return (body===undefined?route.GET:route.POST)(req,{params:Promise.resolve({path:path.split('?')[0].split('/').filter(Boolean)})});};
const get=async(id:string,who=a)=>(await (await call('/'+id,who)).json()).community;
const make=async(who=a,visibility='public')=>{const r=await call('',who,{requestId:randomUUID(),title:'Test community',description:'Testing',visibility});expect(r.status).toBe(201);return (await r.json()).community;};
const change=async(id:string,action:string,who=a,extra={})=>call('/'+id+'/'+action,who,{expectedRevision:(await get(id,who)).revision,...extra});
beforeAll(async()=>{if(process.env.COMMUNITY_ENABLED!=='1')throw Error('Run test-member --community');issuer=await startMemberOidc();await migrateMemberDatabase(memberRuntime().pool,true);await migrateMemberDatabase(memberRuntime().pool,true);a=await person('community-a');b=await person('community-b');d=await person('community-d');},30000);
beforeEach(async()=>{await memberRuntime().pool.query('DELETE FROM community_rate');});
afterAll(async()=>{await memberRuntime().pool.end();await issuer?.close();});

const pool=()=>memberRuntime().pool;
async function thread(cid:string,who=a,audience='public',text='Reported text') {
 const r=await call('/'+cid+'/threads',who,{requestId:randomUUID(),expectedRevision:(await get(cid,who)).revision,title:'Reported thread',body:text,audience});
 expect(r.status).toBe(201);const tid=(await r.json()).id;
 const data=await (await call('/threads/'+tid,who)).json();return {tid,pid:data.posts[0].id};
}
async function report(kind:string,targetId:string,revision=1,who=b) {
 const r=await call('/reports',who,{requestId:randomUUID(),kind,targetId,expectedRevision:revision,category:'privacy',detail:'Please review this item only.'});
 expect(r.status).toBe(201);return (await r.json()).id as string;
}
const site=(reportId:string,action:'inspect'|'hide-post'|'unhide-post'|'suspend-community'|'resume-community'|'resolve'|'dismiss',revision=1,apply=true,reportRevision=1)=>operateCommunitySafety(pool(),{reportId,action,expectedRevision:revision,expectedReportRevision:reportRevision,actor:'safety-test',caseReference:'case/C3',reason:'Requested scoped review'},apply);
const moderate=(pid:string,hidden:boolean,rev=1,who=a)=>call('/posts/'+pid+'/moderate',who,{expectedRevision:rev,hidden,reason:'Community rules'});
async function quota(who:Person,action:string,used:number,seconds:number) {await pool().query(`INSERT INTO community_rate(user_id,action,window_start,used) VALUES($1,$2,floor(extract(epoch FROM clock_timestamp())/$3)::bigint,$4) ON CONFLICT(user_id,action) DO UPDATE SET window_start=EXCLUDED.window_start,used=EXCLUDED.used`,[who.id,action,seconds,used]);}

it('reports require real identity, current audience and explicit exact targets; retries do not duplicate',async()=>{
 const c=await make();const {tid,pid}=await thread(c.id);
 const input={requestId:randomUUID(),kind:'post',targetId:pid,expectedRevision:1,category:'spam',detail:'Exact post'};
 expect((await call('/reports',undefined,input)).status).toBe(400);
 expect((await route.POST(request('/api/communities/reports','','POST',input,{'x-member-user':b.id}),{params:Promise.resolve({path:['reports']})})).status).toBe(401);
 const bad=request('/api/communities/reports',b.cookie,'POST',input,{'x-member-user':b.id});bad.headers.set('origin','https://evil.invalid');expect((await route.POST(bad,{params:Promise.resolve({path:['reports']})})).status).toBe(403);
 const r=await call('/reports',b,input);expect(r.status).toBe(201);const rid=(await r.json()).id;expect((await call('/reports',b,input)).status).toBe(200);expect((await call('/reports',b,{...input,detail:'Changed intent'})).status).toBe(409);
 expect((await call('/reports',b,{...input,requestId:randomUUID()})).status).toBe(409);
 await report('thread',tid);await report('community',c.id,c.revision);
 const own=JSON.stringify(await (await call('/reports',b)).json());expect(own).toContain(rid);expect(own).not.toContain('Reported text');expect(own).not.toContain('Exact post');expect(own).not.toContain(c.id);
 expect(JSON.stringify(await (await call('/reports',d)).json())).not.toContain(rid);
 const privateC=await make(a,'members'),secret=await thread(privateC.id,a,'cohort','private body');
 expect((await call('/reports',b,{...input,requestId:randomUUID(),targetId:secret.pid})).status).toBe(404);
 expect((await call('/reports',b,{...input,requestId:randomUUID(),targetId:randomUUID()})).status).toBe(404);
});

it('admin hide/unhide is audited, scoped to readable cohorts, and never returns hidden bodies',async()=>{
 const c=await make();await change(c.id,'join',b);const {tid,pid}=await thread(c.id,a,'cohort');
 expect((await moderate(pid,true,1,b)).status).toBe(403);expect((await moderate(pid,true)).status).toBe(200);
 const hidden=await (await call('/threads/'+tid,b)).json();expect(hidden.posts[0]).toMatchObject({status:'hidden',body:'',name:null,revision:2,hiddenBy:'community'});
 expect((await moderate(pid,false,1)).status).toBe(409);expect((await moderate(pid,false,2)).status).toBe(200);
 expect((await (await call('/threads/'+tid,b)).json()).posts[0].body).toBe('Reported text');
 const log=await (await call('/'+c.id+'/safety-log?limit=1',a)).json();expect(log.audit).toHaveLength(1);expect(log.audit[0]).toMatchObject({actorId:a.id,reason:'Community rules',targetId:pid});expect(log.nextCursor).toBeTruthy();
 const next=await (await call('/'+c.id+'/safety-log?limit=1&cursor='+encodeURIComponent(log.nextCursor),a)).json();expect(next.audit).toHaveLength(1);expect(next.audit[0].id).not.toBe(log.audit[0].id);
 expect((await call('/'+c.id+'/safety-log',b)).status).toBe(403);
 await change(c.id,'join',d);await change(c.id,'offer-admin',a,{userId:d.id});await change(c.id,'accept-admin',d);
 expect((await moderate(pid,true,3,d)).status).toBe(404);expect((await (await call('/'+c.id+'/safety-log',d)).json()).audit).toEqual([]);
});

it('operator inspection returns only the reported item, with purpose, expiry and audit',async()=>{
 const c=await make();await change(c.id,'join',b);const {tid,pid}=await thread(c.id,a,'cohort','private exact item');
 await call('/threads/'+tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'Unreported sibling'});
 const rid=await report('post',pid);
 expect((await site(rid,'inspect',1,false)).content).toBeNull();
 const view=await site(rid,'inspect');expect(view.content).toEqual({title:undefined,description:undefined,body:'private exact item'});expect(JSON.stringify(view)).not.toContain('Unreported sibling');expect(JSON.stringify(view)).not.toContain(a.id);
 const audit=(await pool().query("SELECT * FROM community_operation WHERE report_id=$1 AND action='report-inspect'",[rid])).rows[0];expect(audit).toMatchObject({operator_id:'safety-test',case_reference:'case/C3',target_id:pid,reason:'Requested scoped review'});
 const tr=await report('thread',tid);expect(JSON.stringify(await site(tr,'inspect'))).not.toContain('private exact item');
 const cr=await report('community',c.id,(await get(c.id)).revision);expect(JSON.stringify(await site(cr,'inspect',(await get(c.id)).revision))).not.toContain('Reported thread');
 const queue=JSON.stringify(await communityReportQueue(pool()));expect(queue).toContain(rid);expect(queue).not.toContain('private exact item');expect(queue).not.toContain('Requested scoped review');
 await pool().query("UPDATE community_report SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[rid]);expect((await site(rid,'inspect')).content).toBeNull();await expect(site(rid,'hide-post')).rejects.toMatchObject({code:'REPORT_CLOSED'});
});

it('revocation, rejoining, withdrawal and account suspension revoke inspection content, not just UI',async()=>{
 const c=await make();await change(c.id,'join',b);const {tid,pid}=await thread(c.id,a,'cohort');const rid=await report('post',pid);
 await change(c.id,'remove',a,{userId:b.id});expect((await site(rid,'inspect')).content).toBeNull();
 await call('/'+c.id+'/invitations',a,{expectedRevision:(await get(c.id)).revision,userId:b.id,readmission:true,days:1});const inv=(await (await call('/invitations',b)).json()).invitations.find((i:{communityId:string,status:string})=>i.communityId===c.id&&i.status==='pending');await call('/invitations/'+inv.id+'/accept',b,{expectedRevision:1});
 expect((await site(rid,'inspect')).content).toBeNull();expect((await call('/threads/'+tid,b)).status).toBe(404);
 const publicT=await thread(c.id),publicR=await report('post',publicT.pid,1,d);await call('/posts/'+publicT.pid+'/withdraw',a,{});expect((await site(publicR,'inspect')).content).toBeNull();await expect(site(publicR,'hide-post',2)).rejects.toMatchObject({code:'POST_WITHDRAWN'});
 await operateMember(pool(),{action:'suspend-user',target:d.id,actor:'test',reason:'security'},true);expect((await site(publicR,'inspect')).content).toBeNull();await operateMember(pool(),{action:'resume-user',target:d.id,actor:'test',reason:'correction'},true);d=await person('community-d');
});

it('community and site hides remain independent; withdrawal always wins',async()=>{
 const c=await make();const {tid,pid}=await thread(c.id);const rid=await report('post',pid);
 await moderate(pid,true);await site(rid,'hide-post',2);expect((await moderate(pid,false,3)).status).toBe(403);
 await site(rid,'unhide-post',3);let post=(await (await call('/threads/'+tid,a)).json()).posts[0];expect(post).toMatchObject({status:'hidden',hiddenBy:'community',revision:4});
 await moderate(pid,false,4);post=(await (await call('/threads/'+tid,a)).json()).posts[0];expect(post).toMatchObject({status:'visible',revision:5});
 await site(rid,'hide-post',5);expect((await call('/posts/'+pid+'/withdraw',a,{})).status).toBe(200);await expect(site(rid,'unhide-post',7)).rejects.toMatchObject({code:'POST_WITHDRAWN'});
 expect((await (await call('/threads/'+tid)).json()).posts[0]).toMatchObject({status:'withdrawn',body:''});
});

it('site suspension closes all normal access; resume archives and never revives pending grants',async()=>{
 const c=await make();await change(c.id,'join',b);const {tid}=await thread(c.id);const rid=await report('community',c.id,(await get(c.id)).revision);
 await change(c.id,'offer-admin',a,{userId:b.id});const inv=await call('/'+c.id+'/invitations',a,{expectedRevision:(await get(c.id)).revision,userId:d.id,readmission:false,days:1});expect(inv.status).toBe(201);
 const rev=(await get(c.id)).revision;expect((await site(rid,'suspend-community',rev,false)).applied).toBe(false);expect((await get(c.id)).status).toBe('active');
 await site(rid,'suspend-community',rev);expect((await call('/'+c.id,a)).status).toBe(404);expect((await call('/threads/'+tid,b)).status).toBe(404);expect(JSON.stringify(await (await call('',b)).json())).not.toContain(c.id);
 expect((await call('/'+c.id+'/reopen',a,{expectedRevision:rev+1})).status).toBe(404);
 expect((await pool().query('SELECT status FROM community_invitation WHERE community_id=$1',[c.id])).rows[0].status).toBe('revoked');
 await site(rid,'resolve');await site(rid,'resume-community',rev+1,true,2);expect((await get(c.id)).status).toBe('archived');expect((await get(c.id,b)).adminOffered).toBe(false);
 expect((await call('/threads/'+tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'No automatic resume'})).status).toBe(409);
 await change(c.id,'reopen');expect((await get(c.id)).status).toBe('active');expect((await pool().query('SELECT status FROM community_invitation WHERE community_id=$1',[c.id])).rows[0].status).toBe('revoked');
});

it('queued posts and moderation recheck suspension and withdrawal after locks release',async()=>{
 const c=await make();await change(c.id,'join',b);const {tid,pid}=await thread(c.id);const lock=await pool().connect();
 try{
  await lock.query('BEGIN');await lock.query('SELECT id FROM community WHERE id=$1 FOR UPDATE',[c.id]);
  const waiting=call('/threads/'+tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'Blocked late write'});
  await new Promise(r=>setTimeout(r,70));await lock.query("UPDATE community SET status='suspended',revision=revision+1 WHERE id=$1",[c.id]);await lock.query('COMMIT');expect((await waiting).status).toBe(404);
  await lock.query("UPDATE community SET status='active' WHERE id=$1",[c.id]);
  const race=await Promise.all([moderate(pid,true),call('/posts/'+pid+'/withdraw',a,{})]);expect(race.map(r=>r.status)).toContain(200);
  const final=(await (await call('/threads/'+tid)).json()).posts[0];expect(final.status).toBe('withdrawn');expect(final.body).toBe('');
 }finally{await lock.query('ROLLBACK');lock.release();}
});

it('abuse limits serialize cross-community races and idempotent retries do not consume allowance',async()=>{
 const c=await make(),c2=await make();const t=await thread(c.id),t2=await thread(c2.id);await quota(b,'report',9,3600);
 const rr=await Promise.all([call('/reports',b,{requestId:randomUUID(),kind:'post',targetId:t.pid,expectedRevision:1,category:'spam',detail:'first'}),call('/reports',b,{requestId:randomUUID(),kind:'post',targetId:t2.pid,expectedRevision:1,category:'spam',detail:'second'})]);expect(rr.map(r=>r.status).sort()).toEqual([201,429]);
 await change(c.id,'join',b);await change(c2.id,'join',b);await quota(b,'post',4,60);
 const pp=await Promise.all([call('/threads/'+t.tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'first'}),call('/threads/'+t2.tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'second'})]);expect(pp.map(r=>r.status).sort()).toEqual([201,429]);
 await quota(a,'createHour',4,3600);const input={requestId:randomUUID(),title:'Last allowance',description:'',visibility:'public'};expect((await call('',a,input)).status).toBe(201);expect((await call('',a,input)).status).toBe(200);expect((await call('',a,{...input,requestId:randomUUID()})).status).toBe(429);
 await quota(a,'thread',60,3600);expect((await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'Throttled',body:'No',audience:'public'})).status).toBe(429);
 await quota(a,'invitation',60,3600);expect((await call('/'+c.id+'/invitations',a,{expectedRevision:(await get(c.id)).revision,userId:d.id,days:1,readmission:false})).status).toBe(429);
});

it('report resolution is a separate case status, never a truth judgment or an automatic hide',async()=>{
 const c=await make();const {tid,pid}=await thread(c.id);const rid=await report('post',pid);await site(rid,'dismiss');
 expect((await (await call('/threads/'+tid)).json()).posts[0].body).toBe('Reported text');await expect(site(rid,'hide-post',1,true,2)).rejects.toMatchObject({code:'REPORT_CLOSED'});expect((await site(rid,'inspect',1,true,2)).content).toBeNull();
 const audit=(await pool().query('SELECT action,operator_id,reason,created_at FROM community_operation WHERE report_id=$1 ORDER BY id',[rid])).rows;expect(audit.some(r=>r.action==='report-dismiss'&&r.operator_id==='safety-test'&&r.reason)).toBe(true);
});

it('deletion redacts report detail, preserves independent threads, and old member storage remains separate',async()=>{
 const who=await person('delete'),c=await make();const {tid,pid}=await thread(c.id);const rid=await report('post',pid,1,who);
 const response=await memberRuntime().service.deleteAccount(request('/api/member/profile',who.cookie,'DELETE',{confirmation:'delete-account'},{'x-member-user':who.id}));expect(response.status).toBe(200);
 const r=(await pool().query('SELECT reporter_id,detail,status FROM community_report WHERE id=$1',[rid])).rows[0];expect(r).toMatchObject({reporter_id:null,detail:'[withdrawn]',status:'dismissed'});expect((await call('/threads/'+tid)).status).toBe(200);expect((await site(rid,'inspect',1,true,2)).content).toBeNull();
});

it('disabled community report routes stay unavailable and no operator endpoint exists',async()=>{
 const old=process.env.COMMUNITY_ENABLED;process.env.COMMUNITY_ENABLED='0';try{expect((await call('/reports',a)).status).toBe(404);}finally{process.env.COMMUNITY_ENABLED=old;}
 expect((await call('/operator/suspend',a,{})).status).toBe(404);
});

it('late moderation and inspection reauthorize demotion and a stopped reporter',async()=>{
 const c=await make();await change(c.id,'join',b);await change(c.id,'offer-admin',a,{userId:b.id});await change(c.id,'accept-admin',b);const {pid}=await thread(c.id);const rid=await report('post',pid,1,b);
 const lock=await pool().connect();
 try {
  await lock.query('BEGIN');await lock.query('SELECT id FROM community WHERE id=$1 FOR UPDATE',[c.id]);
  const pending=moderate(pid,true,1,b);await new Promise(r=>setTimeout(r,60));
  await lock.query("UPDATE community_member SET role='member' WHERE community_id=$1 AND user_id=$2",[c.id,b.id]);await lock.query('COMMIT');expect((await pending).status).toBe(403);
  await lock.query('BEGIN');await lock.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[b.id]);const inspect=site(rid,'inspect');await new Promise(r=>setTimeout(r,60));await lock.query('UPDATE "user" SET active=false WHERE id=$1',[b.id]);await lock.query('COMMIT');expect((await inspect).content).toBeNull();
 } finally {await lock.query('ROLLBACK');await lock.query('UPDATE "user" SET active=true WHERE id=$1',[b.id]);lock.release();}
});

it('expired reports need fresh authorization and old cases cannot reverse later suspensions',async()=>{
 const c=await make(),{pid}=await thread(c.id);const old=await report('post',pid);await pool().query("UPDATE community_report SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[old]);const fresh=await report('post',pid);expect(fresh).not.toBe(old);
 await site(fresh,'suspend-community',(await get(c.id)).revision);const suspended=(await pool().query('SELECT revision FROM community WHERE id=$1',[c.id])).rows[0];
 await expect(site(old,'resume-community',suspended.revision,true,2)).rejects.toMatchObject({code:'SUSPENSION_CASE_REQUIRED'});await site(fresh,'resume-community',suspended.revision);
 const r=await report('community',c.id,(await get(c.id)).revision,d);await site(r,'suspend-community',(await get(c.id)).revision);const latest=(await pool().query('SELECT revision FROM community WHERE id=$1',[c.id])).rows[0];
 await expect(site(fresh,'resume-community',latest.revision)).rejects.toMatchObject({code:'SUSPENSION_CASE_REQUIRED'});await site(r,'resume-community',latest.revision);
});

it('a safety change invalidates old post pages; current authorization is evaluated before audit LIMIT',async()=>{
 const c=await make();await change(c.id,'join',b);const {tid,pid}=await thread(c.id,a,'cohort');await call('/threads/'+tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'Second page'});
 const page=await (await call('/threads/'+tid+'?limit=1',b)).json();expect(page.nextCursor).toBeTruthy();await moderate(pid,true);
 expect((await call('/threads/'+tid+'?limit=1&cursor='+encodeURIComponent(page.nextCursor),b)).status).toBe(409);
 await change(c.id,'join',d);await change(c.id,'offer-admin',a,{userId:d.id});await change(c.id,'accept-admin',d);
 const publicT=await thread(c.id);await moderate(publicT.pid,true);const audit=await (await call('/'+c.id+'/safety-log?limit=1',d)).json();expect(audit.audit).toHaveLength(1);expect(audit.audit[0].targetId).toBe(publicT.pid);expect(audit.nextCursor).toBeNull();
});
