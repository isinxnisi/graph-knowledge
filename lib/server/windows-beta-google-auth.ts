import {spawn} from 'node:child_process';
import {lookup} from 'node:dns/promises';
import {isPublicRoutableHost} from '@better-auth/core/utils/host';
import {parseWindowsBetaResponse,windowsBetaHttpsEnabled} from './windows-beta-https';

export const GOOGLE_TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
export const GOOGLE_KEYS_ENDPOINT='https://www.googleapis.com/oauth2/v3/certs';

/** Beta-only egress for two fixed Google OAuth endpoints. Credentials stay on
 * stdin; TLS verification, public DNS pinning and redirect refusal are mandatory.
 * An authorization code is sent once, without transport retries. */
export async function windowsBetaGoogleAuthFetch(input:string,init:RequestInit):Promise<Response>{
 if(!windowsBetaHttpsEnabled())throw Error('BETA_GOOGLE_AUTH_DISABLED');
 const token=input===GOOGLE_TOKEN_ENDPOINT,keys=input===GOOGLE_KEYS_ENDPOINT;
 if((!token&&!keys)||init.redirect!=='error'||init.method!==(token?'POST':'GET'))throw Error('BETA_GOOGLE_AUTH_REQUEST');
 const headers=new Headers(init.headers);
 if(Array.from(headers.keys()).some(k=>!['content-type','accept'].includes(k))||headers.get('accept')!=='application/json')throw Error('BETA_GOOGLE_AUTH_HEADERS');
 if(token){
  if(headers.get('content-type')!=='application/x-www-form-urlencoded'||typeof init.body!=='string'||Buffer.byteLength(init.body)>32768)throw Error('BETA_GOOGLE_AUTH_BODY');
  const body=new URLSearchParams(init.body),allowed=['grant_type','code','code_verifier','redirect_uri','client_id','client_secret'];
  if(Array.from(body.keys()).some(k=>!allowed.includes(k)||body.getAll(k).length!==1)||body.get('grant_type')!=='authorization_code'||!body.get('code')||!body.get('code_verifier')||!body.get('client_id')||!body.get('client_secret')||body.get('redirect_uri')!=='https://graph-beta.isinxnisi.com/api/auth/callback/google')throw Error('BETA_GOOGLE_AUTH_BODY');
 }else if(init.body!=null||headers.has('content-type'))throw Error('BETA_GOOGLE_AUTH_BODY');
 const url=new URL(input),signal=init.signal??AbortSignal.timeout(20000);signal.throwIfAborted();
 const addresses=await lookup(url.hostname,{all:true,family:4});signal.throwIfAborted();
 if(!addresses.length||addresses.some(a=>a.family!==4||!isPublicRoutableHost(a.address)))throw Error('BETA_GOOGLE_AUTH_ADDRESS');
 const max=256000,args=['--disable','--silent','--show-error','--ipv4','--globoff','--noproxy','*','--proto','=https','--max-redirs','0','--connect-timeout','10','--max-time','20','--max-filesize',String(max),'--resolve',url.hostname+':443:'+addresses[0].address,'--include','--config','-'];
 const config=['url = '+JSON.stringify(input),'request = '+JSON.stringify(init.method),...Array.from(headers,([k,v])=>'header = '+JSON.stringify(k+': '+v)),...(token?['data-binary = '+JSON.stringify(init.body)]:[])].join('\n')+'\n';
 return new Promise<Response>((resolve,reject)=>{
  const child=spawn('/mnt/c/Windows/System32/curl.exe',args,{stdio:['pipe','pipe','ignore'],signal});
  const chunks:Buffer[]=[];let size=0,oversize=false;
  const fail=()=>reject(Error('BETA_GOOGLE_AUTH_TRANSPORT'));
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>max+65536){oversize=true;child.kill();return;}chunks.push(chunk);});
  child.once('error',fail);child.stdin.on('error',fail);
  child.once('close',code=>{if(code!==0||oversize){fail();return;}try{const response=parseWindowsBetaResponse(Buffer.concat(chunks),max,token?'POST':'GET');if(response.status>=300&&response.status<400)throw Error('redirect');resolve(response);}catch{fail();}});
  child.stdin.end(config);
 });
}
