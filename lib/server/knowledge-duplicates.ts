import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {duplicateAnchors,duplicateQualifiers,duplicateMeaning} from '../domain/knowledge-duplicate';
import {knowledgeRecordContentSchema,type KnowledgeRecordVersion} from '../domain/knowledge-foundation';
import {createKnowledgeFoundationService,knowledgeDigest} from './knowledge-foundation';
import {readLegacyDuplicateReferences} from './knowledge-submission-legacy';
import {SourceCheckError} from './knowledge-source-verification';
import {resolveIdentityGroups} from './knowledge-identity-resolution';

export const DUPLICATE_POLICY='knowledge-duplicate-v2';
export const duplicateAdviceSchema=z.strictObject({sameAs:z.string().nullable(),reason:z.string().min(1).max(1000)});
export type DuplicateCandidate=Pick<KnowledgeRecordVersion,'id'|'revision'|'content'>;
export type DuplicateReview={policy:typeof DUPLICATE_POLICY;entityIdentities:Record<string,string>;proposed:ReturnType<typeof duplicateMeaning>;candidates:{id:string;revision:number;digest:string;meaning:ReturnType<typeof duplicateMeaning>}[]};
export type DuplicateCapture={review:DuplicateReview;common:{id:string;revision:number;digest:string}[];candidates:DuplicateCandidate[];legacy:Awaited<ReturnType<typeof readLegacyDuplicateReferences>>};

async function duplicateContext(c:PoolClient,record:DuplicateCandidate['content']){
 const a=duplicateAnchors(record),groups=await resolveIdentityGroups(c,[a.subjectId,a.objectId].filter((v):v is string=>!!v));
 const identities=Object.fromEntries([...groups.values()].flatMap(ids=>ids.map(id=>[id,ids[0]])));
 const rows=(await c.query(`SELECT r.id,r.revision,r.content FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision
 WHERE o.kind='record' AND o.visibility='public' AND r.content->>'kind'=$1
 AND (r.content->>'subjectId'=ANY($2::text[]) OR $2::text[] IS NULL AND r.content->>'subjectId' IS NULL)
 AND (r.content->>'objectId'=ANY($3::text[]) OR $3::text[] IS NULL AND r.content->>'objectId' IS NULL)
 AND r.content->'aboutRecord'->>'id' IS NOT DISTINCT FROM $4 AND r.content->>'aboutTheme' IS NOT DISTINCT FROM $5 ORDER BY r.id LIMIT 101`,[a.kind,a.subjectId?groups.get(a.subjectId):null,a.objectId?groups.get(a.objectId):null,a.aboutRecord,a.aboutTheme])).rows;
 if(rows.length>100)throw new SourceCheckError('同じ対象の知識が多いため、既存の知識を選んで根拠を追加してください。');
 return {identities,candidates:rows.map(r=>({id:String(r.id),revision:Number(r.revision),content:knowledgeRecordContentSchema.parse(r.content)}))};
}
async function withContext<T>(db:Pool|PoolClient,record:DuplicateCandidate['content'],read:(value:Awaited<ReturnType<typeof duplicateContext>>)=>T|Promise<T>):Promise<T>{
 if('release' in db)return read(await duplicateContext(db,record));
 const c=await db.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await read(await duplicateContext(c,record));await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function commonDuplicatePins(c:Pool|PoolClient,record:DuplicateCandidate['content']){
 return withContext(c,record,context=>context.candidates);
}
export function duplicateReview(record:DuplicateCandidate['content'],candidates:DuplicateCandidate[],entityIdentities:Record<string,string>={}):DuplicateReview{
 const resolved=(r:DuplicateCandidate['content'])=>({...r,subjectId:r.subjectId?(entityIdentities[r.subjectId]??r.subjectId):null,objectId:r.objectId?(entityIdentities[r.objectId]??r.objectId):null});
 // Free wording in scope may itself be a paraphrase. Compare it semantically,
 // while identity, polarity and structured time remain hard boundaries.
 const hard=(r:DuplicateCandidate['content'])=>{const {scope:_,...qualifiers}=duplicateQualifiers(resolved(r));void _;return knowledgeDigest(qualifiers);};
 const qualifiers=hard(record);
 const eligible=candidates.filter(c=>hard(c.content)===qualifiers).sort((a,b)=>a.id.localeCompare(b.id));
 if(eligible.length>20)throw new SourceCheckError('同じ条件の知識が多いため、既存の知識を選んで根拠を追加してください。');
 return {policy:DUPLICATE_POLICY,entityIdentities,proposed:duplicateMeaning(resolved(record)),candidates:eligible.map(c=>({id:c.id,revision:c.revision,digest:knowledgeDigest(c.content),meaning:duplicateMeaning(resolved(c.content))}))};
}
export async function captureDuplicates(pool:Pool,record:DuplicateCandidate['content'],excludeRecordId?:string):Promise<DuplicateCapture>{
 const {candidates:common,identities}=await withContext(pool,record,context=>context),service=createKnowledgeFoundationService(pool),readable:DuplicateCandidate[]=[];
 for(const r of common){try{await service.get({kind:'reader',id:'submission-duplicates'},'record',r.id,r.revision);readable.push(r);}catch(e){if(!(e instanceof Error&&'status' in e&&[403,404].includes(Number(e.status))))throw e;}}
 let legacy:Awaited<ReturnType<typeof readLegacyDuplicateReferences>>=null;
 const equivalents=(id:string|null)=>id?Object.keys(identities).filter(key=>identities[key]===identities[id]):[];
 try{if(record.kind==='relation')legacy=await readLegacyDuplicateReferences(equivalents(record.subjectId),equivalents(record.objectId));}catch(e){if(e instanceof Error&&'status' in e&&Number(e.status)<500)throw new SourceCheckError(e.message);throw e;}
 const ids=legacy?.records.map(r=>r.id)??[];
 // A common withdrawal must not be bypassed by rediscovering the old KG copy.
 const overridden=new Set(ids.length?(await pool.query("SELECT id FROM knowledge75.objects WHERE kind='record' AND id=ANY($1::text[])",[ids])).rows.map(r=>r.id):[]);
 const candidates=[...readable,...(legacy?.records??[]).filter(r=>!overridden.has(r.id))];
 return {review:duplicateReview(record,candidates.filter(r=>r.id!==excludeRecordId),identities),common:common.map(r=>({id:r.id,revision:r.revision,digest:knowledgeDigest(r.content)})),candidates,legacy};
}
export function duplicateMatch(capture:DuplicateCapture,advice:unknown):DuplicateCandidate|undefined{
 const exact=capture.review.candidates.find(c=>knowledgeDigest(c.meaning)===knowledgeDigest(capture.review.proposed));
 const checked=duplicateAdviceSchema.safeParse(advice);
 const id=exact?.id??(checked.success?checked.data.sameAs:null);
 if(id&&!capture.review.candidates.some(c=>c.id===id))throw new SourceCheckError('既存の知識との照合結果を確認できません。再確認を依頼してください。');
 return capture.candidates.find(c=>c.id===id);
}
