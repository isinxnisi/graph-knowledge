import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startMemberOidc} from './support/member-oidc';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {decideCommunityRecovery} from '../lib/server/member/community-recovery';
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
it('本人の参加世代と最後の管理者だけを返し、閲覧者へ名簿情報を漏らさない',async()=>{
 const c=await make();const first=await get(c.id);expect(first.lastAdmin).toBe(true);expect(first.membershipGeneration).toBe(1);
 const anon=(await(await call('/'+c.id)).json()).community;expect(anon.lastAdmin).toBe(false);expect(anon.membershipGeneration).toBeNull();
 await change(c.id,'join',b);expect((await get(c.id,b)).lastAdmin).toBe(false);await change(c.id,'offer-admin',a,{userId:b.id});await change(c.id,'accept-admin',b);expect((await get(c.id)).lastAdmin).toBe(false);
 await change(c.id,'leave',b);await change(c.id,'join',b);expect((await get(c.id,b)).membershipGeneration).toBe(3);expect((await get(c.id)).lastAdmin).toBe(true);
});
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

const invite=async(cid:string,target=b,readmission=false,days=7)=>{const response=await call('/'+cid+'/invitations',a,{expectedRevision:(await get(cid)).revision,userId:target.id,readmission,days});expect(response.status).toBe(201);return (await response.json()).id as string;};
const inviteState=async(id:string,who=b)=>(await (await call('/invitations',who)).json()).invitations.find((i:{id:string})=>i.id===id);
const decide=async(id:string,action:string,who=b,rev=1)=>call('/invitations/'+id+'/'+action,who,{expectedRevision:rev});
it('private invitations disclose only the invitation, and acceptance belongs to the exact active user',async()=>{
 const c=await make(a,'members');const tid=(await (await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:c.revision,title:'Before invitation',body:'old-private',audience:'cohort'})).json()).id;
 const id=await invite(c.id);expect((await call('/'+c.id,b)).status).toBe(404);expect((await call('/threads/'+tid,b)).status).toBe(404);
 expect((await inviteState(id)).title).toBe('Test community');expect(JSON.stringify(await (await call('/invitations',d)).json())).not.toContain(c.id);
 expect((await decide(id,'accept',d)).status).toBe(404);expect((await decide(id,'accept')).status).toBe(200);expect((await get(c.id,b)).role).toBe('member');expect((await inviteState(id)).title).toBe('Test community');expect((await call('/threads/'+tid,b)).status).toBe(404);expect((await decide(id,'accept')).status).toBe(409);
 const r=await call('/'+c.id+'/threads',b,{requestId:randomUUID(),expectedRevision:(await get(c.id,b)).revision,title:'New conversation',body:'new',audience:'cohort'});expect(r.status).toBe(201);expect((await call('/threads/'+(await r.json()).id,a)).status).toBe(200);
});
it('expiry, cancellation, decline and reissue never grant stale invitation access',async()=>{
 const c=await make(a,'members');const expired=await invite(c.id);await memberRuntime().pool.query("UPDATE community_invitation SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired]);expect((await inviteState(expired)).status).toBe('expired');expect((await inviteState(expired)).title).toBeNull();expect((await decide(expired,'accept')).status).toBe(409);
 const first=await invite(c.id),second=await invite(c.id);expect((await decide(first,'accept')).status).toBe(409);expect((await decide(second,'revoke',a)).status).toBe(200);expect((await decide(second,'accept')).status).toBe(409);
 const third=await invite(c.id);expect((await decide(third,'decline')).status).toBe(200);expect((await decide(third,'accept')).status).toBe(409);expect((await call('/'+c.id,b)).status).toBe(404);
});
it('voluntary leave and explicit readmission use new generations without historical audience revival',async()=>{
 const c=await make();await change(c.id,'join',b);const tid=(await (await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'Old cohort',body:'old',audience:'cohort'})).json()).id;
 await change(c.id,'leave',b);await change(c.id,'join',b);expect((await call('/threads/'+tid,b)).status).toBe(404);await change(c.id,'remove',a,{userId:b.id});
 expect((await call('/'+c.id+'/invitations',a,{expectedRevision:(await get(c.id)).revision,userId:b.id,readmission:false})).status).toBe(409);
 const id=await invite(c.id,b,true);expect((await decide(id,'accept')).status).toBe(200);expect((await call('/threads/'+tid,b)).status).toBe(404);expect((await get(c.id,b)).role).toBe('member');
});
it('accept/revoke races serialize, and issuer demotion invalidates an outstanding invitation',async()=>{
 const c=await make();let id=await invite(c.id);const results=await Promise.all([decide(id,'accept'),decide(id,'revoke',a)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
 id=await invite(c.id,d);expect((await change(c.id,'demote-admin',a,{userId:a.id})).status).toBe(200);expect((await get(c.id,b)).status).toBe('archived');expect((await decide(id,'accept',d)).status).toBe(409);
});
it('account suspension invalidates a pending invitation even before any membership exists',async()=>{
 const c=await make();const id=await invite(c.id,d);await operateMember(memberRuntime().pool,{action:'suspend-user',target:d.id,actor:'test',reason:'security'},true);await operateMember(memberRuntime().pool,{action:'resume-user',target:d.id,actor:'test',reason:'correction'},true);d=await person('community-d');expect((await decide(id,'accept',d)).status).toBe(409);expect((await get(c.id,d)).role).toBeNull();
});
it('orphan recovery requires an audited operator decision and explicit nominee consent, and stays archived',async()=>{
 const c=await make(a,'members');const tid=(await (await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:c.revision,title:'Historical private',body:'secret-old',audience:'cohort'})).json()).id;await change(c.id,'leave',a);
 expect((await call('/'+c.id+'/recovery',b,{})).status).toBe(404);const req=await call('/'+c.id+'/recovery',a,{});expect(req.status).toBe(201);const rid=(await req.json()).id;
 expect((await call('/recoveries/'+rid+'/accept',a,{expectedRevision:1})).status).toBe(409);const input={requestId:rid,expectedRevision:1,decision:'approve' as const,actor:'operator-test',caseReference:'C1B-123'};
 expect((await decideCommunityRecovery(memberRuntime().pool,input,false)).grantsMembership).toBe(false);expect((await memberRuntime().pool.query('SELECT status FROM community_recovery WHERE id=$1',[rid])).rows[0].status).toBe('pending');
 await decideCommunityRecovery(memberRuntime().pool,input,true);expect((await call('/'+c.id,a)).status).toBe(404);expect((await call('/recoveries/'+rid+'/accept',b,{expectedRevision:2})).status).toBe(404);
 expect((await call('/recoveries/'+rid+'/accept',a,{expectedRevision:2})).status).toBe(200);expect((await get(c.id)).status).toBe('archived');expect((await get(c.id)).role).toBe('admin');expect((await call('/threads/'+tid,a)).status).toBe(404);
 expect((await memberRuntime().pool.query("SELECT case_reference FROM community_operation WHERE target_id=$1 AND action='recovery-approve'",[rid])).rows[0].case_reference).toBe('C1B-123');expect((await change(c.id,'reopen')).status).toBe(200);
});
it('recovery rejection and cancellation confer no authority; demotion and admin offer cancellation remain explicit',async()=>{
 const c=await make();await change(c.id,'join',b);await change(c.id,'offer-admin',a,{userId:b.id});await change(c.id,'cancel-admin-offer',a,{userId:b.id});expect((await change(c.id,'accept-admin',b)).status).toBe(403);await change(c.id,'demote-admin',a,{userId:a.id});
 const rid=(await (await call('/'+c.id+'/recovery',b,{})).json()).id;await decideCommunityRecovery(memberRuntime().pool,{requestId:rid,expectedRevision:1,decision:'reject',actor:'operator-test',caseReference:'C1B-124'},true);expect((await call('/recoveries/'+rid+'/accept',b,{expectedRevision:2})).status).toBe(409);
 const rid2=(await (await call('/'+c.id+'/recovery',b,{})).json()).id;expect((await call('/recoveries/'+rid2+'/cancel',b,{expectedRevision:1})).status).toBe(200);expect((await get(c.id,b)).role).toBe('member');
});
it('keyset pages use exact microseconds, filter authorized threads before LIMIT, and reject reuse or mutation',async()=>{
 const c=await make();const tids:string[]=[];for(let i=0;i<7;i++){const id=randomUUID();tids.push(id);await memberRuntime().pool.query("INSERT INTO community_thread(id,community_id,author_id,title,audience,created_at) VALUES($1,$2,$3,$4,'public','2026-01-01T00:00:00.123456Z'::timestamptz+$5*interval '1 microsecond')",[id,c.id,a.id,'Visible '+i,i]);}
 for(let i=0;i<24;i++)await memberRuntime().pool.query("INSERT INTO community_thread(community_id,author_id,title,audience) VALUES($1,$2,'Hidden title','cohort')",[c.id,a.id]);
 const seen:string[]=[];let cursor:string|null=null,first:string|null=null;do{const page=await (await call('/'+c.id+'?limit=2'+(cursor?'&cursor='+encodeURIComponent(cursor):''))).json();expect(JSON.stringify(page)).not.toContain('Hidden title');seen.push(...page.threads.map((x:{id:string})=>x.id));cursor=page.nextCursor;if(!first)first=cursor;}while(cursor);expect(new Set(seen).size).toBe(7);expect(seen.sort()).toEqual(tids.sort());
 expect((await call('/'+c.id+'?limit=2&cursor='+encodeURIComponent(first!),b)).status).toBe(400);expect((await call('/'+c.id+'?limit=2&cursor=bad')).status).toBe(400);
 await change(c.id,'archive');expect((await call('/'+c.id+'?limit=2&cursor='+encodeURIComponent(first!))).status).toBe(409);
});
it('directory, roster, posts, invitations and own-post pages remain bounded and complete',async()=>{
 const c=await make();await change(c.id,'join',b);const tid=(await (await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'Paged',body:'one',audience:'public'})).json()).id;
 for(let i=0;i<8;i++)await memberRuntime().pool.query('INSERT INTO community_post(thread_id,author_id,body,created_at) VALUES($1,$2,$3,clock_timestamp())',[tid,a.id,'Page '+i]);
 let cursor:string|null=null;const ids:string[]=[];do{const page=await (await call('/threads/'+tid+'?limit=2'+(cursor?'&cursor='+encodeURIComponent(cursor):''),a)).json();ids.push(...page.posts.map((p:{id:string})=>p.id));cursor=page.nextCursor;}while(cursor);expect(ids.length).toBe(9);expect(new Set(ids).size).toBe(9);
 const first=await (await call('/'+c.id+'?limit=1',a)).json();expect(first.members).toHaveLength(1);expect(first.membersCursor).toBeTruthy();const second=await (await call('/'+c.id+'?limit=1&membersCursor='+encodeURIComponent(first.membersCursor),a)).json();expect(second.members[0].id).not.toBe(first.members[0].id);const publicPage=await (await call('/'+c.id+'?limit=1',b)).json();expect(publicPage.members).toEqual([]);expect(publicPage.membersCursor).toBeNull();
 for(let i=0;i<5;i++)await memberRuntime().pool.query("INSERT INTO community_invitation(community_id,target_id,issuer_id,issuer_generation,target_generation,status,expires_at) VALUES($1,$2,$3,1,0,'declined',clock_timestamp())",[c.id,d.id,a.id]);
 const inbox=await (await call('/invitations?limit=2',d)).json();expect(inbox.invitations).toHaveLength(2);expect(inbox.nextCursor).toBeTruthy();expect((await call('/my-posts?limit=2',a)).status).toBe(200);
 const directory=await (await call('?limit=2',a)).json();expect(directory.communities).toHaveLength(2);expect(directory.nextCursor).toBeTruthy();const next=await (await call('?limit=2&cursor='+encodeURIComponent(directory.nextCursor),a)).json();expect(next.communities.every((x:{id:string})=>!directory.communities.some((y:{id:string})=>x.id===y.id))).toBe(true);
});
it('invitation issuance waiting on a stopped recipient cannot survive the stop/resume boundary',async()=>{
 const c=await make(b);const lock=await memberRuntime().pool.connect();try{
 await lock.query('BEGIN');await lock.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[d.id]);
 const waiting=call('/'+c.id+'/invitations',b,{expectedRevision:c.revision,userId:d.id,days:7});await new Promise(r=>setTimeout(r,60));await lock.query('UPDATE "user" SET active=false WHERE id=$1',[d.id]);await lock.query('COMMIT');expect((await waiting).status).toBe(400);expect((await memberRuntime().pool.query('SELECT count(*) FROM community_invitation WHERE community_id=$1',[c.id])).rows[0].count).toBe('0');
 }finally{await lock.query('ROLLBACK');lock.release();await operateMember(memberRuntime().pool,{action:'resume-user',target:d.id,actor:'test',reason:'correction'},true);}
});
it('recovery expiry and later membership revocation invalidate operator approval and nominee acceptance',async()=>{
 const c=await make(b);await change(c.id,'demote-admin',b,{userId:b.id});const rid=(await (await call('/'+c.id+'/recovery',b,{})).json()).id;
 const input={requestId:rid,expectedRevision:1,decision:'approve' as const,actor:'operator-test',caseReference:'C1B-expiry'};
 await memberRuntime().pool.query("UPDATE community_recovery SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[rid]);await expect(decideCommunityRecovery(memberRuntime().pool,input,true)).rejects.toThrow();expect((await call('/recoveries/'+rid+'/accept',b,{expectedRevision:1})).status).toBe(409);
 const next=(await (await call('/'+c.id+'/recovery',b,{})).json()).id;await decideCommunityRecovery(memberRuntime().pool,{...input,requestId:next},true);await change(c.id,'leave',b);expect((await call('/recoveries/'+next+'/accept',b,{expectedRevision:2})).status).toBe(409);
});
it('two operator-approved nominees cannot both acquire an orphan administrator role concurrently',async()=>{
 const c=await make(b);await change(c.id,'join',a);await change(c.id,'demote-admin',b,{userId:b.id});
 const ra=(await (await call('/'+c.id+'/recovery',a,{})).json()).id,rb=(await (await call('/'+c.id+'/recovery',b,{})).json()).id;
 for(const requestId of [ra,rb])await decideCommunityRecovery(memberRuntime().pool,{requestId,expectedRevision:1,decision:'approve',actor:'operator-test',caseReference:'C1B-concurrent'},true);
 const results=await Promise.all([call('/recoveries/'+ra+'/accept',a,{expectedRevision:2}),call('/recoveries/'+rb+'/accept',b,{expectedRevision:2})]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect((await memberRuntime().pool.query("SELECT count(*) FROM community_member WHERE community_id=$1 AND status='active' AND role='admin'",[c.id])).rows[0].count).toBe('1');expect((await get(c.id,b)).status).toBe('archived');
});
it('a resumed former administrator needs explicit operator readmission and fresh consent to recover an orphan',async()=>{
 const c=await make(b,'members');const tid=(await (await call('/'+c.id+'/threads',b,{requestId:randomUUID(),expectedRevision:c.revision,title:'Before stop',body:'Old generation',audience:'cohort'})).json()).id;
 await operateMember(memberRuntime().pool,{action:'suspend-user',target:b.id,actor:'test',reason:'security'},true);await operateMember(memberRuntime().pool,{action:'resume-user',target:b.id,actor:'test',reason:'correction'},true);b=await person('community-b');expect((await call('/'+c.id,b)).status).toBe(404);
 const history=await (await call('/participation',b)).json();expect(history.participation.find((m:{communityId:string})=>m.communityId===c.id).canRequestRecovery).toBe(true);
 const rid=(await (await call('/'+c.id+'/recovery',b,{})).json()).id;const input={requestId:rid,expectedRevision:1,decision:'approve' as const,actor:'operator-test',caseReference:'C1B-explicit-readmission'};
 await expect(decideCommunityRecovery(memberRuntime().pool,input,true)).rejects.toThrow('RECOVERY_READMISSION_REQUIRED');await decideCommunityRecovery(memberRuntime().pool,{...input,readmit:true},true);expect((await call('/'+c.id,b)).status).toBe(404);expect((await call('/recoveries/'+rid+'/accept',b,{expectedRevision:2})).status).toBe(200);
 expect((await get(c.id,b)).status).toBe('archived');expect((await call('/threads/'+tid,b)).status).toBe(404);expect((await memberRuntime().pool.query("SELECT case_reference FROM community_operation WHERE target_id=$1 AND action='recovery-readmit-approve'",[rid])).rows[0].case_reference).toBe('C1B-explicit-readmission');
});
it('a continuing member becoming administrator retains their existing restricted audience',async()=>{
 const c=await make(b);await change(c.id,'join',a);const tid=(await (await call('/'+c.id+'/threads',b,{requestId:randomUUID(),expectedRevision:(await get(c.id,b)).revision,title:'Still authorized',body:'Continuing audience',audience:'cohort'})).json()).id;
 const prior=(await memberRuntime().pool.query('SELECT generation FROM community_member WHERE community_id=$1 AND user_id=$2',[c.id,a.id])).rows[0].generation;
 await change(c.id,'demote-admin',b,{userId:b.id});const rid=(await (await call('/'+c.id+'/recovery',a,{})).json()).id;await decideCommunityRecovery(memberRuntime().pool,{requestId:rid,expectedRevision:1,decision:'approve',actor:'operator-test',caseReference:'C1B-continuing'},true);expect((await call('/recoveries/'+rid+'/accept',a,{expectedRevision:2})).status).toBe(200);
 expect((await memberRuntime().pool.query('SELECT generation FROM community_member WHERE community_id=$1 AND user_id=$2',[c.id,a.id])).rows[0].generation).toBe(prior);expect((await call('/threads/'+tid,a)).status).toBe(200);expect((await get(c.id,a)).status).toBe('archived');
});
it('threads and posts remain usable beyond the old 200-item ceiling with complete authorized pages',async()=>{
 const c=await make(d);await memberRuntime().pool.query("INSERT INTO community_thread(community_id,author_id,title,audience,created_at) SELECT $1,$2,'Archived batch '||i,'public','2025-01-01T00:00:00Z'::timestamptz+i*interval '1 microsecond' FROM generate_series(1,205) AS i",[c.id,d.id]);
 const response=await call('/'+c.id+'/threads',d,{requestId:randomUUID(),expectedRevision:c.revision,title:'Beyond 200',body:'Start',audience:'public'});expect(response.status).toBe(201);const tid=(await response.json()).id;
 await memberRuntime().pool.query("INSERT INTO community_post(thread_id,author_id,body,created_at) SELECT $1,$2,'Older post '||i,'2025-01-01T00:00:00Z'::timestamptz+i*interval '1 microsecond' FROM generate_series(1,205) AS i",[tid,d.id]);
 expect((await call('/threads/'+tid+'/posts',d,{requestId:randomUUID(),expectedRevision:1,body:'Beyond 200 replies'})).status).toBe(201);
 for(const [path,field,total] of [['/'+c.id,'threads',206],['/threads/'+tid,'posts',207]] as const){let cursor:string|null=null;const ids:string[]=[];do{const page=await(await call(path+'?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),d)).json();ids.push(...page[field].map((r:{id:string})=>r.id));cursor=page.nextCursor;}while(cursor);expect(ids.length).toBe(total);expect(new Set(ids).size).toBe(total);}
 const inviteId=(await (await call('/'+c.id+'/invitations',d,{expectedRevision:(await get(c.id,d)).revision,userId:a.id,days:7})).json()).id;expect((await decide(inviteId,'revoke',b)).status).toBe(404);expect((await decide(randomUUID(),'revoke',b)).status).toBe(404);
});

it('招待総数は本人の有効な対応待ちだけで、ページング・閲覧に依存しない',async()=>{
 const owner=await person('notification-owner'),recipient=await person('notification-recipient'),other=await person('notification-other');
 const c=await make(owner,'members');const invite=await call('/'+c.id+'/invitations',owner,{expectedRevision:(await get(c.id,owner)).revision,userId:recipient.id,days:7});expect(invite.status).toBe(201);const id=(await invite.json()).id;
 const count=async(who:Person)=>(await(await call('/invitations/summary',who)).json()).pendingCount;
 expect((await call('/invitations/summary')).status).toBe(401);expect(await count(recipient)).toBe(1);expect(await count(other)).toBe(0);
 const extra=await make(owner,'members');const extraId=(await(await call('/'+extra.id+'/invitations',owner,{expectedRevision:extra.revision,userId:recipient.id})).json()).id;const page=await(await call('/invitations?limit=1',recipient)).json();expect(page.invitations).toHaveLength(1);expect(await count(recipient)).toBe(2);await call('/invitations/'+extraId+'/revoke',owner,{expectedRevision:1});expect(await count(recipient)).toBe(1);
 await memberRuntime().pool.query("UPDATE community_invitation SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);expect(await count(recipient)).toBe(0);
 const reissue=await call('/'+c.id+'/invitations',owner,{expectedRevision:(await get(c.id,owner)).revision,userId:recipient.id});const next=(await reissue.json()).id;expect(await count(recipient)).toBe(1);
 await call('/invitations/'+next+'/decline',recipient,{expectedRevision:1});expect(await count(recipient)).toBe(0);
 const third=(await(await call('/'+c.id+'/invitations',owner,{expectedRevision:(await get(c.id,owner)).revision,userId:recipient.id})).json()).id;
 await call('/invitations/'+third+'/revoke',owner,{expectedRevision:1});expect(await count(recipient)).toBe(0);
 const fourth=(await(await call('/'+c.id+'/invitations',owner,{expectedRevision:(await get(c.id,owner)).revision,userId:recipient.id})).json()).id;
 await call('/invitations/'+fourth+'/accept',recipient,{expectedRevision:1});expect(await count(recipient)).toBe(0);
 const c2=await make(owner,'members');await call('/'+c2.id+'/invitations',owner,{expectedRevision:(await get(c2.id,owner)).revision,userId:other.id});expect(await count(other)).toBe(1);await change(c2.id,'leave',owner);expect(await count(other)).toBe(0);
});
it('投稿位置を認可後に解決し、取得上限の先・前後のページ・別スレッドを区別する',async()=>{
 const c=await make();await change(c.id,'join',b);
 const tid=(await(await call('/'+c.id+'/threads',a,{requestId:randomUUID(),expectedRevision:(await get(c.id)).revision,title:'History conversation',body:'Start',audience:'cohort'})).json()).id;
 let target='';for(let n=0;n<65;n++){const p=await memberRuntime().pool.query("INSERT INTO community_post(thread_id,author_id,body,created_at) VALUES($1,$2,$3,clock_timestamp()+($4||' seconds')::interval) RETURNING id",[tid,b.id,'message-'+n,String(n-100)]);if(n===44)target=p.rows[0].id;}
 const first=await(await call('/threads/'+tid,b)).json();expect(first.posts).toHaveLength(20);expect(first.posts.some((p:{id:string})=>p.id===target)).toBe(false);
 const focused=await(await call('/threads/'+tid+'?post='+target,b)).json();expect(focused.posts).toHaveLength(20);expect(focused.posts[10].id).toBe(target);expect(focused.posts[9].body).toBe('message-43');expect(focused.posts[11].body).toBe('message-45');
 const next=await(await call('/threads/'+tid+'?cursor='+encodeURIComponent(focused.nextCursor),b)).json();expect(next.posts[0].body).toBe('message-54');
 expect((await call('/threads/'+tid+'?post='+randomUUID(),b)).status).toBe(404);
 const history=await(await call('/my-posts?limit=50',b)).json();const recent=history.posts.find((p:{body:string})=>p.body==='message-64');expect(recent.threadTitle).toBe('History conversation');expect(recent.readable).toBe(true);
 await change(c.id,'leave',b);await change(c.id,'join',b);
 expect((await call('/threads/'+tid+'?post='+target,b)).status).toBe(404);
 const lost=await(await call('/my-posts?limit=50',b)).json();const inaccessible=lost.posts.find((p:{id:string})=>p.id===recent.id);expect(inaccessible.readable).toBe(false);expect(inaccessible).not.toHaveProperty('threadTitle');expect(inaccessible).not.toHaveProperty('threadId');expect(inaccessible).not.toHaveProperty('communityTitle');expect(inaccessible.body).toBeTruthy();expect((await call('/posts/'+target+'/withdraw',b,{})).status).toBe(200);
});
