import type {callGeminiReview} from './gemini-knowledge-review';

type WireResult=Awaited<ReturnType<typeof callGeminiReview>>;
export const REVIEW_SENDS_PER_ITEM_DAY=8;
/** One durable attempt at a time; no in-process retry loop or paid fallback. */
export function reviewRetryAt(attempts:number,retryAfter:string|null=null,now=new Date(),random=Math.random()){
 const base=Math.min(3600000,120000*2**Math.max(0,Math.min(5,attempts-1)));
 const jitter=Math.round(base*(.85+.3*Math.max(0,Math.min(1,random))));
 const seconds=retryAfter===null?NaN:Number(retryAfter),date=Date.parse(retryAfter??'');
 const requested=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?Math.max(0,date-now.getTime()):0;
 return new Date(now.getTime()+Math.min(86400000,Math.max(Math.min(3600000,jitter),requested)));
}
/** Allowlisted metadata only: no provider body, exception message, URL or headers. */
export function aiFailureDiagnostic(result:WireResult|{state:'not-sent'}){
 if(result.state==='http-error'){
  const value=result.retryAfter,seconds=value&&/^[0-9]{1,8}$/.test(value)?String(Number(value)):null,date=Date.parse(value??'');
  const retryAfter=seconds??(Number.isFinite(date)?new Date(date).toUTCString():null);
  return {kind:'attempt-failure',version:1,state:result.state,category:result.category,httpStatus:result.status,retryAfter};
 }
 if(result.state==='delivery-unknown')return {kind:'attempt-failure',version:1,state:result.state,category:result.transport?.category??'network',transportCode:result.transport?.code??'UNKNOWN'};
 return null;
}
