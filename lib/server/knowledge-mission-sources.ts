import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import type {MissionPlan} from '../domain/knowledge-mission';
import {canonicalSourceUrl} from '../domain/knowledge-source-identity';
import {KnowledgeError} from './knowledge-foundation';
import {publicSourceDocument,sourceURL,sourceText,normalizeSourceText,SOURCE_EXTRACTOR,type SourceDocument} from './knowledge-source-verification';

const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
/** An excerpt of the changed region, not a claim that a fact changed. */
export function sourceTextChange(before:string,after:string){
 let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let end=0;while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
 const from=Math.max(0,start-120);
 return {before:before.slice(from,Math.min(before.length-end+120,from+2000)),after:after.slice(from,Math.min(after.length-end+120,from+2000)),excerptOnly:true};
}
export function createMissionSourceChecks(pool:Pool,options:{fetchDocument?:(url:string)=>Promise<SourceDocument>}={}){
 function allowed(plan:MissionPlan,raw:string){const u=sourceURL(raw);if(!plan.sourceHosts.includes(u.hostname))throw new KnowledgeError('計画の資料サイトを指定してください。',403,'MISSION_SOURCE_SCOPE');return canonicalSourceUrl(u.href);}
 async function acquire(plan:MissionPlan,urls:string[]){
  const unique=[...new Set(urls.map(v=>allowed(plan,v)))];if(unique.length>plan.maxSources)throw new KnowledgeError('1回の資料数の上限を超えています。',400,'MISSION_SOURCE_SCOPE');
  return Promise.all(unique.map(async url=>{const doc=await (options.fetchDocument?options.fetchDocument(url):publicSourceDocument(url,{allowedHosts:plan.sourceHosts}));allowed(plan,doc.url);return {requested:url,doc,text:normalizeSourceText(sourceText(doc))};}));
 }
 async function view(c:Pool|PoolClient,row:QueryResultRow,includeText:boolean){
  const previous=row.previous_id?(await c.query('SELECT * FROM knowledge_missions.source_checks WHERE id=$1 AND plan_id=$2',[row.previous_id,row.plan_id])).rows[0]:null;
  const text=includeText?gunzipSync(row.text_gzip).toString('utf8'):'';
  const state=!previous?'first':previous.extractor!==row.extractor?'extractor-changed':previous.text_sha256!==row.text_sha256?'text-changed':previous.body_sha256!==row.body_sha256?'markup-only':'unchanged';
  return {id:row.id,url:row.document_url,finalUrl:row.final_url,checkedAt:row.checked_at.toISOString(),bodySha256:row.body_sha256,textSha256:row.text_sha256,extractor:row.extractor,previous:previous?{id:previous.id,bodySha256:previous.body_sha256,textSha256:previous.text_sha256,checkedAt:previous.checked_at.toISOString()}:null,state,
   ...(includeText?{text:text.slice(0,20000),textTruncated:text.length>20000,...(state==='text-changed'?{change:sourceTextChange(gunzipSync(previous.text_gzip).toString('utf8'),text)}:{})}:{})};
 }
 async function retain(c:PoolClient,run:{id:string;plan_id:string},plan:MissionPlan,docs:Awaited<ReturnType<typeof acquire>>){
  const old=(await c.query('SELECT document_url FROM knowledge_missions.source_checks WHERE run_id=$1',[run.id])).rows;
  if(new Set([...old.map(v=>v.document_url),...docs.map(v=>v.requested)]).size>plan.maxSources)throw new KnowledgeError('この実行の資料数の上限を超えています。',429,'MISSION_SOURCE_SCOPE');
  const result=[];
  for(const {requested,doc,text} of docs){
   let row=(await c.query('SELECT * FROM knowledge_missions.source_checks WHERE run_id=$1 AND document_url=$2',[run.id,requested])).rows[0];
   if(!row){const previous=(await c.query('SELECT id FROM knowledge_missions.source_checks WHERE plan_id=$1 AND document_url=$2 ORDER BY checked_at DESC,id DESC LIMIT 1',[run.plan_id,requested])).rows[0];
    row=(await c.query('INSERT INTO knowledge_missions.source_checks(id,run_id,plan_id,document_url,final_url,body_sha256,text_sha256,extractor,media_type,body_gzip,text_gzip,previous_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[randomUUID(),run.id,run.plan_id,requested,canonicalSourceUrl(doc.url),hash(doc.body),hash(text),SOURCE_EXTRACTOR,doc.type,gzipSync(doc.body),gzipSync(text),previous?.id??null])).rows[0];
   }result.push(await view(c,row,true));
  }return result;
 }
 async function summary(runId:string){const rows=(await pool.query('SELECT * FROM knowledge_missions.source_checks WHERE run_id=$1 ORDER BY checked_at,id',[runId])).rows;return Promise.all(rows.map(row=>view(pool,row,false)));}
 return {acquire,retain,summary};
}
