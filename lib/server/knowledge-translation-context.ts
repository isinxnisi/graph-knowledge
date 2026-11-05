import type {PoolClient} from 'pg';
import type {KnowledgeTextTarget} from '../domain/knowledge-translation';
import type {KnowledgeEntityContent,KnowledgeSourceContent,KnowledgeThemeContent} from '../domain/knowledge-foundation';
import {knowledgeDigest,KnowledgeError,readKnowledgeTextOriginal} from './knowledge-foundation';
import {readKnowledgeRecordVersion} from './knowledge-record-version';

/** Public context only. Endpoint names come from the record's fixed edition,
 * never from today's entity head. This object is persisted with the request. */
export async function readTranslationGenerationInput(c:PoolClient,target:KnowledgeTextTarget){
 const original=await readKnowledgeTextOriginal(c,target,true);
 const references:{kind:"entity"|"source"|"record"|"theme";id:string;revision:number}[]=[{kind:target.kind,id:target.id,revision:target.revision}];
 let shortened=false;
 const clip=(text:string,max:number)=>{if(text.length>max)shortened=true;return text.slice(0,max);};
 const entity=(v:{id:string;revision:number;content:KnowledgeEntityContent})=>{references.push({kind:"entity",id:v.id,revision:v.revision});return ({
  id:v.id,revision:v.revision,name:v.content.name,kind:v.content.kind,
  aliases:v.content.aliases.slice(0,8),description:clip(v.content.description,800),
  textLanguages:v.content.textLanguages,aliasesOmitted:Math.max(0,v.content.aliases.length-8),
 });};
 const source=(v:{id:string;revision:number;content:KnowledgeSourceContent})=>{references.push({kind:"source",id:v.id,revision:v.revision});return ({
  id:v.id,revision:v.revision,title:v.content.title,bibliography:clip(v.content.bibliography,800),
  textLanguages:v.content.textLanguages,
 });};
 let surrounding:Record<string,unknown>;
 if(target.kind==='entity')surrounding={entity:entity({id:target.id,revision:target.revision,content:original.content as KnowledgeEntityContent})};
 else if(target.kind==='source')surrounding={source:source({id:target.id,revision:target.revision,content:original.content as KnowledgeSourceContent})};
 else if(target.kind==='theme'){
  const t=original.content as KnowledgeThemeContent;
  surrounding={theme:{id:target.id,revision:target.revision,title:t.title,description:clip(t.description,1200),textLanguages:t.textLanguages}};
 }else{
  const {record,contextBasis}=await readKnowledgeRecordVersion(c,{id:target.id,revision:target.revision}),r=record.record.content;
  const describe=(value:typeof record)=>{references.push({kind:"record",id:value.record.id,revision:value.record.revision});return ({
   id:value.record.id,revision:value.record.revision,kind:value.record.content.kind,
   assertion:value.record.content.assertion,relation:value.record.content.relation,
   polarity:value.record.content.polarity,scope:value.record.content.scope,
   direction:'subjectId -> relation -> objectId (do not reverse the participants)',
   subjectId:value.record.content.subjectId,objectId:value.record.content.objectId,
   entities:value.entities.map(entity),textLanguages:value.record.content.textLanguages,
  });};
  let about:unknown;
  if(r.aboutRecord)about=describe((await readKnowledgeRecordVersion(c,r.aboutRecord)).record);
  let theme:unknown;
  if(r.aboutTheme){
   const row=(await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='theme' AND id=$1 AND visibility='public'",[r.aboutTheme])).rows[0];
   if(!row)throw new KnowledgeError('文脈のテーマを閲覧できません',404,'NOT_FOUND');
   const t=await readKnowledgeTextOriginal(c,{kind:'theme',id:r.aboutTheme,revision:Number(row.current_revision),field:'title'});
   references.push({kind:"theme",id:r.aboutTheme,revision:t.target.revision});
   theme={id:r.aboutTheme,revision:t.target.revision,title:t.text,description:clip((t.content as KnowledgeThemeContent).description,800)};
  }
  const selected=r.evidence.find(e=>e.id===target.evidenceId);
  surrounding={record:describe(record),contextBasis,
   ...(about?{aboutRecord:about}:{}),...(theme?{aboutTheme:theme}:{}),
   ...(selected?{evidence:{...selected,source:source(record.sources.find(s=>s.id===selected.source.id&&s.revision===selected.source.revision)!)}}:{}),
   sources:record.sources.slice(0,4).map(source),sourcesOmitted:Math.max(0,record.sources.length-4)};
 }
 const context={target,surrounding,shortened};
 if(JSON.stringify(context).length>24000)throw new KnowledgeError('文脈を含む翻訳対象が大きすぎます。項目を分けるか手入力してください',400,'TRANSLATION_CONTEXT_LIMIT');
 return {...original,context,contextHash:knowledgeDigest(context),references:[...new Map(references.map(v=>[v.kind+":"+v.id+"@"+v.revision,v])).values()]};
}

export type TranslationReviewSnapshot={reviewContext?:Record<string,unknown>;reviewContextHash?:string;reviewReferences?:{kind:'entity'|'source'|'record'|'theme';id:string;revision:number}[]};
/** Recheck the server-captured public context. At publication, retain shared
 * object locks until the translation transaction commits, including sources. */
export async function verifyTranslationReviewContext(c:PoolClient,target:KnowledgeTextTarget,snapshot:TranslationReviewSnapshot,lock=false){
 const bad=()=>new KnowledgeError('翻訳の原文または公開文脈が変わりました。草稿を保存し、内容を確認して依頼し直してください。',409,'TRANSLATION_CONTEXT_CHANGED');
 if(!snapshot.reviewContext||!snapshot.reviewContextHash||!snapshot.reviewReferences?.length||knowledgeDigest(snapshot.reviewContext)!==snapshot.reviewContextHash)throw bad();
 if(lock)for(const ref of [...snapshot.reviewReferences].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id))){
  const row=(await c.query("SELECT visibility FROM knowledge75.objects WHERE kind=$1 AND id=$2 FOR SHARE",[ref.kind,ref.id])).rows[0];
  if(row?.visibility!=='public')throw bad();
 }
 const current=await readTranslationGenerationInput(c,target);
 const pins=(v:typeof current.references)=>v.map(r=>r.kind+':'+r.id+'@'+r.revision).sort();
 if(current.contextHash!==snapshot.reviewContextHash||knowledgeDigest(pins(current.references))!==knowledgeDigest(pins(snapshot.reviewReferences)))throw bad();
 return current;
}
