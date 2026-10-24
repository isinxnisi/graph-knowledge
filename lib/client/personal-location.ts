"use client";
import {useSyncExternalStore} from 'react';
const subscribe=(fn:()=>void)=>{addEventListener('hashchange',fn);addEventListener('popstate',fn);return()=>{removeEventListener('hashchange',fn);removeEventListener('popstate',fn);};};
// null during server rendering: never render a default page before its fragment is known.
export function usePersonalHash(){return useSyncExternalStore(subscribe,()=>location.hash.slice(1)||(location.pathname==='/communities'?location.search:''),()=>null);}

// Use Next's patched History API so hash entries retain the current router tree.
export function navigatePersonalHash(hash:string){const url=new URL(location.href);url.hash=hash;if(url.href===location.href)return;const oldURL=location.href;history.pushState(null,'',url);dispatchEvent(new HashChangeEvent('hashchange',{oldURL,newURL:url.href}));}
