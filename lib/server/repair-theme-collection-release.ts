import type {Pool} from 'pg';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {capturedThemeTranslations,themePublicationState} from './knowledge-theme-publication';
import {releaseAcceptedThemeKnowledge} from './knowledge-theme-knowledge-update';
import type {KnowledgeThemeVersion} from '../domain/knowledge-foundation';
import type {KnowledgeDisplayTranslation} from '../domain/knowledge-translation';

export type CollectionReleaseRepair={themeId:string;parent:number;revision:number;parentDigest:string;digest:string;requestId:string;actorId:string;principalId:string;record:{id:string;revision:number}};
/** Maintenance only: exact pre-migration, already-accepted collection artifact.
 * No new content, receipt, production case, assessment or revision is written. */
export async function repairThemeCollectionRelease(member:Pool,knowledge:Pool,expected:CollectionReleaseRepair,apply=false){
 const k=await knowledge.connect(),m=await member.connect();const bad=()=>new KnowledgeError('復旧対象または受入証明が変わっています。自動公開せず再監査してください。',409,'COLLECTION_REPAIR_CONFLICT');
 try{
  await m.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const receipt=(await m.query(`SELECT i.state,i.result,p.principal_id FROM knowledge_import.items i JOIN knowledge_import.packages p ON p.id=i.package_id WHERE i.id=$1`,[expected.requestId])).rows[0];
  if(!receipt||receipt.state!=='published'||receipt.principal_id!==expected.principalId||receipt.result?.id!==expected.record.id||receipt.result?.revision!==expected.record.revision||!receipt.result?.themes?.some((p:{id:string;revision:number})=>p.id===expected.themeId&&p.revision===expected.revision))throw bad();
  // A live production/review case is not a veto on accepted knowledge. The
  // exact artifact/head checks below protect its unpublished prose; its lease,
  // pending submissions, assessment and completion remain untouched.
  await k.query('BEGIN');await k.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge-record-writes-v1',0))");
  const state=await themePublicationState(k,expected.themeId);
  const ready=!!(await k.query("SELECT to_regclass('knowledge75.theme_knowledge_revisions') AS ready")).rows[0].ready;
  if(apply&&!ready)throw new KnowledgeError('011の明示migrationが必要です',503,'MIGRATION_REQUIRED');
  const prior=ready?(await k.query('SELECT * FROM knowledge75.theme_knowledge_revisions WHERE theme_id=$1 AND revision=$2',[expected.themeId,expected.revision])).rows[0]:null;
  if(prior){if(prior.channel!=='published'||prior.parent_revision!==expected.parent||prior.actor_id!==expected.actorId||prior.request_id!==expected.requestId||state.publishedRevision!==expected.revision)throw bad();await k.query('COMMIT');await m.query('COMMIT');return {outcome:'already-repaired',publication:state};}
  if(state.publishedRevision!==expected.parent||state.workingRevision<expected.revision)throw bad();
  const rows=(await k.query("SELECT * FROM knowledge75.revisions WHERE kind='theme' AND id=$1 AND revision=ANY($2::integer[]) ORDER BY revision",[expected.themeId,[expected.parent,expected.revision]])).rows;
  if(rows.length!==2||knowledgeDigest(rows[0].content)!==expected.parentDigest||knowledgeDigest(rows[1].content)!==expected.digest||rows[1].actor_id!==expected.actorId||rows[1].actor_kind!=='import')throw bad();
  const [parent,next]=rows.map(r=>({id:r.id,revision:r.revision,content:r.content,reason:r.reason,createdAt:r.created_at.toISOString()} as KnowledgeThemeVersion));
  if(knowledgeDigest({...parent.content,recordPins:[...parent.content.recordPins,expected.record]})!==knowledgeDigest(next.content))throw bad();
  const operation=(await k.query('SELECT * FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2',[expected.actorId,expected.requestId])).rows[0];
  if(!operation||operation.actor_kind!=='import'||operation.input.action!=='accept-record'||operation.input.record.id!==expected.record.id||knowledgeDigest(operation.result)!==knowledgeDigest(receipt.result)||!operation.input.themes?.some((p:{id:string;revision:number})=>p.id===expected.themeId&&p.revision===expected.parent))throw bad();
  const frozen=(await k.query('SELECT theme_translations FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2',[expected.themeId,expected.parent])).rows[0];
  if(!frozen||frozen.theme_translations===null)throw bad(); // Never capture already changed legacy heads.
  const plan={themeId:expected.themeId,from:expected.parent,to:expected.revision,requestId:expected.requestId,contentUnchanged:true};
  if(!apply){await k.query('ROLLBACK');await m.query('COMMIT');return {outcome:'verified',plan};}
  await k.query("INSERT INTO knowledge75.theme_knowledge_revisions(theme_id,revision,parent_revision,channel,record_id,record_revision,actor_id,request_id) VALUES($1,$2,$3,'published',$4,$5,$6,$7)",[expected.themeId,expected.revision,expected.parent,expected.record.id,expected.record.revision,expected.actorId,expected.requestId]);
  await releaseAcceptedThemeKnowledge(k,parent,next,{actorId:expected.actorId,requestId:expected.requestId,record:expected.record});
  // Preserve genuinely pending Theme translations, including edits without a
  // Theme revision. The collection release inherits only frozen parent text.
  const approved=(await k.query('SELECT theme_translations FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2',[expected.themeId,expected.revision])).rows[0].theme_translations;
  const signature=(t:KnowledgeDisplayTranslation)=>knowledgeDigest({id:t.id,revision:t.revision,target:{...(t.displayTarget??t.target),revision:1},text:t.text});
  const permitted=new Set((approved as KnowledgeDisplayTranslation[]).map(signature));
  if((await capturedThemeTranslations(k,next)).some(t=>!permitted.has(signature(t))))await k.query('UPDATE knowledge75.theme_publications SET draft_updated_at=clock_timestamp() WHERE theme_id=$1',[expected.themeId]);
  const publication=await themePublicationState(k,expected.themeId);await k.query('COMMIT');await m.query('COMMIT');return {outcome:'repaired',plan,publication};
 }catch(e){await k.query('ROLLBACK');await m.query('ROLLBACK');throw e;}finally{k.release();m.release();}
}
