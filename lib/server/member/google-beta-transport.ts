import type {BetterAuthPlugin} from 'better-auth';
import {authorizationCodeRequest,getOAuth2Tokens,verifyProviderIdToken} from '@better-auth/core/oauth2';
import {createLocalJWKSet} from 'jose';
import type {MemberConfig} from './config';
import {windowsBetaHttpsEnabled} from '../windows-beta-https';
import {GOOGLE_KEYS_ENDPOINT,GOOGLE_TOKEN_ENDPOINT,windowsBetaGoogleAuthFetch} from '../windows-beta-google-auth';

/** Changes Google network I/O only in the explicitly enabled local beta.
 * Better Auth still owns state, PKCE, identity mapping, cookies and sessions. */
export function googleBetaTransportPlugins(config:MemberConfig):BetterAuthPlugin[]{
 if(config.provider.kind!=='google'||config.origin!=='https://graph-beta.isinxnisi.com'||!windowsBetaHttpsEnabled())return [];
 const options={clientId:config.provider.clientId,clientSecret:config.provider.clientSecret};
 return [{id:'plunode-beta-google-egress',init(ctx){
  const provider=ctx.socialProviders.find(p=>p.id==='google');
  if(!provider?.idToken||!('jwks' in provider.idToken))throw Error('BETA_GOOGLE_AUTH_PROVIDER');
  provider.validateAuthorizationCode=async ({code,codeVerifier,redirectURI})=>{
   try{
    const {body,headers}=await authorizationCodeRequest({code,codeVerifier,redirectURI,options,tokenEndpoint:GOOGLE_TOKEN_ENDPOINT});
    const response=await windowsBetaGoogleAuthFetch(GOOGLE_TOKEN_ENDPOINT,{method:'POST',redirect:'error',headers,body:body.toString()});
    if(!response.ok)throw Error('TOKEN_HTTP_'+response.status);
    const data=await response.json();
    if(!data||typeof data.id_token!=='string'||typeof data.access_token!=='string'||data.error)throw Error('TOKEN_RESPONSE');
    return getOAuth2Tokens(data);
   }catch{
    // No OAuth code, token, body, URL query or raw provider error is logged.
    console.error('Beta Google login: token exchange failed');
    throw Error('BETA_GOOGLE_AUTH_TOKEN_EXCHANGE');
   }
  };
  provider.idToken={...provider.idToken,algorithms:['RS256'],jwks:async (header,token)=>{
   try{
    const response=await windowsBetaGoogleAuthFetch(GOOGLE_KEYS_ENDPOINT,{method:'GET',redirect:'error',headers:{accept:'application/json'}});
    if(!response.ok)throw Error('KEYS_HTTP');
    return await createLocalJWKSet(await response.json())(header,token);
   }catch{
    console.error('Beta Google login: verification keys unavailable');
    throw Error('BETA_GOOGLE_AUTH_KEYS');
   }
  }};
  const getUserInfo=provider.getUserInfo.bind(provider);
  provider.getUserInfo=async tokens=>{
   // Validate the signed ID token before the standard Google profile decoder.
   if(!tokens.idToken||!await verifyProviderIdToken(provider,tokens.idToken,tokens.expectedIdTokenNonce))return null;
   return getUserInfo(tokens);
  };
 }}];
}
