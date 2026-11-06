import {knowledgeCapability} from "../knowledge-deployment";
import {Pool} from 'pg';
import {identityCommandSchema} from '../../domain/knowledge-identity';
import {createKnowledgeIdentity} from '../knowledge-identity';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {MemberError,assertMemberOrigin,memberInput,memberJson} from './http';
import {memberTransaction} from './operations';
import {isSiteOperator} from './site-operations';
export function createMemberKnowledgeIdentity(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string;sessionId:string}>){
 let knowledge:Pool|undefined;
 async function operator(r:Request,run:(id:string,k:Pool)=>Promise<Response>){
  if(process.env.KNOWLEDGE_COLLECTION_READING_ENABLED!=='1'||!knowledgeCapability("operator",origin))throw new MemberError(404,'NOT_FOUND');
  const u=await owner(r);if(!isSiteOperator(u.id))throw new MemberError(403,'OPERATOR_REQUIRED');
  knowledge??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3,statement_timeout:10000});
  return memberTransaction(pool,async c=>{if((await c.query('SELECT 1 FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId])).rowCount!==1||!isSiteOperator(u.id))throw new MemberError(401,'UNAUTHENTICATED');return run(u.id,knowledge!);});
 }
 return {
  list:(r:Request)=>operator(r,async(_id,k)=>{const q=new URL(r.url).searchParams,s=createKnowledgeIdentity(k);return memberJson(q.has('id')?await s.detail(q.get('id')!):await s.list(Object.fromEntries(q)));}),
  async act(r:Request){assertMemberOrigin(r,origin);const cmd=await memberInput(r,identityCommandSchema,16000);return operator(r,async(id,k)=>memberJson(await createKnowledgeIdentity(k).act(id,cmd)));}
 };
}
