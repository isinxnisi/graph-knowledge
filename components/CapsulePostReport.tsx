"use client";
import {useEffect,useRef} from "react";
import {z} from "zod";
import {CommunitySafetyActions} from "./CommunitySafety";
import {MemberClientError} from "../lib/client/member-api";
import type {CommunityMutation} from "../lib/client/use-community-session";
export function CapsulePostReport({capsuleId,revision,postRevision,postId,moderationRevision,userId,token,t,onReported}:{capsuleId:string;revision:number;postRevision:number;postId:string;moderationRevision:number;userId:string;token?:string;t:(ja:string,en:string)=>string;onReported:()=>void}) {
 const pending=useRef(new Map<string,{requestId:string;body:Record<string,unknown>} >()),active=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
 const mutate:CommunityMutation=async(_path,input)=>{
  const key=JSON.stringify(input);
  const attempt=pending.current.get(key)??{requestId:crypto.randomUUID(),body:{postId,revision,expectedRevision:input.expectedRevision,category:input.category,detail:input.detail}};pending.current.set(key,attempt);
  const ac=new AbortController();active.current=ac;
  try{
   const response=await fetch(`/api/capsules/${capsuleId}/discussion/reports`,{method:"POST",cache:"no-store",credentials:"same-origin",referrerPolicy:"no-referrer",headers:{"Content-Type":"application/json","X-Member-User":userId,...(token?{"X-Capsule-Token":token}:{})},body:JSON.stringify({...attempt.body,requestId:attempt.requestId}),signal:AbortSignal.any([ac.signal,AbortSignal.timeout(15000)])});
   if(!response.ok){const error=await response.json().catch(()=>null);throw new MemberClientError(response.status,error?.error?.code??"REQUEST_FAILED");}
   const result=z.object({id:z.uuidv4()}).parse(await response.json());
   if(!mounted.current||ac.signal.aborted)return {ok:false,code:"RESULT_UNKNOWN",unknown:true};
   pending.current.delete(key);onReported();return {ok:true,receipt:result.id};
  }catch(e){const unknown=!(e instanceof MemberClientError)||e.status>=500;if(!unknown)pending.current.delete(key);return {ok:false,code:e instanceof MemberClientError?e.code:"RESULT_UNKNOWN",unknown};}
 };
 return <CommunitySafetyActions kind="capsule-post" id={postId} revision={moderationRevision} t={t} mutate={mutate} busy={false} reportable targetLabel={t(`保存版 ${postRevision} へのコメント`, `Comment on version ${postRevision}`)}/>;
}
