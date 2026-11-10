import {Pool} from 'pg';
import {dispatchProductAuthoring} from './product-editorial';
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
  if(command.action==="upload-product-image"||command.action==="save-product"||command.action==="read-product")return await dispatchProductAuthoring(memberRuntime().pool,owner,command);
  if(command.action==='read-translation'){const {action,...input}=command;void action;return await translations!.read(owner,input);}
  if(command.action==='submit-translation'){const {action,...input}=command;void action;return await translations!.submit(owner,input);}
  if(command.action==='translation-status')return await translations!.status(owner,command.requestId);
  if(command.action==='cancel-translation')return await translations!.cancel(owner,command.requestId);
  if(command.action==='theme-guide')return themeAuthoringGuide();
  if(command.action==='find-themes')return await reader!.find('theme',command.query,command.cursor);
  if(command.action==='read-theme')return await reader!.read(command.theme,command.revision);
  if(command.action==='find-knowledge')return await reader!.find(command.kind,command.query,command.cursor);
  if(command.action==='read-knowledge')return await reader!.knowledge(command.kind,command.id,command.revision);
  if(command.action==='theme-status')return await registration.status(owner,command.requestId);
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
