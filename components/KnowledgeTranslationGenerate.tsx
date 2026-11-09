"use client";
import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import type {KnowledgeTextTarget} from '../lib/domain/knowledge-translation';
import {translationGenerationStatusSchema,translationGenerationDisclosure,type TranslationGenerationStatus} from '../lib/domain/knowledge-translation-generation';
import {memberRequest,MemberClientError} from '../lib/client/member-api';
import {useMemberSession} from '../lib/client/use-member-identity';
import css from './KnowledgeTranslationPanel.module.css';
export default function KnowledgeTranslationGenerate({target,language,en}:{target:KnowledgeTextTarget;language:string;en:boolean}){
 const identity=useMemberSession(),userId=identity.status==='authenticated'?identity.user?.id:undefined;
 const [status,setStatus]=useState<TranslationGenerationStatus|null>(null),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState<string|null>(null);
 const key=JSON.stringify(target);
 const load=useCallback(async(action:'status'|'request'|'cancel',signal?:AbortSignal)=>{
  if(!userId)return null;const r=await memberRequest('/api/member/translation-generation',z.object({generation:translationGenerationStatusSchema}),{method:'POST',user:userId,body:{action,target:JSON.parse(key),language,...(action==='request'?{profileId:translationGenerationDisclosure.profileId}:{})},signal});return r.generation;
 },[key,language,userId]);
 useEffect(()=>{const c=new AbortController();if(userId)void load('status',c.signal).then(v=>{if(!c.signal.aborted)setStatus(v);}).catch(e=>{if(!c.signal.aborted)setError(e instanceof MemberClientError&&e.status===404?(en?'Automatic translation is not available for this account.':'このアカウントでは自動翻訳を利用できません。'):en?'Could not check the translation request.':'翻訳依頼を確認できません。');});return()=>c.abort();},[load,userId,en]);
 const run=async(action:'request'|'cancel'|'status')=>{setBusy(true);setError(null);try{setStatus(await load(action));}catch(e){setError(e instanceof MemberClientError&&e.status===429?(en?'Too many requests. Try again later.':'翻訳依頼が続いています。時間をおいて再試行してください。'):en?'Could not complete the request. Your draft is safe.':'操作を完了できませんでした。草稿は保持されています。');}finally{setBusy(false);}};
 const pending=status&&['queued','running','retry','quota'].includes(status.state);
 const link='/member/submissions?'+new URLSearchParams({translate:JSON.stringify(target),language,...(status?.state==='ready'?{generation:status.id}:{})});
 if(!userId)return <small>{en?'Sign in to request an automatic translation.':'ログインすると自動翻訳を依頼できます。'}</small>;
 return <div className={css.generation}>
  {error&&<p role="alert">{error}</p>}
  {status?.state==='ready'?<><small>{en?'Generated draft · not published':'自動生成の草稿・未公開'}</small><p lang={language}>{status.text}</p><a href={link}>{en?'Check and edit this draft':'この訳文を確認・編集する'} →</a></>:pending?<><p role="status">{!status.workerAvailable?(en?'Waiting for translation processing to resume.':'翻訳処理の再開を待っています。'):status.reason||(en?'Waiting to generate a translation.':'訳文の生成待ちです。')}{status.nextAttemptAt&&<> · {new Date(status.nextAttemptAt).toLocaleString(en?'en':'ja')} {en?'or later':'以降'}</>}</p><button disabled={busy} onClick={()=>void run('status')}>{en?'Check result':'結果を確認'}</button><button disabled={busy} onClick={()=>void run('cancel')}>{en?'Cancel request':'依頼を取り消す'}</button></>:<>
   {status?.reason&&<p role="status">{status.reason}</p>}
   {status?.state!=='attention'&&<><label className={css.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{en?'Send this public original and its context to generate an editable translation.':'この公開原文と文脈を送って、編集できる訳文を生成します。'}</span></label><small>{en?'For people aged 18 or older in eligible regions. ':'18歳以上・提供地域の条件を満たしてご利用ください。'}{translationGenerationDisclosure.serviceName} · {en?'Free API inputs may be used to improve Google services. Only the public original and its subject, relation and source context are sent.':translationGenerationDisclosure.notice} <a href="/privacy#knowledge-ai" target="_blank" rel="noopener noreferrer">{en?'Conditions & external processing':'利用条件・外部送信'} ↗</a></small><button disabled={busy||!consent} onClick={()=>void run('request')}>{busy?(en?'Requesting…':'依頼中…'):en?'Generate translation draft':'訳文を自動で下書き'}</button></>}
   <button disabled={busy} onClick={()=>void run('status')}>{en?'Check request':'依頼状況を確認'}</button>
  </>}
 </div>;
}
