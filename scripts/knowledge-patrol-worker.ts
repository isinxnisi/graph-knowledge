import {Pool} from 'pg';
import {pathToFileURL} from 'node:url';
import {assertKnowledgeWorker,knowledgeDeployment} from '../lib/server/knowledge-deployment';
import {knowledgeReadConfiguration} from '../lib/server/knowledge-read-runtime';
import {createKnowledgePatrol} from '../lib/server/knowledge-patrol';
import {migrateKnowledgePatrol} from '../lib/server/knowledge-patrol-schema';
import {readLegacyTargetInventory} from '../lib/server/knowledge-target-inventory-legacy';

export async function main(args=process.argv.slice(2)){
 const action=args[0]??'run';
 if(args.length>1||!['run','once','status','migrate'].includes(action))throw Error('Usage: knowledge-patrol-worker.ts run|once|status|migrate');
 const profile=knowledgeDeployment();
 if(!profile||process.env.KNOWLEDGE_PATROL_ENABLED!=='1')throw Error('Explicit private patrol deployment required');
 const allowed=()=>assertKnowledgeWorker('patrol',profile.origin);
 allowed();
 const pool=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3,statement_timeout:15000});
 let stop=false;
 const halt=()=>{stop=true;};
 process.once('SIGTERM',halt);process.once('SIGINT',halt);
 try{
  if(action==='migrate'){console.log(JSON.stringify(await migrateKnowledgePatrol(pool)));return;}
  const patrol=createKnowledgePatrol(pool,readLegacyTargetInventory);
  if(action==='status'){console.log(JSON.stringify(await patrol.status()));return;}
  do{
   for(const origin of ['common','public-kg'] as const){
    if(stop)break;
    try{
     allowed();
     const result=await patrol.tick(origin);
     if(result.visited||result.phase==='queueing')console.log(JSON.stringify({event:'knowledge-patrol',origin,...result}));
    }catch{
     // Failure of one origin does not block the other. Retained checkpoints and
     // bounded automatic retry do not depend on an operator opening a screen.
     console.error(JSON.stringify({event:'knowledge-patrol',origin,state:'retry',code:'PATROL_RETRY'}));
     if(action==='once')process.exitCode=1;
    }
   }
   if(action==='once')break;
   await new Promise(resolve=>setTimeout(resolve,5000));
  }while(!stop);
 }finally{
  process.removeListener('SIGTERM',halt);process.removeListener('SIGINT',halt);
  await pool.end();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
 console.error('Patrol stopped. Check its private deployment and explicit migration. Original records and KG are unchanged.');process.exitCode=1;
});
