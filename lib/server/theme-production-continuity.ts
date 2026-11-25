import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {
 productionFollowUpLinkSchema,productionSuspensionSchema,type ProductionProgress,type ProductionFollowUpInput,
 type listThemeProductionFollowUpsSchema,
} from '../domain/theme-production';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';

const stored=z.object({
 topicKey:z.string().optional(),suspension:productionSuspensionSchema.optional(),parkedIntentId:z.string().optional(),
 followUps:z.record(z.string(),productionFollowUpLinkSchema).optional(),
});
type Continuity=z.infer<typeof stored>;
type Pin=z.infer<typeof productionFollowUpLinkSchema>['theme'];
type Scope=[owner:string,environment:'beta'|'production',origin:string];
const keyFor=(scope:string,key:string)=>scope+':'+key;
const error=(message:string,code:string)=>new KnowledgeError(message,409,code);

export function productionContinuity(progress:ProductionProgress):Continuity{
 return stored.parse(progress.artifacts?.productionContinuity??{});
}

export function withProductionContinuity(progress:ProductionProgress,continuity:Continuity):ProductionProgress{
 const {productionContinuity:ignored,...artifacts}=progress.artifacts;
 void ignored;
 return {...progress,artifacts:{...artifacts,...(Object.keys(continuity).length?{productionContinuity:JSON.parse(JSON.stringify(continuity))}:{})}};
}

export async function saveProductionFollowUps(c:PoolClient,scope:Scope,old:Continuity,updates:ProductionFollowUpInput[],theme:Pin){
 const followUps={...old.followUps};
 const changed:string[]=[];
 const prior:typeof followUps={};
 const seen=new Set<string>();
 for(const {scope:kind,key,impact,record} of updates){
  const id=keyFor(kind,key),previous=followUps[id];
  if(seen.has(id))throw error('同じ残件キーを一度だけ指定してください。','PRODUCTION_FOLLOW_UP_DUPLICATE');
  seen.add(id);
  if(!record&&!previous){
   if(!(await c.query(`SELECT 1 FROM theme_production.cases
    WHERE owner_id=$1 AND environment=$2 AND origin=$3
     AND progress #> ARRAY['artifacts','productionContinuity','followUps',$4::text,'record'] IS NOT NULL
     AND ($5::boolean OR COALESCE(progress #>> ARRAY['artifacts','productionContinuity','followUps',$4::text,'theme','id'],theme_id)=$6)
    LIMIT 1`,[...scope,id,kind==='shared',theme?.id??null])).rowCount)
    throw error('先に内容、理由、実施結果、再対応条件を記録してください。','PRODUCTION_FOLLOW_UP_REQUIRED');
  }
  const value={key,scope:kind,impact,theme,...(record||previous?.record?{record:record??previous?.record}:{})};
  if(previous){
   const {recordedAt,recordUpdatedAt,...before}=previous;void recordedAt;void recordUpdatedAt;
   if(knowledgeDigest(before)===knowledgeDigest(value))continue;
   prior[id]=previous;
  }
  const recordedAt=new Date().toISOString();
  const recordUpdatedAt=record&&(!previous?.record||knowledgeDigest(record)!==knowledgeDigest(previous.record))?recordedAt:previous?.recordUpdatedAt;
  followUps[id]={...value,recordedAt,...(recordUpdatedAt?{recordUpdatedAt}:{})};
  changed.push(id);
 }
 return {continuity:{...old,followUps},changed,prior};
}

export async function listProductionFollowUps(pool:Pool,scope:Scope,command:z.infer<typeof listThemeProductionFollowUpsSchema>){
 const rows=(await pool.query(`SELECT c.id AS "caseId",c.progress->>'brief' AS brief,f.value AS link,c.theme_id AS "boundThemeId"
  FROM theme_production.cases c
  CROSS JOIN LATERAL jsonb_each(COALESCE(c.progress #> '{artifacts,productionContinuity,followUps}','{}'::jsonb)) f
  WHERE c.owner_id=$1 AND c.environment=$2 AND c.origin=$3
  ORDER BY f.value->>'recordedAt' DESC,c.id`,scope)).rows;
 type Link=z.infer<typeof productionFollowUpLinkSchema>;
 type Context=Omit<Link,'scope'|'key'|'record'>&{caseId:string;brief:string};
 type Item={key:string;scope:Link['scope'];record?:Link['record'];sourceCaseId:string;cases:Context[]};
 const groups=new Map<string,Item>();
 const newestRecord=new Map<string,string>();
 for(const {caseId,brief,link,boundThemeId} of rows){
  const {key,scope:kind,record,recordUpdatedAt,...context}=productionFollowUpLinkSchema.parse(link);
  const id=kind==='shared'?keyFor(kind,key):JSON.stringify([context.theme?.id??boundThemeId??caseId,key]);
  const item:Item=groups.get(id)??{key,scope:kind,sourceCaseId:caseId,cases:[]};
  const updated=recordUpdatedAt??context.recordedAt;
  if(record&&updated>(newestRecord.get(id)??'')){
   item.record=record;item.sourceCaseId=caseId;newestRecord.set(id,updated);
  }
  item.cases.push({caseId,brief,...context});
  groups.set(id,item);
 }
 const term=command.query?.normalize('NFKC').toLowerCase();
 const matched=[...groups.values()].filter(item=>item.record&&(!term||JSON.stringify(item).normalize('NFKC').toLowerCase().includes(term)));
 return {items:matched.slice(command.cursor,command.cursor+10),nextCursor:matched.length>command.cursor+10?command.cursor+10:null};
}
