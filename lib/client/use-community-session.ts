"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {communityResponse} from '../domain/community';
import {memberRequest,MemberClientError,type MemberUser} from './member-api';
import {useMemberSession,refreshMemberIdentity,refreshPendingInvitations} from './use-member-identity';
import {memberSessionEvent} from './account-navigation';
export type CommunityMutationResult={ok:true;receipt?:string}|{ok:false;code:string;unknown:boolean};
export type CommunityMutation=(path:string,input:Record<string,unknown>,idempotent?:boolean)=>Promise<CommunityMutationResult>;
type Data=z.infer<typeof communityResponse>;
export function useCommunitySession(route:string,onReset:()=>void,ready=true){
 const identityState=useMemberSession();
 const [publicDirectory,setPublicDirectory]=useState<Data|null>(null);
 const [data,setData]=useState<Data|null>(null),[user,setUser]=useState<MemberUser|null>(null),[busy,setBusy]=useState(true),[blocked,setBlocked]=useState(true),[error,setError]=useState(''),[operationError,setOperationError]=useState(''),[notice,setNotice]=useState(''),[epoch,setEpoch]=useState(0);
 const read=useRef<AbortController|null>(null),generation=useRef(0),writing=useRef(false),queued=useRef(false),owner=useRef<string|null|undefined>(undefined),previous=useRef<Data|null>(null),pendingLoad=useRef(false),lastRead=useRef(0),mounted=useRef(true);
 const [loadedRoute,setLoadedRoute]=useState<string|null>(null);
 const intents=useRef(new Map<string,{id:string;input:Record<string,unknown>}>());
 const reset=useCallback(()=>{intents.current.clear();previous.current=null;setData(null);setOperationError('');setEpoch(n=>n+1);onReset();},[onReset]);
 const load=useCallback(async(hard=false)=>{
  if(!ready)return;
  if(hard)setBlocked(true);
  if(document.hidden){generation.current++;read.current?.abort();setBlocked(true);return;}
  if(writing.current){queued.current=true;return;}
  if(pendingLoad.current&&!hard)return;
  const g=++generation.current;read.current?.abort();const controller=new AbortController();read.current=controller;pendingLoad.current=true;setBusy(true);
  // While first authentication is pending, the public directory can render
  // independently. Omit credentials: this response can never contain membership data.
  if(route===''&&owner.current===undefined)void memberRequest('/api/communities',communityResponse,{signal:controller.signal,publicOnly:true}).then(result=>{if(g===generation.current&&!controller.signal.aborted)setPublicDirectory(result);}).catch(()=>{});
  try{
   const identity=await refreshMemberIdentity(hard);
   if(g!==generation.current||controller.signal.aborted)return;
   if(owner.current!==(identity?.id??null)){reset();owner.current=identity?.id??null;}setUser(identity);
   const result=await memberRequest('/api/communities'+route,communityResponse,{signal:controller.signal,...(identity?{user:identity.id}:{})});
   if(g!==generation.current||controller.signal.aborted||document.hidden)return;
   const old=previous.current?.community,c=result.community;
   if(old&&c&&old.id===c.id&&(old.role!==c.role||old.membershipGeneration!==c.membershipGeneration||old.status!==c.status))reset();
   setLoadedRoute(route);previous.current=result;setData(result);setBlocked(false);setError('');lastRead.current=Date.now();
  }catch(e){if(g!==generation.current||controller.signal.aborted)return;
   const code=e instanceof MemberClientError?e.code:'UNAVAILABLE';setError(code);
   if(e instanceof MemberClientError&&[401,403,404].includes(e.status)){reset();setBlocked(true);if(e.status===401){owner.current=null;setUser(null);void refreshMemberIdentity(true).catch(()=>{});}}
   // On a failed hard revalidation the retained subtree stays hidden. No private
   // draft or content is persisted to storage/history, nor shown to a new user.
  }finally{if(g===generation.current){pendingLoad.current=false;setBusy(false);}}
 },[route,reset,ready]);
 useEffect(()=>{mounted.current=true;const initial=setTimeout(()=>{setNotice('');void load(false);},0);
  const focus=()=>{if(Date.now()-lastRead.current>500)void load(false);};
  const visibility=()=>void load(true);
  const page=(e:PageTransitionEvent)=>void load(e.persisted);
  const auth=()=>{generation.current++;read.current?.abort();pendingLoad.current=false;setBlocked(true);void load(true);};
  const storage=(e:StorageEvent)=>{if(e.key===null||e.key==='graph-knowledge:member-session-changed')auth();};
  const timer=setInterval(()=>void load(false),30000);
  addEventListener('focus',focus);addEventListener('pageshow',page);addEventListener('storage',storage);addEventListener(memberSessionEvent,auth);document.addEventListener('visibilitychange',visibility);
  // This is a request sequence, not a DOM ref: cleanup must invalidate the latest request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return()=>{mounted.current=false;clearTimeout(initial);clearInterval(timer);generation.current++;read.current?.abort();pendingLoad.current=false;removeEventListener('focus',focus);removeEventListener('pageshow',page);removeEventListener('storage',storage);removeEventListener(memberSessionEvent,auth);document.removeEventListener('visibilitychange',visibility);};
 },[load,identityState.version]);
 const mutate:CommunityMutation=async(path,input,idempotent=false)=>{
  if(!user||blocked||loadedRoute!==route||writing.current)return {ok:false,code:'NOT_READY',unknown:false};
  writing.current=true;generation.current++;read.current?.abort();pendingLoad.current=false;const g=generation.current,uid=user.id;setBusy(true);setError('');setOperationError('');setNotice('');
  const content=Object.fromEntries(Object.entries(input).filter(([key])=>key!=='expectedRevision'));const key=JSON.stringify([uid,path,content]);if(idempotent&&!intents.current.has(key))intents.current.set(key,{id:crypto.randomUUID(),input});
  try{
   const result=await memberRequest('/api/communities'+path,z.object({id:z.string().optional()}),{method:'POST',body:idempotent?{...intents.current.get(key)!.input,requestId:intents.current.get(key)!.id}:input,user:uid});
   if(!mounted.current||owner.current!==uid||g!==generation.current)return {ok:false,code:'RESULT_UNKNOWN',unknown:true};
   void refreshPendingInvitations();
   intents.current.delete(key);setNotice(path==='/reports'?'REPORT_RECEIVED':'SAVED');
   return {ok:true,receipt:result.id};
  }catch(e){
   const unknown=!(e instanceof MemberClientError)||e.status>=500;const code=e instanceof MemberClientError?e.code:'RESULT_UNKNOWN';
   if(mounted.current&&owner.current===uid){setOperationError(code);if(e instanceof MemberClientError&&[401,403,404].includes(e.status)){reset();setBlocked(true);if(e.status===401){owner.current=null;setUser(null);void refreshMemberIdentity(true).catch(()=>{});}}}
   if(!unknown)intents.current.delete(key);
   return {ok:false,code,unknown};
  }finally{writing.current=false;if(mounted.current){setBusy(false);const hard=queued.current;queued.current=false;void load(hard);}}
 };
 const publicFallback=route===''&&!data&&!!publicDirectory&&['checking','error'].includes(identityState.status);
 return {data:publicFallback?publicDirectory:data,user:identityState.user?.id===user?.id?user:null,authStatus:identityState.status,busy,blocked:!ready||(!publicFallback&&(blocked||loadedRoute!==route||identityState.status==='checking'||(!!user&&identityState.user?.id!==user.id))),error:operationError||error,notice,epoch,load,mutate};
}
