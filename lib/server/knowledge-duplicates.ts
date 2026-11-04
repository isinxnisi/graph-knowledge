import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {duplicateAnchors,duplicateQualifiers,duplicateMeaning} from '../domain/knowledge-duplicate';
import {knowledgeRecordContentSchema,type KnowledgeRecordVersion} from '../domain/knowledge-foundation';
import {createKnowledgeFoundationService,knowledgeDigest} from './knowledge-foundation';
import {readLegacyDuplicateReferences} from './knowledge-submission-legacy';
import {SourceCheckError} from './knowledge-source-verification';

export const DUPLICATE_POLICY='knowledge-duplicate-v1';
export const duplicateAdviceSchema=z.strictObject({sameAs:z.string().nullable(),reason:z.string().min(1).max(1000)});
export type DuplicateCandidate=Pick<KnowledgeRecordVersion,'id'|'revision'|'content'>;
export type DuplicateReview={policy:typeof DUPLICATE_POLICY;proposed:ReturnType<typeof duplicateMeaning>;candidates:{id:string;revision:number;digest:string;meaning:ReturnType<typeof duplicateMeaning>}[]};
export type DuplicateCapture={review:DuplicateReview;common:{id:string;revision:number;digest:string}[];candidates:DuplicateCandidate[];legacy:Awaited<ReturnType<typeof readLegacyDuplicateReferences>>};

export async function commonDuplicatePins(c:Pool|PoolClient,record:DuplicateCandidate['content']){
 const a=duplicateAnchors(record);
 const rows=(await c.query(`SELECT r.id,r.revision,r.content FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision
 WHERE o.kind='record' AND o.visibility='public' AND r.content->>'kind'=$1
 AND r.content->>'subjectId' IS NOT DISTINCT FROM $2 AND r.content->>'objectId' IS NOT DISTINCT FROM $3
 AND r.content->'aboutRecord'->>'id' IS NOT DISTINCT FROM $4 AND r.content->>'aboutTheme' IS NOT DISTINCT FROM $5 ORDER BY r.id LIMIT 101`,[a.kind,a.subjectId,a.objectId,a.aboutRecord,a.aboutTheme])).rows;
 if(rows.length>100)throw new SourceCheckError('同じ対象の知識が多いため、既存の知識を選んで根拠を追加してください。');
 return rows.map(r=>({id:String(r.id),revision:Number(r.revision),content:knowledgeRecordContentSchema.parse(r.content)}));
}
export function duplicateReview(record:DuplicateCandidate['content'],candidates:DuplicateCandidate[]):DuplicateReview{
 // Free wording in scope may itself be a paraphrase. Compare it semantically,
 // while identity, polarity and structured time remain hard boundaries.
 const hard=(r:DuplicateCandidate['content'])=>{const {scope:_,...qualifiers}=duplicateQualifiers(r);void _;return knowledgeDigest(qualifiers);};
 const qualifiers=hard(record);
 const eligible=candidates.filter(c=>hard(c.content)===qualifiers).sort((a,b)=>a.id.localeCompare(b.id));
 if(eligible.length>20)throw new SourceCheckError('同じ条件の知識が多いため、既存の知識を選んで根拠を追加してください。');
 return {policy:DUPLICATE_POLICY,proposed:duplicateMeaning(record),candidates:eligible.map(c=>({id:c.id,revision:c.revision,digest:knowledgeDigest(c.content),meaning:duplicateMeaning(c.content)}))};
}
export async function captureDuplicates(pool:Pool,record:DuplicateCandidate['content'],excludeRecordId?:string):Promise<DuplicateCapture>{
 const common=await commonDuplicatePins(pool,record),service=createKnowledgeFoundationService(pool),readable:DuplicateCandidate[]=[];
 for(const r of common){try{await service.get({kind:'reader',id:'submission-duplicates'},'record',r.id,r.revision);readable.push(r);}catch(e){if(!(e instanceof Error&&'status' in e&&[403,404].includes(Number(e.status))))throw e;}}
 let legacy:Awaited<ReturnType<typeof readLegacyDuplicateReferences>>=null;
 try{if(record.kind==='relation')legacy=await readLegacyDuplicateReferences(record.subjectId,record.objectId);}catch(e){if(e instanceof Error&&'status' in e&&Number(e.status)<500)throw new SourceCheckError(e.message);throw e;}
 const ids=legacy?.records.map(r=>r.id)??[];
 // A common withdrawal must not be bypassed by rediscovering the old KG copy.
 const overridden=new Set(ids.length?(await pool.query("SELECT id FROM knowledge75.objects WHERE kind='record' AND id=ANY($1::text[])",[ids])).rows.map(r=>r.id):[]);
 const candidates=[...readable,...(legacy?.records??[]).filter(r=>!overridden.has(r.id))];
 return {review:duplicateReview(record,candidates.filter(r=>r.id!==excludeRecordId)),common:common.map(r=>({id:r.id,revision:r.revision,digest:knowledgeDigest(r.content)})),candidates,legacy};
}
export function duplicateMatch(capture:DuplicateCapture,advice:unknown):DuplicateCandidate|undefined{
 const exact=capture.review.candidates.find(c=>knowledgeDigest(c.meaning)===knowledgeDigest(capture.review.proposed));
 const checked=duplicateAdviceSchema.safeParse(advice);
 const id=exact?.id??(checked.success?checked.data.sameAs:null);
 if(id&&!capture.review.candidates.some(c=>c.id===id))throw new SourceCheckError('既存の知識との照合結果を確認できません。再確認を依頼してください。');
 return capture.candidates.find(c=>c.id===id);
}
