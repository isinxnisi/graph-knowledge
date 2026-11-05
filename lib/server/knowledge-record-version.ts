import type {PoolClient} from 'pg';
import {z} from 'zod';
import {knowledgeIdSchema,knowledgeEntityContentSchema,knowledgeRecordContentSchema,knowledgeSourceContentSchema,type KnowledgePin} from '../domain/knowledge-foundation';
import {buildKnowledgePublishedRecord,type KnowledgePublishedRecord} from '../domain/knowledge-publication';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
const query=z.strictObject({id:knowledgeIdSchema,revision:z.number().int().positive()});
/** Historical content never grants historical access: today's visibility and
 * explicit publication of every fixed dependency remain authoritative. */
export async function readKnowledgeRecordVersion(c:PoolClient,raw:unknown){
 const q=query.parse(raw);
 const load=async(kind:'record'|'entity'|'source',pin:KnowledgePin)=>{
  const row=(await c.query("SELECT r.*,o.current_revision FROM knowledge75.revisions r JOIN knowledge75.objects o ON o.kind=r.kind AND o.id=r.id JOIN knowledge75.published_revisions p ON p.kind=r.kind AND p.id=r.id AND p.revision=r.revision WHERE r.kind=$1 AND r.id=$2 AND r.revision=$3 AND o.visibility='public'",[kind,pin.id,pin.revision])).rows[0];
  if(!row)throw new KnowledgeError('この内容版は現在閲覧できません',404,'NOT_FOUND');
  return row;
 };
 const row=await load('record',q);
 if(row.content.aboutRecord)await load('record',row.content.aboutRecord);
 if(row.content.aboutTheme&&!(await c.query("SELECT 1 FROM knowledge75.objects WHERE kind='theme' AND id=$1 AND visibility='public'",[row.content.aboutTheme])).rowCount)throw new KnowledgeError('この内容版は現在閲覧できません',404,'NOT_FOUND');
 // A ready generation can have been activated before being superseded. Staged
 // or failed unpublished captures are never used as historical public content.
 const published=(await c.query("SELECT r.body FROM knowledge75.publication_records r JOIN knowledge75.publication_generations g ON g.id=r.generation WHERE r.id=$1 AND r.revision=$2 AND g.published_at IS NOT NULL ORDER BY g.published_at,g.id LIMIT 1",[q.id,q.revision])).rows[0]?.body as KnowledgePublishedRecord|undefined;
 if(published){for(const e of published.entities)await load('entity',e);for(const s of published.sources)await load('source',s);return {record:published,currentRevision:Number(row.current_revision),contextBasis:'published-generation' as const};}
 const record={id:row.id,revision:Number(row.revision),content:knowledgeRecordContentSchema.parse(row.content),createdAt:new Date(row.created_at).toISOString(),reason:row.reason};
 const op=(await c.query("SELECT op.input FROM knowledge75.changes ch JOIN knowledge75.operations op ON op.actor_id=ch.actor_id AND op.request_id=ch.request_id WHERE ch.kind='record' AND ch.id=$1 AND ch.content_revision=$2 AND ch.operation IN('accept-record','create-bundle','correct') ORDER BY ch.sequence LIMIT 1",[q.id,q.revision])).rows[0]?.input;
 const pins:KnowledgePin[]=[...(op?.entityPins??[]),...(op?.entities??[]).map((e:{id:string})=>({id:e.id,revision:1})),...(op?.legacyEntities??[]).map((e:{id:string})=>({id:e.id,revision:1}))];
 if(op?.entityCorrection)pins.unshift({id:op.entityCorrection.id,revision:op.entityCorrection.expectedRevision+1});
 let observed=false;
 const entities=[];
 for(const id of [...new Set([record.content.subjectId,record.content.objectId].filter((v):v is string=>!!v))]){
  let pin=pins.find(p=>p.id===id);
  if(!pin){const old=(await c.query("SELECT r.revision FROM knowledge75.revisions r JOIN knowledge75.published_revisions p USING(kind,id,revision) WHERE r.kind='entity' AND r.id=$1 AND r.created_at<=$2 ORDER BY r.revision DESC LIMIT 1",[id,row.created_at])).rows[0];if(!old)throw new KnowledgeError('当時の対象版を確認できません',404,'NOT_FOUND');pin={id,revision:Number(old.revision)};observed=true;}
  const e=await load('entity',pin);entities.push({id:e.id,revision:Number(e.revision),content:knowledgeEntityContentSchema.parse(e.content),createdAt:new Date(e.created_at).toISOString(),reason:e.reason});
 }
 const sources=[];
 for(const pin of [...new Map(record.content.evidence.map(e=>[e.source.id+'@'+e.source.revision,e.source])).values()]){
  const s=await load('source',pin);sources.push({id:s.id,revision:Number(s.revision),content:knowledgeSourceContentSchema.parse(s.content),createdAt:new Date(s.created_at).toISOString(),reason:s.reason});
 }
 const link=(await c.query('SELECT * FROM knowledge75.legacy_links WHERE record_id=$1',[q.id])).rows[0];
 if(link&&knowledgeDigest(link.payload)!==link.sha256)throw new KnowledgeError('旧原本のhashが一致しません',503,'LEGACY_HASH_MISMATCH');
 const dto=buildKnowledgePublishedRecord(record,{entities,sources,mappings:[],...(link?{legacyLink:{dataset:link.dataset,legacyClaimId:link.legacy_claim_id,recordId:link.record_id,importedRevision:Number(link.imported_revision),payload:link.payload,sha256:link.sha256}}:{})});
 return {record:dto,currentRevision:Number(row.current_revision),contextBasis:observed?'record-time-observation' as const:'recorded-command' as const};
}
