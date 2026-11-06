import {assertKnowledgeWorker,knowledgeHttpsOrigin} from "../lib/server/knowledge-deployment";
import {lstat,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {readingLeaseSchema,readingWorkerSchema,type ReadingLease} from '../lib/domain/knowledge-collection-reading';
import {callGeminiReview} from '../lib/server/gemini-knowledge-review';
import {privateCollectionFile} from './knowledge-collection-worker';
const configSchema=z.strictObject({origin:knowledgeHttpsOrigin,token:z.string().regex(/^[a-f0-9]{64}$/),stateDirectory:z.string(),apiKeyFile:z.string()});
const responseSchema=z.object({result:z.object({lease:readingLeaseSchema.nullable().optional(),send:z.boolean().optional(),state:z.string().optional()}),replayed:z.boolean()});
const workSchema=z.strictObject({lease:readingLeaseSchema,stage:z.enum(['claimed','sending','response']),result:z.unknown().optional()});
type Command=ReturnType<typeof readingWorkerSchema.parse>;
export function createCollectionReader(directory:string,send:(body:Command)=>Promise<unknown>,infer:(lease:ReadingLease)=>ReturnType<typeof callGeminiReview>){
 const pendingFile=path.join(directory,'pending.json'),workFile=path.join(directory,'work.json');
 async function atomic(file:string,value:unknown){const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{flag:'wx',mode:0o600});await rename(temp,file);}
 async function read(file:string){try{return JSON.parse(await privateCollectionFile(file,512000));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 async function remove(file:string){await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 async function deliver(command:Command){await atomic(pendingFile,command);const result=responseSchema.parse(await send(command));await remove(pendingFile);return result.result;}
 async function handle(command:Command,result:z.infer<typeof responseSchema>['result']){
  if(command.action==='complete'){await remove(workFile);return;}
  if(command.action==='claim'){if(result.lease)await atomic(workFile,{lease:result.lease,stage:'claimed'});return;}
  if(!result.send){await remove(workFile);return;}
  // Persist this marker BEFORE the external request. A restart here records an
  // unknown delivery instead of resending an inference that may have succeeded.
  await atomic(workFile,{lease:command.lease,stage:'sending'});
  const reply=Date.parse(command.lease.expiresAt)<=Date.now()?{state:'delivery-unknown' as const}:await infer(command.lease);await atomic(workFile,{lease:command.lease,stage:'response',result:reply});
 }
 return {async run(){
  const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700)throw Error('Private reader directory required');
  const pending=await read(pendingFile);if(pending){const command=readingWorkerSchema.parse(pending);await handle(command,await deliver(command));}
  let work=await read(workFile);
  if(!work){const command={action:'claim' as const,requestId:randomUUID()};await handle(command,await deliver(command));work=await read(workFile);if(!work)return false;}
  let saved=workSchema.parse(work);
  if(createHash('sha256').update(saved.lease.wire).digest('hex')!==saved.lease.wireDigest)throw Error('Retained wire changed');
  if(saved.stage==='claimed'){
   if(Date.parse(saved.lease.expiresAt)<=Date.now()){const c=readingWorkerSchema.parse({action:'complete',requestId:randomUUID(),lease:saved.lease,result:{state:'not-sent'}});await handle(c,await deliver(c));return true;}
   const c={action:'begin' as const,requestId:randomUUID(),lease:saved.lease};await handle(c,await deliver(c));work=await read(workFile);if(!work)return true;saved=workSchema.parse(work);
  }
  const c=readingWorkerSchema.parse({action:'complete',requestId:randomUUID(),lease:saved.lease,result:saved.stage==='response'?saved.result:{state:'delivery-unknown'}});await handle(c,await deliver(c));return true;
 }};
}
async function main(){
 const at=process.argv.indexOf('--config');if(at<0||!path.isAbsolute(process.argv[at+1]??''))throw Error('Absolute private configuration required');const cfg=configSchema.parse(JSON.parse(await privateCollectionFile(process.argv[at+1],8000)));
 assertKnowledgeWorker("reader",cfg.origin);
 if(!path.isAbsolute(cfg.stateDirectory)||!path.isAbsolute(cfg.apiKeyFile))throw Error('Private absolute paths required');await mkdir(cfg.stateDirectory,{recursive:true,mode:0o700});const key=(await privateCollectionFile(cfg.apiKeyFile,8192)).trim();
 const worker=createCollectionReader(cfg.stateDirectory,async command=>{assertKnowledgeWorker("reader",cfg.origin);const r=await fetch(cfg.origin+'/api/knowledge-collection/reading-worker',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+cfg.token,'content-type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Reader delivery unavailable');return r.json();},lease=>{assertKnowledgeWorker("reader",cfg.origin);return callGeminiReview({apiKey:key,model:lease.model,request:JSON.parse(lease.wire)});});
 let stop=false;process.once('SIGTERM',()=>{stop=true;});process.once('SIGINT',()=>{stop=true;});do{try{if(await worker.run())console.log(JSON.stringify({event:'collection-reading',completed:true}));}catch{console.error('Reader delivery pending. Private checkpoints and usage reservations are retained.');if(process.argv.includes('--once')){process.exitCode=1;break;}}if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,5000));}while(!stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Collection reader stopped. Check its private configuration and retained state.');process.exitCode=1;});
