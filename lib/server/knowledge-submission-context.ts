import type {KnowledgeRecordVersion} from "../domain/knowledge-foundation";
import {knowledgeSubmissionContentSchema,type KnowledgeSubmissionContent,type KnowledgeSubmissionContext,type submissionSelectionContextSchema} from "../domain/knowledge-submission";
import {z} from "zod";
import {KnowledgeError,knowledgeDigest} from "./knowledge-foundation";
import {knowledgePublicationPreview} from "./knowledge-publication-preview";
import {readSubmissionLegacyReferences} from "./knowledge-submission-legacy";

const unique=<T extends {id:string;revision?:number}>(values:T[])=>[...new Map(values.map(v=>[v.id+"@"+(v.revision??1),v])).values()];
/** Resolve identities on the server without replacing the author's current form. */
export async function resolveSubmissionContext(content:KnowledgeSubmissionContent,prior?:KnowledgeSubmissionContext):Promise<KnowledgeSubmissionContext>{
 const captured:KnowledgeSubmissionContext={entities:[],sources:[],records:[],themes:[]};
 const legacy=content.legacy?await readSubmissionLegacyReferences(content.legacy):undefined;
 if(legacy){captured.entities.push(...legacy.entities);captured.sources.push(...legacy.sources);captured.records!.push(...legacy.records);captured.legacy={revision:legacy.revision,entities:legacy.legacy.entities,records:legacy.legacy.records};}
 const service=()=>knowledgePublicationPreview();
 const recordPins=unique(content.items.flatMap(i=>[...(i.correction?[i.correction]:[]),...(i.about?.kind==='record'?[i.about]:[]),...(i.record.aboutRecord?[i.record.aboutRecord]:[])]));
 for(const p of recordPins){
  if(captured.records!.some(r=>r.id===p.id&&r.revision===p.revision))continue;
  const {record:dto}=await (await service()).detail({recordId:p.id});
  if(dto.record.revision!==p.revision)throw new KnowledgeError("参照する記録が更新されました。最新版を選び直してください",409,"REFERENCE_CONFLICT");
  captured.records!.push(dto.record);captured.entities.push(...dto.entities);captured.sources.push(...dto.sources);
 }
 const themePins=unique(content.items.flatMap(i=>[...(i.themes??[]),...(i.about?.kind==='theme'?[i.about]:[])]));
 for(const p of themePins){const dto=await (await service()).theme({themeId:p.id});if(dto.theme.revision!==p.revision)throw new KnowledgeError("追加先のテーマが更新されました。最新版を選び直してください",409,"REFERENCE_CONFLICT");captured.themes!.push(dto.theme);}
 for(const p of content.entityPins){
  const found=captured.entities.find(v=>v.id===p.id&&(v.revision??1)===p.revision);if(found)continue;
  const dto=await (await service()).entities({entityId:p.id,limit:1});const e=dto.entities[0];
  if(!e||e.revision!==p.revision)throw new KnowledgeError("参照する対象が更新されたか、公開されていません。選び直してください",409,"REFERENCE_CONFLICT");captured.entities.push(e);
 }
 // Source editions are fixed by a server-captured Record. A client cannot submit
 // someone else's full snapshot or silently switch the source edition.
 for(const p of content.sourcePins){
  if(captured.sources.some(s=>s.id===p.id&&s.revision===p.revision))continue;
  const old=prior?.sources.find(s=>s.id===p.id&&s.revision===p.revision);
  if(!old)throw new KnowledgeError("資料の取得版がありません。元の情報から根拠を選び直してください",409,"REFERENCE_CONFLICT");
  captured.sources.push(old);
 }
 captured.entities=unique(captured.entities);captured.sources=unique(captured.sources);captured.records=unique(captured.records!);captured.themes=unique(captured.themes!);
 return captured;
}
export async function captureSubmissionSelection(selection:z.infer<typeof submissionSelectionContextSchema>,authored?:KnowledgeSubmissionContent){
 const legacy=selection.entityIds.length||selection.claimIds.length?await readSubmissionLegacyReferences({revision:selection.revision,entityIds:selection.entityIds,claimIds:selection.claimIds}):undefined;
 let content:KnowledgeSubmissionContent;
 if(authored){
  content=knowledgeSubmissionContentSchema.parse({...authored,schemaVersion:2,legacy:legacy?{revision:legacy.revision,entityIds:selection.entityIds,claimIds:selection.claimIds}:authored.legacy,entityPins:unique([...authored.entityPins,...selection.entityPins,...(legacy?.entities.map(e=>({id:e.id,revision:e.revision}))??[])])});
 }else{
  const records:KnowledgeRecordVersion[]=[...(legacy?.records??[])];const entities:KnowledgeSubmissionContext['entities']=[...(legacy?.entities??[])];const sources:KnowledgeSubmissionContext['sources']=[...(legacy?.sources??[])];
  const service=await knowledgePublicationPreview();
  for(const p of selection.recordPins){const {record:dto}=await service.detail({recordId:p.id});if(dto.record.revision!==p.revision)throw new KnowledgeError("取得元が更新されました",409,"REFERENCE_CONFLICT");records.push(dto.record);entities.push(...dto.entities);sources.push(...dto.sources);}
  for(const p of selection.entityPins){const e=(await service.entities({entityId:p.id,limit:1})).entities[0];if(!e||e.revision!==p.revision)throw new KnowledgeError("取得元が更新されました",409,"REFERENCE_CONFLICT");entities.push(e);}
  if(!records.length&&entities.length>20)throw new KnowledgeError('一度に選択する対象は20件までです',400,'TOO_MANY_TARGETS');
  const items:KnowledgeSubmissionContent['items']=records.length?records.map(r=>({key:r.id,operation:'add-evidence',about:{kind:'record',id:r.id,revision:r.revision},correction:{id:r.id,revision:r.revision},record:r.content,...(selection.themePin?{themes:[selection.themePin]}:{})})):entities.map(e=>({key:'information:'+knowledgeDigest(e.id).slice(0,16),operation:'add-information',about:{kind:'entity',id:e.id,revision:e.revision??1},record:{kind:'note',subjectId:e.id,objectId:null,relation:'',assertion:'',polarity:'affirmed',scope:'',times:[],evidence:[]},...(selection.themePin?{themes:[selection.themePin]}:{})}));
  if(!items.length)throw new KnowledgeError("申請する対象か関係を選んでください");
  content=knowledgeSubmissionContentSchema.parse({schemaVersion:2,attribution:'profile',title:records[0]?.content.assertion.slice(0,180)||entities[0]?.content.name||'知識の投稿',entities:[],sources:[],items,entityPins:unique(entities.map(e=>({id:e.id,revision:e.revision??1}))),sourcePins:unique(sources.map(s=>({id:s.id,revision:s.revision}))),...(legacy?{legacy:{revision:legacy.revision,entityIds:selection.entityIds,claimIds:selection.claimIds}}:{})});
 }
 const captured=await resolveSubmissionContext(content);
 // Canonical KG evidence must survive unsaved Capsule capture; it is never made
 // up from a node's free-form note. New evidence still needs the author's input.
 if(authored&&legacy)for(const item of content.items){const old=captured.records?.find(r=>r.id===item.correction?.id&&r.revision===item.correction?.revision);if(old){if(!item.record.evidence.length)item.record.evidence=old.content.evidence;if(!item.record.scope)item.record.scope=old.content.scope;if(!item.record.times.length)item.record.times=old.content.times;}
 content.sourcePins=unique([...content.sourcePins,...captured.sources.map(v=>({id:v.id,revision:v.revision}))]);}
 return {content,captured};
}
