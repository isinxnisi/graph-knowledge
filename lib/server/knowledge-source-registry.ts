import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import type {KnowledgeRecordContent} from '../domain/knowledge-foundation';
import {proofMatchesSourceUrl,verifiedSourceDocumentKey} from '../domain/knowledge-source-identity';
import {assertAcquisitionSchema} from './knowledge-acquisition-schema';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {normalizeSourceText,type SourceProof} from './knowledge-source-verification';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const url=z.url({protocol:/^https$/}).max(2000).refine(s=>{const u=new URL(s);return !u.username&&!u.password;});
export const acquisitionProofSchema=z.strictObject({url,requestedUrl:url.optional(),bodySha256:sha,textSha256:sha,excerptSha256:sha,extractor:z.string().min(1).max(100),checkedAt:z.iso.datetime({offset:true})});
export const ACQUISITION_POLICY='source-excerpt-v1';
const hashQuote=(s:string)=>createHash('sha256').update(normalizeSourceText(s)).digest('hex');

/** Server-only: caller must supply a locally verified proof, never an external
 * hash claim. Called inside the same knowledge transaction as its operation. */
export async function retainSourceAcquisitions(c:PoolClient,input:{actorId:string;requestId:string;result:unknown;proofs:SourceProof[]}){
 if(!input.proofs.length)return;
 await assertAcquisitionSchema(c);
 const result=z.object({id:z.string(),revision:z.number().int().positive()}).parse(input.result);
 const record=(await c.query("SELECT content FROM knowledge75.revisions WHERE kind='record' AND id=$1 AND revision=$2",[result.id,result.revision])).rows[0]?.content as KnowledgeRecordContent|undefined;
 if(!record)throw new KnowledgeError('取得証明の対応する記録版がありません',409,'PROOF_TARGET_CHANGED');
 for(const raw of input.proofs){
  const proof=acquisitionProofSchema.parse(raw),documentKey=verifiedSourceDocumentKey(proof)!;
  const id=knowledgeDigest({actor:input.actorId,requestId:input.requestId,policy:ACQUISITION_POLICY,proof});
  await c.query('INSERT INTO knowledge75.source_acquisitions(id,actor_id,request_id,policy,proof,document_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[id,input.actorId,input.requestId,ACQUISITION_POLICY,proof,documentKey]);
  for(const e of record.evidence){
   if(hashQuote(e.excerpt)!==proof.excerptSha256)continue;
   const source=(await c.query("SELECT content FROM knowledge75.revisions WHERE kind='source' AND id=$1 AND revision=$2",[e.source.id,e.source.revision])).rows[0]?.content;
   if(!source?.url||!proofMatchesSourceUrl(proof,source.url))continue;
   await c.query('INSERT INTO knowledge75.source_acquisition_links(acquisition_id,record_id,record_revision,source_id,source_revision,evidence_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[id,result.id,result.revision,e.source.id,e.source.revision,e.id]);
  }
 }
}

/** Compare only evidence attached to this currently readable, fixed record.
 * Private observations, stopped sources and unrelated records cannot lend proof. */
export async function knownSourceDocuments(pool:Pool,pin:{id:string;revision:number}):Promise<string[]>{
 const c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await assertAcquisitionSchema(c);
  const rows=(await c.query(`SELECT DISTINCT a.document_key FROM knowledge75.source_acquisition_links l
   JOIN knowledge75.source_acquisitions a ON a.id=l.acquisition_id
   JOIN knowledge75.revisions r ON r.kind='record' AND r.id=l.record_id AND r.revision=l.record_revision
   JOIN knowledge75.objects ro ON ro.kind=r.kind AND ro.id=r.id AND ro.visibility='public'
   JOIN knowledge75.published_revisions rp ON rp.kind=r.kind AND rp.id=r.id AND rp.revision=r.revision
   JOIN knowledge75.objects so ON so.kind='source' AND so.id=l.source_id AND so.visibility='public'
   JOIN knowledge75.published_revisions sp ON sp.kind='source' AND sp.id=l.source_id AND sp.revision=l.source_revision
   WHERE l.record_id=$1 AND l.record_revision=$2 AND a.policy=$3
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.content->'evidence') e WHERE e->>'id'=l.evidence_id AND e->'source'->>'id'=l.source_id AND (e->'source'->>'revision')::int=l.source_revision)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.content->'evidence') e LEFT JOIN knowledge75.objects o ON o.kind='source' AND o.id=e->'source'->>'id' LEFT JOIN knowledge75.published_revisions p ON p.kind='source' AND p.id=o.id AND p.revision=(e->'source'->>'revision')::int WHERE o.visibility IS DISTINCT FROM 'public' OR p.id IS NULL)
    AND NOT EXISTS(SELECT 1 FROM (VALUES(r.content->>'subjectId'),(r.content->>'objectId')) v(id) LEFT JOIN knowledge75.objects o ON o.kind='entity' AND o.id=v.id WHERE v.id IS NOT NULL AND o.visibility IS DISTINCT FROM 'public')`,[pin.id,pin.revision,ACQUISITION_POLICY])).rows;
  await c.query('COMMIT');return rows.map(r=>r.document_key).sort();
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
