'use client';

import {useState} from 'react';
import {z} from 'zod';
import {memberRequest,MemberClientError} from '../lib/client/member-api';
import {useUiLocale} from '../lib/client/ui-locale';
import {themeProductionListSchema} from '../lib/domain/theme-production';
import {operatorThemeCaseDetailsSchema} from '../lib/domain/theme-operations';
import css from './ThemeProductionOperations.module.css';

type Cases=z.infer<typeof themeProductionListSchema>;
type Case=Cases['items'][number];
type Details=z.infer<typeof operatorThemeCaseDetailsSchema>;
const endpoint='/api/site-operations/theme-cases';
const endedSchema=z.object({outcome:z.literal('abandoned')});

export function ThemeCaseHistory({userId,themeId,currentCaseId,refresh}:{userId:string;themeId:string;currentCaseId:string;refresh:()=>void}){
 const {locale}=useUiLocale(),t=(ja:string,en:string)=>locale==='ja'?ja:en;
 const [cases,setCases]=useState<Cases|null>(null),[selected,setSelected]=useState<Case|null>(null);
 const [detail,setDetail]=useState<Details|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reason,setReason]=useState(''),[confirmEnding,setConfirmEnding]=useState(false);
 const [abandonId,setAbandonId]=useState<string|null>(null);
 const format=(at:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(at));
 const states:Record<Case['status'],string>={
  ready:t('着手待ち','Ready'),working:t('作業中','Working'),'waiting-publication':t('反映確認待ち','Awaiting confirmation'),
  blocked:t('停止中','Blocked'),completed:t('完了','Completed'),'needs-review':t('要再評価','Needs review'),abandoned:t('公開せず終了','Closed without publishing'),
 };
 function problem(error:unknown){
  if(error instanceof MemberClientError){
   if(error.code==='PRODUCTION_VERSION_CONFLICT')return t('案件が更新されました。詳細を読み直してください。','The case changed. Reload details.');
   if(error.code==='PRODUCTION_BUSY')return t('別の処理が進行中です。実行権と受付を確認してください。','Work is in progress. Check the lease and requests.');
   if(error.code==='PRODUCTION_PUBLICATION_PENDING'||error.code==='PRODUCTION_AUTOMATION_PENDING'||error.code==='PRODUCTION_CASE_TERMINAL')return t('案件の状態や未決の受付を確認してください。','Check the case state and unresolved requests.');
  }
  return t('案件の操作を確認できませんでした。','Could not confirm the case operation.');
 }
 async function loadCases(cursor:number,append=false){
  setBusy(true);setError('');
  try{
   const result=await memberRequest(endpoint+'?'+new URLSearchParams({themeId,cursor:String(cursor)}),themeProductionListSchema,{user:userId});
   setCases(append&&cases?{...result,items:[...cases.items,...result.items]}:result);
  }catch(e){setError(problem(e));}finally{setBusy(false);}
 }
 async function open(row:Case,submissionCursor=0,operationCursor=0){
  setBusy(true);setSelected(row);setError('');
  if(row.id!==selected?.id){
   setDetail(null);setReason('');setConfirmEnding(false);setAbandonId(null);
  }
  try{
   const result=await memberRequest(endpoint+'?'+new URLSearchParams({caseId:row.id,submissionCursor:String(submissionCursor),operationCursor:String(operationCursor)}),operatorThemeCaseDetailsSchema,{user:userId});
   if(detail?.version!==result.version)setAbandonId(null);
   setDetail(result);
  }catch(e){setError(problem(e));}finally{setBusy(false);}
 }
 async function abandon(){
  if(!selected||!detail||detail.id!==selected.id||!reason.trim())return;
  const requestId=abandonId??crypto.randomUUID();
  setAbandonId(requestId);setBusy(true);setError('');
  try{
   await memberRequest(endpoint,endedSchema,{user:userId,method:'POST',body:{caseId:selected.id,expectedVersion:detail.version,requestId,reason:reason.trim()}});
   setSelected(null);setDetail(null);setConfirmEnding(false);setReason('');setAbandonId(null);
   await loadCases(0);
   refresh();
  }catch(e){setError(problem(e));}finally{setBusy(false);}
 }
 const canEnd=selected&&detail?.id===selected.id&&selected.status!=='completed'&&selected.status!=='abandoned'&&
  !selected.lease?.valid&&!selected.publication?.pending&&!selected.pendingSubmissionCount;
 return <details className={css.work} onToggle={e=>{
  if(e.currentTarget.open&&!cases&&!busy)void loadCases(0);
 }}>
  <summary>{t('制作・見直し案件', 'Production and review cases')}</summary>
  <p>{t('一覧に表示中の案件ID','Case shown in the theme list')} <code>{currentCaseId}</code></p>
  {error&&<p role="alert">{error}</p>}
  {busy&&<p role="status">{t('案件を確認しています…','Checking the case…')}</p>}
  <button disabled={busy} onClick={()=>{setSelected(null);setDetail(null);setConfirmEnding(false);void loadCases(0);}}>{t('案件一覧を更新','Refresh cases')}</button>
  <ul>{cases?.items.map(row=><li key={row.id}>
   <button disabled={busy} aria-expanded={selected?.id===row.id} onClick={()=>void open(row)}>
    {row.phase==='review'?t('見直し','Review'):t('制作','Production')} · {states[row.status]} · {row.workflow==='manual'?t('手動','Manual'):t('定期','Scheduled')}
   </button>
   <div><code>{row.id}</code> · {format(row.updatedAt)}</div>
   {row.abandonReason&&<p>{row.abandonReason}</p>}
  </li>)}</ul>
  {cases?.nextCursor!=null&&<button disabled={busy} onClick={()=>void loadCases(cases.nextCursor!,true)}>{t('さらに案件を表示','More cases')}</button>}
  {selected&&detail?.id===selected.id&&<section aria-label={t('案件詳細','Case details')}>
   <p><code>{selected.id}</code> · {t('案件版','Case version')} {detail.version}</p>
   <p>{detail.progress.brief}</p>
   {detail.progress.scope&&<p>{detail.progress.scope}</p>}
   {selected.lease?.valid&&<p>{t('実行権の期限','Lease expires')} {format(selected.lease.until)}</p>}
   {selected.assessment&&<p>{t('全体評価','Assessment')} {selected.assessment.result} · {format(selected.assessment.evaluatedAt)}</p>}
   {selected.publication?.pending&&<p>{t('公開切替の確認待ち','Public activation pending')}</p>}
   {detail.progress.blockers.length>0&&<><strong>{t('続行を妨げている理由','Blockers')}</strong><ul>{detail.progress.blockers.map((note,i)=><li key={i}>{note}</li>)}</ul></>}
   {detail.progress.unfinished.length>0&&<><strong>{t('残作業','Remaining')}</strong><ul>{detail.progress.unfinished.map((note,i)=><li key={i}>{note}</li>)}</ul></>}
   <strong>{t('登録受付履歴','Submission history')}</strong>
   <ul>{detail.submissions.map(row=><li key={row.id}>{row.action} · {row.state}{row.reason&&(' · '+row.reason)} · <code>{row.id}</code></li>)}</ul>
   {detail.nextSubmissionCursor!==null&&<button disabled={busy} onClick={()=>void open(selected,detail.nextSubmissionCursor!)}>{t('次の登録受付','Next submissions')}</button>}
   <strong>{t('操作履歴','Operation history')}</strong>
   <ul>{detail.operationHistory?.items.map(row=><li key={row.requestId}>{format(row.at)} · {row.outcome} · <code>{row.requestId}</code></li>)}</ul>
   {detail.operationHistory?.nextCursor!=null&&<button disabled={busy} onClick={()=>void open(selected,0,detail.operationHistory!.nextCursor!)}>{t('次の操作履歴','Next operations')}</button>}
   {canEnd&&!confirmEnding&&<button disabled={busy} onClick={()=>setConfirmEnding(true)}>{t('公開せずに案件を終了','Close case without publishing')}</button>}
   {canEnd&&confirmEnding&&<form onSubmit={e=>{e.preventDefault();void abandon();}}>
    <p>{t('案件は終了し、公開版と作業版は保持します。','This closes the case and keeps the published and working editions.')}</p>
    <label>{t('終了理由','Closure reason')}<textarea required maxLength={2000} value={reason} onChange={e=>{setReason(e.target.value);setAbandonId(null);}}/></label>
    <button type="submit" disabled={!reason.trim()||busy}>{t('終了を確定','Confirm closure')}</button>
    <button type="button" disabled={busy} onClick={()=>setConfirmEnding(false)}>{t('戻る','Back')}</button>
   </form>}
  </section>}
 </details>;
}
