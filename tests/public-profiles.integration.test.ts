import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
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
const oldTables:{name:string;columns:string;rows:unknown[];after?:unknown[]}[]=[];
async function inviteFixture(){
 const owner=await person('invite-owner'),target=await person('invite-target'),other=await person('invite-third'),handle='invite-'+randomUUID().slice(0,8);
 expect((await save(target,handle)).status).toBe(200);const community=await make(owner,'members');
 const issue=async(userId:string,who:Person|undefined=owner,extra={})=>{const current=(await(await com('/'+community.id,owner)).json()).community;return com('/'+community.id+'/invitations',who,{expectedRevision:current.revision,userId,...extra});};
 return {owner,target,other,handle,community,issue};
}
let legacyPost='',legacyFirstPost='',legacyBefore:unknown[]=[],bootstrap:ReturnType<typeof memberPool>;
beforeAll(async()=>{
 if(process.env.PUBLIC_PROFILES_ENABLED!=='1')throw Error('Use test-member --accounts');issuer=await startMemberOidc();
 const pool=bootstrap=memberPool(memberConfig()!);await migrateMemberDatabase(pool,true,true);
 process.env.PUBLIC_PROFILES_ENABLED='0';
 a=await person('profile-a');b=await person('profile-b');const place=await make(a);await change(place.id,b,'join');
 const tid=randomUUID();await pool.query("INSERT INTO community_thread(id,community_id,author_id,title,audience) VALUES($1,$2,$3,'Legacy public','public')",[tid,place.id,a.id]);
 legacyPost=(await pool.query("INSERT INTO community_post(thread_id,author_id,body) VALUES($1,$2,'Legacy rejoined post') RETURNING id",[tid,a.id])).rows[0].id;
 legacyFirstPost=(await pool.query("INSERT INTO community_post(thread_id,author_id,body) VALUES($1,$2,'Legacy first generation') RETURNING id",[tid,b.id])).rows[0].id;
 await pool.query('UPDATE community_member SET generation=3 WHERE community_id=$1 AND user_id=$2',[place.id,a.id]);
 legacyBefore=(await pool.query('SELECT id,thread_id,author_id,body,status,created_at,revision FROM community_post ORDER BY id')).rows;
 const sql=await readFile(new URL('../db/member/009-public-profiles.sql',import.meta.url),'utf8');
 await pool.query(sql);await pool.query('INSERT INTO member_migration(name,checksum) VALUES($1,$2)',['009-public-profiles.sql',createHash('sha256').update(sql).digest('hex')]);
 await pool.query("INSERT INTO public_profile(user_id,handle,display_name,bio,icon,timeline_public,revision) VALUES($1,'existing-bob','本人が設定した名前','Saved bio','star',false,7)",[b.id]);
 await pool.query("INSERT INTO public_handle_claim(handle,profile_id) SELECT handle,id FROM public_profile WHERE user_id=$1",[b.id]);
 await pool.query("INSERT INTO public_handle_claim(handle) VALUES('retired-fixture')");
 await pool.query("INSERT INTO account_follow(user_id,profile_id) SELECT $1,id FROM public_profile WHERE handle='plunode-official-ai'",[b.id]);
 const tables=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'member_migration' ORDER BY table_name")).rows;
 for(const {table_name:name} of tables){
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[name])).rows.map(r=>r.column_name).filter(n=>name!=='user'||n!=='name').map(n=>'"'+n.replaceAll('"','""')+'"').join(',');
  const rows=(await pool.query(`SELECT row_to_json(x) AS row FROM (SELECT ${columns} FROM "${name}") x ORDER BY row_to_json(x)::text`)).rows.map(r=>r.row);
  oldTables.push({name,columns,rows});
 }
 await migrateMemberDatabase(pool,true,true,true);await migrateMemberDatabase(pool,true,true,true);
 for(const table of oldTables)table.after=(await pool.query(`SELECT row_to_json(x) AS row FROM (SELECT ${table.columns} FROM "${table.name}") x ORDER BY row_to_json(x)::text`)).rows.map(r=>r.row);
 process.env.PUBLIC_PROFILES_ENABLED='1';
},30000);
beforeEach(async()=>{await memberRuntime().pool.query('DELETE FROM community_rate');});
afterAll(async()=>{await memberRuntime().pool.end();await bootstrap?.end();await issuer?.close();});

it('010 is additive, prepares every human exactly once and preserves AI identities',async()=>{
 expect((await memberRuntime().pool.query('SELECT name FROM member_migration ORDER BY name')).rows).toHaveLength(11);
 expect((await memberRuntime().pool.query('SELECT id FROM ai_identity ORDER BY id')).rows.map(r=>r.id).sort()).toEqual([OFFICIAL_AI_ID,APPRENTICE_AI_ID].sort());
 const own=await(await call('/me',a)).json();expect(own.profile.displayName).toBe(a.name);expect(own.profile.handle).toMatch(/^member-[a-f0-9]{16}$/);expect(own.profile.timelinePublic).toBe(true);
 expect((await memberRuntime().pool.query('SELECT user_id FROM public_profile WHERE user_id IS NOT NULL')).rows).toHaveLength(2);
 const saved=await(await call('/me',b)).json();expect(saved).toMatchObject({revision:7,profile:{handle:'existing-bob',displayName:'本人が設定した名前',bio:'Saved bio',icon:'star',timelinePublic:false}});
 expect((await memberRuntime().pool.query('SELECT name FROM "user" WHERE id=$1',[b.id])).rows[0].name).toBe('本人が設定した名前');
 for(const [key,id] of [['plunode-official-ai',OFFICIAL_AI_ID],['explorer-apprentice',APPRENTICE_AI_ID]]){const data=await pub(key);expect(data.profile.ai.id).toBe(id);expect(data.activities).toEqual([]);expect(data.nextCursor).toBeNull();}
 expect((await memberRuntime().pool.query('SELECT id FROM "user" WHERE id=ANY($1::uuid[])',[[OFFICIAL_AI_ID,APPRENTICE_AI_ID]])).rowCount).toBe(0);
});
it('010 preserves every old column except intentional name normalization; saved profiles/follows/claims stay intact',async()=>{
 expect(oldTables.length).toBeGreaterThan(25);
 for(const table of oldTables){
  const rows=table.after;
  if(['public_profile','public_handle_claim'].includes(table.name))expect(rows).toEqual(expect.arrayContaining(table.rows));else expect(rows).toEqual(table.rows);
 }
});
it('009 preserves existing post columns and never guesses a rejoined legacy author generation',async()=>{
 const pool=memberRuntime().pool;expect((await pool.query('SELECT id,thread_id,author_id,body,status,created_at,revision FROM community_post ORDER BY id')).rows).toEqual(legacyBefore);
 expect((await pool.query('SELECT author_generation FROM community_post WHERE id=$1',[legacyPost])).rows[0].author_generation).toBeNull();
 expect((await pool.query('SELECT author_generation FROM community_post WHERE id=$1',[legacyFirstPost])).rows[0].author_generation).toBe(1);
});
it('normal OIDC automatically prepares a safe profile and chosen names replace the initial name everywhere',async()=>{
 const c=await make(a);const t=await thread(c.id,a);const before=await(await com('/threads/'+t.id)).json();
 expect(before.posts[0].name).toBe(a.name);expect(before.posts[0].author.handle).toMatch(/^member-/);expect(JSON.stringify(before.posts)).not.toContain(a.id);
 expect((await save(a,'profile-alice')).status).toBe(200);const data=await pub('profile-alice');expect(data.profile.displayName).toBe('公開 profile-alice');
 const serialized=JSON.stringify(data);for(const secret of [a.id,a.name,'@fixture.test','email','provider_image','user_id'])expect(serialized).not.toContain(secret);
 const after=await(await com('/threads/'+t.id)).json();expect(after.posts[0].author).toEqual({handle:'profile-alice',icon:'leaf',imageUrl:null});expect(after.posts[0].name).toBe('公開 profile-alice');expect(after.posts[0]).not.toHaveProperty('author_id');
});
it('new real OIDC users receive unique pseudonyms for missing/email names without a setup gate',async()=>{
 const empty=await person('profile-empty'),email=await person('profile-email');
 const profiles=await Promise.all([empty,email].map(async u=>(await(await call('/me',u)).json()).profile));
 for(let i=0;i<2;i++){
  const p=profiles[i];expect(p.displayName).toMatch(/^Explorer [a-f0-9]{12}$/);expect(p.timelinePublic).toBe(true);expect(p.bio).toBe('');expect(p.icon).toBe('person');
  expect(JSON.stringify(await pub(p.handle))).not.toContain(i?email.id:empty.id);expect(JSON.stringify(await pub(p.handle))).not.toContain('@example.invalid');
 }
 expect(profiles[0].displayName).not.toBe(profiles[1].displayName);expect(profiles[0].handle).not.toBe(profiles[1].handle);
 const pool=memberRuntime().pool;
 await Promise.all([pool.query('SELECT member_prepare_public_profile($1)',[empty.id]),pool.query('SELECT member_prepare_public_profile($1)',[empty.id])]);
 expect((await pool.query('SELECT count(*)::int AS n FROM public_profile WHERE user_id=$1',[empty.id])).rows[0].n).toBe(1);
});
it('one name survives both edit APIs, concurrent updates and a real provider relogin',async()=>{
 const who=await person('profile-third'),initial=await(await call('/me',who)).json();await save(who,initial.profile.handle,{timelinePublic:false});const own=await(await call('/me',who)).json(),key=own.profile.handle;
 const updates=await Promise.all([
  call('/me',who,'PUT',{handle:key,displayName:'Chosen public name',bio:'',icon:'orbit',timelinePublic:false,expectedRevision:own.revision}),
  memberRuntime().service.updateProfile(request('/api/member/profile',who,'PUT',{name:'Chosen account name'})),
 ]);
 expect([200,409]).toContain(updates[0].status);expect(updates[1].status).toBe(200);
 const current=await(await call('/me',who)).json(),member=await(await memberRuntime().service.profile(request('/api/member/profile',who))).json();
 expect(current.profile.displayName).toBe(member.user.name);expect(current.profile.timelinePublic).toBe(false);expect(current.revision).toBeGreaterThan(own.revision);
 issuer.setName('profile-third','A new provider name');const again=await person('profile-third');
 expect(again.id).toBe(who.id);expect(again.name).toBe(current.profile.displayName);expect((await(await call('/me',again)).json()).profile).toEqual(current.profile);
 const context=await memberRuntime().auth.$context;
 await context.internalAdapter.updateUser(who.id,{name:'Provider overwrite attempt'});
 expect((await memberRuntime().pool.query('SELECT name FROM "user" WHERE id=$1',[who.id])).rows[0].name).toBe(current.profile.displayName);
 for(const name of ['','   ','\n']){
  await expect(memberRuntime().service.updateProfile(request('/api/member/profile',again,'PUT',{name}))).rejects.toMatchObject({status:400});
  expect((await call('/me',again,'PUT',{handle:key,displayName:name,bio:'',icon:'person',timelinePublic:true,expectedRevision:current.revision})).status).toBe(400);
 }
});
it('creation and comments project distinct real sources, without any message excerpts',async()=>{
 const c=await make(a),t=await thread(c.id,a,'public','visible-source');
 const response=await com('/threads/'+t.id+'/posts',a,{requestId:randomUUID(),expectedRevision:1,body:'COMMENT-BODY-MUST-NOT-LEAK-IN-TIMELINE'});expect(response.status).toBe(201);const comment=(await response.json()).id;
 for(const who of [undefined,a,b]){
  const data=await pub('profile-alice',who),wire=JSON.stringify(data);
  expect(data.activities).toEqual(expect.arrayContaining([
   expect.objectContaining({id:c.id,kind:'community-created',source:expect.objectContaining({kind:'community',id:c.id})}),
   expect.objectContaining({id:t.id,kind:'thread-created',source:expect.objectContaining({kind:'community-thread',id:t.id})}),
   expect.objectContaining({id:comment,kind:'community-comment',source:expect.objectContaining({kind:'community-post',id:comment})}),
  ]));
  expect(wire).not.toContain('COMMENT-BODY-MUST-NOT-LEAK');expect(wire).not.toContain('excerpt');expect(wire).not.toContain(t.post);
  expect(wire).not.toContain(legacyPost);expect(wire).not.toContain(legacyFirstPost);
 }
 await memberRuntime().pool.query('DELETE FROM community_post WHERE id=$1',[comment]);
 expect((await pub('profile-alice')).activities.some((r:{id:string})=>r.id===comment)).toBe(false);
 await memberRuntime().pool.query('DELETE FROM community_post WHERE id=$1',[t.post]);
 const later=await com('/threads/'+t.id+'/posts',a,{requestId:randomUUID(),expectedRevision:1,body:'A later reply must not replace the deleted opening'});expect(later.status).toBe(201);
 expect((await pub('profile-alice')).activities.some((r:{id:string})=>r.id===t.id)).toBe(false);
 await change(c.id,a,'settings',{title:c.title,description:'',visibility:'members'});await change(c.id,a,'settings',{title:c.title,description:'',visibility:'public'});
 const restored=JSON.stringify(await pub('profile-alice'));for(const id of [c.id,t.id,comment])expect(restored).not.toContain(id);
});
it('creator and roster bindings stay inside readable scope and never expose a public member roster',async()=>{
 const c=await make(a),t=await thread(c.id,a),publicPlace=await(await com('/'+c.id)).json();
 expect(publicPlace.community.creator).toEqual({handle:'profile-alice',displayName:'公開 profile-alice',icon:'leaf',imageUrl:null});
 expect(publicPlace.threads.find((r:{id:string})=>r.id===t.id).creator).toEqual(publicPlace.community.creator);expect(publicPlace.members).toEqual([]);
 const detail=await(await com('/threads/'+t.id)).json();expect(detail.thread.creator).toEqual(publicPlace.community.creator);
 expect(JSON.stringify(publicPlace)).not.toContain(a.id);
 const admin=await(await com('/'+c.id,a)).json();expect(admin.members.find((r:{id:string})=>r.id===a.id).creator).toEqual(publicPlace.community.creator);
 const secret=await make(a,'members'),limited=await thread(secret.id,a,'cohort','CREATOR-LIMITED-SECRET');
 for(const who of [undefined,b]){expect((await com('/'+secret.id,who)).status).toBe(404);expect((await com('/threads/'+limited.id,who)).status).toBe(404);expect(JSON.stringify(await(await com('',who)).json())).not.toContain(secret.id);}
});
it('private thread activity and membership do not change the public creation projection or its version',async()=>{
 const c=await make(a);await thread(c.id,a,'public','public-version');
 const before=(await pub('profile-alice')).activities;
 await change(c.id,b,'join');const secret=await thread(c.id,b,'cohort','private-version-secret');
 expect((await com('/threads/'+secret.id+'/posts',b,{requestId:randomUUID(),expectedRevision:1,body:'Private reply, with a private timestamp'})).status).toBe(201);
 expect((await pub('profile-alice')).activities).toEqual(before);
 const wire=JSON.stringify(await pub('profile-alice'));for(const id of [secret.id,secret.post,'private-version-secret'])expect(wire).not.toContain(id);
});

it('profile writes require real human session, same origin and exact expected user',async()=>{
 const input={handle:'profile-bob',displayName:'Bob',bio:'',icon:'star',timelinePublic:false,expectedRevision:(await(await call('/me',b)).json()).revision};
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
 for(const who of [undefined,a,b]){const data=await pub('profile-alice',who),wire=JSON.stringify(data);expect(data.activities.some((p:{id:string})=>p.id===publicT.id)).toBe(true);
  for(const secret of [privateT.id,privateT.post,limitedT.id,limitedT.post,privateC.id,'secret-cohort','secret-private'])expect(wire).not.toContain(secret);
  expect(data.activities.every((p:{source:{kind:string,revision:number}})=>['community','community-thread','community-post'].includes(p.source.kind)&&p.source.revision>=1)).toBe(true);
 }
 await change(c.id,a,'settings',{title:'Now private',description:'',visibility:'members'});
 expect(JSON.stringify(await pub('profile-alice'))).not.toContain(publicT.id);
 await change(c.id,a,'settings',{title:'Public again',description:'',visibility:'public'});
 expect(JSON.stringify(await pub('profile-alice'))).not.toContain(publicT.id);
});
it('withdrawal, moderation and community suspension remove source references immediately',async()=>{
 const c=await make(a),t=await thread(c.id,a,'public','withdraw-me');expect(JSON.stringify(await pub('profile-alice'))).toContain(t.id);
 expect((await com('/posts/'+t.post+'/withdraw',a,{})).status).toBe(200);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.id);
 const h=await thread(c.id,a,'public','hide-me');expect((await com('/posts/'+h.post+'/moderate',a,{expectedRevision:1,hidden:true,reason:'Test moderation'})).status).toBe(200);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(h.post);
 const s=await thread(c.id,a,'public','suspend-place');await memberRuntime().pool.query("UPDATE community SET status='suspended' WHERE id=$1",[c.id]);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(s.post);
});
it('revoked author generation never returns through follow, rejoining or old cursors',async()=>{
 const c=await make(b);await change(c.id,a,'join');const t=await thread(c.id,a,'public','past-generation');expect(JSON.stringify(await pub('profile-alice'))).toContain(t.id);
 await change(c.id,a,'leave');expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.id);
 await change(c.id,a,'join');expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.id);
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
 expect((await call('/profiles/lifecycle-person')).status).toBe(404);expect((await save(b,'lifecycle-person')).status).toBe(409);expect(JSON.stringify(await pub('profile-alice'))).not.toContain(t.id);
});
it('disabled feature cannot access profile/follow storage and keeps community provider identities private',async()=>{
 process.env.PUBLIC_PROFILES_ENABLED='0';try{
  expect((await call('/profiles/plunode-official-ai')).status).toBe(404);expect((await call('/me',a)).status).toBe(404);
  const tid=(await memberRuntime().pool.query('SELECT thread_id FROM community_post WHERE id=$1',[legacyPost])).rows[0].thread_id;
  const source=await(await com('/threads/'+tid)).json();expect(source.posts.every((p:{name:string|null,author:unknown})=>p.name===null&&p.author===null)).toBe(true);
  expect(JSON.stringify(source)).not.toContain(a.id);expect(JSON.stringify(source)).not.toContain(b.id);
 }finally{process.env.PUBLIC_PROFILES_ENABLED='1';}
});

it('@handle and legacy UUID issue the same bound invitation; rename, reissue, other-user and cancellation stay safe',async()=>{
 const f=await inviteFixture(),oldThread=await thread(f.community.id,f.owner,'cohort','before-invite');
 const first=await f.issue(' @'+f.handle.toUpperCase()+' ');expect(first.status).toBe(201);const firstId=(await first.json()).id;
 const sent=await(await com('/'+f.community.id+'/invitations',f.owner)).json();expect(sent.community.creator.handle).toBe((await(await call('/me',f.owner)).json()).profile.handle);
 const pending=(await(await com('/invitations',f.target)).json()).invitations.find((i:{id:string})=>i.id===firstId);expect(pending.targetId).toBe(f.target.id);expect(pending.targetHandle).toBe(f.handle);
 expect((await com('/invitations/'+firstId+'/accept',f.other,{expectedRevision:1})).status).toBe(404);
 const duplicate=await f.issue(f.target.id.toUpperCase());expect(duplicate.status).toBe(201);const id=(await duplicate.json()).id;
 expect((await com('/invitations/'+firstId+'/accept',f.target,{expectedRevision:1})).status).toBe(409);
 const newHandle='renamed-'+randomUUID().slice(0,8);expect((await save(f.target,newHandle)).status).toBe(200);
 expect((await f.issue('@'+f.handle)).status).toBe(400);
 expect((await com('/invitations/'+id+'/accept',f.target,{expectedRevision:1})).status).toBe(200);
 expect((await com('/threads/'+oldThread.id,f.target)).status).toBe(404);
 expect((await f.issue('@'+newHandle)).status).toBe(409);
 await change(f.community.id,f.target,'leave');
 const again=await f.issue('@'+newHandle);expect(again.status).toBe(201);const cancel=(await again.json()).id;
 expect((await com('/invitations/'+cancel+'/revoke',f.owner,{expectedRevision:1})).status).toBe(200);
 expect((await com('/invitations/'+cancel+'/accept',f.target,{expectedRevision:2})).status).toBe(409);
});
it('invite resolution requires management and charges failed lookups; AI, missing, inactive and withdrawn handles share one error',async()=>{
 const f=await inviteFixture(),pool=memberRuntime().pool;
 for(const who of [undefined,{...f.owner,cookie:''},f.other])for(const key of ['@'+f.handle,'@unavailable-human']){
  const current=(await(await com('/'+f.community.id,f.owner)).json()).community;
  const r=await com('/'+f.community.id+'/invitations',who,{expectedRevision:current.revision,userId:key});expect(r.status).toBe(!who?400:who.cookie?404:401);
 }
 expect((await pool.query("SELECT * FROM community_rate WHERE action='invitation'")).rowCount).toBe(0);
 const unavailable=async(key:string)=>{const r=await f.issue(key);expect(r.status).toBe(400);expect(await r.json()).toEqual({error:{code:'TARGET_UNAVAILABLE'}});};
 for(const key of ['@unavailable-human','@plunode-official-ai','@explorer-apprentice',OFFICIAL_AI_ID])await unavailable(key);
 await operateMember(pool,{action:'suspend-user',target:f.target.id,actor:'test',reason:'security'},true);await unavailable('@'+f.handle);await unavailable(f.target.id);
 await operateMember(pool,{action:'resume-user',target:f.target.id,actor:'test',reason:'correction'},true);
 await pool.query('UPDATE "user" SET active=false WHERE id=$1',[f.other.id]);await unavailable('@'+f.handle+'-unknown');
 const otherHandle=(await pool.query('SELECT handle FROM public_profile WHERE user_id=$1',[f.other.id])).rows[0].handle;await unavailable('@'+otherHandle);await pool.query('DELETE FROM "user" WHERE id=$1',[f.other.id]);await unavailable('@'+otherHandle);await unavailable(f.other.id);
 await pool.query("UPDATE community_rate SET used=60 WHERE user_id=$1 AND action='invitation'",[f.owner.id]);expect((await f.issue('@unavailable-human')).status).toBe(429);expect((await f.issue('@'+f.handle)).status).toBe(429);
});
it('@handle invitations retain expiry, issuer generation and target suspension invalidation',async()=>{
 const f=await inviteFixture(),pool=memberRuntime().pool;
 const issue=async()=>{const r=await f.issue('@'+f.handle);expect(r.status).toBe(201);return (await r.json()).id;};
 const expired=await issue();await pool.query("UPDATE community_invitation SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired]);expect((await com('/invitations/'+expired+'/accept',f.target,{expectedRevision:1})).status).toBe(409);
 const generation=await issue();await pool.query('UPDATE community_member SET generation=generation+1 WHERE community_id=$1 AND user_id=$2',[f.community.id,f.owner.id]);expect((await com('/invitations/'+generation+'/accept',f.target,{expectedRevision:1})).status).toBe(409);
 const stopped=await issue();await operateMember(pool,{action:'suspend-user',target:f.target.id,actor:'test',reason:'security'},true);expect((await com('/invitations/'+stopped+'/accept',f.target,{expectedRevision:1})).status).toBe(401);
 await operateMember(pool,{action:'resume-user',target:f.target.id,actor:'test',reason:'correction'},true);const signed=await person('invite-target');expect((await com('/invitations/'+stopped+'/accept',signed,{expectedRevision:2})).status).toBe(409);
});
it('handle changes while user locking is pending never redirect an invitation to a different or retired handle',async()=>{
 const f=await inviteFixture(),pool=memberRuntime().pool,lock=await pool.connect();
 try{await lock.query('BEGIN');await lock.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[f.target.id]);const pending=f.issue('@'+f.handle);await vi.waitFor(async()=>expect((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT active FROM%'")).rowCount).toBeGreaterThan(0));await lock.query('UPDATE public_profile SET handle=$2 WHERE user_id=$1',[f.target.id,'moved-'+randomUUID().slice(0,8)]);await lock.query('COMMIT');expect((await pending).status).toBe(400);expect((await pool.query('SELECT id FROM community_invitation WHERE community_id=$1',[f.community.id])).rowCount).toBe(0);}finally{await lock.query('ROLLBACK');lock.release();}
});

it('016 switches human defaults once, protects saved choices on re-run and projects only opted-in safe Google photos',async()=>{
 const pool=memberRuntime().pool;
 const before=(await pool.query('SELECT * FROM public_profile ORDER BY id')).rows;
 const usersBefore=(await pool.query('SELECT * FROM "user" ORDER BY id')).rows;
 const ledgerBefore=(await pool.query('SELECT * FROM member_migration ORDER BY name')).rows;
 await migrateMemberDatabase(pool,true,true,true,false,false,false,false,false,true);
 const after=(await pool.query('SELECT * FROM public_profile ORDER BY id')).rows;
 expect(after).toEqual(before.map(p=>p.user_id?{...p,icon:'google',revision:p.revision+(p.icon==='google'?0:1)}:p));
 expect((await pool.query('SELECT * FROM "user" ORDER BY id')).rows).toEqual(usersBefore);
 expect((await pool.query('SELECT * FROM member_migration ORDER BY name')).rows.slice(0,-1)).toEqual(ledgerBefore);
 const who=await person('google-photo-default');
 const photo='https://lh3.googleusercontent.com/a/test-account-photo=s96-c';
 await pool.query('UPDATE "user" SET image=$2 WHERE id=$1',[who.id,photo]);
 const own=await(await call('/me',who)).json();
 expect(own).toMatchObject({googleImageUrl:photo,profile:{icon:'google',imageUrl:photo}});
 expect((await pub(own.profile.handle)).profile.imageUrl).toBe(photo);
 expect((await(await memberRuntime().service.profile(request('/api/member/profile',who))).json()).user.profile).toMatchObject({icon:'google',imageUrl:photo});
 const place=await make(who);const conversation=await thread(place.id,who);
 const read=await(await com('/threads/'+conversation.id)).json();
 expect(read.thread.creator.imageUrl).toBe(photo);expect(read.posts[0].author.imageUrl).toBe(photo);
 expect((await save(who,own.profile.handle,{icon:'leaf'})).status).toBe(200);
 expect((await pub(own.profile.handle)).profile.imageUrl).toBeNull();
 expect((await(await call('/me',who)).json()).googleImageUrl).toBe(photo);
 const snapshot=(await pool.query('SELECT * FROM public_profile ORDER BY id')).rows;
 await migrateMemberDatabase(pool,true,true,true,false,false,false,false,false,true);
 expect((await pool.query('SELECT * FROM public_profile ORDER BY id')).rows).toEqual(snapshot);
 expect((await save(who,own.profile.handle,{icon:'google'})).status).toBe(200);
 await pool.query('UPDATE "user" SET image=$2 WHERE id=$1',[who.id,'https://example.com/private-tracker']);
 expect((await pub(own.profile.handle)).profile.imageUrl).toBeNull();
 expect((await(await call('/me',who)).json()).googleImageUrl).toBeNull();
 await pool.query('UPDATE "user" SET image=NULL WHERE id=$1',[who.id]);
 expect((await pub(own.profile.handle)).profile).toMatchObject({icon:'google',imageUrl:null});
});
