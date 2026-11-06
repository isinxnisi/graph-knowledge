import type {Pool,PoolClient} from 'pg';
import type {ImportPrincipal} from '../domain/knowledge-import';
import {missionPlanSchema} from '../domain/knowledge-mission';
import {knowledgeCapability} from './knowledge-deployment';

/** Internal run identities have no bearer credential. They can only be created
 * by the scoped mission delivery endpoint, and are rechecked by import workers. */
export async function missionImportPrincipal(pool:Pool,id:string,client?:PoolClient):Promise<ImportPrincipal|null>{
 if(!/^mission:[a-f0-9-]{36}$/.test(id)||!knowledgeCapability('missions')||process.env.KNOWLEDGE_MISSIONS_ENABLED!=='1')return null;
 const db=client??pool,seed=(await db.query('SELECT plan_id FROM knowledge_missions.runs WHERE id=$1',[id.slice(8)])).rows[0];if(!seed)return null;
 // The importer holds this share lock until its member transaction finishes.
 // Stop/edit takes the plan first, so it cannot race the final knowledge commit.
 const planRow=(await db.query('SELECT * FROM knowledge_missions.plans WHERE id=$1'+(client?' FOR SHARE':''),[seed.plan_id])).rows[0];
 const run=(await db.query('SELECT * FROM knowledge_missions.runs WHERE id=$1',[id.slice(8)])).rows[0];
 const row=planRow&&run?{...planRow,id:run.id,plan_id:run.plan_id,plan_revision:run.plan_revision,run_state:run.state}:null;
 if(!row||row.state!=='active'||row.revision!==row.plan_revision||!['delivering','delivered'].includes(row.run_state))return null;
 const plan=missionPlanSchema.parse(row.content);
 return {id,namespace:'mission.'+row.plan_id,tokenSha256:'0'.repeat(64),expiresAt:'2100-01-01T00:00:00Z',disabled:false,
  operations:['create-entity','create-relation','add-information','add-evidence'],
  targets:{entities:'*',records:'*',sources:'*',themes:plan.themeId?[plan.themeId]:[]},allowNewEntities:true,
  packagesPerDay:1,itemsPerDay:plan.maxItems,pendingItems:plan.maxItems};
}
