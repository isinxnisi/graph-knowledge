const errors=new Set(['invalid_client','invalid_grant','invalid_scope','invalid_request','unauthorized_client','access_denied','server_error','temporarily_unavailable','unsupported_grant_type']);
const safeError=(value:unknown)=>typeof value==='string'&&errors.has(value)?value:'other';
/** No tokens, code/state values, URLs, cookies, or raw error descriptions. */
export function missionOAuthResponseSummary(status:number,data:unknown){
 const value=data&&typeof data==='object'?data as Record<string,unknown>:{};
 const description=typeof value.error_description==='string'?value.error_description:'';
 const checks:[RegExp,string][]=[[/audience|aud claim/i,'audience'],[/signature|signing algorithm|jwks|public key/i,'client_signature'],[/verifier|challenge|pkce/i,'pkce'],[/redirect/i,'redirect'],[/authorization code|code.*expired/i,'authorization_code'],[/client|assertion/i,'client_authentication']];
 const result:Record<string,string|number|boolean>={status,error:value.error?safeError(value.error):'none',hint:checks.find(([pattern])=>pattern.test(description))?.[1]??'other'};
 if(typeof value.url==='string')try{
  const target=new URL(value.url);result.callbackIsChatGPT=target.origin==='https://chatgpt.com';
  result.callbackHasCode=target.searchParams.has('code');result.callbackHasState=target.searchParams.has('state');
  if(target.searchParams.has('error'))result.callbackError=safeError(target.searchParams.get('error'));
 }catch{result.invalidCallback=true;}
 return result;
}
export function missionOAuthRequestSummary(path:string,request:Request,origin:string){
 const requestOrigin=request.headers.get('origin');
 return {endpoint:path,origin:requestOrigin===null?'absent':requestOrigin===origin?'same':'other',
  form:request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')??false,
  hasAuthorization:request.headers.has('authorization')};
}
import {createLocalJWKSet,decodeJwt,decodeProtectedHeader,jwtVerify} from 'jose';
import {fetchMissionClientMetadataResource} from './mission-oauth-transport';


/** Inspect only a rejected assertion in memory. Never persist or emit the JWT. */
export async function diagnoseMissionClientAssertion(request:Request,issuer:string){
 try{
  const form=await request.formData(),assertion=form.get('client_assertion');
  if(typeof assertion!=='string')return {assertion:'absent'};
  const header=decodeProtectedHeader(assertion),claims=decodeJwt(assertion);
  const clientId='https://chatgpt.com/oauth/client.json',audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  const details:Record<string,string|boolean>={assertion:'present',issuerMatches:claims.iss===clientId,subjectMatches:claims.sub===clientId,
   audienceMatches:audiences.includes(issuer)||audiences.includes(issuer+'/oauth2/token')};
  const response=await fetchMissionClientMetadataResource('https://chatgpt.com/oauth/jwks.json',{signal:AbortSignal.timeout(3000),headers:{Accept:'application/json'}});
  if(response.status!==200)return {...details,keys:'unavailable'};
  const jwks=await response.json();details.keyIdMatches=Array.isArray(jwks.keys)&&jwks.keys.some((key:{kid?:string})=>key.kid===header.kid);
  try{
   await jwtVerify(assertion,createLocalJWKSet(jwks),{issuer:clientId,subject:clientId,audience:[issuer,issuer+'/oauth2/token']});
   details.verification='valid';
  }catch(error){
   const e=error as {code?:unknown;claim?:unknown};
   details.verification=typeof e.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(e.code)?e.code:'failed';
   if(typeof e.claim==='string'&&['iss','sub','aud','exp','nbf','iat'].includes(e.claim))details.claim=e.claim;
  }
  return details;
 }catch{return {assertion:'diagnostic-unavailable'};}
}
