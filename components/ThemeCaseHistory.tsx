'use client';

import {useEffect,useState} from 'react';
import {z} from 'zod';
import {MemberClientError,memberRequest} from '../lib/client/member-api';
import {useUiLocale} from '../lib/client/ui-locale';
import {themeProductionListSchema} from '../lib/domain/theme-production';
import {operatorThemeCaseDetailsSchema} from '../lib/domain/theme-operations';
import css from './ThemeProductionOperations.module.css';

type CaseList=z.infer<typeof themeProductionListSchema>;
type CaseDetail=z.infer<typeof operatorThemeCaseDetailsSchema>;
const endpoint='/api/site-operations/theme-cases';
const endedSchema=z.object({outcome:z.literal('abandoned')});
type Translate=(ja:string,en:string)=>string;

function caseStatus(detail:CaseDetail,t:Translate){
 if(detail.status==='abandoned')return t('公開せず終了','Closed without publishing');
 if(detail.status==='completed')return t('見直し完了','Review complete');
 if(detail.publicationConflict)return t('先に公開版との変更点を照合する必要があります。','Reconcile changes with the published edition first.');
 if(detail.status==='needs-review')return t('この案件の公開承認を確認できないため、テーマ全体を改めて見直す必要があります。','This case needs a new whole-theme review because its approval could not be verified.');
 if(detail.publicationPending)return t('承認した版への公開切替を確認しています。','Waiting to confirm the approved edition is live.');
 if(detail.status==='blocked')return detail.progress.blockers.length
  ?t('続行待ち','Blocked') : t('停止中です。停止理由の記録がありません。','Work is blocked. No reason was recorded.');
 if(detail.pendingSubmissionCount)return t(`登録${detail.pendingSubmissionCount}件の反映待ち`,`Waiting on ${detail.pendingSubmissionCount} submissions`);
 if(detail.lease?.valid)return detail.phase==='review'?t('全体を見直し中','Review in progress'):t('原稿を作成中','Drafting in progress');
 if(detail.status==='ready')return detail.phase==='review'?t('全体の見直し待ち','Ready for whole-theme review'):t('制作の着手待ち','Ready to start production');
 if(detail.phase==='review'){
  if(detail.assessment?.current&&detail.assessment.result==='pass')return t('全体評価は合格。承認公開の操作待ちです。','The current review passed. Awaiting the publication step.');
  if(detail.assessment?.current)return t('修正を反映した後、全体の見直しが必要です。','Apply the requested changes, then review the whole theme.');
  return t('全体評価は未記録','No whole-theme assessment recorded');
 }
 return t('次の制作作業待ち','Awaiting further production work');
}

function requestError(error:unknown,t:Translate){
 const code=error instanceof MemberClientError?error.code:'';
 if(code==='PRODUCTION_VERSION_CONFLICT')return t('別の操作で案件が更新されました。一覧の「更新」で読み直してください。','The case changed. Use Refresh above to reload it.');
 if(code==='PRODUCTION_BUSY')return t('別の実行が案件を使用しています。','Another run is working on this case.');
 if(code==='PRODUCTION_PUBLICATION_PENDING'||code==='PRODUCTION_AUTOMATION_PENDING'||code==='PRODUCTION_CASE_TERMINAL')
  return t('公開切替や登録、画像・画面採取の結果を確認してから終了してください。','Confirm the publication, registration, image and preview results before closing.');
 return t('案件を確認できませんでした。一覧の「更新」で再取得できます。','Could not load or update the case. Use Refresh above to retry.');
}

export function ThemeCaseHistory({userId,themeId,currentCaseId,refreshVersion,refresh}:{
 userId:string;themeId:string;currentCaseId:string;refreshVersion:number;refresh:()=>void;
}){
 const {locale}=useUiLocale(),t:Translate=(ja,en)=>locale==='ja'?ja:en;
 const [expanded,setExpanded]=useState(false),[historicalId,setHistoricalId]=useState<string|null>(null);
 const [detail,setDetail]=useState<CaseDetail|null>(null),[caseError,setCaseError]=useState<unknown>(null);
 const [historyOpen,setHistoryOpen]=useState(false),[history,setHistory]=useState<CaseList|null>(null);
 const [historyError,setHistoryError]=useState(false),[loadingHistory,setLoadingHistory]=useState(false);
 const [submissionCursor,setSubmissionCursor]=useState(0),[operationCursor,setOperationCursor]=useState(0);
 const [reason,setReason]=useState(''),[ending,setEnding]=useState(false),[saving,setSaving]=useState(false);
 const [attempt,setAttempt]=useState<{requestId:string;version:number;reason:string}|null>(null);
 const caseId=historicalId??currentCaseId;
 const selected=detail?.id===caseId?detail:null;
 const format=(at:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(at));

 useEffect(()=>{
  if(!expanded)return;
  const abort=new AbortController();
  memberRequest(endpoint+'?'+new URLSearchParams({caseId,includeCaseContext:'1',submissionCursor:String(submissionCursor),operationCursor:String(operationCursor)}),operatorThemeCaseDetailsSchema,{user:userId,signal:abort.signal})
   .then(result=>{if(!abort.signal.aborted){setDetail(result);setCaseError(null);}})
   .catch(error=>{if(!abort.signal.aborted)setCaseError(error);});
  return ()=>abort.abort();
 },[expanded,caseId,userId,refreshVersion,submissionCursor,operationCursor]);

 useEffect(()=>{
  if(!expanded||!historyOpen)return;
  const abort=new AbortController();
  memberRequest(endpoint+'?'+new URLSearchParams({themeId}),themeProductionListSchema,{user:userId,signal:abort.signal})
   .then(result=>{if(!abort.signal.aborted){setHistory(result);setHistoryError(false);}})
   .catch(()=>{if(!abort.signal.aborted)setHistoryError(true);});
  return ()=>abort.abort();
 },[expanded,historyOpen,themeId,userId,refreshVersion]);

 function selectCase(id:string|null){
  setHistoricalId(id);setSubmissionCursor(0);setOperationCursor(0);setCaseError(null);
  setEnding(false);setReason('');setAttempt(null);
 }

 async function moreHistory(){
  if(!history||history.nextCursor===null||loadingHistory)return;
  setLoadingHistory(true);
  try{
   const next=await memberRequest(endpoint+'?'+new URLSearchParams({themeId,cursor:String(history.nextCursor)}),themeProductionListSchema,{user:userId});
   setHistory({...next,items:[...history.items,...next.items]});setHistoryError(false);
  }catch{setHistoryError(true);}finally{setLoadingHistory(false);}
 }

 async function abandon(){
  if(!selected||!reason.trim()||saving)return;
  const text=reason.trim();
  const body=attempt?.version===selected.version&&attempt.reason===text?attempt:{requestId:crypto.randomUUID(),version:selected.version,reason:text};
  setAttempt(body);setSaving(true);setCaseError(null);
  try{
   await memberRequest(endpoint,endedSchema,{
    user:userId,method:'POST',body:{caseId:selected.id,requestId:body.requestId,expectedVersion:body.version,reason:text},
   });
   selectCase(null);refresh();
  }catch(error){setCaseError(error);}finally{setSaving(false);}
 }

 const canEnd=selected&&selected.status!=='completed'&&selected.status!=='abandoned'&&
  !selected.lease?.valid&&!selected.publicationPending&&!selected.pendingSubmissionCount;
 const older=history?.items.filter(row=>row.id!==currentCaseId);
 return <details className={css.caseDisclosure} onToggle={event=>setExpanded(event.currentTarget.open)}>
  <summary>{t('案件の内容','Case details')}</summary>
  <div className={css.caseBody}>
   {caseError!=null&&<p role="alert" className={css.problem}>{requestError(caseError,t)}</p>}
   {!selected&&caseError==null&&<p role="status">{t('案件を読み込んでいます…','Loading case…')}</p>}
   {historicalId&&<button className={css.quietButton} onClick={()=>selectCase(null)}>{t('現在の案件に戻る','Back to current case')}</button>}
   {selected&&<>
    <div className={css.caseHeader}>
     <p className={css.caseStatus}>{caseStatus(selected,t)}</p>
     <p className={css.caseMeta}>{selected.workflow==='manual'?t('個別案件','Individual case'):t('定期制作','Scheduled production')} <span aria-hidden="true">·</span> {t('更新','Updated')} {format(selected.updatedAt)}</p>
    </div>
    <p className={css.caseBrief}>{selected.progress.brief}</p>
    {selected.progress.scope.trim()&&selected.progress.scope.trim()!==selected.progress.brief.trim()&&<p className={css.caseScope}>{selected.progress.scope}</p>}
    {selected.status==='abandoned'&&selected.abandonReason&&<p className={css.caseScope}>{selected.abandonReason}</p>}
    {selected.progress.blockers.length>0&&<section className={css.caseBlockers}>
     <h3>{t('続行に必要なこと','What is blocking progress')}</h3>
     <ul>{selected.progress.blockers.map((note,i)=><li key={i}>{note}</li>)}</ul>
    </section>}
    {selected.progress.unfinished.length>0&&<section className={css.caseNotes}>
     <h3>{t('残作業','Remaining work')}</h3>
     <ul>{selected.progress.unfinished.map((note,i)=><li key={i}>{note}</li>)}</ul>
    </section>}
    {selected.assessment&&<section className={css.caseNotes}>
     <h3>{selected.assessment.current?t('全体評価','Whole-theme assessment'):t('前回の全体評価','Previous whole-theme assessment')}</h3>
     <p>{selected.assessment.result==='pass'?t('合格','Passed'):t('要修正','Needs changes')} <span aria-hidden="true">·</span> {format(selected.assessment.evaluatedAt)}</p>
     {selected.assessment.summary.length>280||selected.assessment.summary.split('\n').length>4
      ?<details className={css.secondaryDisclosure}>
       <summary>{t('評価コメント全文','Full assessment comments')}</summary>
       <div className={css.secondaryBody}><p className={css.assessmentText}>{selected.assessment.summary}</p></div>
      </details>
      :<p className={css.assessmentText}>{selected.assessment.summary}</p>}
    </section>}
    <details className={css.secondaryDisclosure}>
     <summary>{t('技術情報・操作履歴','Technical details and operation history')}</summary>
     <div className={css.secondaryBody}>
      <dl className={css.technical}>
       <dt>{t('案件ID','Case ID')}</dt><dd><code>{selected.id}</code></dd>
       <dt>{t('案件版','Case version')}</dt><dd>{selected.version}</dd>
       {selected.lease?.valid&&<><dt>{t('実行権の期限','Lease expires')}</dt><dd>{format(selected.lease.until)}</dd></>}
      </dl>
      {selected.submissions.length>0&&<><h3>{t('登録受付履歴','Submission history')}</h3>
       <ul>{selected.submissions.map(row=><li key={row.id}>{row.action} · {row.state}{row.reason&&(' · '+row.reason)} · <code>{row.id}</code></li>)}</ul></>}
      {selected.nextSubmissionCursor!==null&&<button className={css.quietButton} onClick={()=>setSubmissionCursor(selected.nextSubmissionCursor!)}>{t('次の登録受付','Next submissions')}</button>}
      {!!selected.operationHistory?.items.length&&<><h3>{t('操作履歴','Operation history')}</h3>
       <ul>{selected.operationHistory.items.map(row=><li key={row.requestId}>{format(row.at)} · {row.outcome} · <code>{row.requestId}</code></li>)}</ul></>}
      {selected.operationHistory?.nextCursor!=null&&<button className={css.quietButton} onClick={()=>setOperationCursor(selected.operationHistory!.nextCursor!)}>{t('次の操作履歴','Next operations')}</button>}
     </div>
    </details>
    {canEnd&&<details className={css.secondaryDisclosure} onToggle={event=>{if(!event.currentTarget.open)setEnding(false);}}>
     <summary>{t('案件の終了','Close this case')}</summary>
     <div className={css.secondaryBody}>
      {!ending&&<button onClick={()=>setEnding(true)}>{t('公開せずに終了する','Close without publishing')}</button>}
      {ending&&<form className={css.endForm} onSubmit={e=>{e.preventDefault();void abandon();}}>
       <label>{t('終了理由','Closure reason')}<textarea required maxLength={2000} value={reason} onChange={e=>{setReason(e.target.value);setAttempt(null);}}/></label>
       <p>{t('公開版・作業版・履歴は保持されます。','The published edition, draft and history are kept.')}</p>
       <div><button type="submit" disabled={!reason.trim()||saving}>{t('終了を確定','Confirm closure')}</button>
        <button type="button" disabled={saving} onClick={()=>setEnding(false)}>{t('戻る','Back')}</button></div>
      </form>}
     </div>
    </details>}
   </>}
   <details className={css.secondaryDisclosure} onToggle={event=>setHistoryOpen(event.currentTarget.open)}>
    <summary>{t('過去の案件','Case history')}</summary>
    <div className={css.secondaryBody}>
     {historyError&&<p role="alert" className={css.problem}>{requestError(null,t)}</p>}
     {history===null&&!historyError&&<p role="status">{t('履歴を読み込んでいます…','Loading case history…')}</p>}
     {older?.length===0&&history?.nextCursor===null&&<p>{t('過去の案件はありません。','No earlier cases.')}</p>}
     <ul className={css.earlierCases}>{older?.map(row=><li key={row.id}>
      <button className={css.quietButton} aria-pressed={row.id===historicalId} onClick={()=>selectCase(row.id)}>
       {format(row.updatedAt)} <span aria-hidden="true">·</span> {row.phase==='review'?t('見直し','Review'):t('制作','Production')}
      </button>
      {(row.abandonReason||row.blockers[0]||row.unfinished[0])&&<p>{row.abandonReason||row.blockers[0]||row.unfinished[0]}</p>}
     </li>)}</ul>
     {history?.nextCursor!=null&&<button disabled={loadingHistory} className={css.quietButton} onClick={()=>void moreHistory()}>{t('さらに案件を表示','More cases')}</button>}
    </div>
   </details>
  </div>
 </details>;
}
