import {assertPreviewTheme,previewGrant,PREVIEW_HEADER} from './theme-automation';
import {Pool} from 'pg';
import type {KnowledgeThemeRead} from '../domain/knowledge-theme-reader';
import {buildKnowledgePublishedRecord} from '../domain/knowledge-publication';
import {memberRuntime} from './member/runtime';
import {isSiteOperator} from './member/site-operations';
import {KnowledgeError} from './knowledge-foundation';
import {knowledgeReadConfiguration} from './knowledge-read-runtime';
import {verifyKnowledgeReadSchema} from './knowledge-publication-preview';
import {createThemeAuthoringReader} from './knowledge-theme-authoring-reader';
import {publicThemeSnapshotTranslations} from './knowledge-display-translations';
import {withOperatorThemeRead} from './knowledge-theme-access';
import {themeReadingPresentation} from './theme-reading-presentation';
export const PRIVATE_THEME_HEADERS={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Vary':'Cookie'};
let pool:Pool|undefined;
type PreviewScope={themeId:string;revision?:number;locale?:'ja'|'en'}|{imageId:string};
export async function themeOperator(headers:Headers,scope?:PreviewScope){
 const runtime=memberRuntime();
 if(scope&&headers.has(PREVIEW_HEADER)){
  const target=await previewGrant(runtime.pool,runtime.config.origin,headers);
  if('themeId' in scope)assertPreviewTheme(target,scope.themeId,scope.revision,scope.locale);
  else if(!target.imageIds.includes(scope.imageId))throw new KnowledgeError('閲覧できません',404,'NOT_FOUND');
  return '';
 }
 const session=await runtime.auth.api.getSession({headers,query:{disableCookieCache:true}});
 if(!session?.user.active||!isSiteOperator(session.user.id))throw new KnowledgeError('閲覧できません',404,'NOT_FOUND');
 return session.user.id;
}
export async function operatorThemePool(){pool??=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:3});await verifyKnowledgeReadSchema(pool);return pool;}
/** Call only after authenticated operator authorization; never on a public route. */
export async function operatorThemePreview(id:string,locale:'ja'|'en',revision?:number):Promise<KnowledgeThemeRead>{
 const knowledge=await operatorThemePool(),resolved=await createThemeAuthoringReader(knowledge,memberRuntime().config.origin).read(id,revision),c=await knowledge.connect();
 try{return await withOperatorThemeRead(async()=>{const {theme,snapshot}=resolved;return {theme,snapshot,operatorPreview:true,records:snapshot.records.map(record=>buildKnowledgePublishedRecord(record,{entities:snapshot.entities,sources:snapshot.sources,mappings:snapshot.mappings})),presentation:themeReadingPresentation(theme,locale,snapshot),displayTranslations:await publicThemeSnapshotTranslations(c,resolved,locale)};});}finally{c.release();}
}
export async function operatorThemeList(owner:string){
 const knowledge=await operatorThemePool(),rows=(await knowledge.query("SELECT o.id,o.current_revision,r.content->>'title' AS title,h.published_revision,(h.draft_updated_at>h.updated_at) AS working_changes FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision JOIN knowledge75.theme_publications h ON h.theme_id=o.id WHERE o.kind='theme' AND o.visibility='public' ORDER BY r.created_at DESC,o.id LIMIT 200")).rows;
 const {pool:member,config}=memberRuntime();
 const environment=config.origin==='https://plunode.net'?'production':'beta';
 const cases=(await member.query(
  `SELECT DISTINCT ON(c.theme_id) c.id,c.theme_id,c.phase,c.status,c.progress,intent.id AS intent_id
   FROM theme_production.cases c
   LEFT JOIN LATERAL (SELECT id FROM theme_production.publication_intents WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) intent ON true
   WHERE c.owner_id=$1 AND c.environment=$2 AND c.origin=$3 AND c.theme_id=ANY($4::text[])
   ORDER BY c.theme_id,(c.status NOT IN ('completed','abandoned')) DESC,c.created_at DESC,c.id DESC`,
  [owner,environment,config.origin,rows.map(r=>r.id)])).rows;
 const intents=cases.filter(c=>c.status==='completed'&&c.intent_id).map(c=>c.intent_id);
 const approvals=new Set(intents.length?(await knowledge.query(
  'SELECT release_id FROM knowledge75.theme_release_approvals WHERE release_id=ANY($1::text[])',[intents])).rows.map(r=>r.release_id):[]);
 return rows.map(row=>{
  const work=cases.find(c=>c.theme_id===row.id);
  const active=work&&work.status!=='abandoned'&&(work.status!=='completed'||!approvals.has(work.intent_id));
  const editing=active||!row.published_revision||row.working_changes||row.current_revision!==row.published_revision;
  const state=work?.status==='abandoned'?'inactive':active&&work.phase==='review'?'review':editing?'production':'published';
  return {...row,state,work};
 });
}
