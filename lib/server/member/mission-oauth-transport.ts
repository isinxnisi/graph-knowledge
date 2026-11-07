import {isPublicRoutableHost} from '@better-auth/core/utils/host';
import type {ClientMetadataResourceFetch} from '@better-auth/oauth-provider';
import {Resolver} from 'node:dns/promises';
import {request} from 'node:https';
import {Readable} from 'node:stream';

function reportMetadataFailure(stage:'dns'|'https',error:unknown){
 const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;
 console.warn('Collection OAuth metadata request failed',{stage,code:typeof code==='string'&&/^[A-Z0-9_]{1,48}$/.test(code)?code:'UNKNOWN'});
}

/** Resolve IPv4 through DNS directly: this host's NSS lookup adds about five
 * seconds and its IPv6 route is unavailable. Retry DNS within the five-second
 * CIMD deadline, validate every answer, then pin one for TLS without a relookup.
 * Both the metadata document and its JWKS stay on the sole trusted client host. */
export const fetchMissionClientMetadataResource:ClientMetadataResourceFetch=async(input,init)=>{
 const webRequest=new Request(input,init),url=new URL(webRequest.url);
 if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.username||url.password||(url.port&&url.port!=='443'))
  throw new TypeError('Untrusted collection client metadata URL');
 if(!['GET','HEAD'].includes(webRequest.method))throw new TypeError('Metadata requires GET or HEAD');
 const signal=webRequest.signal;signal.throwIfAborted();
 const resolver=new Resolver({timeout:1000,tries:2});
 const cancel=()=>resolver.cancel();signal.addEventListener('abort',cancel,{once:true});
 let addresses:{address:string;family:number}[];
 try{
  const v4=await resolver.resolve4(url.hostname);
  signal.throwIfAborted();
  addresses=v4.map(address=>({address,family:4}));
 }catch(error){
  if(!signal.aborted)reportMetadataFailure('dns',error);
  throw error;
 }finally{signal.removeEventListener('abort',cancel);}
 if(!addresses.length||addresses.some(a=>!isPublicRoutableHost(a.address)))
  throw new TypeError('Metadata requires public-routable DNS answers');
 const pinned=addresses[0],headers:Record<string,string>={host:url.host};
 for(const name of ['accept','if-none-match','if-modified-since']){
  const value=webRequest.headers.get(name);if(value!==null)headers[name]=value;
 }
 return new Promise((resolve,reject)=>{
  const req=request(url,{agent:false,headers,method:webRequest.method,servername:url.hostname,signal,family:4,autoSelectFamily:false,
   lookup:(_host,options,callback)=>{
    if(options.all)callback(null,[pinned]);else callback(null,pinned.address,pinned.family);
   },
  },response=>{
   const status=response.statusCode??500,responseHeaders=new Headers();
   for(const [name,value]of Object.entries(response.headers)){
    if(Array.isArray(value))for(const item of value)responseHeaders.append(name,item);
    else if(value!==undefined)responseHeaders.append(name,value);
   }
   // IncomingMessage yields bytes; Node and DOM declare distinct stream types.
   const body=webRequest.method==='HEAD'||[204,205,304].includes(status)?null:Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>;
   resolve(new Response(body,{status,headers:responseHeaders,statusText:response.statusMessage}));
  });
  // Keep handling a late socket/abort error after the first rejection as well.
  req.on('error',error=>{reportMetadataFailure('https',error);reject(error);});req.end();
 });
};
