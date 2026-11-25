"use client";
import {useEffect,useState} from 'react';
import Link from './NavigationLink';
import {memberRequest} from '../lib/client/member-api';
import {useUiLocale} from '../lib/client/ui-locale';
import {operatorThemesSchema,type OperatorTheme} from '../lib/domain/theme-operations';
import common from './OperationsPage.module.css';
import css from './ThemeProductionOperations.module.css';
import {ThemeProductionContinuity} from './ThemeProductionContinuity';
import {ThemeCaseHistory} from './ThemeCaseHistory';

export function ThemeProductionOperations({userId,authorized}:{userId:string;authorized:boolean}){
 const {locale}=useUiLocale(),ja=locale==='ja',t=(a:string,b:string)=>ja?a:b;
 const [loaded,setLoaded]=useState<{owner:string;items:OperatorTheme[];refreshVersion:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [filter,setFilter]=useState<'all'|OperatorTheme['state']>('all'),[query,setQuery]=useState('');
 useEffect(()=>{
  if(!authorized)return;
  const ac=new AbortController();queueMicrotask(()=>{if(!ac.signal.aborted){setBusy(true);setError('');}});
  memberRequest('/api/site-operations/themes',operatorThemesSchema,{user:userId,signal:ac.signal}).then(result=>{
   if(!ac.signal.aborted)setLoaded({owner:userId,items:result.items,refreshVersion:attempt});
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
  <div className={css.controls}>
   <label className={css.search}>{t('テーマ名で絞る','Filter by theme title')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label>
   <button className={css.refresh} disabled={!authorized||busy} onClick={()=>setAttempt(n=>n+1)}>{t('更新','Refresh')}</button>
   <div className={common.filters}>{(['all','production','review','published'] as const).map(state=><button key={state} aria-pressed={state===filter} onClick={()=>setFilter(state)}>{label[state]} <span>{items.filter(row=>matches(row,state)).length}</span></button>)}</div>
  </div>
  {authorized&&<ThemeProductionContinuity key={userId} userId={userId} refreshVersion={attempt}/>}
  {authorized&&error&&<p role="alert" className={common.error}>{error}</p>}
  {authorized&&busy&&!loaded&&<p role="status">{t('テーマを確認しています…','Loading themes…')}</p>}
  {authorized&&<ul className={css.rows}>{visible.map(row=><li key={row.id} className={css.themeRow}>
   <div className={css.rowHeading}>
    <Link href={'/operations/themes/'+encodeURIComponent(row.id)}>{row.title}</Link>
    {row.state!=='published'&&<span className={css.state} data-state={row.state}>{label[row.state]}</span>}
   </div>
   <div className={css.revisions}>
    <span>{row.publishedRevision===null?t('公開なし','No public edition'):t(`公開済み 第${row.publishedRevision}版`,`Published revision ${row.publishedRevision}`)}</span>
    <span>{t('作業版','Working revision')} {row.currentRevision}</span>
   </div>
   {row.caseBrief&&<p className={css.casePreview}>{row.caseBrief}</p>}
   {row.caseId
    ?<ThemeCaseHistory key={userId+row.id} userId={userId} themeId={row.id} currentCaseId={row.caseId} refreshVersion={loaded?.refreshVersion??0} refresh={()=>setAttempt(n=>n+1)}/>
    :(row.unfinished.length>0||row.blockers.length>0)&&<details className={css.caseDisclosure}>
     <summary>{t('残作業','Remaining')} {row.unfinished.length}{row.blockers.length>0&&<> · {t('続行待ち','Blocked')} {row.blockers.length}</>}</summary>
     <div className={css.caseBody}>
      {row.blockers.length>0&&<section className={css.caseBlockers}><h3>{t('続行に必要なこと','Blockers')}</h3><ul>{row.blockers.map((text,i)=><li key={i}>{text}</li>)}</ul></section>}
      {row.unfinished.length>0&&<section className={css.caseNotes}><h3>{t('残作業','Remaining work')}</h3><ul>{row.unfinished.map((text,i)=><li key={i}>{text}</li>)}</ul></section>}
     </div>
    </details>}
  </li>)}</ul>}
  {authorized&&loaded&&!busy&&!error&&!visible.length&&<p role="status">{t('条件に合うテーマはありません。','No themes match these filters.')}</p>}
 </section>;
}
