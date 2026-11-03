"use client";
import KnowledgeAppeal from "./KnowledgeAppeal";
import {canAppeal} from "../lib/domain/knowledge-appeal";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {submissionFeedbackSchema,notificationSummarySchema,feedbackCounts,feedbackPendingStates,feedbackSummary,type SubmissionFeedback} from "../lib/domain/knowledge-submission-feedback";
import {reviewStateLabel} from "../lib/domain/knowledge-review-job";
import {memberRequest,MemberClientError} from "../lib/client/member-api";
import {getMemberIdentitySnapshot,refreshMemberIdentity,useMemberSession} from "../lib/client/use-member-identity";
import {acceptSubmissionNotificationSummary} from "../lib/client/use-submission-notifications";
import {useUiLocale} from "../lib/client/ui-locale";
import Icon from "./Icon";
import css from "./KnowledgeSubmissionFeedbackCard.module.css";

const receiptLocationEvent="knowledge-submission:receipt-location";
const subscribeReceiptLocation=(listener:()=>void)=>{window.addEventListener("popstate",listener);window.addEventListener(receiptLocationEvent,listener);return()=>{window.removeEventListener("popstate",listener);window.removeEventListener(receiptLocationEvent,listener);};};
type Props={submissionId:string;userId:string;currentRevision:number;stateVersion?:number;dirty?:boolean;onSelectItem?:(key:string)=>void};
type Display={submissionId:string;identityVersion:number;data:SubmissionFeedback|null;error:boolean};
export default function KnowledgeSubmissionFeedbackCard({submissionId,userId,currentRevision,stateVersion,dirty=false,onSelectItem}:Props){
 const identity=useMemberSession(),{locale}=useUiLocale(),t=(ja:string,en:string)=>locale==="en"?en:ja;
 const [copyStatus,setCopyStatus]=useState<string|null>(null),[display,setDisplay]=useState<Display|null>(null),[acknowledging,setAcknowledging]=useState(false),[ackError,setAckError]=useState(false);
 const locationQuery=useSyncExternalStore(subscribeReceiptLocation,()=>location.search,()=>null),params=new URLSearchParams(locationQuery??""),requestedRevision=params.get("id")===submissionId?params.get("receipt")??undefined:undefined,sequence=useRef(0),flight=useRef<{key:string;signal?:AbortSignal;promise:Promise<void>}|null>(null),version=identity.version;
 function selectReceipt(revision:number|null){const url=new URL(location.href);url.searchParams.set("id",submissionId);if(revision===null)url.searchParams.delete("receipt");else url.searchParams.set("receipt",String(revision));history.replaceState(history.state,"",url);window.dispatchEvent(new Event(receiptLocationEvent));setAckError(false);setCopyStatus(null);}
 const belongs=useCallback(()=>{const current=getMemberIdentitySnapshot();return current.status==="authenticated"&&current.user?.id===userId&&current.version===version;},[userId,version]);
 const load=useCallback((signal?:AbortSignal)=>{
  if(!belongs()||signal?.aborted)return Promise.resolve();
  const key=JSON.stringify([submissionId,requestedRevision,userId,version]);
  if(flight.current?.key===key&&!flight.current.signal?.aborted)return flight.current.promise;
  const request=++sequence.current;
  const promise=(async()=>{try{
   const query=new URLSearchParams({submissionId,...(requestedRevision===undefined?{}:{revision:String(requestedRevision)})});
   const data=await memberRequest(`/api/member/knowledge-submissions/feedback?${query}`,submissionFeedbackSchema,{user:userId,signal});
   if(request===sequence.current&&belongs()&&!signal?.aborted)setDisplay({submissionId,identityVersion:version,data,error:false});
  }catch(error){if(request===sequence.current&&belongs()&&!signal?.aborted){
   const denied=error instanceof MemberClientError&&[400,401,403,404].includes(error.status);
   setDisplay(previous=>({submissionId,identityVersion:version,data:!denied&&previous?.submissionId===submissionId&&previous.identityVersion===version?previous.data:null,error:true}));
   if(error instanceof MemberClientError&&error.status===401)void refreshMemberIdentity(true).catch(()=>{});
  }}finally{if(request===sequence.current)flight.current=null;}})();
  flight.current={key,signal,promise};return promise;
 },[belongs,requestedRevision,submissionId,userId,version]);
 useEffect(()=>{
  const controller=new AbortController(),timer=setTimeout(()=>void load(controller.signal),0);
  return()=>{clearTimeout(timer);controller.abort();};
 },[load,currentRevision,stateVersion]);
 const visible=belongs()&&display?.submissionId===submissionId&&display.identityVersion===version?display:null,data=visible?.data,receipt=data?.receipt;
 const pending=receipt?receipt.items.some(item=>item.appeal?.status==="open"||item.appeal?.pending||feedbackPendingStates.has(item.state)||item.state==="reviewed"&&receipt.disclosure?.purpose==="publish")||receipt.current&&!receipt.cancelled&&receipt.items.length===0:false;
 useEffect(()=>{
  if(!pending)return;
  const controller=new AbortController(),refresh=()=>{if(!document.hidden)void load(controller.signal);},timer=setInterval(refresh,5000);
  document.addEventListener("visibilitychange",refresh);
  return()=>{clearInterval(timer);controller.abort();document.removeEventListener("visibilitychange",refresh);};
 },[load,pending]);
 async function copyReceiptLink(){
  if(!receipt||!belongs())return;
  const url=new URL(location.href);url.search="";url.hash="";url.searchParams.set("id",submissionId);url.searchParams.set("receipt",String(receipt.revision));
  try{await navigator.clipboard.writeText(url.href);if(belongs())setCopyStatus(t("本人用のリンクをコピーしました。","Copied your private results link."));}catch{if(belongs())setCopyStatus(t("リンクをコピーできませんでした。","Could not copy the link."));}
 }
 async function acknowledge(){
  if(!receipt?.eventCursor||!belongs()||acknowledging)return;
  // Capture the cursor of these displayed results, rather than a newer server
  // cursor. A concurrent result remains unread until it has been seen too.
  const cursor=receipt.eventCursor,revision=receipt.revision;setAcknowledging(true);setAckError(false);
  try{
   const summary=await memberRequest("/api/member/knowledge-submissions/feedback",notificationSummarySchema,{method:"POST",user:userId,body:{action:"acknowledge",submissionId,revision,throughEventId:cursor}});
   if(!belongs())return;
   acceptSubmissionNotificationSummary(userId,version,summary);
   setDisplay(previous=>previous?.submissionId===submissionId&&previous.identityVersion===version&&previous.data?.receipt?.revision===revision&&previous.data.receipt.eventCursor===cursor?{...previous,data:{...previous.data,receipts:previous.data.receipts.map(row=>row.revision===revision?{...row,unread:false}:row),receipt:{...previous.data.receipt,unread:false}}}:previous);
  }catch{if(belongs())setAckError(true);}finally{setAcknowledging(false);}
 }
 if(!receipt){return visible?.error?<section className={css.card}><p role="status">{t("確認結果を取得できません。入力内容はそのままです。","Results are unavailable. Your input is unchanged.")}</p><button type="button" onClick={()=>void load()}><Icon name="refresh"/>{t("再取得","Retry")}</button>{requestedRevision!==undefined&&<button type="button" onClick={()=>selectReceipt(null)}>{t("最新の受付結果を見る","Show latest submitted results")}</button>}</section>:null;}
 const stateLabel=(state:string)=>state==="reviewed"&&receipt.disclosure?.purpose==="review"?t("確認が完了しました・未公開","Review completed · not published"):reviewStateLabel(state,locale);
 const originalSummary=feedbackSummary(feedbackCounts(receipt.items),receipt.workerAvailable,receipt.disclosure?.purpose??"publish",locale,receipt.cancelled);
 const openAppeals=receipt.items.filter(item=>item.appeal?.status==='open').length;
 const summary=openAppeals?{...originalSummary,label:originalSummary.published?t("公開済み・運営へ相談中","Published · operator request open"):t("運営への相談を受け付けました","Waiting for operator response"),tone:"neutral"}:originalSummary;
 const published=receipt.items.filter(item=>item.state==="published"&&item.publication?.state==="published"),firstPublished=published[0];
 const publicLink=(item:typeof receipt.items[number])=>item.state==="published"&&item.publication?.state==="published"?<div className={css.publication}><span>{t(`公開した内容版 ${item.publication.revision}`,`Published version ${item.publication.revision}`)}</span><a href={'/?krecord='+encodeURIComponent(item.publication.id)} target="_blank" rel="noopener noreferrer">{t("公開先を開く","Open public record")}<Icon name="external"/></a></div>:null;
 const actionable=receipt.items.filter(item=>["needs-changes","declined","attention"].includes(item.state)),shown=actionable[0];
 const appealFor=(item:typeof receipt.items[number])=>canAppeal(item.state)||item.appeal?<KnowledgeAppeal key={item.key+":"+receipt.revision} submissionId={submissionId} revision={receipt.revision} itemKey={item.key} userId={userId} appeal={item.appeal} published={item.state==="published"} onChange={()=>void load()}/>:null;
 const time=(value:string)=>new Intl.DateTimeFormat(locale==="en"?"en":"ja",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
 return <section className={css.card} data-tone={summary.tone} aria-label={t("投稿の状況と確認結果","Submission status and results")}>
  <div className={css.heading}><div><span className={css.eyebrow}>{t("投稿の状況","Submission status")}{receipt.unread&&<span className={css.unread}>{t("新しい結果","New results")}</span>}</span><h2 aria-live="polite">{summary.label}</h2></div><button type="button" className={css.refresh} onClick={()=>void load()} aria-label={t("確認結果を更新","Refresh results")} title={t("確認結果を更新","Refresh results")}><Icon name="refresh"/></button></div>
  <div className={css.receipt}><span>{t(`受付版 ${receipt.revision}`,`Submitted version ${receipt.revision}`)} · {time(receipt.submittedAt)}</span>{summary.total>0&&<span>{summary.published>0&&t(`${summary.published}件公開 · `,`${summary.published} published · `)}{t(`${summary.total}項目`,`${summary.total} items`)}</span>}
   {data!.receipts.length>1&&<label><span className={css.srOnly}>{t("確認する受付版","Submitted version")}</span><select value={receipt.revision} onChange={event=>selectReceipt(Number(event.target.value))}>{data!.receipts.map(row=><option key={row.revision} value={row.revision}>{t(`受付版 ${row.revision}`,`Version ${row.revision}`)}{row.unread?t(" · 未読"," · unread"):""}</option>)}</select></label>}<button type="button" className={css.copy} onClick={()=>void copyReceiptLink()} aria-label={t("この受付版へのリンクをコピー（本人用）","Copy a private link to this submitted version")} title={t("この受付版へのリンクをコピー（本人用）","Copy a private link to this submitted version")}><Icon name="link"/></button>{copyStatus&&<span role="status">{copyStatus}</span>}
  </div>
  {(!receipt.current||dirty)&&<p className={css.context}>{t("以下は送信した時点の内容への結果です。編集中の変更には反映されません。","These results concern the submitted version, not your current edits.")}</p>}
  {firstPublished&&<div className={css.published}>{publicLink(firstPublished)}<small>{t("公開先では現在の内容を表示します。","The link opens the current public content.")}{published.length>1&&<> {t(`ほか${published.length-1}件は項目ごとの結果から開けます。`,`Open ${published.length-1} other records from the item results.`)}</>}</small></div>}
  {!shown&&firstPublished&&appealFor(firstPublished)}
  {shown&&<div className={css.actionable}><strong>{shown.assertion}</strong><p>{shown.reason||stateLabel(shown.state)}</p>{onSelectItem&&receipt.current&&currentRevision===receipt.revision&&<button type="button" onClick={()=>onSelectItem(shown.key)}>{t("該当する項目を確認","Review this item")}<Icon name="arrow"/></button>}{appealFor(shown)}{actionable.length>1&&<small>{t(`ほか${actionable.length-1}項目にも確認結果があります。`,`There are results for ${actionable.length-1} other items.`)}</small>}</div>}
  <details className={css.details}><summary>{t("項目ごとの状況と結果","Item status and results")} · {receipt.items.length}</summary><ul>{receipt.items.map((item,index)=><li key={item.key}><div><strong>{t(`項目 ${index+1}`,`Item ${index+1}`)} · {item.assertion}</strong><span>{stateLabel(item.state)}</span></div>{item.reason&&<p>{item.reason}</p>}{publicLink(item)}{item.key!==shown?.key&&item.key!==firstPublished?.key&&appealFor(item)}{item.nextAttemptAt&&<small>{t("次の確認予定","Next check")} · {time(item.nextAttemptAt)}</small>}</li>)}</ul>{receipt.disclosure&&<p className={css.provider}>{t("送信先","Sent to")} · {receipt.disclosure.serviceName} / {receipt.disclosure.notice}</p>}</details>
  {receipt.unread&&receipt.eventCursor&&<div className={css.confirm}><span>{t("確認結果を読んだら、未読通知を消せます。","Mark these results as read after reviewing them.")}</span><button type="button" disabled={acknowledging} onClick={()=>void acknowledge()}><Icon name="check"/>{t("結果を確認した","Mark results as read")}</button></div>}
  {(visible?.error||ackError)&&<p role="status" className={css.context}>{ackError?t("既読にできませんでした。もう一度お試しください。","Could not mark as read. Please retry."):t("通信できません。取得済みの結果を表示しています。","Offline. Showing previously loaded results.")}</p>}
 </section>;
}
