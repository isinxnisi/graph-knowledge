import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {THEME_QUALITY_GUIDE_ID,readThemeQualityGuideSchema,updateThemeQualityGuideSchema,type ReadThemeQualityGuide,type UpdateThemeQualityGuide} from '../../domain/theme-quality-guide';
import {KnowledgeError} from '../knowledge-foundation';
import {isSiteOperator} from './site-operations';
import {memberTransaction} from './operations';

const id=THEME_QUALITY_GUIDE_ID,target='68213251-15c8-4e9c-9ca5-2bd60636abb4';
const conflict=(message:string,code:string)=>new KnowledgeError(message,409,code);
async function authorize(c:PoolClient,owner:string){
 if(!isSiteOperator(owner)||!(await c.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[owner])).rowCount)
  throw new KnowledgeError('運営アカウントで接続してください。',403,'OPERATOR_REQUIRED');
}
function version(row:Record<string,unknown>){return {id,revision:Number(row.revision),markdown:row.markdown,reason:row.reason,restoredFrom:row.restored_from??null,updatedAt:new Date(row.created_at as string).toISOString()};}
async function read(c:PoolClient,input:ReadThemeQualityGuide){
 const current=(await c.query('SELECT * FROM site_editorial_guide_version WHERE guide_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];
 if(!current){if(input.revision)throw new KnowledgeError('その版のガイドはありません。',404,'GUIDE_NOT_FOUND');return {id,revision:0,currentRevision:0,markdown:null,updatedAt:null,history:[],nextHistoryBefore:null};}
 const selected=input.revision?(await c.query('SELECT * FROM site_editorial_guide_version WHERE guide_id=$1 AND revision=$2',[id,input.revision])).rows[0]:current;
 if(!selected)throw new KnowledgeError('その版のガイドはありません。',404,'GUIDE_NOT_FOUND');
 const rows=(await c.query('SELECT revision,reason,restored_from,created_at FROM site_editorial_guide_version WHERE guide_id=$1 AND revision<=$2 AND ($3::integer IS NULL OR revision<$3) ORDER BY revision DESC LIMIT 21',[id,current.revision,input.historyBefore??null])).rows;
 return {...version(selected),currentRevision:current.revision,history:rows.slice(0,20).map(row=>({revision:row.revision,reason:row.reason,restoredFrom:row.restored_from,updatedAt:new Date(row.created_at).toISOString()})),nextHistoryBefore:rows.length>20?rows[19].revision:null};
}
/** Same member DB, operator boundary, transaction and durable replay receipts as site operations.
 * Markdown is reference content, never a replacement for schemas, scopes or executable policy. */
export function createThemeQualityGuides(pool:Pool){return {
 read:(owner:string,raw:ReadThemeQualityGuide={})=>memberTransaction(pool,async c=>{await authorize(c,owner);return read(c,readThemeQualityGuideSchema.parse(raw));}),
 update:(owner:string,raw:UpdateThemeQualityGuide)=>memberTransaction(pool,async c=>{
  await authorize(c,owner);const input=updateThemeQualityGuideSchema.parse(raw);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('site-theme-quality-guide',0))");
  const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const receipt=(await c.query('SELECT payload_hash,result FROM site_operation_request WHERE operator_id=$1 AND request_id=$2',[owner,input.requestId])).rows[0];
  if(receipt){if(receipt.payload_hash!==digest)throw conflict('同じ受付IDの内容が異なります。別の改訂には新しいIDを使ってください。','REQUEST_REUSED');const saved=(await c.query('SELECT * FROM site_editorial_guide_version WHERE guide_id=$1 AND revision=$2',[id,receipt.result.revision])).rows[0];return {...version(saved),requestId:input.requestId,replayed:true};}
  const current=Number((await c.query('SELECT coalesce(max(revision),0) AS revision FROM site_editorial_guide_version WHERE guide_id=$1',[id])).rows[0].revision);
  if(current!==input.expectedRevision)throw conflict('別の会話から更新されています。最新の本文と版を読み直して変更を調整してください。','GUIDE_CHANGED');
  let markdown=input.markdown;
  if(input.restoreRevision){const old=(await c.query('SELECT markdown FROM site_editorial_guide_version WHERE guide_id=$1 AND revision=$2',[id,input.restoreRevision])).rows[0];if(!old)throw new KnowledgeError('復元する版が見つかりません。',404,'GUIDE_NOT_FOUND');markdown=old.markdown;}
  if(!markdown||Buffer.byteLength(markdown)>512000)throw new KnowledgeError('ガイド本文は512KB以下にしてください。',400,'GUIDE_TOO_LARGE');
  const row=(await c.query('INSERT INTO site_editorial_guide_version(guide_id,revision,markdown,reason,restored_from,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id,current+1,markdown,input.reason,input.restoreRevision??null,owner])).rows[0];
  const result={...version(row),requestId:input.requestId};
  await c.query(`INSERT INTO site_operation_request(operator_id,request_id,payload_hash,action,target_kind,target_id,reason,result) VALUES($1,$2,$3,'update-theme-quality-guide','editorial-guide',$4,$5,$6)`,[owner,input.requestId,digest,target,input.reason,JSON.stringify({id,revision:row.revision,updatedAt:result.updatedAt,requestId:input.requestId})]);
  // The immutable version is the only body copy; replay receipts contain identifiers, not Markdown.
  return {...result,replayed:false};
 }),
};}
