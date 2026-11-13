"use client";
import {useEffect,useState,useSyncExternalStore} from 'react';
import {navigationProgressSnapshot,navigationProgressServerSnapshot,subscribeNavigationProgress} from '../lib/client/navigation-progress';
import css from './HeaderNavigationProgress.module.css';
export default function HeaderNavigationProgress({label}:{label:string}){
 const pending=useSyncExternalStore(subscribeNavigationProgress,navigationProgressSnapshot,navigationProgressServerSnapshot);
 const [visibleId,setVisibleId]=useState<number|null>(null);
 useEffect(()=>{
  if(!pending)return;
  const timer=setTimeout(()=>setVisibleId(pending.id),Math.max(0,1500-(Date.now()-pending.startedAt)));
  return()=>clearTimeout(timer);
 },[pending]);
 return pending&&visibleId===pending.id?<span role="progressbar" aria-label={label} className={css.progress}><span/></span>:null;
}
