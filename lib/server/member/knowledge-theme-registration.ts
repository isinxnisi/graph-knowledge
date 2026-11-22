import {themeAutomationActions} from '../../domain/theme-automation';
import {diagnosticError,themeAutomationEnabled,themeDiagnostic} from '../theme-automation-diagnostics';
import {publishOrdinaryTheme} from '../knowledge-theme-operator-publication';
import {withOperatorThemeRead} from '../knowledge-theme-access';
import {themePublicationState} from '../knowledge-theme-publication';
import {checkThemePublication} from '../theme-publication-check';
import {themeLocaleTitle} from '../theme-locale-publication';
import {hasThemeLocale} from '../../domain/theme-locale';
import {knowledgeDisplayText} from '../../domain/knowledge-display';
import {knowledgePublicationPreview} from '../knowledge-publication-preview';
import {themeProductionCommandSchema,type ThemeOperatorCommand} from '../../domain/theme-production';
import {createThemeProductions} from '../theme-production';
import {themeProductionRuntime} from '../theme-production-runtime';
import {guardThemeProductionRequest} from '../theme-production-fence';
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
import {themeRegistrationCommandSchema} from '../../domain/knowledge-theme-registration';
import {createKnowledgeImports} from '../knowledge-import';
import {resolveImportPrincipal} from '../knowledge-import-runtime';
import {knowledgeReadConfiguration} from '../knowledge-read-runtime';
import {createWebKnowledgeImports} from '../knowledge-web-import';
import {createThemeRegistrations} from '../knowledge-theme-registration';
import {knowledgeCapability} from '../knowledge-deployment';
import {KnowledgeError} from '../knowledge-foundation';
import {memberRuntime} from './runtime';

let knowledgePool:Pool|undefined;
let registration:ReturnType<typeof createThemeRegistrations>|undefined;
let reader:ReturnType<typeof createThemeAuthoringReader>|undefined;
let translations:ReturnType<typeof createThemeTranslationAuthoring>|undefined;
export function themeRegistrationEnabled(){return process.env.KNOWLEDGE_THEME_REGISTRATION_ENABLED==='1';}
export async function dispatchThemeRegistration(owner:string,raw:ThemeOperatorCommand):Promise<unknown>{
 if(!themeRegistrationEnabled()||!knowledgeCapability('operator')||!knowledgeCapability('missions'))throw new KnowledgeError('この接続ではテーマを作成・更新できません。',404,'NOT_FOUND');
 if(!registration){const {pool,config}=memberRuntime(),knowledge=new Pool({connectionString:knowledgeReadConfiguration().databaseUrl,max:2});knowledgePool=knowledge;const imports=createKnowledgeImports(pool,knowledge,(id,c)=>resolveImportPrincipal(pool,id,c));registration=createThemeRegistrations(pool,knowledge,createWebKnowledgeImports(pool,()=>imports),imports);reader=createThemeAuthoringReader(knowledge,config.origin);translations=createThemeTranslationAuthoring(pool,knowledge,config.origin,owner=>registration!.authorize(owner));}
 try{
  await registration.authorize(owner);
  return await withOperatorThemeRead(async()=>{
  const production=themeProductionCommandSchema.safeParse(raw);
  const automation=themeAutomationActions.safeParse(raw);
  if(production.success||automation.success){
   const {pool,config}=memberRuntime(),runtime=themeProductionRuntime(pool,knowledgePool!,config.origin,registration!,translations!);
   const service=createThemeProductions(pool,{environment:config.origin==='https://plunode.net'?'production':'beta',origin:config.origin,authorize:id=>registration!.authorize(id),...runtime,send:(id,value)=>dispatchThemeRegistration(id,value)});
   if(automation.success)return service.executeAutomation(owner,automation.data);
   if(production.success)return service.execute(owner,production.data);
  }
  const command=themeRegistrationCommandSchema.parse(raw);
  if(['submit-theme','update-theme','submit-translation','amend-theme-items','control-theme-retry','save-product','upload-product-image','upload-editorial-image','cancel-theme','cancel-translation'].includes(command.action))await guardThemeProductionRequest(memberRuntime().pool,owner,command);
  if(command.action==='upload-editorial-image'){
   const {file,purpose,action,...metadata}=command;void action;
   const {pool,config}=memberRuntime();
   let failureStage:'download'|'storage'='download';
   try{
    if(themeAutomationEnabled())await themeDiagnostic(pool,config.origin,{stage:'attachment-download',code:'STARTED',requestId:metadata.requestId}).catch(()=>{});
    const bytes=await downloadEditorialFile(file.download_url);
    failureStage='storage';
    const result=await dispatchProductAuthoring(pool,owner,{action:'upload-product-image',...metadata,role:purpose==='product-photo'?'product-photo':'illustration',base64:bytes.toString('base64')});
    if(config.origin==='https://plunode.net')console.info('Editorial image MCP stored',{requestId:metadata.requestId});
    if(themeAutomationEnabled())await themeDiagnostic(pool,config.origin,{stage:'attachment-storage',code:'STORED',requestId:metadata.requestId}).catch(()=>{});
    return result;
   }catch(error){
    if(config.origin==='https://plunode.net')console.warn('Editorial image MCP rejected',{requestId:metadata.requestId,failureStage,code:error instanceof KnowledgeError?error.code:'INTERNAL'});
    if(themeAutomationEnabled())await themeDiagnostic(pool,config.origin,{stage:'attachment-'+failureStage,code:diagnosticError(error,'INTERNAL'),requestId:metadata.requestId}).catch(()=>{});
    throw error;
   }
  }
  if(command.action==="upload-product-image"||command.action==="save-product"||command.action==="read-product"||command.action==="find-products")return await dispatchProductAuthoring(memberRuntime().pool,owner,command);
  if(command.action==='read-translation'){const {action,...input}=command;void action;return await translations!.read(owner,input);}
  if(command.action==='submit-translation'){const {action,...input}=command;void action;return await translations!.submit(owner,input);}
  if(command.action==='translation-status')return await translations!.status(owner,command.requestId);
  if(command.action==='cancel-translation')return await translations!.cancel(owner,command.requestId);
  if(command.action==='theme-guide')return {...themeAuthoringGuide(),qualityGuide:await createThemeQualityGuides(memberRuntime().pool).read(owner),qualityGuideOperations:{workRead:'read_theme_work_guide',workUpdate:'update_theme_work_guide',read:'read_theme_quality_guide',update:'update_theme_quality_guide',rules:'Fetch the current guide at the start of theme authoring. Markdown is editable reference content, not executable schema or authorization. Use expectedRevision and a new requestId for each requested revision; retry identical input with the same requestId. Read historical revisions and restore them as a new revision, never overwrite history. No build, deployment or App refresh is needed for ordinary text revisions.'}};
  if(command.action==='read-work-guide'){
   const {action,...input}=command;void action;
   const {pool,config}=memberRuntime();
   return createThemeQualityGuides(pool).readWork(owner,config.origin,input);
  }
  if(command.action==='update-work-guide'){
   const {action,...input}=command;void action;
   return createThemeQualityGuides(memberRuntime().pool).updateWork(owner,input);
  }
  if(command.action==='read-quality-guide'){const {action,...input}=command;void action;return await createThemeQualityGuides(memberRuntime().pool).read(owner,input);}
  if(command.action==='update-quality-guide'){const {action,...input}=command;void action;return await createThemeQualityGuides(memberRuntime().pool).update(owner,input);}
  if(command.action==='find-themes')return await reader!.find('theme',command.query,command.cursor);
  if(command.action==='publish-theme'){
   const {action,...input}=command;void action;
   return publishOrdinaryTheme(memberRuntime().pool,knowledgePool!,owner,input,id=>registration!.authorize(id));
  }
  if(command.action==='check-theme-publication'){
   const original=await reader!.read(command.theme,undefined,command.view),service=await knowledgePublicationPreview(),origin=memberRuntime().config.origin;
   if(!['https://plunode.net','https://graph-beta.isinxnisi.com'].includes(origin))throw new KnowledgeError('正規公開originの接続で確認してください。',400,'INVALID_ORIGIN');
   if(command.expectedRevision&&original.theme.revision!==command.expectedRevision)throw new KnowledgeError('対象テーマが更新されました。現在版を読み直してください。',409,'REVISION_CONFLICT');
   const publication=await themePublicationState(knowledgePool!,original.theme.id);
   if(command.view!=='published'&&(publication.state==='private'||publication.workingChanges||publication.publishedRevision!==original.theme.revision))return {state:publication.state==='private'?'private':'working-private',publication,previewUrl:origin+'/operations/themes/'+encodeURIComponent(original.theme.id),message:'運営者プレビューで独立した全体見直しを完了してください。登録済みは一般公開済みを意味しません。'};
   const expectations=await Promise.all([...new Set(command.languages)].map(async language=>{
    const value=await service.theme({themeId:original.theme.id,language},{localeEdition:true});
    if(!hasThemeLocale(value,language))throw new KnowledgeError('指定言語の本文はまだ公開準備中です。',409,'LOCALE_NOT_READY');
    const t=value.theme,p=value.presentation,first=value.snapshot.records.find(r=>r.content.times.length)??value.snapshot.records[0];
    return {id:t.id,language,title:themeLocaleTitle(value,language),bodyText:p?.lead||knowledgeDisplayText(value.displayTranslations,{kind:'theme',id:t.id,revision:t.revision,field:'description'},language,t.content.description)||p?.records.find(r=>r.target.id===first?.id)?.shortTitle||(first?knowledgeDisplayText(value.displayTranslations,{kind:'record',id:first.id,revision:first.revision,field:'assertion'},language,first.content.assertion):''),servedRevision:t.revision,latestRevision:value.localeEdition?.latestRevision??t.revision};
   }));
   const result=await checkThemePublication(origin,expectations);
   if(command.view==='published'){
    const after=await themePublicationState(knowledgePool!,original.theme.id);
    if(after.publishedRevision!==original.theme.revision||after.releaseId!==publication.releaseId)throw new KnowledgeError('公開版が更新されました。提供内容を再確認してください。',409,'THEME_PUBLICATION_CONFLICT');
   }
   return result;
  }
  if(command.action==='read-theme'){
   const result=await reader!.read(command.theme,command.revision,command.view);
   return {...result,presentation:result.theme.content.reading??['ja','en'].map(locale=>themeReadingPresentation(result.theme,locale,result.snapshot)).filter(Boolean),products:await Promise.all((result.theme.content.productPins??[]).map(pin=>readEditorialProduct(memberRuntime().pool,pin.id,pin.revision)))};
  }
  if(command.action==='find-knowledge')return await reader!.find(command.kind,command.query,command.cursor);
  if(command.action==='read-knowledge')return await reader!.knowledge(command.kind,command.id,command.revision);
  if(command.action==='theme-retry-status')return await registration!.retryStatus(owner,command.registrationRequestId,command.itemKey);
  if(command.action==='control-theme-retry'){const {action,...input}=command;void action;return await registration!.controlRetry(owner,input);}
  if(command.action==='theme-status')return await registration!.status(owner,command.requestId,command);
  if(command.action==='amend-theme-items'){const {action,...input}=command;void action;return await registration!.amend(owner,input);}
  if(command.action==='cancel-theme')return await registration!.cancel(owner,command.requestId);
  const {action,...input}=command;void action;
  return await registration!.submit(owner,input);
  });
 }catch(e){
  if(e instanceof MemberError)return {ok:false,code:e.code,message:'このアカウントでは操作できません。接続とログインを確認してください。',retryable:false};
  if(e instanceof KnowledgeError)return {ok:false,code:e.code,message:e.message,retryable:e.status>=500||e.status===429};
  if(e instanceof z.ZodError)return {ok:false,code:'INVALID_ARGUMENT',message:'登録・更新する項目の形式を確認してください。get_theme_authoring_guideで正確な入力仕様を取得できます。',fields:e.issues.map(i=>i.path.join('.'))};
  throw e;
 }
}
