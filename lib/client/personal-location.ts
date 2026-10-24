"use client";
import {useSyncExternalStore} from 'react';
const subscribe=(fn:()=>void)=>{addEventListener('hashchange',fn);addEventListener('popstate',fn);return()=>{removeEventListener('hashchange',fn);removeEventListener('popstate',fn);};};
// null during server rendering: never render a default page before its fragment is known.
export function usePersonalHash(){return useSyncExternalStore(subscribe,()=>location.hash.slice(1)||(location.pathname==='/communities'?location.search:''),()=>null);}
