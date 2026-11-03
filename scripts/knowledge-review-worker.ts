import {lstat,readFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {Pool} from "pg";
import {createKnowledgeAcceptance,acceptanceEnabled} from "../lib/server/knowledge-acceptance";
import {knowledgeReadConfiguration} from "../lib/server/knowledge-read-runtime";
import {createReviewQueue,reviewConfigSchema,type ReviewConfig} from "../lib/server/knowledge-review-queue";
import {callGeminiReview,type geminiReviewRequest} from "../lib/server/gemini-knowledge-review";
import {memberConfig} from "../lib/server/member/config";
export async function runKnowledgeReviewOnce(queue:ReturnType<typeof createReviewQueue>,config:ReviewConfig,dispatch:(lease:NonNullable<Awaited<ReturnType<typeof queue.claim>>>)=>ReturnType<typeof callGeminiReview>,beforeSend?:(lease:NonNullable<Awaited<ReturnType<typeof queue.claim>>>)=>Promise<{reason:string;retryable:boolean}|null>){
 await queue.heartbeat(config);await queue.recoverExpired();const lease=await queue.claim(config);if(!lease)return false;
 if(!await queue.canSend(lease)){await queue.finish(lease,{state:'not-sent'});return true;}
 const rejected=await beforeSend?.(lease);if(rejected){await queue.rejectBeforeSend(lease,rejected.reason,rejected.retryable);return true;}
 if(createHash('sha256').update(lease.wire).digest('hex')!==lease.wireDigest)throw Error('Review wire differs from retained attempt');
 if(!await queue.canSend(lease)){await queue.finish(lease,{state:'not-sent'});return true;}
 const response=await dispatch(lease);await queue.finish(lease,response);return true;
}
async function privateText(file:string,max:number){const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size>max)throw Error('Review private file ownership or mode differs');return readFile(file,'utf8');}
async function main(){
 if(process.env.GRAPH_DEPLOYMENT==='production')throw Error('Production rollout is a separate U8 operation');
 process.loadEnvFile('.env.public');
 const auth=memberConfig();if(!auth||auth.origin!=='https://graph-beta.isinxnisi.com')throw Error('Existing HTTPS beta member configuration required');
 const file=process.env.KNOWLEDGE_REVIEW_CONFIG;if(!file||!path.isAbsolute(file)||process.env.KNOWLEDGE_REVIEW_ENABLED!=='1')throw Error('Review worker is not explicitly enabled');
 const config=reviewConfigSchema.parse(JSON.parse(await privateText(file,32000)));
 if(config.allowedUsers.join(',')!==process.env.KNOWLEDGE_REVIEW_ALLOWED_USERS)throw Error('Review user boundary differs');
 const pool=new Pool({connectionString:auth.databaseUrl,max:4}),queue=createReviewQueue(pool);
 const knowledge=acceptanceEnabled()?new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2}):null;
 const acceptance=knowledge?createKnowledgeAcceptance(pool,knowledge):null;
 let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 try{
  if(process.argv.includes("--status")){console.log(JSON.stringify(await queue.usage(config)));return;}
  await queue.heartbeat(config);
  const importIndex=process.argv.indexOf('--import-evaluation');
  if(importIndex>=0){const text=await privateText(path.resolve(process.argv[importIndex+1]),256000);const n=await queue.importEvaluation(JSON.parse(text),createHash('sha256').update(text).digest('hex'),config);console.log(JSON.stringify({event:'review-usage-import',imported:n}));return;}
  const key=(await privateText(config.apiKeyFile,8192)).trim();
  const heartbeat=setInterval(()=>{void queue.heartbeat(config).catch(()=>{stopping=true;});},15000);heartbeat.unref();
  try{while(!stopping){const worked=await runKnowledgeReviewOnce(queue,config,lease=>callGeminiReview({apiKey:key,model:lease.model,request:JSON.parse(lease.wire) as ReturnType<typeof geminiReviewRequest>}),acceptance?lease=>acceptance.validateReview(lease.jobId):undefined);const accepted=acceptance?await acceptance.run(config):false;if(worked||accepted)console.log(JSON.stringify({event:'knowledge-review-iteration',completed:true}));else await new Promise(resolve=>setTimeout(resolve,2500));if(process.argv.includes('--once'))break;}}
  finally{clearInterval(heartbeat);}
 }finally{await knowledge?.end();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Knowledge review worker stopped. Check the private configuration, migration and retained attempts.');process.exitCode=1;});
