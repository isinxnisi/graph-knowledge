'use client';
import {useSearchParams,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import type {KnowledgePublishedRecord} from '../lib/domain/knowledge-publication';
import {useUiLocale} from '../lib/client/ui-locale';
import {readKnowledge} from '../lib/client/use-knowledge-workspace';
import KnowledgeRecordDetail from './KnowledgeRecordDetail';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import css from './KnowledgeTranslationPage.module.css';
type Version={record:KnowledgePublishedRecord;currentRevision:number;contextBasis:string};
export default function KnowledgeRecordVersionPage(){
 const router=useRouter(),q=useSearchParams(),id=q.get('id')??'',revision=Number(q.get('revision')),key=JSON.stringify([id,revision]),{locale}=useUiLocale(),en=locale==='en';
 const [state,setState]=useState<{key:string;value?:Version;error?:string}>();
 useEffect(()=>{let alive=true;const load=()=>readKnowledge<Version>('record-version',{recordId:id,revision}).then(value=>{if(alive)setState({key,value});}).catch(e=>{if(alive)setState(prior=>({key,error:e instanceof Error?e.message:'閲覧できません',...(prior?.key===key&&prior.value&&!(e&&typeof e==='object'&&'status'in e&&[403,404,410].includes(Number(e.status)))?{value:prior.value}:{})}));});void load();
 const visible=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',visible);const timer=setInterval(visible,60000);
 return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[id,revision,key]);
 const v=state?.key===key?state.value:undefined;
 return <div className={css.screen}><SiteHeader dataset="public-kg" page="shared"/><main className={css.page}><h1>{en?'Published knowledge':'公開した知識'}</h1>{state?.key!==key?<p role="status">{en?'Loading…':'読み込み中…'}</p>:!v?<p role="alert">{state?.error}</p>:<>{state?.error&&<p role="status">{state.error}</p>}<p>{en?'Fixed content revision':'当時の内容版'} {v.record.record.revision}{v.currentRevision!==revision&&<> · {en?'Current revision':'現在は内容版'} {v.currentRevision}</>}</p><p><a href={'/?krecord='+encodeURIComponent(id)}>{en?'Open current knowledge in exploration':'現在の知識を探索で開く'} →</a></p><KnowledgeRecordDetail dto={v.record} onEntity={id=>router.push('/?kentity='+encodeURIComponent(id))}/>{v.contextBasis==='record-time-observation'&&<small>{en?'Subject labels use the public versions observed when this record was saved.':'対象名は、この記録の保存時点で公開されていた版を表示しています。'}</small>}</>}</main><SiteFooter/></div>;
}
