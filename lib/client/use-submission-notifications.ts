"use client";
import {useEffect,useSyncExternalStore} from "react";
import {notificationSummarySchema,type SubmissionNotificationSummary} from "../domain/knowledge-submission-feedback";
import {memberRequest,MemberClientError} from "./member-api";
import {getMemberIdentitySnapshot,refreshMemberIdentity,useMemberSession} from "./use-member-identity";

type NotificationState={owner:string|null;identityVersion:number;status:"checking"|"ready"|"error";data:SubmissionNotificationSummary|null;refreshError:boolean};
const initial:NotificationState={owner:null,identityVersion:-1,status:"checking",data:null,refreshError:false};
let state=initial,generation=0,checkedAt=0,lastAttempt=0,pending:Promise<void>|null=null,observers=0,stopPolling:(()=>void)|undefined;
const listeners=new Set<()=>void>(),freshFor=60_000;
const publish=(value:NotificationState)=>{state=value;listeners.forEach(fn=>fn());};
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const sameOwner=(owner:string,version:number)=>{const current=getMemberIdentitySnapshot();return current.status==="authenticated"&&current.user?.id===owner&&current.version===version;};
export function refreshSubmissionNotifications(force=false):Promise<void>{
 const identity=getMemberIdentitySnapshot(),owner=identity.user?.id,version=identity.version;
 if(!owner||identity.status!=="authenticated")return Promise.resolve();
 if(state.owner!==owner||state.identityVersion!==version){generation++;pending=null;checkedAt=0;lastAttempt=0;publish({...initial,owner,identityVersion:version});}
 if(pending)return pending;
 if(!force&&(Date.now()-checkedAt<freshFor||Date.now()-lastAttempt<freshFor))return Promise.resolve();
 lastAttempt=Date.now();const currentGeneration=generation;
 pending=(async()=>{try{
  const data=await memberRequest("/api/member/knowledge-submissions/feedback",notificationSummarySchema,{user:owner});
  if(currentGeneration===generation&&sameOwner(owner,version)){checkedAt=Date.now();publish({owner,identityVersion:version,status:"ready",data,refreshError:false});}
 }catch(error){
  if(currentGeneration===generation&&sameOwner(owner,version)){
   // A summary failure must neither erase a known count nor unmount a form.
   publish({...state,status:state.data?"ready":"error",refreshError:true});
   if(error instanceof MemberClientError&&error.status===401)void refreshMemberIdentity(true).catch(()=>{});
  }
 }finally{if(currentGeneration===generation)pending=null;}})();return pending;
}
// A read acknowledgement supersedes an earlier in-flight summary. A response
// from another session, including the same account after signing in again,
// cannot put its count into the current account menu.
export function acceptSubmissionNotificationSummary(owner:string,identityVersion:number,data:SubmissionNotificationSummary){
 if(!sameOwner(owner,identityVersion))return;
 generation++;pending=null;checkedAt=Date.now();lastAttempt=checkedAt;
 publish({owner,identityVersion,status:"ready",data:notificationSummarySchema.parse(data),refreshError:false});
}
function retainPolling(){
 observers++;
 if(observers===1){
  const refresh=()=>{if(!document.hidden)void refreshSubmissionNotifications();};
  const timer=setInterval(refresh,freshFor);
  window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  stopPolling=()=>{clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
 }
 return()=>{observers--;if(observers===0){stopPolling?.();stopPolling=undefined;}};
}
export function useSubmissionNotifications(enabled=true){
 const identity=useMemberSession(),value=useSyncExternalStore(subscribe,()=>state,()=>initial);
 useEffect(()=>{if(!enabled)return;void refreshSubmissionNotifications();return retainPolling();},[enabled,identity.user?.id,identity.status,identity.version]);
 return enabled&&identity.status==="authenticated"&&value.owner===identity.user?.id&&value.identityVersion===identity.version?value:initial;
}
