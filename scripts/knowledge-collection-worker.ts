import {lstat,readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {collectionLeaseSchema,collectionWorkerCommandSchema,collectionDocumentSchema,type CollectionLease} from '../lib/domain/knowledge-collection';
import {publicSourceDocument,normalizeSourceText,sourceText,SourceCheckError} from '../lib/server/knowledge-source-verification';
export const collectionClientConfig=z.strictObject({origin:z.literal('https://graph-beta.isinxnisi.com'),token:z.string().regex(/^[a-f0-9]{64}$/),stateDirectory:z.string()});
const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const reply=z.object({result:z.object({lease:collectionLeaseSchema.nullable().optional(),state:z.string().optional()}),replayed:z.boolean()});
export async function captureCollectionSource(lease:CollectionLease){
 const document=await publicSourceDocument(lease.url),text=normalizeSourceText(sourceText(document));
 if(!text||text.length>120000)throw new SourceCheckError('Source exceeds the captured-text limit');
 return collectionDocumentSchema.parse({url:document.url,type:document.type,bodyBase64:document.body.toString('base64'),text,bodySha256:digest(document.body),textSha256:digest(text),fetchedAt:new Date().toISOString()});
}
export async function privateCollectionFile(file:string,max=3200000){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>max)throw Error('Private collection file boundary differs');return readFile(file,'utf8');}
export function createCollectionWorker(stateDirectory:string,send:(body:z.infer<typeof collectionWorkerCommandSchema>)=>Promise<unknown>,capture=captureCollectionSource){
 const pendingPath=path.join(stateDirectory,'pending.json');
 async function atomic(file:string,value:unknown){const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temporary,file);}
 async function read(file:string){try{return JSON.parse(await privateCollectionFile(file));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 async function deliver(body:z.infer<typeof collectionWorkerCommandSchema>){await atomic(pendingPath,body);try{const r=reply.parse(await send(body));await unlink(pendingPath);return r;}catch(e){if((e as {status?:number}).status===409){await unlink(pendingPath);return null;}throw e;}}
 async function run(){
  const info=await lstat(stateDirectory);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700)throw Error('Private collection state directory required');
  const pending=await read(pendingPath);
  const result=await deliver(pending?collectionWorkerCommandSchema.parse(pending):{action:'claim',requestId:randomUUID()});
  if(!result)return false;
  const lease=result.result.lease;if(!lease)return result.result.state==='captured'||result.result.state==='recorded';
  if(Date.parse(lease.expiresAt)<=Date.now())return false;
  const cache=path.join(stateDirectory,lease.itemId+'.json');
  try{
   const previous=await read(cache),document=previous&&previous.requestedURL===lease.url?collectionDocumentSchema.parse(previous.document):await capture(lease);
   if(!previous)await atomic(cache,{requestedURL:lease.url,document});
   await deliver({action:'complete',requestId:randomUUID(),jobId:lease.jobId,itemId:lease.itemId,generation:lease.generation,token:lease.token,document});
  }catch(e){
   // A retained outgoing command means delivery is unknown. Never replace it with a failure or rerun inference.
   if(await read(pendingPath))throw e;
   await deliver({action:'fail',requestId:randomUUID(),jobId:lease.jobId,itemId:lease.itemId,generation:lease.generation,token:lease.token,retryable:!(e instanceof SourceCheckError)||e.retryable,reason:e instanceof SourceCheckError?'unsupported':'network'});
  }
  return true;
 }
 return {run};
}
async function main(){
 const index=process.argv.indexOf('--config');if(index<0||!process.argv[index+1]||!path.isAbsolute(process.argv[index+1]))throw Error('Use --config with an absolute private file');
 const config=collectionClientConfig.parse(JSON.parse(await privateCollectionFile(process.argv[index+1],8000)));
 if(!path.isAbsolute(config.stateDirectory))throw Error('Absolute private state directory required');
 await mkdir(config.stateDirectory,{recursive:true,mode:0o700});
 const worker=createCollectionWorker(config.stateDirectory,async body=>{
  const r=await fetch(config.origin+'/api/knowledge-collection/worker',{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!r.ok){const e=Object.assign(new Error('Collection API unavailable'),{status:r.status});throw e;}return r.json();
 });
 let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 do{try{const worked=await worker.run();if(worked)console.log(JSON.stringify({event:'source-capture',completed:true}));}catch{console.error('Collection delivery is pending. Retained state will resume without another source request.');if(process.argv.includes('--once')){process.exitCode=1;break;}}
  if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,5000));
 }while(!stopping);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Collection worker stopped. Check its private configuration and retained state.');process.exitCode=1;});
