import type {Pool} from 'pg';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {capturedThemeTranslations,freezeThemeReleases} from './knowledge-theme-publication';
import {createThemeAuthoringReader} from './knowledge-theme-authoring-reader';
/** Durable completion commits first. Only this short fenced transaction activates
 * a reviewed edition; a failed completion/activation cannot expose a draft. */
export async function activateReviewedTheme(pool:Pool,knowledge:Pool,owner:string,intentId:string,deps:{authorize:(owner:string)=>Promise<void>;origin:string;target:(id:string,owner:string)=>Promise<{digest:string;theme:{revision:number};guide:{revision:number}}>}){
 await deps.authorize(owner);
 const m=await pool.connect(),k=await knowledge.connect();
 try{
  await m.query('BEGIN');
  const intent=(await m.query('SELECT * FROM theme_production.publication_intents WHERE id=$1 AND owner_id=$2',[intentId,owner])).rows[0];
  if(!intent)throw new KnowledgeError('公開切替の完了記録がありません。',409,'PUBLICATION_PROOF_REQUIRED');
  await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-production:'+intent.case_id]);
  const r=(await m.query('SELECT * FROM theme_production.cases WHERE id=$1 AND owner_id=$2 FOR UPDATE',[intent.case_id,owner])).rows[0];
  if(!r||r.origin!==deps.origin||r.status!=='completed'||r.phase!=='review'||r.theme_id!==intent.theme_id||r.theme_revision!==intent.theme_revision||knowledgeDigest(r.assessment)!==knowledgeDigest(intent.assessment)||r.assessment?.result!=='pass'||r.progress.unfinished.length||r.progress.blockers.length)throw new KnowledgeError('完了後に制作状態が変わりました。独立した全体見直しへ戻してください。',409,'PUBLICATION_PROOF_STALE');
  await m.query('LOCK TABLE product_editorial_version,site_editorial_guide_version IN SHARE MODE');
  await k.query('BEGIN');await k.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge-record-writes-v1',0))");
  const prior=(await k.query('SELECT theme_id,revision FROM knowledge75.theme_release_approvals WHERE release_id=$1',[intentId])).rows[0];
  if(prior){if(prior.theme_id!==intent.theme_id||prior.revision!==intent.theme_revision)throw new KnowledgeError('公開記録が一致しません。',409,'PUBLICATION_PROOF_STALE');await k.query('COMMIT');await m.query('COMMIT');return;}
  const actual=await deps.target(intent.theme_id,owner);
  if(actual.digest!==intent.target_digest||actual.guide.revision!==intent.guide_revision||actual.theme.revision!==intent.theme_revision)throw new KnowledgeError('評価後に対象または品質ガイドが変更されました。全体を再評価してください。',409,'PRODUCTION_ASSESSMENT_STALE');
  await deps.authorize(owner);
  const theme=(await createThemeAuthoringReader(knowledge,deps.origin).read(intent.theme_id,intent.theme_revision)).theme;
  await freezeThemeReleases(k,theme.id);
  const translations=await capturedThemeTranslations(k,theme),imageIds=[...new Set((theme.content.reading??[]).flatMap(p=>p.image?.id?[p.image.id]:[]))];
  const proof={caseId:intent.case_id,ownerId:owner,targetDigest:intent.target_digest,assessment:intent.assessment};
  await k.query('INSERT INTO knowledge75.theme_releases(theme_id,revision,release_id,proof,theme_translations,image_ids) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(theme_id,revision) DO UPDATE SET release_id=EXCLUDED.release_id,proof=EXCLUDED.proof,theme_translations=EXCLUDED.theme_translations,image_ids=EXCLUDED.image_ids,approved_at=clock_timestamp()',[theme.id,theme.revision,intentId,JSON.stringify(proof),JSON.stringify(translations),JSON.stringify(imageIds)]);
  await k.query('INSERT INTO knowledge75.theme_release_approvals(release_id,theme_id,revision,proof,theme_translations,image_ids) VALUES($1,$2,$3,$4,$5,$6)',[intentId,theme.id,theme.revision,JSON.stringify(proof),JSON.stringify(translations),JSON.stringify(imageIds)]);
  await k.query('UPDATE knowledge75.theme_publications SET published_revision=$2,release_id=$3,updated_at=clock_timestamp() WHERE theme_id=$1',[theme.id,theme.revision,intentId]);
  await k.query('COMMIT');await m.query('COMMIT');
 }catch(e){await k.query('ROLLBACK');await m.query('ROLLBACK');throw e;}finally{k.release();m.release();}
}
