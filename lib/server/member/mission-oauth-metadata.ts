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
 return auth.handler(new Request(config.origin+'/api/auth/.well-known/oauth-protected-resource',{headers:request.headers}));
});}
