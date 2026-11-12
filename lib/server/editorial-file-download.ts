import {editorialAttachmentHost} from '../domain/editorial-file';
import {windowsBetaHttps,windowsBetaHttpsEnabled} from './windows-beta-https';
import {lookup,Resolver} from 'node:dns/promises';
import {request} from 'node:https';
import {publicSourceAddress} from './knowledge-source-verification';
import {KnowledgeError} from './knowledge-foundation';

/** Host-issued file URLs only. Never persist/log signed URLs or accept an arbitrary URL importer. */
export function editorialFileURL(raw:string){
 let u:URL;try{u=new URL(raw);}catch{throw new KnowledgeError('ChatGPTの添付ファイルを選び直してください。',400,'FILE_REFERENCE_INVALID');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!editorialAttachmentHost(u.hostname)||u.hash)
  {console.warn('Editorial attachment origin rejected',{protocol:u.protocol.replace(/[^a-z:]/g,'').slice(0,12),hostname:u.hostname.replace(/[^a-z0-9.-]/gi,'').slice(0,160)});throw new KnowledgeError('ChatGPTから渡されたファイルだけを受け取れます。',400,'FILE_REFERENCE_INVALID');}
 return u;
}
export async function downloadEditorialFile(raw:string):Promise<Buffer>{
 const url=editorialFileURL(raw);
 try{
  const addresses=await Promise.race([windowsBetaHttpsEnabled()?new Resolver({timeout:1000,tries:2}).resolve4(url.hostname).then(values=>values.map(address=>({address,family:4}))):lookup(url.hostname,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('dns-timeout')),5000);timer.unref();})]);
  if(!addresses.length||addresses.some(a=>!publicSourceAddress(a.address)))throw Error('address');
  const address=addresses.find(a=>a.family===4)??addresses[0];
  if(windowsBetaHttpsEnabled()&&address.family===4){
   const response=await windowsBetaHttps(url,address.address,'attachment',AbortSignal.timeout(20000),'GET',{accept:'image/*,application/octet-stream','accept-encoding':'identity'});
   if(response.status!==200||response.headers.get('content-encoding')&&response.headers.get('content-encoding')!=='identity')throw Error('response');
   return Buffer.from(await response.arrayBuffer());
  }
  return await new Promise<Buffer>((resolve,reject)=>{
   const req=request(url,{method:'GET',agent:false,family:address.family,lookup:(_h,_o,cb)=>cb(null,address.address,address.family),signal:AbortSignal.timeout(20000),headers:{Accept:'image/*,application/octet-stream','Accept-Encoding':'identity'}},res=>{
    // Redirects are intentionally not followed: file authorization must not become an arbitrary fetch.
    if(res.statusCode!==200||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();reject(Error('response'));return;}
    if(Number(res.headers['content-length']??0)>8388608){res.destroy();reject(new KnowledgeError('画像は8MiB以下にしてください。',413,'IMAGE_TOO_LARGE'));return;}
    const chunks:Buffer[]=[];let size=0;
    res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8388608){res.destroy(new KnowledgeError('画像は8MiB以下にしてください。',413,'IMAGE_TOO_LARGE'));return;}chunks.push(chunk);});
    res.once('error',reject);res.once('end',()=>resolve(Buffer.concat(chunks)));
   });req.once('error',reject);req.end();
  });
 }catch(e){if(e instanceof KnowledgeError)throw e;throw new KnowledgeError('添付画像を取得できません。ファイルの有効期限や接続を確認し、同じ受付IDで送り直せます。',503,'FILE_DOWNLOAD_UNAVAILABLE');}
}
