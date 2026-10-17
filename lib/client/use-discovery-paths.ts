"use client";
import type { PathPresetRef } from "../domain/discovery-path-presets";
import { useEffect, useState } from "react";
import { ClientApiError, fetchDatasetRevision, fetchDiscoveryPaths } from "./api";
import { validatePathResponse, type DiscoveryPathsResponse, type PathConditions } from "../domain/discovery-paths";
export async function executePathSearch(anchor: string, depth: 2 | 3, conditions: PathConditions, revision: string, signal: AbortSignal, preset: PathPresetRef | null = null) {
  const before = await fetchDatasetRevision(signal);
  if (before.dataset !== "public-kg" || before.revision !== revision) throw new ClientApiError("公開KGの版が変わりました。",409);
  const params = new URLSearchParams({ anchor, depth: String(depth), revision });
  if (conditions.predicates !== null) params.set("predicates",conditions.predicates.join(","));
  if (conditions.contributionRoles !== null) params.set("contributionRoles",conditions.contributionRoles.join(","));
  if (preset) { params.set("preset",preset.id);params.set("presetRevision",String(preset.revision)); }
  const raw = await fetchDiscoveryPaths(params,signal);
  if ((raw as { revision?: string })?.revision !== revision) throw new ClientApiError("公開KGの版が変わりました。",409);
  const result = validatePathResponse(raw,anchor,depth,revision,conditions,preset), after = await fetchDatasetRevision(signal);
  if (after.dataset !== before.dataset || after.revision !== revision) throw new ClientApiError("公開KGの版が変わりました。",409);
  signal.throwIfAborted();return result;
}
export function useDiscoveryPaths(enabled: boolean, anchor: string, depth: 2 | 3, conditions: PathConditions, revision: string, preset: PathPresetRef | null = null) {
  const [attempt,setAttempt]=useState(0), key=JSON.stringify([enabled,anchor,depth,conditions,revision,preset,attempt]);
  const [state,setState]=useState<{key:string; result?:DiscoveryPathsResponse; conflict?:boolean; error?:boolean}>({key:""});
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    void executePathSearch(anchor,depth,conditions,revision,controller.signal,preset).then(result=>{if(!controller.signal.aborted)setState({key,result});},error=>{if(!controller.signal.aborted)setState({key,error:true,conflict:error instanceof ClientApiError && error.status===409});});
    return ()=>controller.abort();
  },[enabled,anchor,depth,conditions,revision,preset,key]);
  const current=state.key===key?state:null;
  return {result:current?.result,error:current?.error,conflict:current?.conflict,loading:enabled&&!current,retry:()=>setAttempt(n=>n+1)};
}
