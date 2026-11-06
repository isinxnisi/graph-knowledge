import {Pool} from 'pg';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertKnowledgeWorker,knowledgeDeployment,knowledgePublishingEnabled,reviewMemberScope} from '../lib/server/knowledge-deployment';
import {knowledgeReadConfiguration} from '../lib/server/knowledge-read-runtime';
import {createKnowledgePatrol} from '../lib/server/knowledge-patrol';
import {migrateKnowledgePatrol} from '../lib/server/knowledge-patrol-schema';
import {readLegacyTargetInventory} from '../lib/server/knowledge-target-inventory-legacy';
import {migrateKnowledgeOrganization} from '../lib/server/knowledge-organization-schema';
import {readOrganizationStatus} from '../lib/server/knowledge-organization-status';
import {createOrganizationMaterialReader} from '../lib/server/knowledge-organization-material';
import {createOrganizationCandidates} from '../lib/server/knowledge-organization-candidates';
import {createKnowledgeOrganizationAutomation} from '../lib/server/knowledge-organization-automation';
import {createReviewQueue,reviewConfigSchema} from '../lib/server/knowledge-review-queue';
import {callGeminiReview} from '../lib/server/gemini-knowledge-review';
import {memberConfig} from '../lib/server/member/config';

async function privateText(file:string,max:number){
 if(!path.isAbsolute(file))throw Error('An absolute private file is required');
 const s=await lstat(file);
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid?.()||(s.mode&0o777)!==0o600||s.size>max)throw Error('Private organization configuration differs');
 return readFile(file,'utf8');
}

export async function main(args=process.argv.slice(2)){
 const action=args[0]??'run';
 if(args.length>1||!['run','once','status','migrate'].includes(action))throw Error('Usage: knowledge-patrol-worker.ts run|once|status|migrate');
 process.loadEnvFile('.env.public');
 const profile=knowledgeDeployment();
 if(!profile||process.env.KNOWLEDGE_PATROL_ENABLED!=='1')throw Error('Explicit private patrol deployment required');
 const allowed=()=>assertKnowledgeWorker('patrol',profile.origin);
 const organizing=process.env.KNOWLEDGE_ORGANIZATION_ENABLED==='1';
 const organizeAllowed=()=>{
  allowed();assertKnowledgeWorker('organize',profile.origin);
  if(!knowledgePublishingEnabled())throw Error('Organization publication is disabled');
 };
 allowed();if(organizing)organizeAllowed();
 const pool=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:5,statement_timeout:15000});
 let member:Pool|undefined,stop=false;
 const halt=()=>{stop=true;};
 process.once('SIGTERM',halt);process.once('SIGINT',halt);
 try{
  if(action==='migrate'){
   const patrol=await migrateKnowledgePatrol(pool);
   console.log(JSON.stringify({patrol,...(organizing?{organization:await migrateKnowledgeOrganization(pool)}:{})}));return;
  }
  const patrol=createKnowledgePatrol(pool,readLegacyTargetInventory);
  if(action==='status'){console.log(JSON.stringify({...await patrol.status(),...(organizing?{organization:await readOrganizationStatus(pool)}:{})}));return;}
  const reader=createOrganizationMaterialReader(pool),planner=organizing?createOrganizationCandidates(pool,reader,organizeAllowed):null;
  let runOrganization:(()=>Promise<boolean>)|undefined;
  if(organizing){
   const auth=memberConfig();if(!auth||auth.origin!==profile.origin)throw Error('Member origin differs');
   const config=reviewConfigSchema.parse(JSON.parse(await privateText(process.env.KNOWLEDGE_REVIEW_CONFIG??'',32000)));
   reviewMemberScope(config);
   const key=(await privateText(config.apiKeyFile,8192)).trim();
   member=new Pool({connectionString:auth.databaseUrl,max:3,statement_timeout:15000});
   const queue=createReviewQueue(member);
   const automation=createKnowledgeOrganizationAutomation(member,pool,config,reader,{authorize:organizeAllowed,actorId:'organization:'+profile.id});
   runOrganization=async()=>{
    organizeAllowed();await queue.heartbeat(config);
    return automation.processNext(lease=>{
     organizeAllowed();return stop?Promise.resolve({state:'not-sent' as const}):callGeminiReview({apiKey:key,model:lease.model,request:JSON.parse(lease.wire)});
    });
   };
  }
  do{
   let work=false;
   for(const origin of ['common','public-kg'] as const){
    if(stop)break;
    try{
     allowed();
     const result=await patrol.tick(origin);
     work||=result.visited>0||result.phase==='queueing';
     if(result.visited||result.phase==='queueing')console.log(JSON.stringify({event:'knowledge-patrol',origin,...result}));
    }catch{
     // Failure of one origin does not block the other. Retained checkpoints and
     // bounded automatic retry do not depend on an operator opening a screen.
     console.error(JSON.stringify({event:'knowledge-patrol',origin,state:'retry',code:'PATROL_RETRY'}));
     if(action==='once')process.exitCode=1;
    }
   }
   if(planner&&!stop){try{
    const indexed=await planner.indexPage(),planned=await planner.planPage();
    const processed=await runOrganization!();work||=indexed||planned||processed;
    if(indexed||planned||processed)console.log(JSON.stringify({event:'knowledge-organization',indexed,planned,processed}));
   }catch{console.error(JSON.stringify({event:'knowledge-organization',state:'retry',code:'ORGANIZATION_RETRY'}));if(action==='once')process.exitCode=1;}}
   if(action==='once')break;
   await new Promise(resolve=>setTimeout(resolve,work?250:5000));
  }while(!stop);
 }finally{
  process.removeListener('SIGTERM',halt);process.removeListener('SIGINT',halt);
  await member?.end();await pool.end();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
 console.error('Patrol stopped. Check its private deployment and explicit migrations. Retained inputs and attempts will resume.');process.exitCode=1;
});
