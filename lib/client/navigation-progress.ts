"use client";
import {useEffect} from 'react';

type PendingNavigation={id:number;startedAt:number};
let serial=0,pending:PendingNavigation|null=null;
const listeners=new Set<()=>void>();
export const navigationProgressSnapshot=()=>pending;
export const navigationProgressServerSnapshot=()=>null;
export function subscribeNavigationProgress(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function notify(){for(const listener of listeners)listener();}
/** Only navigation entry points opt in. Background reads and post-navigation
 * graph layout/expansion must never register as page navigation. */
export function startNavigationProgress(){
 const id=++serial;pending={id,startedAt:Date.now()};notify();
 return()=>{if(pending?.id===id){pending=null;notify();}};
}
export function useNavigationProgress(active:boolean){
 useEffect(()=>{if(active)return startNavigationProgress();},[active]);
}
