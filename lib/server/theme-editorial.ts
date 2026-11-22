import type {Pool,PoolClient} from 'pg';
import type {KnowledgeSnapshot} from '../domain/knowledge-foundation';
import {requestedThemeImageIds,resolvedEditorialImageSchema,resolvedThemeEditorialSchema,type ThemeEditorialInput} from '../domain/theme-editorial';
import {KnowledgeError} from './knowledge-foundation';

export async function reserveThemeImages(c:PoolClient,requestId:string,presentation?:ThemeEditorialInput){
 const ids=requestedThemeImageIds(presentation);
 if(!ids.length)return;
 if(!(await c.query("SELECT to_regclass('theme_editorial_asset_reference') AS ready")).rows[0].ready)throw new KnowledgeError('テーマ画像の明示migrationが必要です。',503,'MIGRATION_REQUIRED');
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('product-editorial',0))");
 const assets=await c.query("SELECT id FROM product_image_asset WHERE id=ANY($1::text[]) AND role='illustration' FOR SHARE",[ids]);
 if(assets.rowCount!==ids.length)throw new KnowledgeError('テーマの挿絵として登録した画像IDを指定してください。',400,'THEME_IMAGE_INVALID');
 await c.query('INSERT INTO theme_editorial_asset_reference(request_id,image_id) SELECT $1::uuid,unnest($2::text[]) ON CONFLICT DO NOTHING',[requestId,ids]);
}
export async function resolveThemeEditorial(c:Pool|PoolClient,input:ThemeEditorialInput,resolve:(id:string)=>string|null,bindings?:Map<string,{id:string;revision:number}>){
 const pin=(ref:{id:string;revision:number},id:string)=>ref.id.startsWith('item:')?(bindings?.get(ref.id.slice(5))??{...ref,id}):{...ref,id};
 const ids=requestedThemeImageIds(input);
 const assets=ids.length?(await c.query(
  'SELECT a.id,a.role,a.width,a.height,a.alt,a.created_at,p.content AS provenance FROM product_image_asset a JOIN product_image_provenance p ON p.id=a.provenance_id WHERE a.id=ANY($1::text[])',[ids],
 )).rows:[];
 const byId=new Map(assets.map(asset=>[asset.id,asset]));
 function resolveImage(id:string,locale:'ja'|'en'){
  const asset=byId.get(id);
  if(!asset||asset.role!=='illustration')throw new KnowledgeError('挿絵の登録を確認してください。',400,'THEME_IMAGE_INVALID');
  const provenance=asset.provenance;
  return resolvedEditorialImageSchema.parse({
   id,src:'/api/knowledge/product-images/'+id,width:asset.width,height:asset.height,kind:'illustration',alt:asset.alt[locale],caption:'',
   credit:provenance.creditDisplay==='public'?provenance.credit:'',
   ...(provenance.sourceUrl?{sourceUrl:provenance.sourceUrl}:{}),
   checkedAt:new Date(asset.created_at).toISOString().slice(0,10),focus:'50% 50%',
  });
 }
 const rows=[];
 for(const {imageId,...entry} of input){
  const image=imageId?resolveImage(imageId,entry.locale):undefined;
  const records=entry.records.flatMap(({imageId,...row})=>{
   const id=resolve(row.target.id);
   if(!id)return [];
   const explanations=row.explanations.flatMap(ref=>{
    const target=resolve(ref.record.id);
    return target?[{...ref,record:pin(ref.record,target)}]:[];
   });
   return [{...row,target:pin(row.target,id),explanations,...(imageId?{image:resolveImage(imageId,entry.locale)}:{})}];
  });
  const entityNotes=entry.entityNotes.map(note=>({...note,supportingRecords:note.supportingRecords.flatMap(ref=>{const id=resolve(ref.id);return id?[pin(ref,id)]:[];})}));
  rows.push({...entry,records,entityNotes,...(image?{image}:{})});
 }
 return resolvedThemeEditorialSchema.parse(rows);
}
export function editorialReferenceError(reading:ReturnType<typeof resolvedThemeEditorialSchema.parse>,snapshot:KnowledgeSnapshot):string|null{
 for(const p of reading){
  for(const row of p.records){
   const r=snapshot.records.find(r=>r.id===row.target.id&&r.revision===row.target.revision);if(!r)return '見出し・画像の記録版がテーマに含まれていません。';
   for(const ref of row.explanations){const note=snapshot.records.find(r=>r.id===ref.record.id&&r.revision===ref.record.revision);if(!note||note.content.kind!=='note'||note.content.aboutRecord?.id!==r.id||note.content.aboutRecord.revision!==r.revision)return '解説は、その記録に紐づいた公開済みの説明を指定してください。';}
  }
  for(const note of p.entityNotes){
   if(!snapshot.entities.some(e=>e.id===note.target.id&&e.revision===note.target.revision))return 'ノード説明の対象版がテーマに含まれていません。';
   if(!note.supportingRecords.length||note.supportingRecords.some(pin=>!snapshot.records.some(r=>r.id===pin.id&&r.revision===pin.revision&&[r.content.subjectId,r.content.objectId].includes(note.target.id))))return 'ノード説明には、その人物・作品等に紐づく収録記録を指定してください。';
  }
 }
 return null;
}

/** Reconcile retained editorial metadata after an explicit membership/version edit.
 * Explicit new presentation still takes the strict reference-validation path. */
export function retainedThemeEditorial(
 reading: ReturnType<typeof resolvedThemeEditorialSchema.parse> | undefined,
 snapshot: KnowledgeSnapshot,
) {
 if (!reading) return undefined;
 const hasRecord = (pin: {id:string;revision:number}) => snapshot.records.some(r => r.id === pin.id && r.revision === pin.revision);
 return reading.map(p => ({
  ...p,
  records: p.records.filter(row => hasRecord(row.target)).map(row => ({
   ...row,
   explanations: row.explanations.filter(ref => snapshot.records.some(n =>
    n.id === ref.record.id && n.revision === ref.record.revision && n.content.kind === 'note'
    && n.content.aboutRecord?.id === row.target.id && n.content.aboutRecord.revision === row.target.revision)),
  })),
  entityNotes: p.entityNotes
   .filter(note => snapshot.entities.some(e => e.id === note.target.id && e.revision === note.target.revision))
   .map(note => ({...note, supportingRecords: note.supportingRecords.filter(hasRecord)}))
   .filter(note => note.supportingRecords.length),
 }));
}
