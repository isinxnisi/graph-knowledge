import type {Pool,QueryResultRow} from 'pg';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {knowledgeSubmissionContentSchema} from '../domain/knowledge-submission';

/** Historical server capture shape, restricted to independently authorised
 * operator owners by the repair caller. Never used to grant API permissions or
 * to classify new requests: those receive an explicit trusted server marker. */
export function legacyOperatorTranslation(row:{content:unknown;source_capsule:unknown}){
 const parsed=knowledgeSubmissionContentSchema.safeParse(row.content);
 if(!parsed.success)return false;
 const v=parsed.data,source=row.source_capsule as {kind?:string;captured?:{themes?:{id:string;revision:number}[];texts?:{target:unknown}[];entities?:unknown[];sources?:unknown[];records?:unknown[]}}|null;
 const item=v.items[0],about=item?.about,context=source?.captured;
 return source?.kind==='selection'&&v.items.length===1&&item.operation==='translate-text'&&!!item.translation&&about?.kind==='theme'&&
  v.title===('翻訳 · '+item.translation.text.slice(0,150)).trim()&&context?.themes?.length===1&&context.texts?.length===1&&
  !context.entities?.length&&!context.sources?.length&&!context.records?.length&&
  context.themes[0].id===about.id&&context.themes[0].revision===about.revision&&knowledgeDigest(context.texts[0].target)===knowledgeDigest(item.translation.target);
}

/** Privacy repair only. Original text, input digests, decisions, publication
 * editions and private ownership are retained; ordinary form posts are not
 * classified merely because their author is also a site operator. */
export async function repairOperatorTranslationPrivacy(pool:Pool,operatorIds:string[],apply=false){
 if(!operatorIds.length)throw new KnowledgeError('運営者の確認が必要です',403,'OPERATOR_REQUIRED');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('operator-intake-privacy-20261109',0))");
  const rows=(await c.query(`SELECT s.id,s.owner_id,r.content,r.source_capsule FROM member_knowledge.submissions s JOIN member_knowledge.submission_revisions r ON r.submission_id=s.id AND r.revision=1 WHERE s.owner_id=ANY($1::uuid[]) ORDER BY s.id FOR UPDATE OF s`,[operatorIds])).rows;
  const selected=rows.filter((r:QueryResultRow)=>r.source_capsule?.kind==='operator-api'||legacyOperatorTranslation(r as {content:unknown;source_capsule:unknown}));
  const ids=selected.map(r=>r.id as string);
  const revisions=(await c.query('SELECT submission_id,revision,raw_input,content,digest,source_capsule,reference_context FROM member_knowledge.submission_revisions WHERE submission_id=ANY($1::uuid[]) ORDER BY submission_id,revision',[ids])).rows;
  const originalDigest=knowledgeDigest(revisions.map(({source_capsule:source,...r})=>({...r,captured:source?.captured??null})));
  const credits=(await c.query('SELECT decision_id,owner_id,submission_id,attribution,activity_public FROM member_knowledge.publication_contributors WHERE submission_id=ANY($1::uuid[]) ORDER BY decision_id',[ids])).rows;
  if(apply){
   await c.query(`UPDATE member_knowledge.submission_revisions SET source_capsule=COALESCE(source_capsule,'{}'::jsonb)||jsonb_build_object('kind','operator-api','privacyRepair','2026-11-09') WHERE submission_id=ANY($1::uuid[]) AND COALESCE(source_capsule->>'kind','')<>'operator-api'`,[ids]);
   // These rows were an incorrect public projection, not the operation audit.
   // Removing them also prevents a later private-draft erasure from resurrecting
   // an anonymous member badge when its source marker disappears.
   await c.query('DELETE FROM member_knowledge.publication_contributors WHERE submission_id=ANY($1::uuid[])',[ids]);
   const after=(await c.query('SELECT submission_id,revision,raw_input,content,digest,source_capsule,reference_context FROM member_knowledge.submission_revisions WHERE submission_id=ANY($1::uuid[]) ORDER BY submission_id,revision',[ids])).rows;
   if(knowledgeDigest(after.map(({source_capsule:source,...r})=>({...r,captured:source?.captured??null})))!==originalDigest)throw new Error('Original input or captured knowledge changed');
   const owners=(await c.query('SELECT id,owner_id FROM member_knowledge.submissions WHERE id=ANY($1::uuid[]) ORDER BY id',[ids])).rows;
   if(knowledgeDigest(owners)!==knowledgeDigest(selected.map(r=>({id:r.id,owner_id:r.owner_id}))))throw new Error('Private ownership changed');
  }
  await c.query(apply?'COMMIT':'ROLLBACK');
  return {systemIntakes:ids.length,publicationCredits:credits.length,personalCredits:credits.filter(r=>r.attribution==='profile'||r.activity_public).length,originalDigest,applied:apply,submissionIds:ids};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
