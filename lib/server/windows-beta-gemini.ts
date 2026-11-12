import {spawn} from 'node:child_process';
import {lookup} from 'node:dns/promises';
import {isPublicRoutableHost} from '@better-auth/core/utils/host';
import {parseWindowsBetaResponse,windowsBetaHttpsEnabled} from './windows-beta-https';

/** Fixed Google endpoint only. API key and exact JSON wire go through stdin,
 * never command arguments, files, logs, redirects or a general-purpose proxy.
 * The caller still owns the single durable attempt, quota and retry schedule. */
export async function windowsBetaGeminiFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 if(!windowsBetaHttpsEnabled())throw Error('BETA_GEMINI_DISABLED');
 const url=new URL(String(input));
 if(url.origin!=='https://generativelanguage.googleapis.com'||!/^\/v1beta\/models\/gemini-[a-z0-9.-]+:generateContent$/.test(url.pathname)||url.search||url.hash||url.username||url.password||init?.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||Buffer.byteLength(init.body)>128000)throw Error('BETA_GEMINI_REQUEST');
 const headers=new Headers(init.headers),key=headers.get('x-goog-api-key');
 if(!key||!/^[\x21-\x7e]{1,8192}$/.test(key)||headers.get('content-type')!=='application/json'||headers.get('api-revision')!=='2026-05-20'||Array.from(headers.keys()).some(k=>!['x-goog-api-key','content-type','api-revision'].includes(k)))throw Error('BETA_GEMINI_HEADERS');
 JSON.parse(init.body);const signal=init.signal??AbortSignal.timeout(60000);signal.throwIfAborted();
 const addresses=await lookup(url.hostname,{all:true,family:4});signal.throwIfAborted();
 if(!addresses.length||addresses.some(a=>a.family!==4||!isPublicRoutableHost(a.address)))throw Error('BETA_GEMINI_ADDRESS');
 const max=2_000_000,args=['--silent','--show-error','--ipv4','--globoff','--noproxy','*','--proto','=https','--max-redirs','0','--connect-timeout','10','--max-time','120','--max-filesize',String(max),'--resolve',url.hostname+':443:'+addresses[0].address,'--include','--config','-'];
 const config=['url = '+JSON.stringify(url.href),'request = "POST"',...Array.from(headers,([k,v])=>'header = '+JSON.stringify(k+': '+v)),'data-binary = '+JSON.stringify(init.body)].join('\n')+'\n';
 return new Promise<Response>((resolve,reject)=>{
  const child=spawn('/mnt/c/Windows/System32/curl.exe',args,{stdio:['pipe','pipe','ignore'],signal});
  const chunks:Buffer[]=[];let size=0,oversize=false;
  const fail=()=>reject(Object.assign(Error('BETA_GEMINI_TRANSPORT'),{code:'BETA_GEMINI_TRANSPORT'}));
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>max+65536){oversize=true;child.kill();return;}chunks.push(chunk);});
  child.once('error',fail);child.stdin.on('error',fail);
  child.once('close',code=>{if(code!==0||oversize){fail();return;}try{const response=parseWindowsBetaResponse(Buffer.concat(chunks),max,'POST');if(response.status>=300&&response.status<400)throw Error('BETA_GEMINI_REDIRECT');resolve(response);}catch{fail();}});
  child.stdin.end(config);
 });
}
