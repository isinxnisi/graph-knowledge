import {knowledgeCapability} from "../knowledge-deployment";
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {collectionOperatorSchema,collectionWorkerCommandSchema} from '../../domain/knowledge-collection';
import {knowledgeDigest} from '../knowledge-foundation';
import {sourceURL,sourceText,normalizeSourceText,publicSourceAddress} from '../knowledge-source-verification';
import {isIP} from 'node:net';
import {memberTransaction} from './operations';
import {assertMemberOrigin,MemberError,memberInput,memberJson} from './http';
import {isSiteOperator} from './site-operations';
export async function ensureCollectionSchema(pool:Pool){
 const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/027-knowledge-collection.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='027-knowledge-collection.sql'")).rows[0]?.checksum!==checksum)throw new MemberError(503,'MIGRATION_REQUIRED');
}
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const stamp=(x:unknown)=>x instanceof Date?x.toISOString():String(x);
export const collectionConfigSchema=z.strictObject({workerId:z.string().regex(/^[a-z0-9-]{1,80}$/),tokenSha256:z.string().regex(/^[a-f0-9]{64}$/)});
export async function collectionWorkerIdentity(request:Request,environmentKey='KNOWLEDGE_COLLECTION_CONFIG'){
 const file=process.env[environmentKey];if(!file||!path.isAbsolute(file))throw new MemberError(503,'WORKER_NOT_CONFIGURED');
 const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>4000)throw new MemberError(503,'WORKER_NOT_CONFIGURED');
 const config=collectionConfigSchema.parse(JSON.parse(await readFile(file,'utf8'))),authorization=request.headers.get('authorization')??'';
 if(!/^Bearer [a-f0-9]{64}$/.test(authorization)||!timingSafeEqual(Buffer.from(hash(authorization.slice(7)),'hex'),Buffer.from(config.tokenSha256,'hex')))throw new MemberError(401,'UNAUTHENTICATED');
 return config.workerId;
}
// Only non-private named source URLs. DNS and redirect checks also run in the Worker.
function allowedURL(raw:string){let u:URL;try{u=sourceURL(raw);}catch{throw new MemberError(400,'PUBLIC_SOURCE_REQUIRED');}const host=u.hostname.replace(/^\[|\]$/g,'');if(host==='localhost'||host.endsWith('.localhost')||isIP(host)&&!publicSourceAddress(host))throw new MemberError(400,'PUBLIC_SOURCE_REQUIRED');return u.href;}
export function createKnowledgeCollection(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string;sessionId:string}>){
 let ready:Promise<void>|undefined;
 const enabled=()=>{if(process.env.KNOWLEDGE_COLLECTION_ENABLED!=='1'||!knowledgeCapability("collection",origin))throw new MemberError(404,'NOT_FOUND');};
 const ensure=()=>ready??=ensureCollectionSchema(pool).catch(e=>{ready=undefined;throw e;});
 async function operator(request:Request,run:(c:PoolClient,u:{id:string;sessionId:string})=>Promise<Response>){
  enabled();if(!knowledgeCapability("operator",origin))throw new MemberError(404,"NOT_FOUND");const u=await owner(request);if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');await ensure();return memberTransaction(pool,async c=>{
   if(!isSiteOperator(u.id)||(await c.query('SELECT 1 FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId])).rowCount!==1)throw new MemberError(401,'UNAUTHENTICATED');
   return run(c,u);
  });
 }
 async function once(c:PoolClient,principal:string,requestId:string,action:string,payload:unknown,run:()=>Promise<unknown>){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['collection-command:'+principal+':'+requestId]);
  const digest=knowledgeDigest(payload),previous=(await c.query('SELECT * FROM knowledge_collection.commands WHERE principal=$1 AND request_id=$2',[principal,requestId])).rows[0];
  if(previous){if(previous.payload_hash!==digest)throw new MemberError(409,'REQUEST_CHANGED');return {result:previous.result,replayed:true};}
  const result=await run();await c.query('INSERT INTO knowledge_collection.commands(principal,request_id,action,payload_hash,result) VALUES($1,$2,$3,$4,$5)',[principal,requestId,action,digest,result]);return {result,replayed:false};
 }
 const empty={lease:null};
 async function lockLease(c:PoolClient,input:{itemId:string;jobId:string;generation:number;token:string},worker:string){
  const j=(await c.query('SELECT * FROM knowledge_collection.jobs WHERE id=$1 FOR UPDATE',[input.jobId])).rows[0];
  const i=(await c.query('SELECT * FROM knowledge_collection.items WHERE id=$1 AND job_id=$2 FOR UPDATE',[input.itemId,input.jobId])).rows[0];
  if(!j||!i||j.state!=='active'||i.state!=='leased'||i.generation!==input.generation||i.lease_worker!==worker||i.lease_hash!==hash(input.token)||new Date(i.lease_until).getTime()<=Date.now())throw new MemberError(409,'LEASE_CHANGED');return i;
 }
 async function items(c:PoolClient,id:string){return (await c.query('SELECT id,url,state,attempts,reason,fetched_at,body_sha256,text_sha256,octet_length(body) AS bytes FROM knowledge_collection.items WHERE job_id=$1 ORDER BY ordinal',[id])).rows.map((x:QueryResultRow)=>({id:x.id,url:x.url,state:x.state,attempts:x.attempts,reason:x.reason,fetchedAt:x.fetched_at?stamp(x.fetched_at):null,bodySha256:x.body_sha256,textSha256:x.text_sha256,bytes:x.bytes}));}
 return {
  async list(request:Request){return operator(request,async c=>{
   const raw=new URL(request.url).searchParams.get('before');let before:{time:string;id:string}|null=null;
   if(raw)try{before=z.object({time:z.string().regex(/^\d{4}-\d{2}-\d{2}T/).max(40).refine(s=>Number.isFinite(Date.parse(s))),id:z.uuidv4()}).parse(JSON.parse(Buffer.from(raw,'base64url').toString()));}catch{throw new MemberError(400,'INVALID_CURSOR');}
   const rows=(await c.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS precise_time FROM knowledge_collection.jobs ${before?'WHERE (created_at,id)<($1::timestamptz,$2::uuid)':''} ORDER BY created_at DESC,id DESC LIMIT 21`,before?[before.time,before.id]:[])).rows;
   const page=rows.slice(0,20),last=page.at(-1),jobs=[];for(const j of page)jobs.push({id:j.id,title:j.title,scope:j.scope,state:j.state,createdAt:stamp(j.created_at),items:await items(c,j.id)});return memberJson({stage:'capture',missionsAvailable:process.env.KNOWLEDGE_MISSIONS_ENABLED==='1'&&knowledgeCapability('missions',origin),items:jobs,nextBefore:rows.length>20&&last?Buffer.from(JSON.stringify({time:last.precise_time,id:last.id})).toString('base64url'):null,workerConnected:(await c.query("SELECT 1 FROM knowledge_collection.workers WHERE last_seen>clock_timestamp()-interval '90 seconds' LIMIT 1")).rowCount===1});
  });},
  async act(request:Request){assertMemberOrigin(request,origin);const input=await memberInput(request,collectionOperatorSchema,16000);return operator(request,async(c,u)=>memberJson(await once(c,'operator:'+u.id,input.requestId,input.action,input,async()=>{
   if(input.action==='cancel'){const j=(await c.query('SELECT * FROM knowledge_collection.jobs WHERE id=$1 FOR UPDATE',[input.id])).rows[0];if(!j)throw new MemberError(404,'NOT_FOUND');await c.query("UPDATE knowledge_collection.jobs SET state='cancelled',cancelled_at=clock_timestamp() WHERE id=$1 AND state='active'",[input.id]);await c.query("UPDATE knowledge_collection.items SET state='cancelled',lease_hash=NULL,lease_until=NULL WHERE job_id=$1 AND state IN('queued','leased')",[input.id]);return {id:input.id};}
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('collection-intake',0))");
   const limits=(await c.query("SELECT count(*) FILTER(WHERE created_at>clock_timestamp()-interval '24 hours')::int AS daily,count(*) FILTER(WHERE state='active' AND EXISTS(SELECT 1 FROM knowledge_collection.items i WHERE i.job_id=j.id AND i.state IN('queued','leased')))::int AS active FROM knowledge_collection.jobs j")).rows[0];if(limits.daily>=20||limits.active>=5)throw new MemberError(429,'COLLECTION_LIMIT');
   const urls=input.urls.map(allowedURL);if(new Set(urls).size!==urls.length)throw new MemberError(400,'DUPLICATE_SOURCE');
   const id=randomUUID();await c.query("INSERT INTO knowledge_collection.jobs(id,creator_id,title,scope,policy) VALUES($1,$2,$3,$4,'source-capture-v1')",[id,u.id,input.title,input.scope]);for(const [n,url] of urls.entries())await c.query('INSERT INTO knowledge_collection.items(id,job_id,ordinal,url) VALUES($1,$2,$3,$4)',[randomUUID(),id,n,url]);return {id};
  })));},
  async worker(request:Request,identity=collectionWorkerIdentity){
   enabled();if(!knowledgeCapability("collector",origin))throw new MemberError(404,"NOT_FOUND");const worker=await identity(request);await ensure();const input=await memberInput(request,collectionWorkerCommandSchema,3300000);
   return memberTransaction(pool,async c=>{await c.query('INSERT INTO knowledge_collection.workers(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET last_seen=clock_timestamp()',[worker]);return memberJson(await once(c,'worker:'+worker,input.requestId,input.action,input,async()=>{
    if(input.action==='claim'){
     // Serialize claims and cancellation with job first; old generations never regain their lease.
     await c.query("SELECT pg_advisory_xact_lock(hashtextextended('collection-claim',0))");
     const jobs=(await c.query("SELECT j.id FROM knowledge_collection.jobs j WHERE state='active' AND EXISTS(SELECT 1 FROM knowledge_collection.items i WHERE i.job_id=j.id AND (i.state='queued' AND i.next_attempt<=clock_timestamp() OR i.state='leased' AND i.lease_until<=clock_timestamp())) ORDER BY created_at,id LIMIT 1 FOR UPDATE OF j")).rows;
     if(!jobs.length)return empty;
     const jobId=jobs[0].id;await c.query("UPDATE knowledge_collection.items SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,reason='lease-expired',lease_hash=NULL,lease_until=NULL WHERE job_id=$1 AND state='leased' AND lease_until<=clock_timestamp()",[jobId]);
     const row=(await c.query("SELECT i.*,j.title,j.scope FROM knowledge_collection.items i JOIN knowledge_collection.jobs j ON j.id=i.job_id WHERE i.job_id=$1 AND i.state='queued' AND i.next_attempt<=clock_timestamp() ORDER BY ordinal LIMIT 1 FOR UPDATE OF i",[jobId])).rows[0];if(!row)return empty;
     const token=randomBytes(32).toString('hex'),until=new Date(Date.now()+600000).toISOString();
     await c.query("UPDATE knowledge_collection.items SET state='leased',generation=generation+1,attempts=attempts+1,lease_hash=$2,lease_worker=$3,lease_until=$4,reason='' WHERE id=$1",[row.id,hash(token),worker,until]);return {lease:{jobId,itemId:row.id,generation:row.generation+1,token,url:row.url,title:row.title,scope:row.scope,expiresAt:until}};
    }
    const row=await lockLease(c,input,worker);
    if(input.action==='fail'){await c.query("UPDATE knowledge_collection.items SET state=$2,reason=$3,next_attempt=clock_timestamp()+interval '2 minutes',lease_hash=NULL,lease_until=NULL WHERE id=$1",[input.itemId,input.retryable&&row.attempts<3?'queued':'failed',input.reason]);return {itemId:row.id,state:'recorded'};}
    const d=input.document,body=Buffer.from(d.bodyBase64,'base64');allowedURL(d.url);
    if(body.length>2000000||body.toString('base64')!==d.bodyBase64||!body.length||hash(body)!==d.bodySha256||!d.text.trim()||hash(d.text)!==d.textSha256||new Date(d.fetchedAt).getTime()>Date.now()+60000)throw new MemberError(400,'DOCUMENT_DIFFERS');
    let extracted:string;try{extracted=normalizeSourceText(sourceText({url:d.url,type:d.type,body}));}catch{throw new MemberError(400,'DOCUMENT_DIFFERS');}
    if(!/^(text\/html|text\/plain|application\/xhtml\+xml)(;|$)/.test(d.type)||extracted!==d.text)throw new MemberError(400,'DOCUMENT_DIFFERS');
    const {bodyBase64:_,...metadata}=d;void _;
    await c.query("UPDATE knowledge_collection.items SET state='captured',document=$2,body=$3,body_sha256=$4,text_sha256=$5,fetched_at=$6,captured_at=clock_timestamp(),lease_hash=NULL,lease_until=NULL,reason='' WHERE id=$1",[row.id,metadata,body,d.bodySha256,d.textSha256,d.fetchedAt]);return {itemId:row.id,state:'captured'};
   }));});
  }
 };
}
