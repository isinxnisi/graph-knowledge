"use client";
import {useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {z} from 'zod';
import {memberProfileSchema,memberRequest,MemberClientError,type MemberUser} from './member-api';
import {memberSessionEvent} from './account-navigation';
export type IdentityState={status:'checking'|'authenticated'|'guest'|'error';user:MemberUser|null;rechecking:boolean;error:boolean;version:number};
const initial:IdentityState={status:'checking',user:null,rechecking:false,error:false,version:0};
let state=initial,checkedAt=0,sequence=0,pending:Promise<MemberUser|null>|null=null;
const listeners=new Set<()=>void>();
const publish=(next:IdentityState)=>{state=next;listeners.forEach(fn=>fn());};
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function useMemberSession(){return useSyncExternalStore(subscribe,()=>state,()=>initial);}
// Shared display state is not an authorization cache. Every private API still
// validates the session, active user, expected user and resource permissions.
export function refreshMemberIdentity(force=false):Promise<MemberUser|null>{
 if(pending)return pending;
 if(!force&&state.status!=='checking'&&!state.error&&Date.now()-checkedAt<30000)return Promise.resolve(state.user);
 const seq=sequence;publish({...state,rechecking:state.status!=='checking',error:false});
 pending=(async()=>{try{
  const {user}=await memberRequest('/api/member/profile',memberProfileSchema);
  if(seq!==sequence)throw new Error('IDENTITY_CHANGED');
  checkedAt=Date.now();publish({status:'authenticated',user,rechecking:false,error:false,version:state.version+(state.user?.id!==user.id?1:0)});return user;
 }catch(e){if(seq!==sequence)throw e;
  if(e instanceof MemberClientError&&e.status===401){checkedAt=Date.now();publish({status:'guest',user:null,rechecking:false,error:false,version:state.version+(state.user?1:0)});return null;}
  publish({...state,status:state.user?'authenticated':'error',rechecking:false,error:true});throw e;
 }finally{if(seq===sequence)pending=null;}})();return pending;
}
export function invalidateMemberIdentity(){sequence++;pending=null;checkedAt=0;publish({...initial,version:state.version+1});clearInvitations();}
export function useMemberIdentity(enabled=true){const value=useMemberSession();return enabled?value.user:null;}
type Invitations={owner:string|null;status:'checking'|'ready'|'error';count:number|null};
const initialInvites:Invitations={owner:null,status:'checking',count:null};
let invitations=initialInvites,invitePending:Promise<void>|null=null,inviteGeneration=0;
const inviteListeners=new Set<()=>void>();
function publishInvitations(value:Invitations){invitations=value;inviteListeners.forEach(fn=>fn());}
function clearInvitations(){inviteGeneration++;invitePending=null;publishInvitations(initialInvites);}
export function usePendingInvitations(){const identity=useMemberSession();const value=useSyncExternalStore(fn=>{inviteListeners.add(fn);return()=>{inviteListeners.delete(fn);};},()=>invitations,()=>initialInvites);return identity.error?{...initialInvites,status:'error' as const}:identity.user&&identity.user.id===value.owner?value:initialInvites;}
export function refreshPendingInvitations(){
 const user=state.user;if(!user||state.status!=='authenticated')return Promise.resolve();
 if(invitePending&&invitations.owner===user.id)return invitePending;
 if(invitations.owner!==user.id){clearInvitations();publishInvitations({owner:user.id,status:'checking',count:null});}
 const generation=inviteGeneration;
 invitePending=(async()=>{try{
  const result=await memberRequest('/api/communities/invitations/summary',z.object({pendingCount:z.number().int().nonnegative()}),{user:user.id});
  if(generation===inviteGeneration&&state.user?.id===user.id)publishInvitations({owner:user.id,status:'ready',count:result.pendingCount});
 }catch{if(generation===inviteGeneration&&state.user?.id===user.id)publishInvitations({owner:user.id,status:'error',count:null});}
 finally{if(generation===inviteGeneration)invitePending=null;}})();return invitePending;
}
export function MemberIdentityProvider({children,communityEnabled}:{children:ReactNode;communityEnabled:boolean}){
 useEffect(()=>{
  let lastFocus=0;
  const update=()=>{if(document.hidden)return;void refreshMemberIdentity(true).then(()=>{if(communityEnabled)void refreshPendingInvitations();}).catch(()=>{});};
  const focus=()=>{if(Date.now()-lastFocus<1000)return;lastFocus=Date.now();update();};
  const auth=()=>{invalidateMemberIdentity();update();};
  const storage=(e:StorageEvent)=>{if(e.key===null||e.key==='graph-knowledge:member-session-changed')auth();};
  const restored=(e:PageTransitionEvent)=>{if(e.persisted)focus();};
  update();const timer=setInterval(update,30000);
  addEventListener('focus',focus);addEventListener('storage',storage);addEventListener(memberSessionEvent,auth);addEventListener('pageshow',restored);document.addEventListener('visibilitychange',focus);
  return()=>{clearInterval(timer);removeEventListener('focus',focus);removeEventListener('storage',storage);removeEventListener(memberSessionEvent,auth);removeEventListener('pageshow',restored);document.removeEventListener('visibilitychange',focus);};
 },[communityEnabled]);return children;
}
