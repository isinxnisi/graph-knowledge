import {knowledgeCapability} from "../knowledge-deployment";
import {Pool} from "pg";
import {knowledgeCommandSchema} from "../../domain/knowledge-foundation";
import {createKnowledgeFoundationService} from "../knowledge-foundation";
import {createKnowledgeOrganization} from "../knowledge-organization";
import {createKnowledgePatrol} from "../knowledge-patrol";
import {knowledgeReadConfiguration} from "../knowledge-read-runtime";
import {MemberError,assertMemberOrigin,memberInput,memberJson} from "./http";
import {memberTransaction} from "./operations";
import {isSiteOperator} from "./site-operations";
export function createMemberKnowledgeOrganization(pool:Pool,origin:string,owner:(r:Request)=>Promise<{id:string;sessionId:string}>){
 let knowledge:Pool|undefined;
 function enabled(){if(process.env.KNOWLEDGE_COLLECTION_READING_ENABLED!=="1"||!knowledgeCapability("operator",origin))throw new MemberError(404,"NOT_FOUND");}
 async function operator(r:Request,run:(userId:string,k:Pool)=>Promise<Response>){
  enabled();const u=await owner(r);if(!isSiteOperator(u.id))throw new MemberError(403,"OPERATOR_REQUIRED");
  knowledge??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3,statement_timeout:10000});
  return memberTransaction(pool,async c=>{
   if((await c.query('SELECT 1 FROM "user" u JOIN session s ON s."userId"=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s',[u.id,u.sessionId])).rowCount!==1||!isSiteOperator(u.id))throw new MemberError(401,"UNAUTHENTICATED");
   return run(u.id,knowledge!);
  });
 }
 return {
  list:(r:Request)=>operator(r,async(_id,k)=>{
   const page=await createKnowledgeOrganization(k).list(Object.fromEntries(new URL(r.url).searchParams));
   // Operational summary only, behind the existing operator/session boundary.
   // Do not expose unpublished target IDs or depend on opening this page to run.
   const patrol=process.env.KNOWLEDGE_PATROL_ENABLED==='1'&&knowledgeCapability('patrol',origin)
    ?await createKnowledgePatrol(k,async()=>{throw Error('Read-only status');}).status():undefined;
   return memberJson({...page,...(patrol?{patrol}:{})});
  }),
  async act(r:Request){assertMemberOrigin(r,origin);const cmd=await memberInput(r,knowledgeCommandSchema,32000);if(cmd.action!=="set-mappings")throw new MemberError(400,"INVALID_ARGUMENT");return operator(r,async(id,k)=>memberJson(await createKnowledgeFoundationService(k).execute({kind:"operator",id},cmd)));}
 };
}
