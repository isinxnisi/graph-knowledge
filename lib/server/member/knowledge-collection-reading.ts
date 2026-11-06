import {knowledgeCapability} from "../knowledge-deployment";
import {Pool,type PoolClient} from 'pg';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createCollectionReading} from '../knowledge-collection-reading';
import {reviewConfigSchema} from '../knowledge-review-queue';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {collectionWorkerIdentity} from './knowledge-collection';
import {readingWorkerSchema} from '../../domain/knowledge-collection-reading';
import {MemberError,assertMemberOrigin,memberInput,memberJson} from './http';
import {memberTransaction} from './operations';
import {isSiteOperator} from './site-operations';
export function createMemberCollectionReading(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string;sessionId:string}>){
 let service:ReturnType<typeof createCollectionReading>|undefined;
 function enabled(){if(process.env.KNOWLEDGE_COLLECTION_READING_ENABLED!=='1'||!knowledgeCapability("collection-reading",origin))throw new MemberError(404,'NOT_FOUND');}
 async function get(){enabled();if(service)return service;const file=process.env.KNOWLEDGE_REVIEW_CONFIG;
  if(!file||!path.isAbsolute(file))throw new MemberError(503,'WORKER_NOT_CONFIGURED');const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>32000)throw new MemberError(503,'WORKER_NOT_CONFIGURED');
  const cfg=reviewConfigSchema.parse(JSON.parse(await readFile(file,'utf8')));service=createCollectionReading(pool,new Pool({connectionString:process.env.NODE_ENV==='test'&&process.env.MEMBER_TEST_CONTAINER?.startsWith('gk-member-test-')?process.env.KNOWLEDGE_CAPSULE_TEST_DATABASE_URL:knowledgeReadConfiguration().databaseUrl,max:3}),cfg);return service;
 }
 async function operator(request:Request,run:(c:PoolClient,u:{id:string;sessionId:string},s:ReturnType<typeof createCollectionReading>)=>Promise<Response>){
  enabled();if(!knowledgeCapability("operator",origin))throw new MemberError(404,"NOT_FOUND");const u=await owner(request);if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');const s=await get();return memberTransaction(pool,async c=>{if((await c.query('SELECT 1 FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId])).rowCount!==1||!isSiteOperator(u.id))throw new MemberError(401,'UNAUTHENTICATED');return run(c,u,s);});
 }
 return {
  list:(r:Request)=>operator(r,async(_c,_u,s)=>memberJson({...await s.list(),provider:'Google Gemini'})),
  async act(r:Request){assertMemberOrigin(r,origin);const input=await memberInput(r,(await import('../../domain/knowledge-collection-reading')).readingOperatorSchema,16000);return operator(r,async(_c,u,s)=>memberJson(await s.act(u.id,input)));},
  async worker(r:Request){enabled();if(!knowledgeCapability('reader',origin))throw new MemberError(404,'NOT_FOUND');const id=await collectionWorkerIdentity(r,'KNOWLEDGE_COLLECTION_READER_CONFIG');const input=await memberInput(r,readingWorkerSchema,256000);const s=await get();const result=await s.worker(id,input);await s.drain();return memberJson(result);}
 };
}
