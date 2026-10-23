"use client";
import {useState} from 'react';
import css from './CommunityPage.module.css';

type Translate=(ja:string,en:string)=>string;
type Mutate=(path:string,input:Record<string,unknown>,idempotent?:boolean)=>Promise<void>;
type Props={kind:'community'|'thread'|'post',id:string,revision:number,t:Translate,mutate:Mutate,busy:boolean,reportable:boolean,moderate?:boolean,hiddenBy?:string|null,hidden?:boolean};

export function CommunitySafetyActions({kind,id,revision,t,mutate,busy,reportable,moderate=false,hiddenBy,hidden=false}:Props) {
 const [editor,setEditor]=useState<'report'|'moderate'|null>(null);
 const [reason,setReason]=useState(''),[category,setCategory]=useState('spam');
 const object=kind==='post'?t('投稿','post'):kind==='thread'?t('スレッド','thread'):t('コミュニティ','community');
 return <div className={css.safety}>
  <div className={css.actions}>
   {reportable&&<button className={css.quiet} disabled={busy} onClick={()=>setEditor(editor==='report'?null:'report')}>{t('通報','Report')}<span className={css.srOnly}> · {object}</span></button>}
   {moderate&&hiddenBy!=='site'&&<button className={css.quiet} disabled={busy} onClick={()=>setEditor(editor==='moderate'?null:'moderate')}>{hidden?t('非表示を解除','Unhide post'):t('投稿を非表示','Hide post')}</button>}
   {hiddenBy==='site'&&<small>{t('サイト運営による非表示','Hidden by site moderation')}</small>}
  </div>
  {editor&&<form className={css.safetyForm} onSubmit={async e=>{
   e.preventDefault();
   if(editor==='report')await mutate('/reports',{kind,targetId:id,expectedRevision:revision,category,detail:reason},true);
   else await mutate('/posts/'+id+'/moderate',{expectedRevision:revision,hidden:!hidden,reason});
   setEditor(null);setReason('');
  }}>
   <h3>{editor==='report'?t('サイト運営へ通報','Report to site moderation'):hidden?t('投稿の非表示を解除','Unhide this post'):t('投稿を非表示にする','Hide this post')}</h3>
   <p>{editor==='report'?t('対象を限定して確認します。通報は、内容の誤りの認定や自動的な非表示ではありません。','Only the reported item is reviewed. A report does not establish that it is false or automatically hide it.'):hidden?t('投稿者が撤回した内容や、サイト運営の非表示は復活しません。','Author withdrawals and site moderation cannot be reversed here.'):t('本文を通常表示から除きます。投稿者の撤回とは別の管理操作です。','This removes the body from normal display. It is separate from author withdrawal.')}</p>
   {editor==='report'&&<fieldset><legend>{t('通報の種類','Report category')}</legend><div className={css.actions}>{(['spam','harassment','privacy','other'] as const).map((v,i)=><label key={v}><input type="radio" name={'report-category-'+id} checked={category===v} onChange={()=>setCategory(v)}/>{[t('迷惑行為','Spam'),t('嫌がらせ','Harassment'),t('個人情報','Privacy'),t('その他','Other')][i]}</label>)}</div></fieldset>}
   <label>{editor==='report'?t('通報の理由','Reason for reporting'):t('管理操作の理由','Reason for moderation')}<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <p>{t('対象外の私的な情報は記入しないでください。','Do not include unrelated private information.')}</p>
   <div className={css.actions}><button className={css.primary} disabled={busy}>{editor==='report'?t('通報を送る','Send report'):t('理由を記録して適用','Apply & record reason')}</button><button type="button" onClick={()=>{setEditor(null);setReason('');}}>{t('キャンセル','Cancel')}</button></div>
  </form>}
 </div>;
}

export function CommunityReportReceipts({reports,t}:{reports:{id:string,kind:string,status:string}[],t:Translate}) {
 return <section><h1>{t('自分の通報','My reports')}</h1><p>{t('通報はサイト運営が確認します。対象の非公開内容や参加権は、この一覧から復元しません。','Reports are reviewed by site moderation. This list does not restore access to private content or memberships.')}</p>
  {!reports.length&&<p>{t('通報はありません。','No reports.')}</p>}
  {reports.map(r=><article className={css.row} key={r.id}><div><strong>{r.kind==='post'?t('投稿への通報','Post report'):r.kind==='thread'?t('スレッドへの通報','Thread report'):t('コミュニティへの通報','Community report')}</strong><small>{t('受付ID','Report ID')}: <code>{r.id}</code></small></div><span>{r.status==='open'?t('確認待ち','Open'):r.status==='resolved'?t('対応を終了','Resolved'):r.status==='expired'?t('確認期限終了・必要なら再通報','Review expired · report again if needed'):t('対応不要として終了','Dismissed')}</span></article>)}
 </section>;
}
