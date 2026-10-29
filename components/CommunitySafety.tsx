"use client";
import PageIdentity from "./PageIdentity";
import {useId,useRef,useState} from 'react';
import type {CommunityMutation,CommunityMutationResult} from '../lib/client/use-community-session';
import {CommunityDialog} from './CommunityDialog';
import css from './CommunityPage.module.css';
type Translate=(ja:string,en:string)=>string;
type Props={kind:'community'|'thread'|'post'|'capsule';id:string;revision:number;t:Translate;mutate:CommunityMutation;busy:boolean;reportable:boolean;moderate?:boolean;hiddenBy?:string|null;hidden?:boolean;targetLabel?:string};
export function CommunitySafetyActions({kind,id,revision,t,mutate,busy,reportable,moderate=false,hiddenBy,hidden=false,targetLabel}:Props){
 const [editor,setEditor]=useState<'report'|'moderate'|null>(null),[reason,setReason]=useState(''),[category,setCategory]=useState('spam'),[discard,setDiscard]=useState(false),[failure,setFailure]=useState<Extract<CommunityMutationResult,{ok:false}>|null>(null),[sending,setSending]=useState(false);
 const attempt=useRef<Record<string,unknown>|null>(null),reasonId=useId();
 const object=kind==='capsule'?'Capsule':kind==='post'?t('投稿','post'):kind==='thread'?t('スレッド','thread'):t('コミュニティ','community');
 const close=()=>{setEditor(null);setReason('');setFailure(null);setDiscard(false);attempt.current=null;};
 const cancel=()=>{if(sending)return;if(reason.trim()||failure?.unknown)setDiscard(true);else close();};
 const open=(mode:'report'|'moderate')=>{setEditor(mode);setDiscard(false);};
 return <div className={css.safety}><div className={css.actions}>
 {reportable&&<button className={css.quiet} disabled={busy||sending} onClick={()=>open('report')}>{t('通報','Report')}<span className={css.srOnly}> · {object}</span></button>}
 {moderate&&hiddenBy!=='site'&&<button className={css.quiet} disabled={busy||sending} onClick={()=>open('moderate')}>{hidden?t('非表示を解除','Unhide post'):t('投稿を非表示','Hide post')}</button>}
 {hiddenBy==='site'&&<small>{t('サイト運営による非表示','Hidden by site moderation')}</small>}
 </div>{editor&&<CommunityDialog title={editor==='report'?t('サイト運営へ通報','Report to site moderation'):hidden?t('投稿の非表示を解除','Unhide this post'):t('投稿を非表示にする','Hide this post')} busy={sending} onCancel={cancel}>
 <form className={css.safetyForm} onSubmit={async e=>{e.preventDefault();if(sending)return;setSending(true);
 const input=attempt.current??(editor==='report'?{kind,targetId:id,expectedRevision:revision,category,detail:reason}:{expectedRevision:revision,hidden:!hidden,reason});attempt.current=input;
 const result=await mutate(editor==='report'?'/reports':'/posts/'+id+'/moderate',input,editor==='report');setSending(false);
 if(result.ok)close();else{setFailure(result);if(!result.unknown)attempt.current=null;}
 }}>
 <p className={css.dialogTarget}>{t('対象','Target')}: {targetLabel??object}</p>
 <p>{editor==='report'?t('対象を限定して確認します。通報は、内容の誤りの認定や自動的な非表示ではありません。','Only the reported item is reviewed. A report does not establish that it is false or automatically hide it.'):hidden?t('投稿者が撤回した内容や、サイト運営の非表示は復活しません。','Author withdrawals and site moderation cannot be reversed here.'):t('本文を通常表示から除きます。投稿者の撤回とは別の管理操作です。','This removes the body from normal display. It is separate from author withdrawal.')}</p>
 {failure&&<p role="alert">{failure.unknown?t('送信結果を確認できませんでした。同じ内容で再試行すると、同じ受付として確認します。未送信とは断定できません。','The outcome is unknown. Retry the same report to recover its receipt without duplication. It may already have been received.'):failure.code==='REPORT_EXISTS'?t('この対象には受付済みの通報があります。自分の通報で確認してください。','An open report already exists. Check My reports.'):t('送信できませんでした。入力は保持しています。対象の版・権限または操作上限を確認して再試行してください。','Submission failed. Your input is retained. Check the target version, permissions or request limit before retrying.')} <code>{failure.code}</code></p>}
 {editor==='report'&&<fieldset disabled={sending||!!failure?.unknown}><legend>{t('通報の種類','Report category')}</legend><div className={css.actions}>{(['spam','harassment','privacy','other'] as const).map((v,i)=><label key={v}><input type="radio" name={'report-category-'+id} checked={category===v} onChange={()=>setCategory(v)}/>{[t('迷惑行為','Spam'),t('嫌がらせ','Harassment'),t('個人情報','Privacy'),t('その他','Other')][i]}</label>)}</div></fieldset>}
 <div><label htmlFor={reasonId}>{editor==='report'?t('通報の理由','Reason for reporting'):t('管理操作の理由','Reason for moderation')}</label><textarea id={reasonId} required maxLength={500} readOnly={sending||!!failure?.unknown} value={reason} onChange={e=>setReason(e.target.value)}/></div>
 <p>{t('対象外の私的な情報は記入しないでください。','Do not include unrelated private information.')}</p>
 {discard?<div className={css.discard}><p>{failure?.unknown?t('送信を取り消す操作ではありません。受付済みの可能性があります。入力を破棄して閉じますか？','This does not cancel a submitted report. It may already be received. Discard the draft and close?'):t('入力を破棄して閉じますか？','Discard your draft and close?')}</p><div className={css.actions}><button type="button" onClick={()=>setDiscard(false)}>{t('入力に戻る','Keep editing')}</button><button type="button" onClick={close}>{t('破棄して閉じる','Discard & close')}</button></div></div>:<div className={css.actions}><button className={css.primary} disabled={busy||sending}>{failure?.unknown?t('同じ送信を再確認','Retry same submission'):failure?.code==='COMMUNITY_CHANGED'?t('最新の対象版で再試行','Retry with current target version'):editor==='report'?t('通報を送る','Send report'):t('理由を記録して適用','Apply & record reason')}</button><button type="button" disabled={sending} onClick={cancel}>{t('キャンセル','Cancel')}</button></div>}
 </form></CommunityDialog>}</div>;
}
export function CommunityReportReceipts({reports,t}:{reports:{id:string;kind:string;status:string}[];t:Translate}){
 return <section><header className={css.heading}><div><PageIdentity area="activity"/><h1>{t('自分の通報','My reports')}</h1><p>{t('受付状況を確認できます。通報は真偽の認定とは別です。','Track your reports. Reporting is separate from judging truth.')}</p></div></header>{!reports.length&&<p className={css.empty}>{t('通報はありません。','No reports.')}</p>}{reports.map(r=><article className={css.row} key={r.id}><div><strong>{r.kind==='capsule'?t('Capsuleへの通報','Capsule report'):r.kind==='post'?t('投稿への通報','Post report'):r.kind==='thread'?t('スレッドへの通報','Thread report'):t('コミュニティへの通報','Community report')}</strong><small>{t('受付ID','Report ID')}: <code>{r.id}</code></small></div><span>{r.status==='open'?t('確認待ち','Open'):r.status==='resolved'?t('対応を終了','Resolved'):r.status==='expired'?t('確認期限終了・必要なら再通報','Review expired · report again if needed'):t('対応不要として終了','Dismissed')}</span></article>)}</section>;
}
