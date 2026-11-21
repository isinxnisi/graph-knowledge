"use client";
import {useEffect,useState} from 'react';
import Link from './NavigationLink';
import {memberRequest} from '../lib/client/member-api';
import {useUiLocale} from '../lib/client/ui-locale';
import {operatorThemesSchema,type OperatorTheme} from '../lib/domain/theme-operations';
import common from './OperationsPage.module.css';
import css from './ThemeProductionOperations.module.css';
import {ThemeCaseHistory} from './ThemeCaseHistory';

export function ThemeProductionOperations({userId,authorized}:{userId:string;authorized:boolean}){
 const {locale}=useUiLocale(),ja=locale==='ja',t=(a:string,b:string)=>ja?a:b;
 const [loaded,setLoaded]=useState<{owner:string;items:OperatorTheme[]}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [filter,setFilter]=useState<'all'|OperatorTheme['state']>('all'),[query,setQuery]=useState('');
 useEffect(()=>{
  if(!authorized)return;
  const ac=new AbortController();queueMicrotask(()=>{if(!ac.signal.aborted){setBusy(true);setError('');}});
  memberRequest('/api/site-operations/themes',operatorThemesSchema,{user:userId,signal:ac.signal}).then(result=>{
   if(!ac.signal.aborted)setLoaded({owner:userId,items:result.items});
  }).catch(()=>{if(!ac.signal.aborted){setLoaded(null);setError(t('テーマを取得できません。再取得してください。','Could not load themes. Please retry.'));}})
   .finally(()=>{if(!ac.signal.aborted)setBusy(false);});
  return()=>ac.abort();
 // Language changes do not change authorization or require a private refetch.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[authorized,userId,attempt]);
 const items=authorized&&loaded?.owner===userId?loaded.items:[];
 const matches=(row:OperatorTheme,state:typeof filter)=>state==='all'||(state==='published'?row.publishedRevision!==null:row.state===state);
 const term=query.trim().normalize('NFKC').toLocaleLowerCase();
 const visible=items.filter(row=>matches(row,filter)&&row.title.normalize('NFKC').toLocaleLowerCase().includes(term));
 const label={all:t('すべて','All'),production:t('制作中','In production'),review:t('見直し中','In review'),published:t('公開済み','Published'),inactive:t('案件終了','Case closed')};
 return <section aria-label={t('テーマ制作一覧','Theme production list')} className={css.production}>
  <p className={common.notice}>{t('作業版は運営者プレビューで確認できます。制作案件の公開は独立した見直しの完了後に切り替わります。','Preview working editions as an operator. Production cases publish after independent review is complete.')}</p>
  <div className={common.tools}><div className={common.filters}>{(['all','production','review','published'] as const).map(state=><button key={state} aria-pressed={state===filter} onClick={()=>setFilter(state)}>{label[state]} <span>{items.filter(row=>matches(row,state)).length}</span></button>)}</div><button disabled={!authorized||busy} onClick={()=>setAttempt(n=>n+1)}>{t('更新','Refresh')}</button></div>
  <label className={css.search}>{t('テーマ名で絞る','Filter by theme title')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label>
  {authorized&&error&&<p role="alert" className={common.error}>{error}</p>}
  {authorized&&busy&&!loaded&&<p role="status">{t('テーマを確認しています…','Loading themes…')}</p>}
  {authorized&&<ul className={css.rows}>{visible.map(row=><li key={row.id}>
   <div className={css.rowHeading}>{row.state!=='published'&&<span className={css.state}>{label[row.state]}</span>}<Link href={'/operations/themes/'+encodeURIComponent(row.id)}>{row.title}</Link></div>
   <div className={css.revisions}>{t('作業','Working')} {row.currentRevision}<span>·</span>{row.publishedRevision===null?t('公開なし','No public edition'):<>{t('公開済み','Published')} · {t(`第${row.publishedRevision}版`,`revision ${row.publishedRevision}`)}</>}</div>
   {(row.unfinished.length>0||row.blockers.length>0)&&<details className={css.work}><summary>{t('残作業','Remaining')} {row.unfinished.length}{row.blockers.length>0&&<> · {t('続行待ち','Blocked')} {row.blockers.length}</>}</summary>
    {row.blockers.length>0&&<><strong>{t('続行を妨げている理由','Blockers')}</strong><ul>{row.blockers.map((text,i)=><li key={i}>{text}</li>)}</ul></>}
    {row.unfinished.length>0&&<ul>{row.unfinished.map((text,i)=><li key={i}>{text}</li>)}</ul>}
   </details>}
   {row.caseId&&<ThemeCaseHistory key={userId+row.id} userId={userId} themeId={row.id} currentCaseId={row.caseId} refresh={()=>setAttempt(n=>n+1)}/>}
  </li>)}</ul>}
  {authorized&&loaded&&!busy&&!error&&!visible.length&&<p role="status">{t('条件に合うテーマはありません。','No themes match these filters.')}</p>}
 </section>;
}
