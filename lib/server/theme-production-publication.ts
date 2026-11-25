import {productionContinuity} from './theme-production-continuity';
import type {GuideVersions} from '../domain/theme-work-guide';
import {lockThemeQualityGuide} from './member/theme-quality-guide';
import {assertThemeEvidence} from './theme-automation';
import type {Pool} from 'pg';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {themeEditions} from './knowledge-theme-editions';
import {capturedThemeTranslations,freezeThemeReleases,writeEditorialThemeRelease} from './knowledge-theme-publication';
import {createThemeAuthoringReader} from './knowledge-theme-authoring-reader';
/** Durable completion commits first. Only this short fenced transaction activates
 * a reviewed edition; a failed completion/activation cannot expose a draft. */
export async function activateReviewedTheme(pool:Pool,knowledge:Pool,owner:string,intentId:string,deps:{authorize:(owner:string)=>Promise<void>;origin:string;target:(id:string,owner:string,revision?:number,dynamic?:boolean)=>Promise<{digest:string;theme:{revision:number};guide:GuideVersions}>}){
 await deps.authorize(owner);
 const m=await pool.connect(),k=await knowledge.connect();
 try{
  await m.query('BEGIN');
  const intent=(await m.query('SELECT * FROM theme_production.publication_intents WHERE id=$1 AND owner_id=$2',[intentId,owner])).rows[0];
  if(!intent)throw new KnowledgeError('公開切替の完了記録がありません。',409,'PUBLICATION_PROOF_REQUIRED');
  await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-production:'+intent.case_id]);
  const r=(await m.query('SELECT * FROM theme_production.cases WHERE id=$1 AND owner_id=$2 FOR UPDATE',[intent.case_id,owner])).rows[0];
  if(!r||r.origin!==deps.origin||r.status!=='completed'||productionContinuity(r.progress).parkedIntentId===intentId||r.phase!=='review'||r.theme_id!==intent.theme_id||r.theme_revision!==intent.theme_revision||knowledgeDigest(r.assessment)!==knowledgeDigest(intent.assessment)||r.assessment?.result!=='pass'||r.progress.unfinished.length||r.progress.blockers.length)throw new KnowledgeError('完了後に制作状態が変わりました。独立した全体見直しへ戻してください。',409,'PUBLICATION_PROOF_STALE');
  const dynamic=r.guide_contract===2;
  if(dynamic)await lockThemeQualityGuide(m,true);
  await m.query('LOCK TABLE product_editorial_version,site_editorial_guide_version IN SHARE MODE');
  await k.query('BEGIN');await k.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge-record-writes-v1',0))");
  const prior=(await k.query('SELECT theme_id,revision FROM knowledge75.theme_release_approvals WHERE release_id=$1',[intentId])).rows[0];
  if(prior){if(prior.theme_id!==intent.theme_id||prior.revision!==intent.theme_revision)throw new KnowledgeError('公開記録が一致しません。',409,'PUBLICATION_PROOF_STALE');await k.query('COMMIT');await m.query('COMMIT');return;}
  const editions=await themeEditions(k,intent.theme_id);
  if(editions.productionConflict)throw new KnowledgeError('通常公開が進みました。公開版と制作原稿を照合してから、全体を見直してください。',409,'THEME_PUBLICATION_CONFLICT');
  if(editions.draft&&(editions.published.revision===null||editions.draft.revision===intent.theme_revision))throw new KnowledgeError('通常編集の作業版は通常公開で切り替えてください。',409,'PRODUCTION_EDIT_CHANNEL');
  const actual=await deps.target(intent.theme_id,owner,undefined,dynamic);
  const guideCurrent=dynamic
   ?actual.guide.criteriaRevision===intent.assessment.criteriaRevision&&actual.guide.evidenceRevision===intent.assessment.evidenceRevision
   :actual.guide.revision===intent.guide_revision;
  if(actual.digest!==intent.target_digest||!guideCurrent||actual.theme.revision!==intent.theme_revision)throw new KnowledgeError('評価後に対象または品質ガイドが変更されました。全体を再評価してください。',409,'PRODUCTION_ASSESSMENT_STALE');
  if(dynamic)await assertThemeEvidence(m,r.id,intent.assessment.executionId,intent.assessment.reviewEvidenceId,actual,r.workflow==='scheduled');
  await deps.authorize(owner);
  const theme=(await createThemeAuthoringReader(knowledge,deps.origin).read(intent.theme_id,intent.theme_revision)).theme;
  await freezeThemeReleases(k,theme.id);
  const translations=await capturedThemeTranslations(k,theme);
  const proof={caseId:intent.case_id,ownerId:owner,targetDigest:intent.target_digest,assessment:intent.assessment};
  await writeEditorialThemeRelease(k,theme,intentId,proof,translations);
  await k.query('COMMIT');await m.query('COMMIT');
 }catch(e){await k.query('ROLLBACK');await m.query('ROLLBACK');throw e;}finally{k.release();m.release();}
}
