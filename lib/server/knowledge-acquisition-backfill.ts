import type {Pool} from 'pg';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {retainSourceAcquisitions} from './knowledge-source-registry';
import {matchSourceExcerpt,sourceText,normalizeSourceText} from './knowledge-source-verification';
import {createHash} from 'node:crypto';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
/** Explicit, bounded migration of existing trusted server receipts. Never trusts
 * a package's self-reported hash or creates knowledge/source editions. */
export async function backfillAcquisitionPage(member:Pool,knowledge:Pool,origin:'submission'|'collection',after:string|null=null,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>500)throw new KnowledgeError('移行件数が不正です');
 const actorId=origin==='submission'?'member-submission-v1':'collection-reading-v1';
 const rows=origin==='submission'?(await member.query(`SELECT id,command,result,proofs->'sources' AS proofs FROM member_knowledge.publication_decisions WHERE state='published' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`,[after,limit+1])).rows:(await member.query(`SELECT d.id,d.command,d.result,i.url,i.document,i.body,i.body_sha256,i.text_sha256,i.fetched_at FROM knowledge_collection.read_decisions d JOIN knowledge_collection.read_tasks t ON t.id=d.task_id JOIN knowledge_collection.items i ON i.id=t.source_id WHERE d.state='applied' AND ($1::uuid IS NULL OR d.id>$1) ORDER BY d.id LIMIT $2`,[after,limit+1])).rows;
 let retained=0,skipped=0;
 for(const row of rows.slice(0,limit)){
  if(row.command?.action!=='accept-record'){skipped++;continue;}
  const c=await knowledge.connect();try{
   await c.query('BEGIN');
   const operation=(await c.query('SELECT input,result FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',[actorId,row.command.requestId])).rows[0];
   if(!operation||knowledgeDigest(operation.input)!==knowledgeDigest(row.command)||knowledgeDigest(operation.result)!==knowledgeDigest(row.result))throw new KnowledgeError('公開receiptと共通原本の操作が一致しません',409,'ACQUISITION_RECEIPT_CHANGED');
   let proofs=row.proofs??[];
   if(origin==='collection'){
    if(!row.body||!row.document||hash(row.body)!==row.body_sha256||hash(row.document.text)!==row.text_sha256||normalizeSourceText(sourceText({url:row.document.url,type:row.document.type,body:row.body}))!==row.document.text)throw new KnowledgeError('保存した収集原本が一致しません',409,'SOURCE_CHANGED');
    proofs=row.command.record.content.evidence.map((e:{excerpt:string})=>({...matchSourceExcerpt({url:row.document.url,type:row.document.type,body:row.body},e.excerpt),requestedUrl:row.url,checkedAt:new Date(row.fetched_at).toISOString()}));
   }
   await retainSourceAcquisitions(c,{actorId,requestId:row.command.requestId,result:operation.result,proofs});
   await c.query('COMMIT');retained++;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 return {origin,retained,skipped,next:rows.length>limit?String(rows[limit-1].id):null};
}
