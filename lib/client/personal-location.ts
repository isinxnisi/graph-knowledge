"use client";
import {useSyncExternalStore} from 'react';
const subscribe=(fn:()=>void)=>{addEventListener('hashchange',fn);addEventListener('popstate',fn);return()=>{removeEventListener('hashchange',fn);removeEventListener('popstate',fn);};};
// null during server rendering: never render a default page before its fragment is known.
export function usePersonalHash(){return useSyncExternalStore(subscribe,()=>location.hash.slice(1)||(location.pathname==='/communities'?location.search:''),()=>null);}

// Preserve the current router entry for local fragments without a route-cache restore.
export function navigatePersonalHash(hash:string){const url=new URL(location.href);url.hash=hash;if(url.href===location.href)return;const oldURL=location.href;history.pushState(history.state,'',url);dispatchEvent(new HashChangeEvent('hashchange',{oldURL,newURL:url.href}));}

export const personalSubmissionListEvent='personal:submission-list';
// Re-selecting this menu means the list, even when the router retains the
// client workspace that changed its own detail URL with history.replaceState.
export function navigatePersonalList(target:URL){
 if(target.pathname!=='/member/submissions'||target.search||target.hash||location.pathname!==target.pathname)return false;
 history.replaceState(history.state,'',target);dispatchEvent(new Event(personalSubmissionListEvent));return true;
}
