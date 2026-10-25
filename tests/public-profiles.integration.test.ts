import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startMemberOidc} from './support/member-oidc';
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {memberPool} from '../lib/server/member/auth';
import {memberConfig} from '../lib/server/member/config';
import {operateMember} from '../lib/server/member/operations';
import {operateAiIdentity} from '../lib/server/member/ai-identity';
import {OFFICIAL_AI_ID} from '../lib/domain/public-profile';
import {APPRENTICE_AI_ID} from '../lib/domain/ai-lab';
vi.mock('server-only',()=>({}));
import {memberRuntime} from '../lib/server/member/runtime';
import * as authRoute from '../app/api/auth/[...all]/route';
import * as accounts from '../app/api/accounts/[[...path]]/route';
import * as communities from '../app/api/communities/[[...path]]/route';
const origin='http://127.0.0.1:3221';
type Person={cookie:string;id:string;name:string};
function request(path:string,who?:Person,method='GET',body?:unknown,headers:Record<string,string>={}){return new Request(origin+path,{method,headers:{cookie:who?.cookie??'',origin,'Content-Type':'application/json',...(who?.id?{'x-member-user':who.id}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
async function person(identity:string){
 const cookies=new Map<string,string>();const receive=(r:Response)=>{for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}};
 const who={id:'',name:'',get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');}};
 const start=await authRoute.POST(request('/api/auth/sign-in/social',undefined,'POST',{provider:'fixture',callbackURL:'/member',disableRedirect:true}));expect(start.status).toBe(200);receive(start);
 const url=new URL((await start.json()).url);url.searchParams.set('fixture_identity',identity);url.searchParams.set('fixture_mode','valid');
 const consent=await fetch(url,{redirect:'manual'});expect(consent.status).toBe(302);const back=new URL(consent.headers.get('location')!);
 receive(await authRoute.GET(request(back.pathname+back.search,who)));
 const profile=await memberRuntime().service.profile(request('/api/member/profile',who));expect(profile.status).toBe(200);Object.assign(who,(await profile.json()).user);return who;
}
function call(path:string,who?:Person,method='GET',body?:unknown,headers:Record<string,string>={}){const req=request('/api/accounts'+path,who,method,body,headers);return accounts[method as 'GET'|'PUT'|'DELETE'](req,{params:Promise.resolve({path:path.split('?')[0].split('/').filter(Boolean)})});}
const com=(path:string,who?:Person,body?:unknown)=>{const req=request('/api/communities'+path,who,body===undefined?'GET':'POST',body);return (body===undefined?communities.GET:communities.POST)(req,{params:Promise.resolve({path:path.split('?')[0].split('/').filter(Boolean)})});};
const pub=async(key:string,who?:Person)=>{const r=await call('/profiles/'+key,who);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');return r.json();};
async function save(who:Person,key:string,extra={}){const old=await(await call('/me',who)).json();return call('/me',who,'PUT',{handle:key,displayName:'公開 '+key,bio:'My chosen public bio',icon:'leaf',timelinePublic:true,expectedRevision:old.revision,...extra});}
async function make(who:Person,visibility='public'){const r=await com('',who,{requestId:randomUUID(),title:'Public place',description:'',visibility});expect(r.status).toBe(201);return (await r.json()).community;}
async function change(cid:string,who:Person,action:string,extra={}){const c=(await(await com('/'+cid,who)).json()).community;const r=await com('/'+cid+'/'+action,who,{expectedRevision:c.revision,...extra});expect(r.status).toBe(200);}
async function thread(cid:string,who:Person,audience='public',text='Public message'){const c=(await(await com('/'+cid,who)).json()).community;const r=await com('/'+cid+'/threads',who,{requestId:randomUUID(),expectedRevision:c.revision,title:text+' title',body:text,audience});expect(r.status).toBe(201);const id=(await r.json()).id;return {id,post:(await(await com('/threads/'+id,who)).json()).posts[0].id};}
let issuer:Awaited<ReturnType<typeof startMemberOidc>>,a:Person,b:Person;
let legacyPost='',legacyFirstPost='',legacyBefore:unknown[]=[],bootstrap:ReturnType<typeof memberPool>;
beforeAll(async()=>{
 if(process.env.PUBLIC_PROFILES_ENABLED!=='1')throw Error('Use test-member --accounts');issuer=await startMemberOidc();
 const pool=bootstrap=memberPool(memberConfig()!);await migrateMemberDatabase(pool,true,true);
 a=await person('profile-a');b=await person('profile-b');const place=await make(a);await change(place.id,b,'join');
 const tid=randomUUID();await pool.query("INSERT INTO community_thread(id,community_id,author_id,title,audience) VALUES($1,$2,$3,'Legacy public','public')",[tid,place.id,a.id]);
 legacyPost=(await pool.query("INSERT INTO community_post(thread_id,author_id,body) VALUES($1,$2,'Legacy rejoined post') RETURNING id",[tid,a.id])).rows[0].id;
 legacyFirstPost=(await pool.query("INSERT INTO community_post(thread_id,author_id,body) VALUES($1,$2,'Legacy first generation') RETURNING id",[tid,b.id])).rows[0].id;
 await pool.query('UPDATE community_member SET generation=3 WHERE community_id=$1 AND user_id=$2',[place.id,a.id]);
 legacyBefore=(await pool.query('SELECT id,thread_id,author_id,body,status,created_at,revision FROM community_post ORDER BY id')).rows;
 await migrateMemberDatabase(pool,true,true,true);await migrateMemberDatabase(pool,true,true,true);
},30000);
beforeEach(async()=>{await memberRuntime().pool.query('DELETE FROM community_rate');});
afterAll(async()=>{await memberRuntime().pool.end();await bootstrap?.end();await issuer?.close();});

it('009 is explicit/additive, seeds exactly two distinct AI identities and no human profiles',async()=>{
 expect((await memberRuntime().pool.query('SELECT name FROM member_migration ORDER BY name')).rows).toHaveLength(10);
 expect((await memberRuntime().pool.query('SELECT id FROM ai_identity ORDER BY id')).rows.map(r=>r.id).sort()).toEqual([OFFICIAL_AI_ID,APPRENTICE_AI_ID].sort());
 expect((await(await call('/me',a)).json()).profile).toBeNull();
 for(const [key,id] of [['plunode-official-ai',OFFICIAL_AI_ID],['explorer-apprentice',APPRENTICE_AI_ID]]){const data=await pub(key);expect(data.profile.ai.id).toBe(id);expect(data.activities).toEqual([]);expect(data.nextCursor).toBeNull();}
 expect((await memberRuntime().pool.query('SELECT id FROM "user" WHERE id=ANY($1::uuid[])',[[OFFICIAL_AI_ID,APPRENTICE_AI_ID]])).rowCount).toBe(0);
});
it('009 preserves existing post columns and never guesses a rejoined legacy author generation',async()=>{
 const pool=memberRuntime().pool;expect((await pool.query('SELECT id,thread_id,author_id,body,status,created_at,revision FROM community_post ORDER BY id')).rows).toEqual(legacyBefore);
 expect((await pool.query('SELECT author_generation FROM community_post WHERE id=$1',[legacyPost])).rows[0].author_generation).toBeNull();
 expect((await pool.query('SELECT author_generation FROM community_post WHERE id=$1',[legacyFirstPost])).rows[0].author_generation).toBe(1);
});
it('real OIDC registration is opt-in, never imports provider name/image/email or internal UUID',async()=>{
 const c=await make(a);const t=await thread(c.id,a);const before=await(await com('/threads/'+t.id)).json();
 expect(before.posts[0].name).toBeNull();expect(before.posts[0].author).toBeNull();expect(JSON.stringify(before.posts)).not.toContain(a.id);expect(JSON.stringify(before.posts)).not.toContain(a.name);
 expect((await save(a,'profile-alice')).status).toBe(200);const data=await pub('profile-alice');expect(data.profile.displayName).toBe('公開 profile-alice');
 const serialized=JSON.stringify(data);for(const secret of [a.id,a.name,'@fixture.test','email','image','user_id'])expect(serialized).not.toContain(secret);
 const after=await(await com('/threads/'+t.id)).json();expect(after.posts[0].author).toEqual({handle:'profile-alice',icon:'leaf'});expect(after.posts[0].name).toBe('公開 profile-alice');expect(after.posts[0]).not.toHaveProperty('author_id');
});
it('profile writes require real human session, same origin and exact expected user',async()=>{
 const input={handle:'profile-bob',displayName:'Bob',bio:'',icon:'star',timelinePublic:false,expectedRevision:0};
 expect((await call('/me',undefined,'PUT',input)).status).toBe(400);
 expect((await call('/me',b,'PUT',input,{origin:'https://evil.example'})).status).toBe(403);
 expect((await call('/me',b,'PUT',input,{'x-member-user':a.id})).status).toBe(401);
 expect((await call('/me',b,'PUT',{...input,aiIdentityId:OFFICIAL_AI_ID})).status).toBe(400);
 expect((await call('/me',b,'PUT',input)).status).toBe(200);
 expect((await call('/me',b,'PUT',input)).status).toBe(409);
 expect((await call('/me',{...b,id:OFFICIAL_AI_ID},'PUT',input)).status).toBe(401);
});
it('handles normalize, reject reserved names, serialize collisions and preserve retired IDs',async()=>{
 for(const handle of ['admin-team','plunode-fake','official-guide','bad--id','-bad','bad-','x','bad/name'])expect((await save(b,handle)).status).toBe(400);
 expect((await save(b,'PROFILE-BOB')).status).toBe(200);expect((await pub('profile-bob')).profile.handle).toBe('profile-bob');
 const third=await person('profile-third');const race=await Promise.all([save(third,'same-handle'),save(b,'same-handle')]);expect(race.map(r=>r.status).sort()).toEqual([200,409]);
 const winner=race[0].status===200?third:b;expect((await save(winner,'renamed-handle')).status).toBe(200);
 expect((await call('/profiles/same-handle')).status).toBe(404);expect((await save(a,'same-handle')).status).toBe(409);
});
it('private timeline is identical for anonymous, owner, another user and forged AI identity, with no counts/cursor/times',async()=>{
 expect((await save(a,'profile-alice',{timelinePublic:false})).status).toBe(200);
 const all=await Promise.all([pub('profile-alice'),pub('profile-alice',a),pub('profile-alice',b),pub('profile-alice',{...b,id:OFFICIAL_AI_ID})]);
 for(const data of all){expect(data.activities).toEqual([]);expect(data.nextCursor).toBeNull();expect(data).not.toHaveProperty('count');expect(data.profile).not.toHaveProperty('updatedAt');}
 expect(all).toEqual([all[0],all[0],all[0],all[0]]);
 await save(a,'profile-alice');
});
it('only real current public sources enter timelines; limited existence/content/participation never does',async()=>{
 const c=await make(a),publicT=await thread(c.id,a,'public','actually-public'),privateT=await thread(c.id,a,'cohort','secret-cohort');
 const privateC=await make(a,'members'),limitedT=await thread(privateC.id,a,'cohort','secret-private');
 for(const who of [undefined,a,b]){const data=await pub('profile-alice',who),wire=JSON.stringify(data);expect(data.activities.some((p:{id:string})=>p.id===publicT.post)).toBe(true);
  for(const secret of [privateT.id,privateT.post,limitedT.id,limitedT.post,privateC.id,'secret-cohort','secret-private'])expect(wire).not.toContain(secret);
  expect(data.activities.every((p:{source:{kind:string,revision:number}})=>p.source.kind==='community-post'&&p.source.revision>=1)).toBe(true);
 }
 await change(c.id,a,'settings',{title:'Now private',description:'',visibility:'members'});
 expect(JSON.stringify(await pub('profile-alice'))).not.toContain(publicT.id);
 await change(c.id,a,'settings',{title:'Public again',description:'',visibility:'public'});
 expect(JSON.stringify(await pub('profile-alice'))).not.toContain(publicT.id);
});
it('withdrawal, moderation and community suspension remove source references immediately',async()=>{
 const c=await make(a),t=await thread(c.id,a,'public','withdraw-me');expect(JSON.stringify(await pub('profile-alice'))).toContain(t.post);
 expect((await com('/posts/'+t.post+'/withdraw',a,{})).status).toBe(200);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.post);
 const h=await thread(c.id,a,'public','hide-me');expect((await com('/posts/'+h.post+'/moderate',a,{expectedRevision:1,hidden:true,reason:'Test moderation'})).status).toBe(200);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(h.post);
 const s=await thread(c.id,a,'public','suspend-place');await memberRuntime().pool.query("UPDATE community SET status='suspended' WHERE id=$1",[c.id]);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(s.post);
});
it('revoked author generation never returns through follow, rejoining or old cursors',async()=>{
 const c=await make(b);await change(c.id,a,'join');const t=await thread(c.id,a,'public','past-generation');expect(JSON.stringify(await pub('profile-alice'))).toContain(t.post);
 await change(c.id,a,'leave');expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.post);
 await change(c.id,a,'join');expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.post);
});
it('following is private, idempotent, cannot grant private access or create a human session for AI',async()=>{
 expect((await call('/following')).status).toBe(401);
 for(const key of ['plunode-official-ai','explorer-apprentice','profile-alice']){
  expect((await call('/follows/'+key,b,'PUT',{})).status).toBe(200);expect((await call('/follows/'+key,b,'PUT',{})).status).toBe(200);
  expect((await(await call('/follows/'+key,b)).json()).following).toBe(true);
 }
 const list=await(await call('/following',b)).json();expect(list.profiles.map((p:{handle:string})=>p.handle)).toEqual(expect.arrayContaining(['profile-alice','plunode-official-ai','explorer-apprentice']));expect(JSON.stringify(list)).not.toContain(a.id);
 const c=await make(a,'members'),t=await thread(c.id,a,'cohort','follow-never-grants');expect((await com('/'+c.id,b)).status).toBe(404);expect((await com('/threads/'+t.id,b)).status).toBe(404);
 expect((await call('/follows/profile-alice',a,'PUT',{})).status).toBe(400);
 expect((await call('/follows/plunode-official-ai',{...b,id:OFFICIAL_AI_ID},'PUT',{})).status).toBe(401);
 expect((await call('/follows/plunode-official-ai',b,'DELETE',{})).status).toBe(200);expect((await call('/follows/plunode-official-ai',b,'DELETE',{})).status).toBe(200);
 expect((await(await call('/follows/plunode-official-ai',b)).json()).following).toBe(false);
});
it('AI suspension hides profile and following entry without altering lab artifacts or other identities',async()=>{
 await call('/follows/plunode-official-ai',b,'PUT',{});
 expect((await operateAiIdentity(memberRuntime().pool,{id:OFFICIAL_AI_ID,status:'suspended',actor:'test',reason:'Review'},false)).applied).toBe(false);expect((await call('/profiles/plunode-official-ai')).status).toBe(200);
 await operateAiIdentity(memberRuntime().pool,{id:OFFICIAL_AI_ID,status:'suspended',actor:'test',reason:'Review'},true);
 expect((await call('/profiles/plunode-official-ai')).status).toBe(404);expect((await call('/follows/plunode-official-ai',b,'PUT',{})).status).toBe(404);
 expect(JSON.stringify(await(await call('/following',b)).json())).not.toContain('plunode-official-ai');expect((await call('/profiles/explorer-apprentice')).status).toBe(200);
 await operateAiIdentity(memberRuntime().pool,{id:OFFICIAL_AI_ID,status:'active',actor:'test',reason:'Reopen'},true);
});
it('waiting timeline rechecks public-to-limited changes after community lock is released',async()=>{
 const c=await make(a),t=await thread(c.id,a,'public','no-stale-response'),lock=await memberRuntime().pool.connect();
 try{await lock.query('BEGIN');await lock.query('SELECT id FROM community WHERE id=$1 FOR UPDATE',[c.id]);const waiting=pub('profile-alice');await new Promise(r=>setTimeout(r,80));await lock.query("UPDATE community_thread SET audience='cohort' WHERE id=$1",[t.id]);await lock.query('COMMIT');expect(JSON.stringify(await waiting)).not.toContain(t.id);}finally{await lock.query('ROLLBACK');lock.release();}
});
it('waiting profile read rechecks timeline privacy after owner lock is released',async()=>{
 const lock=await memberRuntime().pool.connect();try{await lock.query('BEGIN');await lock.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[a.id]);const waiting=pub('profile-alice');await new Promise(r=>setTimeout(r,80));await lock.query('UPDATE public_profile SET timeline_public=false,revision=revision+1 WHERE user_id=$1',[a.id]);await lock.query('COMMIT');expect((await waiting).activities).toEqual([]);}finally{await lock.query('ROLLBACK');lock.release();}await save(a,'profile-alice');
});
it('pagination cursors contain only authorized boundaries and reauthorize every page',async()=>{
 const c=await make(a);await thread(c.id,a,'public','page-one');await thread(c.id,a,'public','page-two');const first=await(await call('/profiles/profile-alice?limit=1')).json();expect(first.activities).toHaveLength(1);expect(first.nextCursor).toBeTruthy();
 const payload=JSON.parse(Buffer.from(first.nextCursor.split('.')[0],'base64url').toString());expect(payload.user).toBeNull();expect(JSON.stringify(payload)).not.toContain(a.id);
 await save(a,'profile-alice',{timelinePublic:false});const next=await(await call('/profiles/profile-alice?limit=1&cursor='+encodeURIComponent(first.nextCursor))).json();expect(next.activities).toEqual([]);expect(next.nextCursor).toBeNull();await save(a,'profile-alice');
 expect((await call('/profiles/profile-alice?limit=1&cursor=tampered')).status).toBe(400);
});
it('suspension, resume and deletion obey account lifecycle, preserve retired handle tombstones',async()=>{
 const who=await person('lifecycle-profile');await save(who,'lifecycle-person');const c=await make(who),t=await thread(c.id,who);await call('/follows/lifecycle-person',b,'PUT',{});
 await operateMember(memberRuntime().pool,{action:'suspend-user',target:who.id,actor:'test',reason:'security'},true);expect((await call('/profiles/lifecycle-person')).status).toBe(404);expect(JSON.stringify(await(await call('/following',b)).json())).not.toContain('lifecycle-person');
 await operateMember(memberRuntime().pool,{action:'resume-user',target:who.id,actor:'test',reason:'correction'},true);expect((await pub('lifecycle-person')).activities).toEqual([]);
 const again=await person('lifecycle-profile');expect((await memberRuntime().service.deleteAccount(request('/api/member/profile',again,'DELETE',{confirmation:'delete-account'}))).status).toBe(200);
 expect((await call('/profiles/lifecycle-person')).status).toBe(404);expect((await save(b,'lifecycle-person')).status).toBe(409);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.post);
});
it('disabled feature cannot access profile/follow storage and keeps community provider identities private',async()=>{
 process.env.PUBLIC_PROFILES_ENABLED='0';try{
  expect((await call('/profiles/plunode-official-ai')).status).toBe(404);expect((await call('/me',a)).status).toBe(404);
  const tid=(await memberRuntime().pool.query('SELECT thread_id FROM community_post WHERE id=$1',[legacyPost])).rows[0].thread_id;
  const source=await(await com('/threads/'+tid)).json();expect(source.posts.every((p:{name:string|null,author:unknown})=>p.name===null&&p.author===null)).toBe(true);
  expect(JSON.stringify(source)).not.toContain(a.id);expect(JSON.stringify(source)).not.toContain(b.id);
 }finally{process.env.PUBLIC_PROFILES_ENABLED='1';}
});
