import {lookup} from "node:dns/promises";
import {request} from "node:https";
import {isIP} from "node:net";
import {createHash} from "node:crypto";
import ipaddr from "ipaddr.js";
import {parse,type DefaultTreeAdapterMap} from "parse5";

export const SOURCE_EXTRACTOR = "public-text-v1";
export type SourceDocument = {url:string;type:string;body:Buffer};
export type SourceProof = {url:string;requestedUrl?:string;bodySha256:string;textSha256:string;excerptSha256:string;extractor:string;checkedAt:string};
export class SourceCheckError extends Error {
 constructor(message:string,readonly retryable=false,readonly retryAfterMs=120000){super(message);}
}
export function publicSourceAddress(address:string){
 try{return ipaddr.process(address).range()==="unicast";}catch{return false;}
}
export function sourceURL(raw:string){
 let url:URL;try{url=new URL(raw);}catch{throw new SourceCheckError("原資料の公開HTTPS URLを確認してください。");}
 if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443"||url.hostname.endsWith(".")||url.hostname.length>253)
  throw new SourceCheckError("原資料には認証不要の公開HTTPS URLを指定してください。");
 url.hash="";return url;
}
export async function publicSourceDocument(raw:string,options:{allowedHosts?:string[]}={}):Promise<SourceDocument>{
 let url=sourceURL(raw);const deadline=Date.now()+20000;
 for(let redirect=0;redirect<=3;redirect++){
  if(options.allowedHosts&&!options.allowedHosts.includes(url.hostname))throw new SourceCheckError("計画で指定したサイト以外への転送は取得しません。");
  const host=url.hostname.replace(/^\[|\]$/g,"");
  const addresses=await Promise.race([lookup(host,{all:true,verbatim:true,family:isIP(host)||4}).catch(()=>lookup(host,{all:true,verbatim:true,family:6})),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new SourceCheckError("資料の接続先を確認できません。再試行します。",true)),5000);timer.unref();})]);
  if(!addresses.length||addresses.some(a=>!publicSourceAddress(a.address)))throw new SourceCheckError("内部ネットワークの資料は取得できません。公開資料を指定してください。");
  const address=addresses[0],remaining=deadline-Date.now();if(remaining<=0)throw new SourceCheckError("資料の取得に時間がかかっています。再試行します。",true);
  const result=await new Promise<{status:number;location?:string;type:string;body:Buffer;retryAfter?:string}>((resolve,reject)=>{
   const req=request(url,{method:"GET",family:address.family,agent:false,
    lookup:(_host,_options,callback)=>callback(null,address.address,address.family),
    headers:{"User-Agent":"Plunode-SourceCheck/1.0 (+https://plunode.net/privacy)",Accept:"text/html, text/plain;q=0.9","Accept-Encoding":"identity"},signal:AbortSignal.timeout(Math.min(10000,remaining))},res=>{
    const status=res.statusCode??0,type=String(res.headers['content-type']??'').toLowerCase();
    if(status>=300&&status<400){res.destroy();resolve({status,location:res.headers.location,type,body:Buffer.alloc(0)});return;}
    if(status!==200){res.destroy();resolve({status,type,body:Buffer.alloc(0),retryAfter:String(res.headers['retry-after']??'')});return;}
    if(!/^(text\/html|text\/plain|application\/xhtml\+xml)(;|$)/.test(type)||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){
     res.destroy();reject(new SourceCheckError("この資料形式はまだ自動照合できません。本文を読めるHTMLやテキストの別資料を指定してください。"));return;
    }
    const chunks:Buffer[]=[];let bytes=0;
    res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2_000_000){res.destroy(new SourceCheckError("資料が大きすぎます。該当箇所のある別ページを指定してください。"));return;}chunks.push(chunk);});
    res.on('end',()=>resolve({status,type,body:Buffer.concat(chunks)}));res.on('error',reject);
   });req.once('error',reject);req.end();
  });
  if(result.status>=300&&result.status<400){if(!result.location||redirect===3)throw new SourceCheckError("資料の転送が続いています。最終ページのURLを指定してください。");url=sourceURL(new URL(result.location,url).href);continue;}
  if(result.status===429||result.status>=500){const seconds=Number(result.retryAfter),date=Date.parse(result.retryAfter??'');throw new SourceCheckError("原資料のサイトが混雑しています。時間をおいて再試行します。",true,Math.min(86400000,Math.max(120000,Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?date-Date.now():120000)));}
  if(result.status!==200)throw new SourceCheckError("原資料を匿名で読めません。公開URLや別資料を確認してください。");
  return {url:url.href,type:result.type,body:result.body};
 }
 throw new SourceCheckError("原資料の転送先を確認できません。");
}
type TreeNode=DefaultTreeAdapterMap['node'];
export function sourceText(document:SourceDocument){
 const charset=/charset\s*=\s*["']?([^\s;"']+)/i.exec(document.type)?.[1]??'utf-8';
 let decoded:string;try{decoded=new TextDecoder(charset,{fatal:true}).decode(document.body);}catch{throw new SourceCheckError("資料の文字コードを読めません。別の公開資料を指定してください。");}
 if(document.type.startsWith('text/plain'))return decoded;
 const root=parse(decoded);const blocks=new Set(['p','div','li','h1','h2','h3','h4','section','article','br','tr','td']);
 const omit=new Set(['script','style','noscript','template','nav','footer','header','form','svg','canvas']);
 function text(node:TreeNode):string{
  if(node.nodeName==='#text')return (node as DefaultTreeAdapterMap['textNode']).value;
  if('tagName' in node){if(omit.has(node.tagName)||node.attrs.some(a=>a.name==='hidden'||a.name==='aria-hidden'&&a.value==='true'))return '';}
  const children='childNodes' in node?node.childNodes.map(text).join(''):'';
  return 'tagName' in node&&blocks.has(node.tagName)?'\n'+children+'\n':children;
 }
 return text(root);
}
export const normalizeSourceText=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,' ').trim();
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function matchSourceExcerpt(document:SourceDocument,excerpt:string):SourceProof{
 const normalized=normalizeSourceText(sourceText(document)),quote=normalizeSourceText(excerpt);
 if(!quote)throw new SourceCheckError("根拠の抜粋を、原資料の本文から引用して追加してください。");
 if(!normalized.includes(quote))throw new SourceCheckError("抜粋を原資料の本文に見つけられませんでした。要約ではなく、資料から引用した文章を確認してください。");
 return {url:document.url,bodySha256:hash(document.body),textSha256:hash(normalized),excerptSha256:hash(quote),extractor:SOURCE_EXTRACTOR,checkedAt:new Date().toISOString()};
}
export async function verifySourceExcerpt(url:string,excerpt:string):Promise<SourceProof>{
  try{return {...matchSourceExcerpt(await publicSourceDocument(url),excerpt),requestedUrl:sourceURL(url).href};}catch(e){if(e instanceof SourceCheckError)throw e;throw new SourceCheckError("原資料との接続を確認できません。時間をおいて再試行します。",true);}
}
