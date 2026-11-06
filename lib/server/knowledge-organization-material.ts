import type {Pool,PoolClient} from 'pg';
import {organizationMaterialSchema,type OrganizationMaterial} from '../domain/knowledge-organization-job';
import {knowledgeEntityContentSchema,knowledgeRecordContentSchema,knowledgeSourceContentSchema} from '../domain/knowledge-foundation';
import {knowledgeDigest,KnowledgeError,recordReadable,readKnowledgeTextOriginal} from './knowledge-foundation';
import {readSubmissionLegacyReferences} from './knowledge-submission-legacy';
import {openDatabase,readQueryTimeout} from './neo4j';
import {readPublicRevision} from './public-revision';

export type OrganizationTarget=Pick<OrganizationMaterial,'origin'|'kind'|'id'>;
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
/** Public, immutable inputs. Never substitutes an unpublished old edition. */
export async function readCommonOrganizationMaterial(c:PoolClient,target:OrganizationTarget):Promise<OrganizationMaterial>{
 async function row(kind:string,id:string,revision?:number){
  const r=(await c.query(`SELECT o.*,v.revision,v.content FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id
   AND v.revision=COALESCE($3,o.current_revision) JOIN knowledge75.published_revisions p ON p.kind=v.kind AND p.id=v.id AND p.revision=v.revision
   WHERE o.kind=$1 AND o.id=$2 AND o.visibility='public'`,[kind,id,revision??null])).rows[0];
  if(!r)throw new KnowledgeError('現在公開されている知識だけを整理します',409,'REFERENCE_NOT_PUBLIC');
  return r;
 }
 const primary=await row(target.kind,target.id);
 const refs:OrganizationMaterial['references']=[],entities:OrganizationMaterial['entities']=[],sources:OrganizationMaterial['sources']=[];
 const retain=(r:typeof primary)=>{
  if(!refs.some(v=>v.kind===r.kind&&v.id===r.id&&v.revision===String(r.revision)))refs.push({origin:'common',kind:r.kind,id:r.id,revision:String(r.revision),statusRevision:String(r.status_revision),digest:knowledgeDigest(r.content)});
 };
 retain(primary);
 const translatedNames:string[]=[];let translationStamp='';
 if(target.kind==='entity'){
  const translations=(await c.query(`SELECT h.*,v.text,v.original_hash FROM knowledge75.text_translation_heads h
   JOIN knowledge75.text_translation_revisions v ON v.id=h.id AND v.revision=h.current_revision
   WHERE h.target->>'kind'='entity' AND h.target->>'id'=$1 AND h.target->>'revision'=$2 AND h.target->>'field' IN('name','aliases') ORDER BY h.id`,[target.id,String(primary.revision)])).rows;
  translationStamp=knowledgeDigest(translations.map(t=>[t.id,t.current_revision,t.status_revision,t.visibility]));
  for(const t of translations.filter(t=>t.visibility==='public')){
   const original=await readKnowledgeTextOriginal(c,t.target,true);
   if(original.hash===t.original_hash)translatedNames.push(t.text);
  }
 }
 if(target.kind==='record'){
  const content=knowledgeRecordContentSchema.parse(primary.content);
  if(!await recordReadable(c,{id:primary.id,revision:primary.revision,content,createdAt:'',reason:''}))throw new KnowledgeError('知識の公開範囲が変わりました',409,'REFERENCE_NOT_PUBLIC');
  for(const id of [...new Set([content.subjectId,content.objectId].filter((id):id is string=>!!id))]){
   const e=await row('entity',id);retain(e);entities.push({id,revision:e.revision,content:knowledgeEntityContentSchema.parse(e.content)});
  }
  for(const pin of content.evidence.map(e=>e.source)){
   if(sources.some(s=>s.id===pin.id&&s.revision===pin.revision))continue;
   const s=await row('source',pin.id,pin.revision);retain(s);sources.push({id:s.id,revision:s.revision,content:knowledgeSourceContentSchema.parse(s.content)});
  }
  if(content.aboutRecord)retain(await row('record',content.aboutRecord.id,content.aboutRecord.revision));
  if(content.aboutTheme)retain(await row('theme',content.aboutTheme));
 }
 return organizationMaterialSchema.parse({origin:'common',kind:target.kind,id:target.id,revision:String(primary.revision),statusRevision:String(primary.status_revision),digest:knowledgeDigest(primary.content),content:primary.content,entities,sources,references:refs,translatedNames,translationStamp});
}

/** Batch only the current public KG. Canonical adaptation retains typed roles,
 * original IDs, quotations and time precision. No write access to this Neo4j. */
export async function readLegacyOrganizationMaterials(targets:OrganizationTarget[]):Promise<OrganizationMaterial[]>{
 if(targets.length>40)throw Error('Bounded legacy material batch required');
 if(!targets.length)return [];
 const db=openDatabase(),session=db.driver.session({database:db.database,defaultAccessMode:'READ'});
 try{return await session.executeRead(async tx=>{
  const revision=await readPublicRevision(tx,null);
  const capture=await readSubmissionLegacyReferences({revision,entityIds:targets.filter(t=>t.kind==='entity').map(t=>t.id),claimIds:targets.filter(t=>t.kind==='record').map(t=>t.id)},{read:run=>run(tx)});
  const sourceIds=targets.filter(t=>t.kind==='source').map(t=>t.id);
  const rawSources=sourceIds.length?(await tx.run('MATCH(s:Source) WHERE s.id IN $ids RETURN properties(s) AS body',{ids:sourceIds})).records.map(r=>json(r.get('body')) as Record<string,unknown>):[];
  const result:OrganizationMaterial[]=[];
  for(const t of targets){
   let content:Record<string,unknown>,raw:unknown,entities:OrganizationMaterial['entities']=[],sources:OrganizationMaterial['sources']=[];
   if(t.kind==='entity'){
    const e=capture.entities.find(e=>e.id===t.id),original=capture.legacy.entities.find(e=>e.id===t.id);
    if(!e||!original)throw new KnowledgeError('旧KGの対象が変わりました',409,'REFERENCE_NOT_PUBLIC');
    content=e.content;raw=(original.payload as {entity:unknown}).entity;
   }else if(t.kind==='record'){
    const r=capture.records.find(r=>r.id===t.id),original=capture.legacy.records.find(r=>r.id===t.id);
    if(!r||!original)throw new KnowledgeError('旧KGの知識が変わりました',409,'REFERENCE_NOT_PUBLIC');
    content=r.content;raw=original.payload.canonical.claim;
    entities=capture.entities.filter(e=>e.id===r.content.subjectId||e.id===r.content.objectId);
    sources=capture.sources.filter(s=>r.content.evidence.some(e=>e.source.id===s.id));
   }else if(t.kind==='source'){
    const s=rawSources.find(s=>s.id===t.id);if(!s)throw new KnowledgeError('旧KGの資料が変わりました',409,'REFERENCE_NOT_PUBLIC');
    raw=s;content=knowledgeSourceContentSchema.parse({title:s.title,url:s.url??null,bibliography:[s.publisher,s.publishedAt].filter(Boolean).join(' · '),language:s.language??'und'});
   }else continue;
   result.push(organizationMaterialSchema.parse({origin:'public-kg',kind:t.kind,id:t.id,revision,statusRevision:revision,digest:knowledgeDigest(raw),content,entities,sources,
    references:[{origin:'public-kg',kind:t.kind,id:t.id,revision,statusRevision:revision,digest:knowledgeDigest(raw)}]}));
  }
  await readPublicRevision(tx,revision);return result;
 },{timeout:Math.max(10000,readQueryTimeout())});}finally{await session.close();await db.driver.close();}
}

export function createOrganizationMaterialReader(pool:Pool,legacy=readLegacyOrganizationMaterials){
 return {
  async many(targets:OrganizationTarget[]){
   const result:OrganizationMaterial[]=[],c=await pool.connect();
   try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for(const t of targets.filter(t=>t.origin==='common'))result.push(await readCommonOrganizationMaterial(c,t));
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   result.push(...await legacy(targets.filter(t=>t.origin==='public-kg')));return result;
  },
  async one(target:OrganizationTarget){
   if(target.origin==='public-kg'&&['record','entity'].includes(target.kind)){
    // A corrected common original takes precedence over its older KG bridge.
    const c=await pool.connect();try{
     await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
     const exists=(await c.query('SELECT 1 FROM knowledge75.objects WHERE kind=$1 AND id=$2',[target.kind,target.id])).rowCount;
     if(exists){const v=await readCommonOrganizationMaterial(c,{...target,origin:'common'});await c.query('COMMIT');return v;}
     await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   }
   const result=await this.many([target]);if(!result[0])throw new KnowledgeError('整理対象が見つかりません',404,'NOT_FOUND');return result[0];
  },
 };
}

export const organizationName=(text:string)=>text.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
/** Exact assertion template/category reuse, never equivalence of whole facts.
 * Dates, scope, polarity, endpoint kinds and original language stay in the key. */
export function organizationMeaningKey(m:OrganizationMaterial){
 const r=knowledgeRecordContentSchema.parse(m.content);let assertion=organizationName(r.assertion);
 const replace=(value:string,replacement:string)=>{
  const name=organizationName(value);if(!name)return;
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // A short name such as “A” must not remove the a in “made”. Japanese
  // possessive particles, however, are normally adjacent to a person's name.
  const latin=/[\p{Script=Latin}\p{N}]/u;
  assertion=assertion.replace(new RegExp((latin.test(name[0])?'(?<![\\p{Script=Latin}\\p{N}])':'')+escaped+(latin.test(name.at(-1)!)?'(?![\\p{Script=Latin}\\p{N}])':''),'gu'),replacement);
 };
 for(const [id,marker] of [[r.subjectId,'[subject]'],[r.objectId,'[object]']] as const){
  const e=m.entities.find(e=>e.id===id);if(e)for(const name of [e.content.name,...e.content.aliases].sort((a,b)=>b.length-a.length))replace(name,marker);
 }
 return knowledgeDigest({kind:r.kind,assertion,relation:organizationName(r.relation),polarity:r.polarity,scope:r.scope,times:r.times,
  languages:r.textLanguages??null,kinds:[r.subjectId,r.objectId].map(id=>m.entities.find(e=>e.id===id)?.content.kind??null)});
}
export function organizationNames(m:OrganizationMaterial){
 if(m.kind!=='entity')return [];
 const e=knowledgeEntityContentSchema.parse(m.content);return [...new Set([e.name,...e.aliases,...m.translatedNames].map(organizationName))];
}
