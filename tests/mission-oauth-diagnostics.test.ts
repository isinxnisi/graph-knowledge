import {expect,it} from 'vitest';
import {inspectMissionOAuthTokenRequest,missionOAuthRequestSummary,missionOAuthResponseSummary} from '../lib/server/member/mission-oauth-diagnostics';
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

it('distinguishes an early private-key JWT and its grant without recording any credential data',async()=>{
 const origin='https://graph-beta.isinxnisi.com',client='https://chatgpt.com/oauth/client.json';
 const encoded=Buffer.from(JSON.stringify({nbf:150,exp:500,iss:client,sub:client,aud:origin+'/api/auth/oauth2/token',jti:'SECRET_PAYLOAD'})).toString('base64url');
 const wire=new URLSearchParams({grant_type:'refresh_token',client_assertion:'e30.'+encoded+'.SECRET_SIGNATURE',refresh_token:'SECRET_REFRESH'}).toString();
 const req=new Request(origin+'/api/auth/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','content-length':String(Buffer.byteLength(wire))},body:wire});
 const details=await inspectMissionOAuthTokenRequest(req,origin,149650);
 expect(details?.(149990)).toEqual({grantType:'refresh_token',assertion:'decoded',issuerMatches:true,subjectMatches:true,
  audienceMatches:true,notBeforeAtReceipt:'future',notBefore:'future',expiration:'valid'});
 expect(details?.(150010)).toMatchObject({notBeforeAtReceipt:'future',notBefore:'reached'});
 expect(JSON.stringify(details?.(150010))).not.toMatch(/SECRET|https|150|500/);
 expect(await req.text()).toBe(wire);
});

it('skips bodies outside the beta diagnostic size gate and redacts a malformed assertion',async()=>{
 const url='https://graph-beta.isinxnisi.com/api/auth/oauth2/token',origin=new URL(url).origin;
 const body='grant_type=SECRET&client_assertion=SECRET';
 const mk=(len:string)=>new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','content-length':len},body});
 expect(await inspectMissionOAuthTokenRequest(mk('17000'),origin,0)).toBeUndefined();
 const details=await inspectMissionOAuthTokenRequest(mk(String(body.length)),origin,0);
 expect(details?.(1000)).toEqual({grantType:'other',assertion:'malformed'});
});
