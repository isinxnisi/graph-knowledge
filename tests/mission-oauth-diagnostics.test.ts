import {expect,it} from 'vitest';
import {missionOAuthRequestSummary,missionOAuthResponseSummary} from '../lib/server/member/mission-oauth-diagnostics';
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
