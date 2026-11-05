import type {PoolClient} from 'pg';
import type {KnowledgeTextTarget} from '../domain/knowledge-translation';
import type {KnowledgeEntityContent,KnowledgeSourceContent,KnowledgeThemeContent} from '../domain/knowledge-foundation';
import {knowledgeDigest,KnowledgeError,readKnowledgeTextOriginal} from './knowledge-foundation';
import {readKnowledgeRecordVersion} from './knowledge-record-version';

/** Public context only. Endpoint names come from the record's fixed edition,
 * never from today's entity head. This object is persisted with the request. */
export async function readTranslationGenerationInput(c:PoolClient,target:KnowledgeTextTarget){
 const original=await readKnowledgeTextOriginal(c,target,true);
 let shortened=false;
 const clip=(text:string,max:number)=>{if(text.length>max)shortened=true;return text.slice(0,max);};
 const entity=(v:{id:string;revision:number;content:KnowledgeEntityContent})=>({
  id:v.id,revision:v.revision,name:v.content.name,kind:v.content.kind,
  aliases:v.content.aliases.slice(0,8),description:clip(v.content.description,800),
  textLanguages:v.content.textLanguages,aliasesOmitted:Math.max(0,v.content.aliases.length-8),
 });
 const source=(v:{id:string;revision:number;content:KnowledgeSourceContent})=>({
  id:v.id,revision:v.revision,title:v.content.title,bibliography:clip(v.content.bibliography,800),
  textLanguages:v.content.textLanguages,
 });
 let surrounding:Record<string,unknown>;
 if(target.kind==='entity')surrounding={entity:entity({id:target.id,revision:target.revision,content:original.content as KnowledgeEntityContent})};
 else if(target.kind==='source')surrounding={source:source({id:target.id,revision:target.revision,content:original.content as KnowledgeSourceContent})};
 else if(target.kind==='theme'){
  const t=original.content as KnowledgeThemeContent;
  surrounding={theme:{id:target.id,revision:target.revision,title:t.title,description:clip(t.description,1200),textLanguages:t.textLanguages}};
 }else{
  const {record,contextBasis}=await readKnowledgeRecordVersion(c,{id:target.id,revision:target.revision}),r=record.record.content;
  const describe=(value:typeof record)=>({
   id:value.record.id,revision:value.record.revision,kind:value.record.content.kind,
   assertion:value.record.content.assertion,relation:value.record.content.relation,
   polarity:value.record.content.polarity,scope:value.record.content.scope,
   subjectId:value.record.content.subjectId,objectId:value.record.content.objectId,
   entities:value.entities.map(entity),textLanguages:value.record.content.textLanguages,
  });
  let about:unknown;
  if(r.aboutRecord)about=describe((await readKnowledgeRecordVersion(c,r.aboutRecord)).record);
  let theme:unknown;
  if(r.aboutTheme){
   const row=(await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='theme' AND id=$1 AND visibility='public'",[r.aboutTheme])).rows[0];
   if(!row)throw new KnowledgeError('文脈のテーマを閲覧できません',404,'NOT_FOUND');
   const t=await readKnowledgeTextOriginal(c,{kind:'theme',id:r.aboutTheme,revision:Number(row.current_revision),field:'title'});
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
 return {...original,context,contextHash:knowledgeDigest(context)};
}
