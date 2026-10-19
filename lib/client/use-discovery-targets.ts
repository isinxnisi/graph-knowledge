"use client";
import { useEffect, useRef, useState } from "react";
import { fetchDiscoveryTargets } from "./discovery-targets";
import { fetchDatasetRevision, ClientApiError } from "./api";
import { canonicalTargetCriteria, type ConnectionsWorkspace } from "../domain/discovery-connections";
import { targetCriteriaKey, targetSearchRequestSchema, type TargetSearchResponse } from "../domain/discovery-targets";
export function useDiscoveryTargets(input:ConnectionsWorkspace["criteria"],cursors:ConnectionsWorkspace["cursors"],cached:TargetSearchResponse|null,enabled:boolean,composing:boolean){
 const valid=canonicalTargetCriteria(input),criteriaKey=valid.success?targetCriteriaKey(valid.data):null,after=cursors.at(-1)!,key=JSON.stringify([criteriaKey,after]);
 const [attempt,retry]=useState(0),[state,setState]=useState<{key:string;result?:TargetSearchResponse;error?:string;conflict?:boolean}>({key:""});
 const cache=useRef(cached),cacheKey=useRef(key);const revision=useRef(cached?.revision??null);const priorCriteria=useRef(criteriaKey);
 useEffect(()=>{if(priorCriteria.current!==criteriaKey){priorCriteria.current=criteriaKey;revision.current=null;cache.current=null;}},[criteriaKey]);
 useEffect(()=>{
  if(!enabled||!criteriaKey||composing)return;
  const controller=new AbortController(),criteria=canonicalTargetCriteria(input);if(!criteria.success)return;
  const timer=setTimeout(()=>void(async()=>{
   setState(old=>({...old,key:"checking:"+key}));
   try{
    let result:TargetSearchResponse;
    const reusable=cache.current&&cacheKey.current===key&&targetCriteriaKey(cache.current.criteria)===criteriaKey;
    if(reusable){const current=await fetchDatasetRevision(controller.signal);if(current.dataset!=="public-kg"||current.revision!==cache.current!.revision)throw new ClientApiError("公開版が変わりました。",409);result=cache.current!;}
    else result=await fetchDiscoveryTargets(targetSearchRequestSchema.parse({version:"nameTarget" in criteria.data?2:1,dataset:"public-kg",after,revision:after?revision.current:null,criteria:criteria.data}),controller.signal);
    if(controller.signal.aborted)return;revision.current=result.revision;cache.current=result;cacheKey.current=key;setState({key,result});
   }catch(error){if(!controller.signal.aborted)setState({key,error:error instanceof Error?error.message:"unconfirmed",conflict:error instanceof ClientApiError&&error.status===409});}
  })(),input.q.trim()?220:0);
  return()=>{clearTimeout(timer);controller.abort();};
 // Canonical criteria and cursor define the request; drafts never reuse another result.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,enabled,composing,attempt]);
 return {result:state.key===key?state.result:undefined,previous:state.result,error:state.key===key?state.error:undefined,conflict:state.key===key&&state.conflict,loading:enabled&&valid.success&&(state.key!==key||!state.result&&!state.error),invalid:!valid.success,
  retry:()=>{cache.current=null;revision.current=null;setState({key:""});retry(a=>a+1);}};
}
