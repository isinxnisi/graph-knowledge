import {Pool,type PoolClient} from 'pg';
import {z} from 'zod';
import {missionOperatorSchema,missionWorkerSchema} from '../../domain/knowledge-mission';
import {createKnowledgeMissions} from '../knowledge-missions';
import {createKnowledgeImports} from '../knowledge-import';
import {resolveImportPrincipal} from '../knowledge-import-runtime';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {KnowledgeError} from '../knowledge-foundation';
import {knowledgeCapability} from '../knowledge-deployment';
import {collectionWorkerIdentity} from './knowledge-collection';
import {MemberError,assertMemberOrigin,memberInput,memberJson} from './http';
import {isSiteOperator} from './site-operations';

export function createMemberKnowledgeMissions(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string;sessionId:string}>){
 let core:ReturnType<typeof createKnowledgeMissions>|undefined;
 function enabled(){if(process.env.KNOWLEDGE_MISSIONS_ENABLED!=='1'||!knowledgeCapability('missions',origin))throw new MemberError(404,'NOT_FOUND');}
 function get(){enabled();if(core)return core;const knowledge=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3});const imports=createKnowledgeImports(pool,knowledge,(id,client)=>resolveImportPrincipal(pool,id,client));return core=createKnowledgeMissions(pool,knowledge,()=>imports);}
 async function auth(r:Request){enabled();if(!knowledgeCapability('operator',origin))throw new MemberError(404,'NOT_FOUND');const u=await owner(r);if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');return u;}
 async function current(c:PoolClient,u:{id:string;sessionId:string}){if(!isSiteOperator(u.id)||(await c.query('SELECT 1 FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId])).rowCount!==1)throw new MemberError(401,'UNAUTHENTICATED');}
 return {
  async list(r:Request){await auth(r);return memberJson(await get().list(new URL(r.url).searchParams.get('q')??''));},
  async act(r:Request){assertMemberOrigin(r,origin);const u=await auth(r),input=await memberInput(r,missionOperatorSchema,32000);return memberJson(await get().act(u.id,input,c=>current(c,u)));},
  async worker(r:Request){enabled();if(r.headers.has('origin')&&r.headers.get('origin')!==origin||r.headers.get('sec-fetch-site')==='cross-site')throw new MemberError(403,'INVALID_ORIGIN');const id=await collectionWorkerIdentity(r,'KNOWLEDGE_MISSIONS_CONFIG'),input=await memberInput(r,missionWorkerSchema,2100000);return memberJson(await get().worker(id,input));},
 };
}
export async function missionHandle(f:()=>Promise<Response>){try{return await f();}catch(e){if(e instanceof KnowledgeError)return memberJson({error:{code:e.code,message:e.message}},e.status);if(e instanceof MemberError)return memberJson({error:{code:e.code}},e.status);if(e instanceof z.ZodError)return memberJson({error:{code:'INVALID_ARGUMENT',message:'計画・資料・項目の形式を確認してください。'}},400);console.error('Scheduled collection temporarily unavailable');return memberJson({error:{code:'MISSION_UNAVAILABLE'}},503);}}
