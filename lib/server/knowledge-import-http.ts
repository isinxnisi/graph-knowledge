import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {importCancelSchema,type ImportConfiguration} from '../domain/knowledge-import';
import {KnowledgeError} from './knowledge-foundation';
import type {createKnowledgeImports} from './knowledge-import';
type Service=ReturnType<typeof createKnowledgeImports>;
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'}});
async function boundedJson(r:Request){
 if(r.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new KnowledgeError('JSON形式で送信してください',415,'JSON_REQUIRED');
 const reader=r.body?.getReader();if(!reader)throw new KnowledgeError('内容がありません',400,'INVALID_JSON');
 const deadline=Date.now()+15000,chunks:Uint8Array[]=[];let size=0;
 try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;
  const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new KnowledgeError('送信に時間がかかっています',408,'BODY_TIMEOUT')),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
  if(part.done)break;size+=part.value.byteLength;if(size>2000000)throw new KnowledgeError('2MB以内のpackageへ分けてください',413,'BODY_TOO_LARGE');chunks.push(part.value);
 }}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new KnowledgeError('JSON形式を確認してください',400,'INVALID_JSON');}
}
export function createKnowledgeImportHttp(origin:string,configuration:()=>Promise<ImportConfiguration>,service:()=>Promise<Service>){
 async function authenticate(r:Request){
  const cfg=await configuration();if(cfg.origin!==origin)throw new KnowledgeError('配置設定を確認してください',503,'IMPORT_UNAVAILABLE');
  if(r.headers.has('origin')&&r.headers.get('origin')!==origin||r.headers.get('sec-fetch-site')==='cross-site')throw new KnowledgeError('送信元を確認してください',403,'INVALID_ORIGIN');
  const match=/^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(r.headers.get('authorization')??'');
  const digest=createHash('sha256').update(match?.[1]??'').digest();
  const p=cfg.principals.find(p=>timingSafeEqual(Buffer.from(p.tokenSha256,'hex'),digest));
  if(!match||!p||p.disabled||Date.parse(p.expiresAt)<=Date.now())throw new KnowledgeError('送信資格を確認してください',401,'UNAUTHENTICATED');
  return p;
 }
 async function handle(f:()=>Promise<Response>){try{return await f();}catch(e){
  if(e instanceof KnowledgeError)return json({error:{code:e.code,message:e.message}},e.status);
  if(e instanceof z.ZodError)return json({error:{code:'INVALID_ARGUMENT',message:'packageの形式・項目数・参照を確認してください。'}},400);
  console.error('Knowledge import temporarily unavailable');return json({error:{code:'IMPORT_UNAVAILABLE',message:'受付との接続を確認しています。同じpackage版を再送できます。'}},503);
 }}
 const id=(v:string)=>z.uuidv4().parse(v);
 return {
  post:(r:Request)=>handle(async()=>{const p=await authenticate(r),raw=await boundedJson(r),s=await service(),accepted=await s.intake(p,raw);return json({...accepted,receipt:await s.receipt(p,accepted.receiptId)},202);}),
  get:(r:Request,receiptId:string)=>handle(async()=>{const p=await authenticate(r);return json(await(await service()).receipt(p,id(receiptId)));}),
  cancel:(r:Request,receiptId:string)=>handle(async()=>{const p=await authenticate(r);const body=importCancelSchema.parse(await boundedJson(r));const s=await service();await s.cancel(p,id(receiptId),body.reason);return json(await s.receipt(p,receiptId));}),
 };
}
