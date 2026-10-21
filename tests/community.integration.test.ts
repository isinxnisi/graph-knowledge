import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startMemberOidc} from './support/member-oidc';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
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
afterAll(async()=>{await memberRuntime().pool.end();await issuer?.close();});
it('real authenticated creation, duplicate requests and Origin/identity rejection',async()=>{const input={requestId:randomUUID(),title:'One',description:'',visibility:'public'};const responses=await Promise.all([call('',a,input),call('',a,input)]);expect(responses.map(x=>x.status).sort()).toEqual([200,201]);expect((await responses[0].json()).community.id).toBe((await responses[1].json()).community.id);const invalid=request('/api/communities',a.cookie,'POST',input,{'x-member-user':b.id});expect((await route.POST(invalid,{params:Promise.resolve({})})).status).toBe(401);invalid.headers.set('origin','https://evil.example');expect((await route.POST(invalid,{params:Promise.resolve({})})).status).toBe(403);});
it('fixed cohort survives public/private switches without granting late/rejoined readers',async()=>{const c=await make();expect((await change(c.id,'join',b)).status).toBe(200);const r=await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'Private discussion',body:'cohort-secret',audience:'cohort'});expect(r.status).toBe(201);const tid=(await r.json()).id;expect((await call('/threads/'+tid,b)).status).toBe(200);expect((await call('/threads/'+tid)).status).toBe(404);await change(c.id,'join',d);expect((await call('/threads/'+tid,d)).status).toBe(404);await change(c.id,'leave',b);await change(c.id,'join',b);expect((await call('/threads/'+tid,b)).status).toBe(404);for(const visibility of ['members','public'])expect((await change(c.id,'settings',a,{title:'Test',description:'',visibility})).status).toBe(200);expect((await call('/threads/'+tid)).status).toBe(404);expect((await call('/threads/'+tid,b)).status).toBe(404);const anon=await (await call('/'+c.id)).json();expect(anon.threads).toEqual([]);expect(anon.members).toEqual([]);});
it('public-to-private conversion pins old public threads and never republishes them',async()=>{const c=await make();const r=await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:c.revision,title:'Old public',body:'old-public',audience:'public'});const tid=(await r.json()).id;expect((await call('/threads/'+tid)).status).toBe(200);await change(c.id,'settings',a,{title:'Test',description:'',visibility:'members'});expect((await call('/'+c.id)).status).toBe(404);await change(c.id,'settings',a,{title:'Test',description:'',visibility:'public'});expect((await call('/threads/'+tid)).status).toBe(404);await change(c.id,'join',b);expect((await call('/threads/'+tid,b)).status).toBe(404);});
it('admin offer requires consent, revision races are rejected, last admin archives',async()=>{const c=await make();await change(c.id,'join',b);expect((await change(c.id,'offer-admin',a,{userId:b.id})).status).toBe(200);expect((await get(c.id,b)).role).toBe('member');await change(c.id,'accept-admin',b);expect((await get(c.id,b)).role).toBe('admin');await change(c.id,'leave',a);expect((await get(c.id,b)).status).toBe('active');const rev=(await get(c.id,b)).revision;const race=await Promise.all([call('/'+c.id+'/archive',b,{expectedRevision:rev}),call('/'+c.id+'/leave',b,{expectedRevision:rev})]);expect(race.map(x=>x.status).sort()).toEqual([200,409]);if((await get(c.id,b)).role)await change(c.id,'leave',b);expect((await get(c.id,d)).status).toBe('archived');});
it('removal blocks rejoining, forbidden member settings, private creation stays private',async()=>{const c=await make();await change(c.id,'join',b);expect((await change(c.id,'archive',b)).status).toBe(403);await change(c.id,'remove',a,{userId:b.id});expect((await change(c.id,'join',b)).status).toBe(403);const privateC=await make(a,'members');expect((await call('/'+privateC.id,b)).status).toBe(404);expect(JSON.stringify(await (await call('')).json())).not.toContain(privateC.id);});
it('posts are idempotent, withdrawn posts never return via retry, close rejects replies',async()=>{const c=await make();await change(c.id,'join',b);const tid=(await (await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'Conversation',body:'Start',audience:'public'})).json()).id;const input={requestId:randomUUID(),expectedRevision:1,body:'A reply'};const rr=await Promise.all([call('/threads/'+tid+'/posts',b,input),call('/threads/'+tid+'/posts',b,input)]);expect(rr.map(x=>x.status).sort()).toEqual([200,201]);const pid=(await rr[0].json()).id;await change(c.id,'leave',b);expect((await call('/posts/'+pid+'/withdraw',b,{})).status).toBe(200);await change(c.id,'join',b);await call('/threads/'+tid+'/posts',b,input);const result=await (await call('/threads/'+tid,a)).json();expect(result.posts.find((p:{id:string})=>p.id===pid).body).toBe('');await call('/threads/'+tid+'/close',a,{expectedRevision:1,closed:true});expect((await call('/threads/'+tid+'/posts',b,{...input,requestId:randomUUID()})).status).toBe(409);});
it('real account suspension revokes membership generation; resume does not restore grants',async()=>{const who=await person('suspend');const c=await make(who);await operateMember(memberRuntime().pool,{action:'suspend-user',target:who.id,actor:'test',reason:'security'},true);expect((await call('/'+c.id,who)).status).toBe(401);const row=(await memberRuntime().pool.query('SELECT status FROM community_member WHERE community_id=$1 AND user_id=$2',[c.id,who.id])).rows[0];expect(row.status).toBe('suspended');expect((await get(c.id,a)).status).toBe('archived');await operateMember(memberRuntime().pool,{action:'resume-user',target:who.id,actor:'test',reason:'correction'},true);expect((await memberRuntime().pool.query('SELECT status FROM community_member WHERE community_id=$1 AND user_id=$2',[c.id,who.id])).rows[0].status).toBe('suspended');});
it('account deletion withdraws own content while independent conversation and another author survive',async()=>{const who=await person('delete');const c=await make(who);await change(c.id,'join',d);const tid=(await (await call('/'+c.id+'/threads',who,{requestId:randomUUID(),expectedRevision:(await get(c.id,who)).revision,title:'Personal title',body:'Private own text',audience:'public'})).json()).id;await call('/threads/'+tid+'/posts',d,{requestId:randomUUID(),expectedRevision:1,body:'Another member'});const response=await memberRuntime().service.deleteAccount(request('/api/member/profile',who.cookie,'DELETE',{confirmation:'delete-account'},{'x-member-user':who.id}));expect(response.status).toBe(200);const result=await (await call('/threads/'+tid,d)).json();expect(result.thread.title).toBe('[withdrawn]');expect(result.posts.some((p:{body:string})=>p.body==='Another member')).toBe(true);expect(JSON.stringify(result)).not.toContain('Private own text');});

it('waiting post rechecks membership after revocation commits',async()=>{const c=await make();await change(c.id,'join',b);const tid=(await (await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'Race',body:'Initial',audience:'cohort'})).json()).id;const lock=await memberRuntime().pool.connect();try{await lock.query('BEGIN');await lock.query('SELECT id FROM community WHERE id=$1 FOR UPDATE',[c.id]);const waiting=call('/threads/'+tid+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'Must not publish'});await new Promise(r=>setTimeout(r,60));await lock.query("UPDATE community_member SET status='removed',generation=generation+1 WHERE community_id=$1 AND user_id=$2",[c.id,b.id]);await lock.query('COMMIT');expect((await waiting).status).toBe(403);expect((await memberRuntime().pool.query('SELECT count(*) FROM community_post WHERE thread_id=$1',[tid])).rows[0].count).toBe('1');}finally{await lock.query('ROLLBACK');lock.release();}});
it('disabled routes cannot access community storage',async()=>{const old=process.env.COMMUNITY_ENABLED;process.env.COMMUNITY_ENABLED='0';try{expect((await call('',a)).status).toBe(404);}finally{process.env.COMMUNITY_ENABLED=old;}});
