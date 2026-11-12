import {editorialAttachmentHost} from '../domain/editorial-file';
import {spawn} from 'node:child_process';
import {isIP} from 'node:net';
import {isPublicRoutableHost} from '@better-auth/core/utils/host';

/** Development-only HTTPS transport. No listener, proxy service, temporary file,
 * credentials or signed URL in command arguments. Windows curl still verifies TLS. */
export function windowsBetaHttpsEnabled(){
 return process.platform==='linux' && process.env.PLUNODE_WINDOWS_HTTPS_TRANSPORT==='1'
  && process.env.KNOWLEDGE_RUNTIME==='beta'
  && process.env.KNOWLEDGE_PUBLIC_ORIGIN==='https://graph-beta.isinxnisi.com';
}
export function validateWindowsBetaDestination(url:URL,address:string,kind:'metadata'|'attachment'|'source'){
 // Source URLs are independently DNS-checked and pinned by the source verifier.
 const allowed=kind==='source'?isPublicRoutableHost(url.hostname):kind==='metadata'?url.hostname==='chatgpt.com':editorialAttachmentHost(url.hostname);
 if(!allowed||url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||isIP(address)!==4||!isPublicRoutableHost(address))throw Error('BETA_HTTPS_DESTINATION');
}
export function parseWindowsBetaResponse(bytes:Buffer,maxBytes:number,method:string){
 let start=0;
 while(true){
  const end=bytes.indexOf('\r\n\r\n',start);if(end<0||end-start>65536)throw Error('BETA_HTTPS_HEADERS');
  const lines=bytes.subarray(start,end).toString('latin1').split('\r\n');
  const status=Number(/^HTTP\/[^ ]+ (\d{3})/.exec(lines.shift()??'')?.[1]);
  if(!status)throw Error('BETA_HTTPS_STATUS');
  start=end+4;if(status>=100&&status<200)continue;
  const headers=new Headers();
  for(const line of lines){const split=line.indexOf(':');if(split>0)headers.append(line.slice(0,split),line.slice(split+1).trim());}
  const body=bytes.subarray(start);if(body.length>maxBytes)throw Error('BETA_HTTPS_TOO_LARGE');
  return new Response(method==='HEAD'||[204,205,304].includes(status)?null:Uint8Array.from(body),{status,headers});
 }
}
export async function windowsBetaHttps(url:URL,address:string,kind:'metadata'|'attachment'|'source',signal:AbortSignal,method='GET',headers:Record<string,string>={}){
 if(!windowsBetaHttpsEnabled())throw Error('BETA_HTTPS_DISABLED');
 validateWindowsBetaDestination(url,address,kind);signal.throwIfAborted();
 if(!['GET','HEAD'].includes(method))throw Error('BETA_HTTPS_METHOD');
 const max=kind==='metadata'?1048576:kind==='source'?2_000_000:8388608;
 const args=['--silent','--show-error','--ipv4','--noproxy','*','--proto','=https','--max-redirs','0','--connect-timeout','3','--max-time',kind==='metadata'?'4':'20','--max-filesize',String(max),'--resolve',url.hostname+':443:'+address,'--request',method,'--include','--config','-'];
 if(kind==='source')args.push('--user-agent','Plunode-SourceCheck/1.0 (+https://plunode.net/privacy)');
 for(const [key,value]of Object.entries(headers)){
  if(!['accept','accept-encoding','if-none-match','if-modified-since'].includes(key.toLowerCase())||/[\r\n]/.test(value))throw Error('BETA_HTTPS_HEADER');
  args.push('--header',key+': '+value);
 }
 return new Promise<Response>((resolve,reject)=>{
  const child=spawn('/mnt/c/Windows/System32/curl.exe',args,{stdio:['pipe','pipe','ignore'],signal});
  const chunks:Buffer[]=[];let size=0,oversize=false;
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>max+65536){oversize=true;child.kill();return;}chunks.push(chunk);});
  child.once('error',()=>reject(Error('BETA_HTTPS_TRANSPORT')));
  child.once('close',code=>{if(code===63||oversize){reject(Error('BETA_HTTPS_TOO_LARGE'));return;}if(code!==0){reject(Error('BETA_HTTPS_TRANSPORT'));return;}try{resolve(parseWindowsBetaResponse(Buffer.concat(chunks),max,method));}catch{reject(Error('BETA_HTTPS_RESPONSE'));}});
  child.stdin.on('error',()=>reject(Error('BETA_HTTPS_TRANSPORT')));
  child.stdin.end('url = '+JSON.stringify(url.href)+'\n');
 });
}
