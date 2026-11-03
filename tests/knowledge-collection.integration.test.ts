import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
vi.mock('server-only',()=>({}));
import {migrateMemberDatabase} from '../lib/server/member/migrate';
import {memberConfig} from '../lib/server/member/config';import {memberPool} from '../lib/server/member/auth';
import {startMemberOidc} from './support/member-oidc';import {memberRuntime} from '../lib/server/member/runtime';
import * as auth from '../app/api/auth/[...all]/route';import * as profile from '../app/api/member/profile/route';
import * as operator from '../app/api/site-operations/collection/route';import * as worker from '../app/api/knowledge-collection/worker/route';
import {createCollectionWorker} from '../scripts/knowledge-collection-worker';
const origin='http://127.0.0.1:3221',endpoint='/api/site-operations/collection',hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const request=(url:string,cookie='',method='GET',body?:unknown,headers:Record<string,string>={})=>new Request(origin+url,{method,headers:{cookie,origin,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function login(identity:string){const cookies=new Map<string,string>(),receive=(r:Response)=>{for(const value of r.headers.getSetCookie()){const pair=value.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}},cookie=()=>[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');const start=await auth.POST(request('/api/auth/sign-in/social','','POST',{provider:'fixture',callbackURL:'/',disableRedirect:true}));expect(start.status).toBe(200);receive(start);const authorization=new URL((await start.json()).url);authorization.searchParams.set('fixture_identity',identity);const consent=await fetch(authorization,{redirect:'manual'});const location=new URL(consent.headers.get('location')!),callback=await auth.GET(request(location.pathname+location.search,cookie()));receive(callback);const user=(await(await profile.GET(request('/api/member/profile',cookie()))).json()).user;return {cookie:cookie(),id:user.id as string};}
let fixture:Awaited<ReturnType<typeof startMemberOidc>>,alice:Awaited<ReturnType<typeof login>>,bob:Awaited<ReturnType<typeof login>>,temporary:string;
const token=randomBytes(32).toString('hex'),pool=()=>memberRuntime().pool;
const act=(body:unknown,u=alice,headers:Record<string,string>={})=>operator.POST(request(endpoint,u.cookie,'POST',body,{'x-member-user':u.id,...headers}));
const list=(suffix='',u=alice)=>operator.GET(request(endpoint+suffix,u.cookie,'GET',undefined,{'x-member-user':u.id}));
const work=(body:unknown,bearer=token)=>worker.POST(request('/api/knowledge-collection/worker','','POST',body,{authorization:'Bearer '+bearer}));
const create=(urls=['https://example.org/source'])=>({action:'create',requestId:randomUUID(),title:'Finite source request',scope:'Only the source facts relevant to this subject',urls});
const claim=()=>work({action:'claim',requestId:randomUUID()}).then(async r=>{expect(r.status).toBe(200);return(await r.json()).result.lease;});
const document=(text='A public source passage.')=>({url:'https://example.org/source',type:'text/plain;charset=utf-8',bodyBase64:Buffer.from(text).toString('base64'),text,bodySha256:hash(text),textSha256:hash(text),fetchedAt:new Date().toISOString()});
const complete=(lease:Record<string,unknown>,doc=document())=>({action:'complete',requestId:randomUUID(),...Object.fromEntries(Object.entries(lease).filter(([k])=>['jobId','itemId','generation','token'].includes(k))),document:doc});
const reset=async()=>{await pool().query("UPDATE knowledge_collection.jobs SET state='cancelled',created_at=clock_timestamp()-interval '25 hours'");await pool().query("UPDATE knowledge_collection.items SET state='cancelled' WHERE state IN('queued','leased')");};
beforeAll(async()=>{const config=memberConfig();if(!config||config.provider.kind!=='fixture'||!process.env.MEMBER_TEST_CONTAINER?.startsWith('gk-member-test-'))throw Error('Use the isolated --collection harness');const p=memberPool(config);try{await migrateMemberDatabase(p,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);const ledger=(await p.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows;await migrateMemberDatabase(p,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true);expect((await p.query('SELECT name,checksum FROM member_migration ORDER BY name')).rows).toEqual(ledger);}finally{await p.end();}fixture=await startMemberOidc();alice=await login('alice');bob=await login('bob');process.env.SITE_OPERATOR_USER_IDS=alice.id;process.env.KNOWLEDGE_COLLECTION_ENABLED='1';temporary=await mkdtemp(path.join(os.tmpdir(),'collection-fixture-'));const configFile=path.join(temporary,'server.json');await writeFile(configFile,JSON.stringify({workerId:'fixture-worker',tokenSha256:hash(token)}),{mode:0o600});process.env.KNOWLEDGE_COLLECTION_CONFIG=configFile;},30000);
afterAll(async()=>{await memberRuntime().pool.end();await fixture?.close();await rm(temporary,{recursive:true,force:true});});
describe('finite capture: authenticated boundaries and restartable delivery',()=>{
 it('requires the active operator, matching identity and Origin; worker credentials do not grant operator rights',async()=>{
  expect((await operator.GET(request(endpoint))).status).toBe(401);expect((await list('',bob)).status).toBe(403);expect((await act(create(),alice,{origin:'https://other.example'})).status).toBe(403);expect((await act(create(),alice,{'x-member-user':bob.id})).status).toBe(401);
  expect((await work({action:'claim',requestId:randomUUID()},'0'.repeat(64))).status).toBe(401);expect((await worker.POST(request('/api/knowledge-collection/worker',alice.cookie,'POST',{action:'claim',requestId:randomUUID()}))).status).toBe(401);expect((await operator.POST(request(endpoint,'','POST',create(),{authorization:'Bearer '+token}))).status).toBe(401);
  process.env.SITE_OPERATOR_USER_IDS=bob.id;try{expect((await act(create())).status).toBe(403);}finally{process.env.SITE_OPERATOR_USER_IDS=alice.id;}
 });
 it('fixes finite scope, rejects unsafe source URLs and changed replays, preserves identical retries',async()=>{
  for(const urls of [['https://127.0.0.1/data'],['https://localhost/data'],['https://example.org/a#fragment'],Array.from({length:6},(_,i)=>'https://example.org/'+i)])expect((await act(create(urls))).status).toBe(400);
  const input=create(),first=await act(input);expect(first.status).toBe(200);const id=(await first.json()).result.id;const replay=await act(input);expect((await replay.json()).replayed).toBe(true);expect((await act({...input,scope:'Expanded scope'})).status).toBe(409);expect((await act({...create(),actor:'collector'})).status).toBe(400);
  expect((await pool().query('SELECT policy FROM knowledge_collection.jobs WHERE id=$1',[id])).rows[0].policy).toBe('source-capture-v1');await reset();
 });
 it('retains immutable documents, exact request replies and partial source failures without a public write',async()=>{
  await act(create(['https://example.org/source','https://example.org/missing']));const lease=await claim(),body=complete(lease);expect((await work({...body,document:{...body.document,text:'Changed text'}})).status).toBe(400);expect((await work(body)).status).toBe(200);expect((await(await work(body)).json()).replayed).toBe(true);expect((await work({...body,document:document('Different body')})).status).toBe(409);
  const second=await claim();expect(second.itemId).not.toBe(lease.itemId);expect((await work({action:'fail',requestId:randomUUID(),jobId:second.jobId,itemId:second.itemId,generation:second.generation,token:second.token,retryable:false,reason:'unsupported'})).status).toBe(200);
  const j=(await(await list()).json()).items[0];expect(j.items.map((i:{state:string})=>i.state)).toEqual(['captured','failed']);expect(j.items[0].bodySha256).toBe(body.document.bodySha256);expect(JSON.stringify(j)).not.toContain('A public source passage');expect((await claim())).toBeNull();expect((await pool().query('SELECT count(*)::int AS n FROM member_knowledge.review_jobs')).rows[0].n).toBe(0);await reset();
 });
 it('expires old generations, limits attempts, and cancels in-flight capture',async()=>{
  await act(create());const first=await claim();await pool().query("UPDATE knowledge_collection.items SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.itemId]);const second=await claim();expect(second.generation).toBe(first.generation+1);expect((await work(complete(first))).status).toBe(409);
  await pool().query("UPDATE knowledge_collection.items SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.itemId]);const third=await claim();expect(third.generation).toBe(3);await pool().query("UPDATE knowledge_collection.items SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.itemId]);expect(await claim()).toBeNull();expect((await pool().query('SELECT state FROM knowledge_collection.items WHERE id=$1',[first.itemId])).rows[0].state).toBe('failed');
  await act(create());const pending=await claim();expect((await act({action:'cancel',requestId:randomUUID(),id:pending.jobId})).status).toBe(200);expect((await work(complete(pending))).status).toBe(409);await reset();
 });
 it('resumes a lost claim ACK and a lost completion ACK without refetching',async()=>{
  await act(create());let captures=0,loseClaim=true,loseComplete=true;const state=path.join(temporary,'worker');await mkdir(state,{mode:0o700});
  const client=createCollectionWorker(state,async body=>{const r=await work(body);if(!r.ok)throw Object.assign(Error('API rejected'),{status:r.status});const data=await r.json();if(body.action==='claim'&&loseClaim){loseClaim=false;throw Error('Lost claim ACK');}if(body.action==='complete'&&loseComplete){loseComplete=false;throw Error('Lost completion ACK');}return data;},async()=>{captures++;return document();});
  await expect(client.run()).rejects.toThrow('Lost claim ACK');await expect(client.run()).rejects.toThrow('Lost completion ACK');expect(captures).toBe(1);expect(await client.run()).toBe(true);expect(captures).toBe(1);expect((await(await list()).json()).items[0].items[0].state).toBe('captured');await reset();
 });
 it('preserves completed sources when later cancellation rejects a queued delivery',async()=>{
  await act(create(['https://example.org/source','https://example.org/other']));const first=await claim();await work(complete(first));const second=await claim();await act({action:'cancel',requestId:randomUUID(),id:second.jobId});expect((await work(complete(second))).status).toBe(409);expect((await(await list()).json()).items[0].items.map((x:{state:string})=>x.state)).toEqual(['captured','cancelled']);await reset();
 });
 it('enforces the active-job bound and lists all same-timestamp jobs by a stable cursor',async()=>{
  for(let i=0;i<6;i++)expect((await act(create())).status).toBe(i<5?200:429);await reset();
  for(let i=0;i<23;i++)await pool().query("INSERT INTO knowledge_collection.jobs(id,creator_id,title,scope,policy,created_at) VALUES($1,$2,'Page fixture','Finite fixture','source-capture-v1','2020-01-01T00:00:00.123456Z')",[randomUUID(),alice.id]);
  const ids=new Set<string>();let before:string|null=null;do{const r=await list(before?'?before='+encodeURIComponent(before):'');expect(r.status).toBe(200);const p=await r.json();for(const j of p.items){expect(ids.has(j.id)).toBe(false);ids.add(j.id);}before=p.nextBefore;}while(before);expect(ids.size).toBe(Number((await pool().query('SELECT count(*) AS n FROM knowledge_collection.jobs')).rows[0].n));
 });
});
