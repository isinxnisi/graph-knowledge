import {oauthProviderAuthServerMetadata} from '@better-auth/oauth-provider';
import {memberRuntime} from './runtime';
import {memberHandle,MemberError} from './http';
import {missionMcpEnabled} from './mission-oauth';

export async function missionOAuthMetadata(request:Request){return memberHandle(async()=>{
 if(!missionMcpEnabled())throw new MemberError(404,'NOT_FOUND');
 return oauthProviderAuthServerMetadata(memberRuntime().auth)(request);
});}
export async function missionResourceMetadata(request:Request){return memberHandle(async()=>{
 if(!missionMcpEnabled())throw new MemberError(404,'NOT_FOUND');
 const {auth,config}=memberRuntime();
 // MCP resource discovery lives at the domain root, outside /api/auth. The
 // provider's onRequest hook owns that exact root path.
 return auth.handler(new Request(config.origin+new URL(request.url).pathname,{headers:request.headers}));
});}
