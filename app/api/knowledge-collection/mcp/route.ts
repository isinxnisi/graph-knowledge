import {requireMcpAuth} from '@better-auth/mcp';
import {z} from 'zod';
import {memberRuntime} from '../../../../lib/server/member/runtime';
import {missionHandle} from '../../../../lib/server/member/knowledge-missions';
import {MemberError,memberInput} from '../../../../lib/server/member/http';
import {missionMcpEnabled,MISSION_SCOPE,MISSION_MCP_PATH} from '../../../../lib/server/member/mission-oauth';
import {assertMissionMcpUser} from '../../../../lib/server/member/mission-mcp-access';
import {knowledgeCapability} from '../../../../lib/server/knowledge-deployment';
import {createMissionMcpHandler,missionMcpBridge} from '../../../../lib/server/knowledge-mission-mcp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return missionHandle(async()=>{
 const {auth,config,pool}=memberRuntime();
 if(!missionMcpEnabled()||process.env.KNOWLEDGE_MISSIONS_ENABLED!=='1'||!knowledgeCapability('missions',config.origin))throw new MemberError(404,'NOT_FOUND');
 if(request.headers.has('origin')&&request.headers.get('origin')!==config.origin)throw new MemberError(403,'INVALID_ORIGIN');
 return requireMcpAuth(auth,async(req,claims)=>{
  await assertMissionMcpUser(pool,claims);
  const body=await memberInput(req,z.json(),2100000);
  const handler=createMissionMcpHandler(async command=>{
   const client=await pool.connect();let held=false;
   try{
    held=(await client.query('SELECT pg_try_advisory_lock(71900261,75) AS held')).rows[0].held===true;
    if(!held)return {ok:false,code:'MISSION_BUSY'};
    // Serialize checkpoint access across HTTP processes; no caller-selected file,
    // destination, bearer credential or shell invocation reaches the bridge.
    return await missionMcpBridge().call(command);
   }finally{if(held)await client.query('SELECT pg_advisory_unlock(71900261,75)');client.release();}
  });
  const response=await handler.fetch(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(body)}));
  response.headers.set('Cache-Control','private, no-store');return response;
 },{resource:config.origin+MISSION_MCP_PATH,requiredScopes:[MISSION_SCOPE]})(request);
});}
