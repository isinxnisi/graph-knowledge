import {isPublicRoutableHost} from '@better-auth/core/utils/host';
import type {ClientMetadataResourceFetch} from '@better-auth/oauth-provider';
import {Resolver} from 'node:dns/promises';
import {request} from 'node:https';
import {Readable} from 'node:stream';

/** Resolve through DNS directly: this host's NSS lookup adds about five seconds.
 * Validate every returned address, then pin one for TLS without a second lookup.
 * Both the metadata document and its JWKS stay on the sole trusted client host. */
export const fetchMissionClientMetadataResource:ClientMetadataResourceFetch=async(input,init)=>{
 const webRequest=new Request(input,init),url=new URL(webRequest.url);
 if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||url.username||url.password||(url.port&&url.port!=='443'))
  throw new TypeError('Untrusted collection client metadata URL');
 if(!['GET','HEAD'].includes(webRequest.method))throw new TypeError('Metadata requires GET or HEAD');
 const signal=webRequest.signal;signal.throwIfAborted();
 const resolver=new Resolver({timeout:1500,tries:1});
 const cancel=()=>resolver.cancel();signal.addEventListener('abort',cancel,{once:true});
 let addresses:{address:string;family:number}[];
 try{
  const [v4,v6]=await Promise.allSettled([resolver.resolve4(url.hostname),resolver.resolve6(url.hostname)]);
  signal.throwIfAborted();
  addresses=[...(v4.status==='fulfilled'?v4.value.map(address=>({address,family:4})):[]),
   ...(v6.status==='fulfilled'?v6.value.map(address=>({address,family:6})):[])];
 }finally{signal.removeEventListener('abort',cancel);}
 if(!addresses.length||addresses.some(a=>!isPublicRoutableHost(a.address)))
  throw new TypeError('Metadata requires public-routable DNS answers');
 const pinned=addresses[0],headers:Record<string,string>={host:url.host};
 for(const name of ['accept','if-none-match','if-modified-since']){
  const value=webRequest.headers.get(name);if(value!==null)headers[name]=value;
 }
 return new Promise((resolve,reject)=>{
  const req=request(url,{agent:false,headers,method:webRequest.method,servername:url.hostname,signal,
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
  req.once('error',reject);req.end();
 });
};
