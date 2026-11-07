import {lstat,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {knowledgeDigest} from '../lib/server/knowledge-foundation';
import {missionWorkerSchema} from '../lib/domain/knowledge-mission';

const configSchema=z.strictObject({origin:z.url(),tokenFile:z.string(),checkpointDirectory:z.string()});
type Lease={runId:string;generation:number;token:string;expiresAt:string;[key:string]:unknown};
type Checkpoint={lease?:Lease;pending?:z.infer<typeof missionWorkerSchema>;result?:unknown;completed?:{runId:string;action:string;digest:string;result:unknown}};
type WorkerCommand=z.infer<typeof missionWorkerSchema>;
function completedCommand(command:Exclude<WorkerCommand,{action:'claim'}>,result:unknown){
 const payload=command.action==='deliver'?command.package:command.action==='empty'?command.summary:command.action==='fail'?command.reason:command.action==='observe'?command.urls:null;
 return {runId:command.runId,action:command.action,digest:knowledgeDigest({action:command.action,payload}),result};
}
async function privateText(file:string,max:number){const s=await lstat(file);if(!path.isAbsolute(file)||!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o600||s.size>max)throw Error('本人所有・0600のprivateファイルを指定してください。');return readFile(file,'utf8');}
export type MissionClientInput={expectedRunId:string;payload?:unknown};
export async function runMissionClient(args:string[],input?:MissionClientInput){
 const [file,action,inputPath]=args;if(!file||!['claim','observe','deliver','empty','fail'].includes(action))throw Error('使い方: knowledge-mission-client.ts PRIVATE_CONFIG claim | observe URLS_JSON | deliver PACKAGE_FILE | empty SUMMARY_FILE | fail REASON');
 const cfg=configSchema.parse(JSON.parse(await privateText(file,16000))),origin=new URL(cfg.origin);
 if(origin.origin!==cfg.origin||origin.protocol!=='https:'||origin.username||origin.password)throw Error('正確なHTTPS originを指定してください。');
 const dir=await lstat(cfg.checkpointDirectory);if(!path.isAbsolute(cfg.checkpointDirectory)||!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid?.()||(dir.mode&0o777)!==0o700)throw Error('checkpointは本人所有の0700ディレクトリへ保存してください。');
 const token=(await privateText(cfg.tokenFile,512)).trim();if(!/^[a-f0-9]{64}$/.test(token))throw Error('配送資格の形式を確認してください。');
 const current=path.join(cfg.checkpointDirectory,'mission-current.json');let cp:Checkpoint={};try{cp=JSON.parse(await privateText(current,2300000));}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='ENOENT'))throw e;}
 async function save(value:Checkpoint){value={...value,completed:value.completed??cp.completed};const tmp=current+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(tmp,current);cp=value;}
 async function send(body:z.infer<typeof missionWorkerSchema>){
  const response=await fetch(cfg.origin+'/api/knowledge-collection/missions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','user-agent':'Plunode-Mission-Delivery'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  const reader=response.body?.getReader();if(!reader)throw Error('配送先の応答がありません。');const chunks:Uint8Array[]=[];let size=0;
  for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>2300000){await reader.cancel();throw Error('応答が大きすぎます。');}chunks.push(v.value);}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!response.ok){const code=result.error?.code;
   if(response.status===409&&['MISSION_LEASE_CHANGED','REVISION_CONFLICT'].includes(code))await save({result:{state:'stale',code}});
   else if(response.status>=400&&response.status<500&&response.status!==429)await save({lease:cp.lease,result:{state:'rejected',code}});
   throw Error(String(code??'DELIVERY_UNAVAILABLE'));
  }return result;
 }
 const publicLease=(lease:Lease)=>{const {token:_,...brief}=lease;void _;return brief;};
 if(action==='claim'){
  // Recover an already prepared delivery before asking the model to research again.
  if(cp.pending&&cp.pending.action!=='claim'){const command=cp.pending,observing=command.action==='observe',result=await send(command);await save(observing?{lease:cp.lease,result}:{result,completed:completedCommand(command,result)});return {recoveredDelivery:!observing,recoveredObservation:observing,...result};}
  if(cp.lease&&Date.parse(cp.lease.expiresAt)>Date.now()){
   const value=await send({action:'resume',requestId:randomUUID(),runId:cp.lease.runId,generation:cp.lease.generation,token:cp.lease.token});
   const lease=value.lease as Lease|undefined;
   if(!lease||lease.runId!==cp.lease.runId||lease.generation!==cp.lease.generation||lease.token!==cp.lease.token||!Number.isFinite(Date.parse(lease.expiresAt)))throw Error('実行の確認応答が不完全です。次回に同じ実行を確認します。');
   await save({lease});return {lease:publicLease(lease),resumed:true};
  }
  const command=cp.pending?.action==='claim'?cp.pending:{action:'claim' as const,requestId:randomUUID()};await save({pending:command});const result=await send(command),lease=result.result?.lease as Lease|null;
  if(lease&&Date.parse(lease.expiresAt)<=Date.now()){await save({});return {lease:null,reason:'前の依頼の期限が切れました。次回の実行で取り直します。'};}
  await save(lease?{lease}:{result});return {...result,result:result.result?{...result.result,lease:lease?publicLease(lease):null}:result.result};
 }
 const inputDigest=input?knowledgeDigest({action,payload:input.payload}):undefined;
 if(input&&cp.completed?.runId===input.expectedRunId){
  if(cp.completed.action===action&&cp.completed.digest===inputDigest)return cp.completed.result;
  throw Error('MISSION_ALREADY_FINISHED');
 }
 if(!cp.lease)throw Error('先にclaimで実行を取得してください。');
 if(input&&cp.lease.runId!==input.expectedRunId)throw Error('MISSION_LEASE_CHANGED');
 const lease={runId:cp.lease.runId,generation:cp.lease.generation,token:cp.lease.token},base={requestId:randomUUID(),...lease};
 const payload=input?input.payload:undefined;
 const body=missionWorkerSchema.parse(action==='observe'?{action,...base,urls:input?payload:JSON.parse(await privateText(path.resolve(inputPath??''),16000))}:action==='deliver'?{action,...base,package:input?payload:JSON.parse(await privateText(path.resolve(inputPath??''),2000000))}:action==='empty'?{action,...base,summary:input?payload:(await privateText(path.resolve(inputPath??''),4000)).trim()}:{action:'fail',...base,retryable:true,reason:input?payload:inputPath});
 if(body.action==='claim')throw Error('INVALID_ARGUMENT');
 if(cp.pending&&knowledgeDigest({...cp.pending,requestId:''})!==knowledgeDigest({...body,requestId:''}))throw Error('再送待ちの内容と異なります。先にclaimで保存済み配送を回収してください。');
 const pending=cp.pending??body;await save({...cp,pending});const result=await send(pending);await save(action==='observe'?{lease:cp.lease,result}:{result,completed:completedCommand(body,result)});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runMissionClient(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error('定期収集の配送を完了できませんでした。資格値は表示しません。'+(e instanceof Error?' '+e.message:''));process.exitCode=1;});
