import type {Pool} from 'pg';
import {readThemeTranslationSchema,submitThemeTranslationSchema,type SubmitThemeTranslation,type ReadThemeTranslation} from '../domain/knowledge-theme-translation';
import {knowledgeSubmissionContentSchema,type KnowledgeSubmissionContext} from '../domain/knowledge-submission';
import {PUBLICATION_CONSENT_VERSION} from '../domain/knowledge-review-job';
import {submissionIntentIssues} from '../domain/knowledge-submission-intent';
import type {KnowledgePin} from '../domain/knowledge-foundation';
import {translationTextLimit,type KnowledgeTextTarget} from '../domain/knowledge-translation';
import {createKnowledgeSubmissionService} from './knowledge-submissions';
import {createReviewQueue,reviewEnabledFor} from './knowledge-review-queue';
import {ensureAcceptanceSchema} from './knowledge-acceptance';
import {createThemeAuthoringReader} from './knowledge-theme-authoring-reader';
import {readTranslationGenerationInput} from './knowledge-translation-context';
import {readKnowledgeTranslation,knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {knowledgeCapability,knowledgePublishingEnabled} from './knowledge-deployment';

/** Disjoint stable IDs resume the existing capture -> submit -> review ledger.
 * They do not grant access: every step still authorizes its authenticated owner. */
export function themeTranslationOperationId(owner:string,requestId:string,step:string){
 const h=knowledgeDigest(['chat-theme-translation-v1',owner,requestId,step]).slice(0,32).split('');h[12]='4';h[16]='8';const s=h.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export function themeTranslationCapture(owner:string,input:SubmitThemeTranslation){
 const content=knowledgeSubmissionContentSchema.parse({schemaVersion:2,attribution:input.attribution,title:'翻訳 · '+input.translation.text.slice(0,150),
  items:[{key:'translation',operation:'translate-text',translation:input.translation,about:{kind:'theme',...input.theme},record:{kind:'note',assertion:'',evidence:[]}}]});
 return {action:'capture-selection' as const,requestId:themeTranslationOperationId(owner,input.requestId,'capture'),id:themeTranslationOperationId(owner,input.requestId,'submission'),expectedVersion:0 as const,
  context:{dataset:'public-kg' as const,entityIds:[],claimIds:[],entityPins:[],recordPins:[],themePin:input.theme},content};
}

/** Only public, pinned Theme contents. Uses the existing member translation
 * queue, attribution, notifications and budget; never edits an original/Theme. */
export function createThemeTranslationAuthoring(pool:Pool,knowledge:Pool,origin:string,authorize:(owner:string)=>Promise<void>,options:{afterCapture?:()=>Promise<void>}={}){
 const reader=createThemeAuthoringReader(knowledge,origin),store=createKnowledgeSubmissionService(pool,{memberStore:true,dataset:'public-kg'}),reviews=createReviewQueue(pool);
 let ready:Promise<void>|undefined;
 async function allowed(owner:string){
  await authorize(owner);
  if(!knowledgeCapability('translation')||!knowledgeCapability('submissions')||!knowledgePublishingEnabled()||!reviewEnabledFor(owner))throw new KnowledgeError('この接続では訳文を投稿できません。',404,'NOT_FOUND');
  await (ready??=ensureAcceptanceSchema(pool).catch(e=>{ready=undefined;throw e;}));
 }
 async function member(theme:KnowledgePin,target:KnowledgeTextTarget){
  const value=await reader.read(theme.id,theme.revision);
  const values=target.kind==='theme'?[value.theme]:target.kind==='entity'?value.snapshot.entities:target.kind==='source'?value.snapshot.sources:value.snapshot.records;
  if(!values.some(v=>v.id===target.id&&v.revision===target.revision))throw new KnowledgeError('翻訳対象は、読み取ったテーマに含まれる同じ公開内容版を指定してください。',400,'THEME_MEMBER_REQUIRED');
  return value.theme;
 }
 async function read(owner:string,raw:ReadThemeTranslation){
  await allowed(owner);const input=readThemeTranslationSchema.parse(raw);await member(input.theme,input.target);
  const c=await knowledge.connect();try{const value=await readKnowledgeTranslation(c,input.target,input.language,input.revision);return {...value,target:input.target,language:input.language,expectedRevision:value.translation?.revision??0,textLimit:translationTextLimit(input.target)};}finally{c.release();}
 }
 async function response(owner:string,requestId:string){
  const value=await store.get(owner,themeTranslationOperationId(owner,requestId,'submission'));
  const item=value.content.items[0],theme=item.about;
  if(item.operation!=='translate-text'||theme?.kind!=='theme')throw new KnowledgeError('訳文の受付がありません。',404,'NOT_FOUND');
  await reader.read(theme.id,theme.revision);
  const states=value.review?.items.map(v=>v.state)??[];
  const state=value.state==='cancelled'?'cancelled':states.length&&states.every(s=>s==='published')?'published':states.some(s=>['needs-changes','declined'].includes(s))?'needs-changes':states.length?'processing':'saved';
  return {requestId,submissionId:value.id,state,theme:{id:theme.id,revision:theme.revision},target:item.translation!.target,language:item.translation!.language,review:value.review??null,
   reason:state==='saved'?'送信は未完了です。同じrequestIdと内容でsubmit_theme_translationを再送すると続きから処理します。':state==='published'?'訳文を公開しました。原文・テーマの内容版と保存済みCapsuleは保持しています。':'確認結果と待ち理由はreview.itemsで確認できます。'};
 }
 async function submit(owner:string,raw:SubmitThemeTranslation){
  await allowed(owner);const input=submitThemeTranslationSchema.parse(raw),command=themeTranslationCapture(owner,input);
  const theme=await member(input.theme,input.translation.target);
  let captured=await store.replay(owner,command.requestId,knowledgeDigest(command));
  if(!captured){
   const c=await knowledge.connect();let context:KnowledgeSubmissionContext;
   try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const original=await readTranslationGenerationInput(c,input.translation.target),current=await readKnowledgeTranslation(c,input.translation.target,input.translation.language);
    if((current.translation?.revision??0)!==input.translation.expectedRevision)throw new KnowledgeError('訳文が更新されています。read_theme_translationで最新版を確認してください。',409,'TRANSLATION_CONFLICT');
    context={entities:[],sources:[],records:[],themes:[theme],texts:[{target:original.target,text:original.text,hash:original.hash,language:original.language,content:original.content,reviewContext:original.context,reviewContextHash:original.contextHash,reviewReferences:original.references,translation:current.translation}]};
    const issues=submissionIntentIssues(command.content,context);if(issues.length)throw new KnowledgeError(issues.join(' '),400,'INVALID_TRANSLATION');
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   captured=await store.execute(owner,command,{content:command.content,captured:context});
  }
  await options.afterCapture?.();
  if((await store.get(owner,captured.id)).state==='cancelled')return response(owner,input.requestId);
  // Immutable step responses cannot submit a later user edit or revive a cancel.
  const queued=await store.execute(owner,{action:'submit',requestId:themeTranslationOperationId(owner,input.requestId,'submit'),id:captured.id,expectedVersion:captured.version});
  await reviews.authorize(owner,{action:'review',requestId:themeTranslationOperationId(owner,input.requestId,'review'),id:queued.id,expectedVersion:queued.version,consentVersion:PUBLICATION_CONSENT_VERSION});
  return response(owner,input.requestId);
 }
 async function cancel(owner:string,requestId:string){
  await allowed(owner);await response(owner,requestId);const id=themeTranslationOperationId(owner,requestId,'submission'),current=await store.get(owner,id);
  if(current.review?.items.length&&current.review.items.every(i=>i.state==='published'))return {...await response(owner,requestId),reason:'既に公開済みの訳文を取り消し・削除していません。訂正は最新の訳文版を確認して別のrequestIdで送れます。'};
  if(current.state!=='cancelled')await store.execute(owner,{action:'cancel',requestId:themeTranslationOperationId(owner,requestId,'cancel'),id,expectedVersion:current.version});
  return response(owner,requestId);
 }
 return {read,submit,status:async(owner:string,requestId:string)=>{await allowed(owner);return response(owner,requestId);},cancel};
}
