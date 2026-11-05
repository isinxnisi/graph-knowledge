import {z} from 'zod';
import type {Pool} from 'pg';
import {importItemSchema,type ImportPrincipal,type KnowledgeImportPackage} from '../domain/knowledge-import';
import {knowledgeEntityContentSchema,knowledgeSourceContentSchema,knowledgePinSchema,type KnowledgePin} from '../domain/knowledge-foundation';
import {knowledgeSubmissionContentSchema,type KnowledgeSubmission,type KnowledgeSubmissionContext,type KnowledgeSubmissionContent} from '../domain/knowledge-submission';
import {submissionIntentIssues} from '../domain/knowledge-submission-intent';
import {createKnowledgeFoundationService,knowledgeDigest,KnowledgeError,readKnowledgeTextOriginal,readKnowledgeTranslation} from './knowledge-foundation';
import {readSubmissionLegacyReferences} from './knowledge-submission-legacy';
import {acceptancePlan} from './knowledge-acceptance';
const newEntity=z.strictObject({id:z.string().min(1).max(200),content:knowledgeEntityContentSchema});
const newSource=z.strictObject({id:z.string().min(1).max(200),content:knowledgeSourceContentSchema});
export const importActor=(p:Pick<ImportPrincipal,'id'>)=>'knowledge-import:'+p.id;
const same=(a:KnowledgePin,b:KnowledgePin)=>a.id===b.id&&a.revision===b.revision;
const error=(text:string)=>{throw new KnowledgeError(text,400,'INVALID_ITEM');};
function entries<T>(raw:unknown[],schema:z.ZodType<T>,label:string){
 const values=new Map<string,{value:T|null;reason:string}>(),issues:{resource:string;index:number;reason:string}[]=[];
 raw.forEach((v,index)=>{
  const parsed=schema.safeParse(v),id=v&&typeof v==='object'&&'id' in v&&typeof v.id==='string'?v.id:null;
  const reason=!parsed.success?label+'の形式を確認してください。':id&&values.has(id)?label+'のIDが重複しています。':'';
  if(reason)issues.push({resource:label,index:index+1,reason});
  if(id)values.set(id,{value:reason?null:parsed.success?parsed.data:null,reason});
 });return {values,issues};
}
export function importResources(pkg:KnowledgeImportPackage){
 return {entities:entries(pkg.entities,newEntity,'対象'),sources:entries(pkg.sources,newSource,'資料'),entityPins:entries(pkg.entityPins,knowledgePinSchema,'対象の参照'),sourcePins:entries(pkg.sourcePins,knowledgePinSchema,'資料の参照')};
}
export function normalizeImportItem(pkg:KnowledgeImportPackage,raw:unknown){
 const checked=importItemSchema.safeParse(raw);
 if(!checked.success)error('項目の操作・対象・事実・根拠・時期の形式を確認してください。'+(checked.error.issues.some(i=>i.path[0]==='reason')?' 訂正理由が必要です。':''));
 const item=checked.data!,resources=importResources(pkg),ids=[item.record.subjectId,item.record.objectId].filter((v):v is string=>!!v);
 const entities:KnowledgeSubmissionContent['entities']=[],entityPins:KnowledgePin[]=[],sources:KnowledgeSubmissionContent['sources']=[],sourcePins:KnowledgePin[]=[];
 for(const id of new Set(ids)){
  const e=resources.entities.values.get(id),pin=resources.entityPins.values.get(id);
  if(e&&pin)error('新しい対象と既存対象のIDを分けてください。');
  if(e){if(!e.value)error(e.reason);if(e.value!.content.aliases.length||e.value!.content.description)error('新しい対象の名称・分類以外は、根拠付きの情報として別項目へ分けてください。');entities.push(e.value!);}
  else if(pin){if(!pin.value)error(pin.reason);entityPins.push(pin.value!);}
  // Record-bound endpoints are captured below, never invented here.
 }
 for(const ref of item.record.evidence.map(e=>e.source)){
  const s=resources.sources.values.get(ref.id),pin=resources.sourcePins.values.get(ref.id);
  if(s&&pin)error('新しい資料と既存資料のIDを分けてください。');
  if(s){if(!s.value||ref.revision!==1)error(s.reason||'新しい資料は内容版1で参照してください。');if(!sources.some(v=>v.id===ref.id))sources.push(s.value!);}
  else if(pin){if(!pin.value||!same(pin.value,ref))error(pin.reason||'資料の参照版が一致しません。');if(!sourcePins.some(v=>same(v,ref)))sourcePins.push(ref);}
  else error('根拠に使う資料の内容または公開参照が必要です。');
 }
 if(item.entityCorrection&&!entityPins.some(e=>e.id===item.entityCorrection!.target.id))entityPins.push(item.entityCorrection.target);
 if(item.about?.kind==='entity'&&!entities.some(e=>e.id===item.about!.id)&&!entityPins.some(e=>e.id===item.about!.id))entityPins.push({id:item.about.id,revision:item.about.revision});
 const {reason,...normalized}=item;void reason;
 return knowledgeSubmissionContentSchema.parse({schemaVersion:2,title:pkg.packageId,entities,entityPins,sources,sourcePins,items:[normalized],...(pkg.legacy?{legacy:pkg.legacy}:{})});
}
export function assertImportScope(p:ImportPrincipal,content:KnowledgeSubmissionContent,context?:KnowledgeSubmissionContext){
 const item=content.items[0];if(!p.operations.includes(item.operation!))error('この送信資格では指定した操作を利用できません。');
 if(content.entities.length&&!p.allowNewEntities)error('この送信資格では新しい対象を追加できません。');
 const allows=(kind:'entities'|'records'|'sources'|'themes',id:string)=>p.targets[kind]==='*'||p.targets[kind].includes(id);
 for(const pin of content.entityPins)if(!allows('entities',pin.id))error('許可範囲外の対象です。');
 for(const e of context?.entities??[])if(!allows('entities',e.id))error('参照する知識の対象が許可範囲外です。');
 for(const pin of [item.correction,item.record.aboutRecord,item.about?.kind==='record'?item.about:undefined].filter((v):v is KnowledgePin=>!!v))if(!allows('records',pin.id))error('許可範囲外の知識です。');
 if(item.record.aboutTheme&&(!allows('themes',item.record.aboutTheme)||!item.themes?.some(p=>p.id===item.record.aboutTheme)))error('許可されたテーマの内容版を指定してください。');
 for(const pin of [...item.themes??[],...(item.about?.kind==='theme'?[item.about]:[])])if(!allows('themes',pin.id))error('許可範囲外のテーマです。');
 if(item.translation&&!allows(item.translation.target.kind==='entity'?'entities':item.translation.target.kind==='theme'?'themes':item.translation.target.kind==='source'?'sources':'records',item.translation.target.id))error('許可範囲外の翻訳対象です。');
}
export async function resolveImportContext(pool:Pool,content:KnowledgeSubmissionContent):Promise<KnowledgeSubmissionContext>{
 const foundation=createKnowledgeFoundationService(pool),reader={kind:'reader' as const,id:'knowledge-import-context'};
 const context:KnowledgeSubmissionContext={entities:[],sources:[],records:[],themes:[]};
 if(content.legacy){const v=await readSubmissionLegacyReferences(content.legacy);Object.assign(context,{entities:v.entities,sources:v.sources,records:v.records,legacy:{revision:v.revision,...v.legacy}});}
 const addEntity=async(p:KnowledgePin)=>{if(!context.entities.some(v=>same({...v,revision:v.revision??1},p)))context.entities.push(await foundation.get(reader,'entity',p.id,p.revision));};
 const addSource=async(p:KnowledgePin)=>{if(!context.sources.some(v=>same(v,p)))context.sources.push(await foundation.get(reader,'source',p.id,p.revision));};
 for(const item of content.items){
  for(const p of [item.correction,item.record.aboutRecord,item.about?.kind==='record'?item.about:undefined].filter((v):v is KnowledgePin=>!!v)){
   let record=context.records!.find(v=>same(v,p));if(!record){record=await foundation.get(reader,'record',p.id,p.revision);context.records!.push(record);}
   for(const id of [record.content.subjectId,record.content.objectId].filter((v):v is string=>!!v)){
    if(!context.entities.some(v=>v.id===id))context.entities.push(await foundation.get(reader,'entity',id));
   }
   for(const e of record.content.evidence)await addSource(e.source);
  }
  for(const p of [...item.themes??[],...(item.about?.kind==='theme'?[item.about]:[])])if(!context.themes!.some(v=>same(v,p)))context.themes!.push(await foundation.get(reader,'theme',p.id,p.revision));
  if(item.translation){const c=await pool.connect();try{const original=await readKnowledgeTextOriginal(c,item.translation.target,true);context.texts=[{...original,translation:(await readKnowledgeTranslation(c,item.translation.target,item.translation.language)).translation}];}finally{c.release();}}
 }
 for(const p of content.entityPins)await addEntity(p);
 for(const p of content.sourcePins)await addSource(p);
 return context;
}
export function prepareImportPlan(pkg:KnowledgeImportPackage,content:KnowledgeSubmissionContent,context:KnowledgeSubmissionContext,receiptId:string,itemId:string){
 const issues=submissionIntentIssues(content,context,'service');if(issues.length)error(issues.join(' '));
 const value:KnowledgeSubmission={id:receiptId,revision:pkg.revision,version:1,state:'queued',content,context,digest:knowledgeDigest(content),createdAt:'',updatedAt:''};
 const raw=pkg.items.find(v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.key===content.items[0].key);
 const reason=raw&&typeof raw==='object'&&'reason'in raw&&typeof raw.reason==='string'?raw.reason:'外部パッケージの原資料・内容確認による自動受理';
 const plan=acceptancePlan(value,content.items[0].key,itemId,undefined,{allocate:(kind,id)=>'import:'+pkg.namespace+':'+kind+':'+knowledgeDigest([...(kind==='record'?[pkg.packageId]:[]),id]).slice(0,32),reason});
 return {value,plan};
}
