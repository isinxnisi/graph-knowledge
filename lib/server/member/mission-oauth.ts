import {jwt} from 'better-auth/plugins';
import {mcp} from '@better-auth/mcp';
import {cimd} from '@better-auth/cimd';
import {fetchMissionClientMetadataResource} from './mission-oauth-transport';

export const MISSION_SCOPE='missions:collect';
export const MISSION_MCP_PATH='/api/knowledge-collection/mcp';
export function missionMcpEnabled(){return process.env.KNOWLEDGE_MISSION_MCP_ENABLED==='1';}
export function chatGptClientUrl(value:string){
 try{const u=new URL(value);return u.origin==='https://chatgpt.com'&&u.pathname==='/oauth/client.json'&&!u.search&&!u.hash;}catch{return false;}
}

/** The existing member identity is reused. This provider issues only a
 * resource-bound collection permission, never member/KG administration. */
export function missionOAuthPlugins(origin:string){
 return [
  jwt({disableSettingJwtHeader:true,schema:{jwks:{modelName:'mission_oauth_jwks'}}}),
  mcp({
   resource:origin+MISSION_MCP_PATH,loginPage:'/collection-connect',consentPage:'/collection-connect',
   scopes:[MISSION_SCOPE,'offline_access'],grantTypes:['authorization_code','refresh_token'],
   accessTokenExpiresIn:600,refreshTokenExpiresIn:60*60*24*30,
   allowDynamicClientRegistration:false,allowUnauthenticatedClientRegistration:false,
   clientPrivileges:()=>false,resourcePrivileges:()=>false,
   schema:{
    oauthClient:{modelName:'mission_oauth_client'},oauthResource:{modelName:'mission_oauth_resource'},
    oauthClientResource:{modelName:'mission_oauth_client_resource'},oauthAccessToken:{modelName:'mission_oauth_access_token'},
    oauthRefreshToken:{modelName:'mission_oauth_refresh_token'},oauthConsent:{modelName:'mission_oauth_consent'},
    oauthClientAssertion:{modelName:'mission_oauth_client_assertion'},
   },
  }),
  cimd({fetchClientMetadataResource:fetchMissionClientMetadataResource,metadataProfile:'mcp-2026-07-28',isMetadataDocumentUrlAllowed:chatGptClientUrl,
   metadataFetchPolicy:{maximumFetchesPerMinute:12,maximumFetchesPerOriginPerMinute:12},maxCacheEntries:4}),
 ];
}

export function signedMissionOAuthQuery(params:URLSearchParams){
 const signed=new Set(['sig','ba_param',...params.getAll('ba_param')]);
 return new URLSearchParams([...params].filter(([key])=>signed.has(key))).toString();
}
