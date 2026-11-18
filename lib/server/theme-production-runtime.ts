import {knowledgeReleaseBase} from './knowledge-theme-knowledge-update';
import {activateReviewedTheme} from './theme-production-publication';
import {withOperatorThemeRead} from './knowledge-theme-access';
import {themePublicationState} from './knowledge-theme-publication';
import {publicThemeSnapshotTranslations} from './knowledge-display-translations';
import type {Pool} from 'pg';
import type {ProductionSubmissionCommand} from '../domain/theme-production';
import {createThemeAuthoringReader} from './knowledge-theme-authoring-reader';
import {createThemeQualityGuides} from './member/theme-quality-guide';
import {associatedEditorialCatalogue,readEditorialProduct} from './member/product-editorial';
import {themeReadingPresentation} from './theme-reading-presentation';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import type {createThemeRegistrations} from './knowledge-theme-registration';
import type {createThemeTranslationAuthoring} from './knowledge-theme-translation';

export function themeProductionRuntime(pool:Pool,knowledge:Pool,origin:string,registrations:ReturnType<typeof createThemeRegistrations>,translations:ReturnType<typeof createThemeTranslationAuthoring>){
 const reader=createThemeAuthoringReader(knowledge,origin);
 async function targetValue(id:string,owner:string,revision?:number){
  const read=await reader.read(id,revision),guide=await createThemeQualityGuides(pool).read(owner),t=read.theme;
  const products=await Promise.all((t.content.productPins??[]).map(p=>readEditorialProduct(pool,p.id,p.revision)));
  const associated=await associatedEditorialCatalogue(pool,[...read.snapshot.entities.map(v=>({kind:'entity' as const,id:v.id})),...read.snapshot.records.map(v=>({kind:'record' as const,id:v.id}))],{products:[],offers:[],recommendations:[]});
  const associatedPins=(await pool.query('SELECT id,max(revision)::integer AS revision FROM product_editorial_version WHERE id=ANY($1::text[]) GROUP BY id ORDER BY id',[associated.products.map(p=>p.id)])).rows;
  const c=await knowledge.connect();let displayTranslations;try{displayTranslations=await Promise.all(['ja','en'].map(locale=>publicThemeSnapshotTranslations(c,read,locale)));}finally{c.release();}
  const presentation=['ja','en'].map(locale=>themeReadingPresentation(t,locale,read.snapshot));
  const references={theme:{id:t.id,revision:t.revision},translations:read.snapshot.translations?.map(v=>({id:v.id,revision:v.revision})),pinnedProducts:products.map(p=>({id:p.id,revision:p.revision})),associatedProducts:associatedPins};
  return {theme:{id:t.id,revision:t.revision},digest:knowledgeDigest({theme:t,snapshot:read.snapshot,displayTranslations,presentation,products,associated,associatedPins}),guide:{id:guide.id,revision:guide.currentRevision},references};
 }
 const target=(id:string,owner:string,revision?:number)=>withOperatorThemeRead(()=>targetValue(id,owner,revision));
 async function observe(owner:string,command:ProductionSubmissionCommand){
  if(command.action==='submit-theme'||command.action==='update-theme'||command.action==='cancel-theme'){
   let value:Awaited<ReturnType<typeof registrations.status>>;
   try{value=await registrations.status(owner,command.requestId);}catch(e){if(e instanceof KnowledgeError&&e.code==='NOT_FOUND')return null;throw e;}
   const published=value.state==='published'||value.state==='published-with-issues';
   return {state:published&&value.state==='published'&&!value.excludedKeys.length?'applied' as const:['needs-changes','cancelled','published-with-issues'].includes(value.state)?'failed' as const:'pending' as const,result:value,...(value.theme?{theme:{id:value.theme.id,revision:value.theme.revision}}:{})};
  }
  if(command.action==='submit-translation'||command.action==='cancel-translation'){
   try{const value=await translations.status(owner,command.requestId);return {state:value.state==='published'?'applied' as const:['needs-changes','cancelled','published-with-issues'].includes(value.state)?'failed' as const:'pending' as const,result:value};}
   catch(e){if((e instanceof KnowledgeError&&e.status===404)||(e instanceof Error&&'status'in e&&e.status===404))return null;throw e;}
  }
  if(command.action==='save-product'||command.action==='upload-product-image'){
   const r=(await pool.query('SELECT result FROM product_editorial_request WHERE request_id=$1 AND owner_id=$2',[command.requestId,owner])).rows[0];return r?{state:'applied' as const,result:r.result}:null;
  }
  const table=command.action==='amend-theme-items'?'theme_item_amendments':'theme_retry_operations';
  const r=(await pool.query('SELECT response FROM knowledge_missions.'+table+' WHERE request_id=$1 AND owner_id=$2',[command.requestId,owner])).rows[0];return r?{state:'applied' as const,result:r.response}:null;
 }
 return {target,observe,publish:(owner:string,id:string)=>activateReviewedTheme(pool,knowledge,owner,id,{origin,target,authorize:owner=>registrations.authorize(owner)}),publication:async(id:string,intentId?:string)=>{const state=await themePublicationState(knowledge,id);return {...state,knowledgeBaseRevision:state.publishedRevision?await knowledgeReleaseBase(knowledge,id,state.publishedRevision):null,approvalPresent:!!intentId&&!!(await knowledge.query('SELECT 1 FROM knowledge75.theme_release_approvals WHERE release_id=$1 AND theme_id=$2',[intentId,id])).rowCount};}};
}
