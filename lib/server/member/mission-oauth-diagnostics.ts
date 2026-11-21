import {decodeJwt} from 'jose';
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


// A beta-only observation. The OAuth provider still handles the original
// request and its signature, audience, lifetime and replay checks.
export async function inspectMissionOAuthTokenRequest(request:Request,origin:string,receivedAt:number){
 const advertised=request.headers.get('content-length'),length=Number(advertised);
 if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')||
    advertised!==null&&(!Number.isSafeInteger(length)||length<1||length>16384))return undefined;
 const reader=request.clone().body?.getReader();
 if(!reader)return undefined;
 const decoder=new TextDecoder();
 let form='',bytes=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('diagnostic deadline')),250);});
  for(;;){
   const part=await Promise.race([reader.read(),deadline]);
   if(part.done)break;
   bytes+=part.value.byteLength;
   if(bytes>16384)return undefined;
   form+=decoder.decode(part.value,{stream:true});
  }
  const params=new URLSearchParams(form+decoder.decode());
  const grant=params.get('grant_type');
  const grantType=grant==='authorization_code'||grant==='refresh_token'?grant:'other';
  const compact=params.get('client_assertion');
  if(!compact)return ()=>({grantType,assertion:'absent'});
  try{
   const {nbf,exp,iss,sub,aud}=decodeJwt(compact);
   const window=(at:number)=>{
    const now=Math.floor(at/1000);
    return {notBefore:typeof nbf!=='number'?'absent':nbf>now?'future':'reached',
     expiration:typeof exp!=='number'?'absent':exp<=now?'expired':'valid'};
   };
   const issuer=origin+'/api/auth';
   const audiences=Array.isArray(aud)?aud:[aud];
   const client='https://chatgpt.com/oauth/client.json';
   return (finishedAt:number)=>({grantType,assertion:'decoded',issuerMatches:iss===client,subjectMatches:sub===client,
    audienceMatches:audiences.includes(issuer)||audiences.includes(issuer+'/oauth2/token'),
    notBeforeAtReceipt:window(receivedAt).notBefore,...window(finishedAt)});
  }catch{return ()=>({grantType,assertion:'malformed'});}
 }catch{return undefined;}
 finally{if(timer)clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
