"use client";
import {useEffect,useState} from 'react';
import {z} from 'zod';
import Link from './NavigationLink';
import {memberRequest} from '../lib/client/member-api';
import {useUiLocale} from '../lib/client/ui-locale';
import {themeProductionFollowUpsSchema,themeProductionListSchema} from '../lib/domain/theme-production';
import css from './ThemeProductionOperations.module.css';

const endpoint='/api/site-operations/theme-cases';
type Mode='follow-ups'|'parked';
type Page={mode:'follow-ups';data:z.infer<typeof themeProductionFollowUpsSchema>}|
 {mode:'parked';data:z.infer<typeof themeProductionListSchema>};

export function ThemeProductionContinuity({userId,refreshVersion}:{userId:string;refreshVersion:number}){
 const {locale}=useUiLocale(),t=(ja:string,en:string)=>locale==='ja'?ja:en;
 const [open,setOpen]=useState(false),[mode,setMode]=useState<Mode>('follow-ups');
 const [input,setInput]=useState(''),[query,setQuery]=useState(''),[cursor,setCursor]=useState(0);
 const [page,setPage]=useState<Page|null>(null),[error,setError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();
  const params=new URLSearchParams({query,cursor:String(cursor)});
  const options={user:userId,signal:controller.signal};
  queueMicrotask(()=>{if(!controller.signal.aborted){setPage(null);setError(false);}});
  if(mode==='follow-ups'){
   params.set('view',mode);
   void memberRequest(endpoint+'?'+params,themeProductionFollowUpsSchema,options)
    .then(data=>{if(!controller.signal.aborted)setPage({mode,data});})
    .catch(()=>{if(!controller.signal.aborted)setError(true);});
  }else{
   params.set('parkedOnly','1');
   void memberRequest(endpoint+'?'+params,themeProductionListSchema,options)
    .then(data=>{if(!controller.signal.aborted)setPage({mode,data});})
    .catch(()=>{if(!controller.signal.aborted)setError(true);});
  }
  return ()=>controller.abort();
 },[open,mode,query,cursor,userId,refreshVersion,attempt]);

 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 return <details className={css.caseDisclosure} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{t('後日対応と非公開の退避案件','Follow-ups and parked cases')}</summary>
  {open&&<div className={css.caseBody}>
   <form className={css.controls} onSubmit={event=>{event.preventDefault();setQuery(input.trim());setCursor(0);setAttempt(n=>n+1);}}>
    <label className={css.search}>{t('表示対象','Show')}
     <select value={mode} onChange={event=>{setPage(null);setError(false);setMode(event.target.value as Mode);setCursor(0);}}>
      <option value="follow-ups">{t('後日対応','Follow-ups')}</option>
      <option value="parked">{t('退避案件','Parked cases')}</option>
     </select>
    </label>
    <label className={css.search}>{t('キーワードまたはID','Keyword or ID')}
     <input type="search" maxLength={200} value={input} onChange={event=>setInput(event.target.value)}/>
    </label>
    <button className={css.refresh} type="submit">{t('検索','Search')}</button>
   </form>
   {error&&<p role="alert">{t('一覧を取得できません。','Could not load the list.')}</p>}
   {!error&&!page&&<p role="status">{t('読み込み中…','Loading…')}</p>}
   {page&&!page.data.items.length&&<p role="status">{t('該当する記録はありません。','No matching records.')}</p>}
   {page?.mode==='follow-ups'&&page.data.items.map(item=><details className={css.secondaryDisclosure} key={item.sourceCaseId+item.key}>
    <summary>{item.record.issue}<span className={css.assessmentResult}>{item.record.status==='resolved'?t('解決済み','Resolved'):t('未対応','Open')}</span></summary>
    <div className={css.secondaryBody}>
     <dl className={css.technical}>
      <dt>{t('記録キー','Record key')}</dt><dd><code>{item.key}</code> · {item.scope==='shared'?t('共通','Shared'):t('テーマ固有','Theme-specific')}</dd>
      <dt>{t('確認日時','Observed')}</dt><dd>{date(item.record.observedAt)}</dd>
      <dt>{t('理由','Reason')}</dt><dd>{item.record.reason}</dd>
      <dt>{t('対応と結果','What was tried')}</dt><dd>{item.record.attempt}</dd>
      <dt>{t('再対応条件','Revisit when')}</dt><dd>{item.record.resumeWhen}</dd>
     </dl>
     <h3>{t('影響を受ける案件','Affected cases')}</h3>
     <ul>{item.cases.map(row=><li key={row.caseId}>
      {row.theme?<Link href={'/operations/themes/'+encodeURIComponent(row.theme.id)}>{t('作業版','Working revision')} {row.theme.revision}</Link>:null}
      <p>{row.brief}</p><p>{row.impact}</p><code>{row.caseId}</code>
     </li>)}</ul>
    </div>
   </details>)}
   {page?.mode==='parked'&&page.data.items.map(row=><details className={css.secondaryDisclosure} key={row.id}>
    <summary>{row.brief||row.theme?.id||row.id}</summary>
    <div className={css.secondaryBody}>
     <p>{row.abandonReason}</p>
     <dl className={css.technical}>
      <dt>{t('再開条件','Resume when')}</dt><dd>{row.suspension?.resumeWhen}</dd>
      <dt>{t('退避日時','Parked at')}</dt><dd>{row.suspension&&date(row.suspension.at)}</dd>
      <dt>{t('未決受付','Pending submissions')}</dt><dd>{row.pendingSubmissionCount}</dd>
      <dt>{t('案件ID','Case ID')}</dt><dd><code>{row.id}</code></dd>
     </dl>
     {row.theme&&<Link href={'/operations/themes/'+encodeURIComponent(row.theme.id)}>{t('テーマの作業版を見る','View working edition')}</Link>}
    </div>
   </details>)}
   {cursor>0&&<button className={css.quietButton} onClick={()=>setCursor(Math.max(0,cursor-(mode==='follow-ups'?10:5)))}>{t('前のページ','Previous page')}</button>}
   {page&&page.data.nextCursor!==null&&<button className={css.quietButton} onClick={()=>setCursor(page.data.nextCursor!)}>{t('次のページ','Next page')}</button>}
  </div>}
 </details>;
}
