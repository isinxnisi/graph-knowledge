import {expect,it,vi} from 'vitest';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
vi.mock('../lib/server/member/mission-oauth-transport',()=>({fetchMissionClientMetadataResource:vi.fn()}));
import {fetchMissionClientMetadataResource} from '../lib/server/member/mission-oauth-transport';
import {diagnoseMissionClientAssertion,missionOAuthRequestSummary,missionOAuthResponseSummary} from '../lib/server/member/mission-oauth-diagnostics';
it('records callback presence without recording code, state or URL values',()=>{
 const data={url:'https://chatgpt.com/connector_platform_oauth_redirect?code=SECRET_CODE&state=SECRET_STATE',access_token:'SECRET_TOKEN'};
 const result=missionOAuthResponseSummary(200,data);
 expect(result).toMatchObject({status:200,error:'none',callbackIsChatGPT:true,callbackHasCode:true,callbackHasState:true});
 expect(JSON.stringify(result)).not.toMatch(/SECRET|https|connector_platform/);
});
it('classifies public protocol errors without logging descriptions or unknown strings',()=>{
 const result=missionOAuthResponseSummary(401,{error:'invalid_client',error_description:'SECRET client assertion signature verification failed'});
 expect(result).toEqual({status:401,error:'invalid_client',hint:'client_signature'});
 expect(missionOAuthResponseSummary(400,{error:'SECRET',error_description:'SECRET'})).toEqual({status:400,error:'other',hint:'other'});
});
it('logs only presence and origin classification for request credentials',()=>{
 const request=new Request('https://beta.example/api/auth/oauth2/token?code=SECRET',{method:'POST',headers:{Authorization:'Basic SECRET',Cookie:'SECRET',Origin:'https://foreign.example','Content-Type':'application/x-www-form-urlencoded'},body:'client_assertion=SECRET'});
 const result=missionOAuthRequestSummary('/oauth2/token',request,'https://beta.example');
 expect(result).toEqual({endpoint:'/oauth2/token',origin:'other',form:true,hasAuthorization:true});
 expect(JSON.stringify(result)).not.toMatch(/SECRET|foreign|https/);
});
it('distinguishes JWT claim failures without recording the rejected credential',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('ES256'),key={...await exportJWK(publicKey),kid:'SECRET_KID'};
 vi.mocked(fetchMissionClientMetadataResource).mockImplementation(async()=>new Response(JSON.stringify({keys:[key]}),{status:200}));
 const issuer='https://beta.example/api/auth',client='https://chatgpt.com/oauth/client.json';
 for(const wrongAudience of [false,true]){
  const assertion=await new SignJWT({jti:'SECRET_JTI'}).setProtectedHeader({alg:'ES256',kid:'SECRET_KID'}).setIssuer(client).setSubject(client).setAudience(wrongAudience?'https://other.example':issuer+'/oauth2/token').setIssuedAt().setExpirationTime('1m').sign(privateKey);
  const request=new Request(issuer+'/oauth2/token',{method:'POST',body:new URLSearchParams({client_assertion:assertion})});
  const result=await diagnoseMissionClientAssertion(request,issuer);
  expect(result).toMatchObject({issuerMatches:true,subjectMatches:true,audienceMatches:!wrongAudience,keyIdMatches:true});
  expect(result.verification).toBe(wrongAudience?'ERR_JWT_CLAIM_VALIDATION_FAILED':'valid');
  if(wrongAudience)expect(result.claim).toBe('aud');
  expect(JSON.stringify(result)).not.toMatch(/SECRET|https|eyJ/);
 }
});
