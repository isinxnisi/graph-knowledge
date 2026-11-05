/** Explicit internal maintenance command. Inherits the existing private runtime.
 * No web/AI calls, source downloads, publication or KG mutations. */
import {Pool} from 'pg';
import {ensureKnowledgeFoundationSchema} from '../lib/server/knowledge-foundation';
import {createTargetInventory} from '../lib/server/knowledge-target-inventory';
import {readLegacyTargetInventory} from '../lib/server/knowledge-target-inventory-legacy';
import {backfillAcquisitionPage} from '../lib/server/knowledge-acquisition-backfill';
import {assertAcquisitionSchema} from '../lib/server/knowledge-acquisition-schema';
import {memberConfig} from '../lib/server/member/config';
import {memberPool} from '../lib/server/member/auth';
import {pathToFileURL} from 'node:url';
export async function main(args=process.argv.slice(2)){
 if(args.length!==1||!['migrate','scan','backfill'].includes(args[0]))throw Error('Usage: knowledge-inventory.ts migrate|scan|backfill');
 if(!process.env.KNOWLEDGE_DATABASE_URL)throw Error('Private knowledge DB configuration is required');
 const knowledge=new Pool({connectionString:process.env.KNOWLEDGE_DATABASE_URL,max:2});
 let member:Pool|undefined;
 try{
  if(args[0]==='migrate'){await ensureKnowledgeFoundationSchema(knowledge);console.log(JSON.stringify({event:'acquisition-inventory-migration-checked',migration:'007-acquisition-inventory.sql'}));return;}
  const c=await knowledge.connect();try{await assertAcquisitionSchema(c);}finally{c.release();}
  if(args[0]==='backfill'){
   const config=memberConfig();if(!config)throw Error('Existing member configuration is required');member=memberPool(config);
   for(const origin of ['submission','collection'] as const){let after:string|null=null,total=0;do{const p=await backfillAcquisitionPage(member,knowledge,origin,after);total+=p.retained;after=p.next;}while(after);console.log(JSON.stringify({event:'source-acquisitions-backfilled',origin,receipts:total}));}
  }else{
   const inventory=createTargetInventory(knowledge,readLegacyTargetInventory);
   for(const origin of ['common','public-kg'] as const){for(;;){const p=await inventory.scanPage(origin);if(p.state==='stale'){console.log(JSON.stringify({event:'inventory-source-changed',origin}));continue;}if(p.state==='complete'){console.log(JSON.stringify({event:'inventory-complete',origin,id:p.id,entries:(await knowledge.query('SELECT count(*)::int AS n FROM knowledge75.target_inventory_entries WHERE run_id=$1',[p.id])).rows[0].n}));break;}}}
  }
 }finally{await member?.end();await knowledge.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('対象台帳・取得証明の処理を完了できませんでした。原記録・KGは変更していません。privateログで実行条件を確認してください。');process.exitCode=1;});
