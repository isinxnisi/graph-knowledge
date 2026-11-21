import type {Pool,PoolClient} from 'pg';
import type {z} from 'zod';
import type {publishThemeSchema} from '../domain/knowledge-theme-registration';
import {KnowledgeError,knowledgeDigest,resolvePublicKnowledgeTheme} from './knowledge-foundation';
import {withOperatorThemeRead} from './knowledge-theme-access';
import {lockThemeCaseBinding,samePublishedBase,themeEditions} from './knowledge-theme-editions';
import {capturedThemeTranslations,freezeThemeReleases,writeEditorialThemeRelease} from './knowledge-theme-publication';
import {validateProductPins} from './member/product-editorial';

async function resolveCandidate(c:PoolClient,id:string,revision:number){
 const resolved=await withOperatorThemeRead(()=>resolvePublicKnowledgeTheme(c,id,revision));
 const translations=await capturedThemeTranslations(c,resolved.theme);
 return {theme:resolved.theme,translations,digest:knowledgeDigest({resolved,translations})};
}

export async function ordinaryPublicationSnapshot(knowledge:Pool,id:string,revision:number){
 const c=await knowledge.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const {draft,published}=await themeEditions(c,id);
  const resolved=draft?.revision===revision&&samePublishedBase(draft.base,published)?await resolveCandidate(c,id,revision):null;
  const snapshot=resolved&&draft?{candidate:{target:{id,revision},base:draft.base,digest:resolved.digest},translations:resolved.translations}:null;
  await c.query('COMMIT');return snapshot;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function publishOrdinaryTheme(pool:Pool,knowledge:Pool,owner:string,input:z.infer<typeof publishThemeSchema>,authorize:(owner:string)=>Promise<void>){
 await authorize(owner);
 const m=await pool.connect();const k=await knowledge.connect().catch(e=>{m.release();throw e;});
 const releaseId='operator:'+input.requestId;
 const digest=knowledgeDigest(input);
 try{
  await m.query('BEGIN');
  if(!(await m.query('SELECT 1 FROM "user" WHERE id=$1 AND active FOR SHARE',[owner])).rowCount)throw new KnowledgeError('現在の運営権限を確認してください。',403,'OPERATOR_REQUIRED');
  await lockThemeCaseBinding(m,input.target.id);
  await m.query('LOCK TABLE product_editorial_version IN SHARE MODE');
  await k.query('BEGIN');
  await k.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge-record-writes-v1',0))");
  const prior=(await k.query('SELECT theme_id,revision,proof FROM knowledge75.theme_release_approvals WHERE release_id=$1',[releaseId])).rows[0];
  if(prior){
   if(prior.proof?.ownerId!==owner||prior.proof?.digest!==digest)throw new KnowledgeError('同じ公開要求IDに異なる内容は送れません。',409,'REQUEST_CHANGED');
   await k.query('COMMIT');await m.query('COMMIT');
   return {state:'published',theme:{id:prior.theme_id,revision:prior.revision},releaseId,replayed:true};
  }
  const {published,draft,workingChanges,workingRevision,productionConflict}=await themeEditions(k,input.target.id);
  if(!draft||draft.revision!==input.target.revision)throw new KnowledgeError('通常編集で保存された現在の作業版を指定してください。',409,'THEME_OPERATOR_DRAFT_REQUIRED');
  if(!samePublishedBase(draft.base,input.base)||!samePublishedBase(published,input.base))throw new KnowledgeError('公開版が変わりました。通常編集と現在の公開版の差分を照合してください。',409,'THEME_PUBLICATION_CONFLICT');
  const {theme,translations,digest:actual}=await resolveCandidate(k,input.target.id,input.target.revision);
  if(input.digest!==actual)throw new KnowledgeError('原稿や訳文が変わりました。確認した通常編集の版を読み直してください。',409,'THEME_PUBLICATION_CONFLICT');
  await validateProductPins(m,theme.content.productPins??[]);
  const images=[...new Set((theme.content.reading??[]).flatMap(p=>p.image?.id?[p.image.id]:[]))];
  if(images.length&&(await m.query("SELECT id FROM product_image_asset WHERE id=ANY($1::text[]) AND role='illustration' FOR SHARE",[images])).rowCount!==images.length)throw new KnowledgeError('公開する挿絵を確認してください。',409,'THEME_IMAGE_INVALID');
  await freezeThemeReleases(k,theme.id);
  const hasActiveCase=published.revision!==null&&(await m.query(
   "SELECT 1 FROM theme_production.cases WHERE theme_id=$1 AND status NOT IN ('completed','abandoned') LIMIT 1",[theme.id])).rowCount===1;
  const keepWorking=workingRevision!==theme.revision&&(hasActiveCase||workingChanges&&(published.revision!==null||workingRevision!==1));
  if(keepWorking){
   await k.query('UPDATE knowledge75.theme_publications SET production_conflict=$2 WHERE theme_id=$1',[theme.id,JSON.stringify(productionConflict??published)]);
  }else{
   await k.query("UPDATE knowledge75.objects SET current_revision=$2,confirmation='unreviewed',status_revision=status_revision+1,updated_at=clock_timestamp() WHERE kind='theme' AND id=$1",[theme.id,theme.revision]);
  }
  await writeEditorialThemeRelease(k,theme,releaseId,{kind:'operator-edit',ownerId:owner,digest,base:input.base,reason:input.reason},translations);
  await k.query('DELETE FROM knowledge75.theme_operator_drafts WHERE theme_id=$1',[theme.id]);
  await k.query(`INSERT INTO knowledge75.changes(kind,id,content_revision,status_revision,operation,actor_id,request_id)
   SELECT 'theme',id,$2,status_revision,'publish-theme',$3,$4 FROM knowledge75.objects WHERE kind='theme' AND id=$1`,[theme.id,theme.revision,'operator-theme-publication:'+owner,input.requestId]);
  await k.query('COMMIT');await m.query('COMMIT');
  return {state:'published',theme:{id:theme.id,revision:theme.revision},releaseId,replayed:false};
 }catch(e){await k.query('ROLLBACK');await m.query('ROLLBACK');throw e;}finally{k.release();m.release();}
}
