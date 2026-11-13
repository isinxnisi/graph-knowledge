import {createThemeQualityGuides} from './theme-quality-guide';
import {themeReadingPresentation} from '../theme-reading-presentation';
import {downloadEditorialFile} from '../editorial-file-download';
import {Pool} from 'pg';
import {dispatchProductAuthoring,readEditorialProduct} from './product-editorial';
import {MemberError} from './http';
import {createThemeTranslationAuthoring} from '../knowledge-theme-translation';
import {z} from 'zod';
import {themeAuthoringGuide} from '../knowledge-theme-authoring-guide';
import {createThemeAuthoringReader} from '../knowledge-theme-authoring-reader';
import {themeRegistrationCommandSchema,type ThemeRegistrationCommand} from '../../domain/knowledge-theme-registration';
import {createKnowledgeImports} from '../knowledge-import';
import {resolveImportPrincipal} from '../knowledge-import-runtime';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {createWebKnowledgeImports} from '../knowledge-web-import';
import {createThemeRegistrations} from '../knowledge-theme-registration';
import {knowledgeCapability} from '../knowledge-deployment';
import {KnowledgeError} from '../knowledge-foundation';
import {memberRuntime} from './runtime';

let registration:ReturnType<typeof createThemeRegistrations>|undefined;
let reader:ReturnType<typeof createThemeAuthoringReader>|undefined;
let translations:ReturnType<typeof createThemeTranslationAuthoring>|undefined;
export function themeRegistrationEnabled(){return process.env.KNOWLEDGE_THEME_REGISTRATION_ENABLED==='1';}
export async function dispatchThemeRegistration(owner:string,raw:ThemeRegistrationCommand){
 if(!themeRegistrationEnabled()||!knowledgeCapability('operator')||!knowledgeCapability('missions'))throw new KnowledgeError('この接続ではテーマを作成・更新できません。',404,'NOT_FOUND');
 if(!registration){const {pool,config}=memberRuntime(),knowledge=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2});const imports=createKnowledgeImports(pool,knowledge,(id,c)=>resolveImportPrincipal(pool,id,c));registration=createThemeRegistrations(pool,knowledge,createWebKnowledgeImports(pool,()=>imports),imports);reader=createThemeAuthoringReader(knowledge,config.origin);translations=createThemeTranslationAuthoring(pool,knowledge,config.origin,owner=>registration!.authorize(owner));}
 try{
  const command=themeRegistrationCommandSchema.parse(raw);
  await registration.authorize(owner);
  if(command.action==='upload-editorial-image'){
   const {file,purpose,action,...metadata}=command;void action;
   const bytes=await downloadEditorialFile(file.download_url);
   return await dispatchProductAuthoring(memberRuntime().pool,owner,{action:'upload-product-image',...metadata,role:purpose==='product-photo'?'product-photo':'illustration',base64:bytes.toString('base64')});
  }
  if(command.action==="upload-product-image"||command.action==="save-product"||command.action==="read-product"||command.action==="find-products")return await dispatchProductAuthoring(memberRuntime().pool,owner,command);
  if(command.action==='read-translation'){const {action,...input}=command;void action;return await translations!.read(owner,input);}
  if(command.action==='submit-translation'){const {action,...input}=command;void action;return await translations!.submit(owner,input);}
  if(command.action==='translation-status')return await translations!.status(owner,command.requestId);
  if(command.action==='cancel-translation')return await translations!.cancel(owner,command.requestId);
  if(command.action==='theme-guide')return {...themeAuthoringGuide(),qualityGuide:await createThemeQualityGuides(memberRuntime().pool).read(owner),qualityGuideOperations:{read:'read_theme_quality_guide',update:'update_theme_quality_guide',rules:'Fetch the current guide at the start of theme authoring. Markdown is editable reference content, not executable schema or authorization. Use expectedRevision and a new requestId for each requested revision; retry identical input with the same requestId. Read historical revisions and restore them as a new revision, never overwrite history. No build, deployment or App refresh is needed for ordinary text revisions.'}};
  if(command.action==='read-quality-guide'){const {action,...input}=command;void action;return await createThemeQualityGuides(memberRuntime().pool).read(owner,input);}
  if(command.action==='update-quality-guide'){const {action,...input}=command;void action;return await createThemeQualityGuides(memberRuntime().pool).update(owner,input);}
  if(command.action==='find-themes')return await reader!.find('theme',command.query,command.cursor);
  if(command.action==='read-theme'){
   const result=await reader!.read(command.theme,command.revision);
   return {...result,presentation:result.theme.content.reading??['ja','en'].map(locale=>themeReadingPresentation(result.theme,locale,result.snapshot)).filter(Boolean),products:await Promise.all((result.theme.content.productPins??[]).map(pin=>readEditorialProduct(memberRuntime().pool,pin.id,pin.revision)))};
  }
  if(command.action==='find-knowledge')return await reader!.find(command.kind,command.query,command.cursor);
  if(command.action==='read-knowledge')return await reader!.knowledge(command.kind,command.id,command.revision);
  if(command.action==='theme-status')return await registration.status(owner,command.requestId,command);
  if(command.action==='amend-theme-items'){const {action,...input}=command;void action;return await registration.amend(owner,input);}
  if(command.action==='cancel-theme')return await registration.cancel(owner,command.requestId);
  const {action,...input}=command;void action;
  return await registration.submit(owner,input);
 }catch(e){
  if(e instanceof MemberError)return {ok:false,code:e.code,message:'このアカウントでは操作できません。接続とログインを確認してください。',retryable:false};
  if(e instanceof KnowledgeError)return {ok:false,code:e.code,message:e.message,retryable:e.status>=500||e.status===429};
  if(e instanceof z.ZodError)return {ok:false,code:'INVALID_ARGUMENT',message:'登録・更新する項目の形式を確認してください。get_theme_authoring_guideで正確な入力仕様を取得できます。',fields:e.issues.map(i=>i.path.join('.'))};
  throw e;
 }
}
