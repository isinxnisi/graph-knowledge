import {requireMcpAuth} from '@better-auth/mcp';
import {windowsBetaHttpsEnabled} from '../../../../lib/server/windows-beta-https';
import {z} from 'zod';
import {memberRuntime} from '../../../../lib/server/member/runtime';
import {missionHandle} from '../../../../lib/server/member/knowledge-missions';
import {MemberError,memberInput} from '../../../../lib/server/member/http';
import {missionMcpEnabled,MISSION_SCOPE,MISSION_MCP_PATH,grantedThemeComposeScope,themeComposeScopeEnabled} from '../../../../lib/server/member/mission-oauth';
import {assertMissionMcpUser} from '../../../../lib/server/member/mission-mcp-access';
import {knowledgeCapability} from '../../../../lib/server/knowledge-deployment';
import {createMissionMcpHandler,missionMcpBridge} from '../../../../lib/server/knowledge-mission-mcp';
import {dispatchThemeRegistration} from '../../../../lib/server/member/knowledge-theme-registration';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return missionHandle(async()=>{
 const {auth,config,pool}=memberRuntime();
 if(!missionMcpEnabled()||process.env.KNOWLEDGE_MISSIONS_ENABLED!=='1'||!knowledgeCapability('missions',config.origin))throw new MemberError(404,'NOT_FOUND');
 if(request.headers.has('origin')&&request.headers.get('origin')!==config.origin)throw new MemberError(403,'INVALID_ORIGIN');
 const trace=process.env.KNOWLEDGE_RUNTIME==='beta'&&process.env.PLUNODE_WINDOWS_HTTPS_TRANSPORT==='1';
 const response=await requireMcpAuth(auth,async(req,claims)=>{
  try{await assertMissionMcpUser(pool,claims);}catch(error){if(trace)console.warn('Collection MCP operator check',{code:error instanceof MemberError?error.code:'INTERNAL'});throw error;}
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
  },themeComposeScopeEnabled()?{
   call:command=>dispatchThemeRegistration(z.uuidv4().parse(claims.sub),command),
   authChallenge:grantedThemeComposeScope(claims.scope)?undefined:'Bearer resource_metadata="'+config.origin+'/.well-known/oauth-protected-resource/api/knowledge-collection/mcp", error="insufficient_scope", error_description="Reconnect to register and update themes.", scope="missions:collect themes:compose"',
  }:undefined);
  const response=await handler.fetch(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(body)}));
  if(trace&&body&&typeof body==='object'&&!Array.isArray(body)&&body.method==='tools/list'){const result=await response.clone().json().catch(()=>null);console.info('Collection MCP tool definitions',{status:response.status,count:result?.result?.tools?.length??0});}
  response.headers.set('Cache-Control','private, no-store');return response;
 },{resource:config.origin+MISSION_MCP_PATH,requiredScopes:[MISSION_SCOPE],
  // The same beta Web serves these public signing keys. Pin its loopback endpoint
  // rather than sending a self-request through the broken WSL external route.
  // Issuer, resource audience, signature, expiry, DPoP and scopes remain verified.
  ...(windowsBetaHttpsEnabled()?{jwksUrl:'http://127.0.0.1:3200/api/auth/jwks'}:{}),
 })(request);
 if(trace&&response.status>=400)console.warn('Collection MCP access failed',{status:response.status});
 return response;
});}
