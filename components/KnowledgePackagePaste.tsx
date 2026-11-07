"use client";
import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {knowledgeImportPackageSchema,type KnowledgeImportPackage} from '../lib/domain/knowledge-import';
import {webImportPageSchema,webImportReceiptSchema} from '../lib/domain/knowledge-web-import';
import {memberRequest,MemberClientError} from '../lib/client/member-api';
import {getMemberIdentitySnapshot} from '../lib/client/use-member-identity';
import {useUiLocale} from '../lib/client/ui-locale';
import css from './KnowledgeCollection.module.css';
const acceptedSchema=z.object({receipt:webImportReceiptSchema,replayed:z.boolean()});
const sendResultSchema=z.union([acceptedSchema,z.object({receiptId:z.string()})]);
export function KnowledgePackagePaste({userId,onDirty}:{userId:string;onDirty:(v:boolean)=>void}){
 const {locale}=useUiLocale(),t=(ja:string,en:string)=>locale==='ja'?ja:en;
 const [opened,setOpened]=useState(false),[text,setText]=useState(''),[preview,setPreview]=useState<KnowledgeImportPackage|null>(null),[page,setPage]=useState<z.infer<typeof webImportPageSchema>|null>(null),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tick,setTick]=useState(0);
 const alive=useRef(true),pending=useRef<Record<string,unknown>|null>(null);
 const belongs=()=>alive.current&&getMemberIdentitySnapshot().user?.id===userId;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onDirty(!!text||unknown);return()=>onDirty(false);},[text,unknown,onDirty]);
 useEffect(()=>{if(!opened)return;const ac=new AbortController();async function load(){if(document.hidden)return;try{const p=await memberRequest('/api/site-operations/knowledge-packages',webImportPageSchema,{user:userId,signal:ac.signal});if(belongs())setPage(p);}catch{if(!ac.signal.aborted&&belongs())setError(t('受付履歴を取得できません。入力は保持しています。','Could not load receipts. Inputs are retained.'));}}void load();const timer=setInterval(()=>void load(),15000);return()=>{ac.abort();clearInterval(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[opened,tick,userId]);
 async function send(body:Record<string,unknown>){if(busy)return;pending.current=body;setBusy(true);setError('');
  try{await memberRequest('/api/site-operations/knowledge-packages',sendResultSchema,{method:'POST',user:userId,body});if(belongs()){pending.current=null;setUnknown(false);setNotice(body.action==='deliver'?t('受け付けました。下の履歴で確認結果と公開先を確認できます。','Received. Results and public links will appear below.'):t('未反映の項目を取り消しました。公開済みの知識は残ります。','Unapplied items cancelled. Published knowledge is retained.'));if(body.action==='deliver'){setText('');setPreview(null);}setTick(n=>n+1);}}
  catch(e){if(belongs()){const ambiguous=!(e instanceof MemberClientError)||e.status>=500;setUnknown(ambiguous);if(!ambiguous)pending.current=null;setError(ambiguous?t('結果を確認できません。同じ内容を再送できます。','Outcome unknown. Retry the same content.'):e instanceof MemberClientError&&e.code==='PACKAGE_CONFLICT'?t('同じパッケージ版に別の内容があります。新しい版番号を使ってください。','This package revision has different content. Use a new revision.'):t('パッケージの形式・対象版・権限を確認してください。入力は保持しています。','Check package format, pinned versions and access. Inputs are retained.'));}}finally{if(alive.current)setBusy(false);}
 }
 const state=(s:string)=>({processing:t('確認中','Checking'),completed:t('反映済み','Completed'),'completed-with-issues':t('補足が必要な項目あり','Some items need changes'),cancelled:t('未反映分を取消済み','Unapplied items cancelled')}[s]??s);
 return <details className={css.paste} open={opened} onToggle={e=>setOpened(e.currentTarget.open)}><summary>{t('パッケージから登録','Register a package')}</summary><p className={css.missionHint}>{t('Chat側でまとめた取込JSONを貼り付けます。原資料と内容を確認し、条件を満たす項目を自動で公開します。','Paste import JSON prepared by your research chat. Supported items publish automatically after source and content checks.')}</p>
 {error&&<p role="alert">{error}{unknown&&<button disabled={busy} onClick={()=>void send(pending.current!)}>{t('同じ内容を再送','Retry same content')}</button>}</p>}{notice&&<p role="status">{notice}</p>}
 <label className={css.pasteLabel}>{t('取込パッケージ（JSON）','Import package (JSON)')}<textarea rows={6} spellCheck={false} value={text} disabled={busy||unknown} placeholder={'{ "format": "plunode-knowledge-package", … }'} onChange={e=>{setText(e.target.value);setPreview(null);setError('');setNotice('');}}/></label>
 <div className={css.missionActions}>{text&&<button disabled={busy||unknown} onClick={()=>{setText('');setPreview(null);}}>{t('入力を破棄','Discard input')}</button>}<button disabled={!text.trim()||busy||unknown} onClick={()=>{try{if(new TextEncoder().encode(text).length>2000000)throw Error();setPreview(knowledgeImportPackageSchema.parse(JSON.parse(text)));setError('');}catch{setError(t('取込JSONを確認してください。最大2MB・20項目です。','Check the import JSON. Maximum 2 MB and 20 items.'));}}}>{t('内容を確認','Review content')}</button></div>
 {preview&&<div className={css.pastePreview}><strong>{preview.packageId} · {t('版','revision')} {preview.revision}</strong><small>{t('項目','Items')} {preview.items.length} · {t('新しい対象','New entities')} {preview.entities.length} · {t('資料','Sources')} {preview.sources.length+preview.sourcePins.length}</small><ul>{preview.items.map((v,n)=><li key={n}>{n+1}. {v&&typeof v==='object'&&!Array.isArray(v)&&v.record&&typeof v.record==='object'&&!Array.isArray(v.record)?String(v.record.assertion??v.operation??''):t('形式は受付時に確認します','Format checked on receipt')}</li>)}</ul><button data-primary disabled={busy||unknown} onClick={()=>void send({action:'deliver',requestId:crypto.randomUUID(),package:JSON.parse(text)})}>{busy?t('受付中…','Receiving…'):t('この内容を受け付ける','Submit this package')}</button></div>}
 {page?.items.map(p=><article className={css.job} key={p.requestId}><div className={css.jobHead}><strong>{p.packageId} · {t('版','revision')} {p.revision}</strong><small>{p.receipt?state(p.receipt.state):p.state==='needs-changes'?t('内容を確認してください','Review this package'):p.state==='cancelled'?t('配送停止','Delivery stopped'):t('配送を確認中','Confirming delivery')}</small></div><small>{new Date(p.createdAt).toLocaleString(locale)}</small>{p.reason&&<p role="status">{p.reason}</p>}{p.receipt?.items.map(v=><p key={v.ordinal}>{v.ordinal}. {v.reason}{v.result?.currentUrl&&<a href={v.result.currentUrl} target="_blank" rel="noopener noreferrer"> {t('知識を読む ↗','Read knowledge ↗')}</a>}</p>)}{p.receipt?.state==='processing'&&<details><summary>{t('未反映分を取り消す','Cancel unapplied items')}</summary><p>{t('公開済みの知識は残ります。','Published knowledge is retained.')}</p><button disabled={busy||unknown} onClick={()=>void send({action:'cancel',receiptId:p.receipt!.receiptId})}>{t('取り消す','Cancel')}</button></details>}</article>)}
 </details>;
}
