"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useUiLocale} from '../lib/client/ui-locale';
import {memberRequest,MemberClientError,type MemberUser} from '../lib/client/member-api';
import {ownPublicProfileSchema,publicProfileInput,profileHref,humanIconSchema} from '../lib/domain/public-profile';
import {usePublicProfilesEnabled} from './PublicProfileAvailability';
import ProfileAvatar from './ProfileAvatar';
import css from './PublicProfile.module.css';
const blank={handle:'',displayName:'',bio:'',icon:'person' as 'person'|'leaf'|'star'|'orbit',timelinePublic:false,expectedRevision:0};
export default function PublicProfileEditor({user}:{user:MemberUser}) {
  const enabled=usePublicProfilesEnabled();
  return enabled?<Editor key={user.id} user={user}/>:null;
}
function Editor({user}:{user:MemberUser}) {
  const {locale}=useUiLocale(),en=locale==='en';
  const [value,setValue]=useState(blank),[original,setOriginal]=useState(blank),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  const load=useCallback(async()=>{active.current?.abort();const c=new AbortController();active.current=c;try{const r=await memberRequest('/api/accounts/me',ownPublicProfileSchema,{user:user.id,signal:c.signal});if(c.signal.aborted)return;const next=r.profile?{handle:r.profile.handle,displayName:r.profile.displayName,bio:r.profile.bio,icon:humanIconSchema.parse(r.profile.icon),timelinePublic:r.profile.timelinePublic,expectedRevision:r.revision}:blank;setValue(next);setOriginal(next);setLoaded(true);}catch{if(!c.signal.aborted)setError('load');}},[user.id]);
  useEffect(()=>{mounted.current=true;const frame=requestAnimationFrame(()=>void load());return()=>{cancelAnimationFrame(frame);mounted.current=false;active.current?.abort();};},[load]);
  const dirty=JSON.stringify(value)!==JSON.stringify(original);
  useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};const navigate=(e:MouseEvent)=>{const a=(e.target as Element).closest('a');if(dirty&&a&&new URL(a.href,location.href).href!==location.href&&!confirm(en?'Discard your profile edits?':'プロフィールの未保存の入力を破棄しますか？')){e.preventDefault();e.stopPropagation();}};addEventListener('beforeunload',protect);document.addEventListener('click',navigate,true);return()=>{removeEventListener('beforeunload',protect);document.removeEventListener('click',navigate,true);};},[dirty,en]);
  const parsed=publicProfileInput.safeParse(value);
  async function save(){if(!parsed.success||busy)return;setBusy(true);setError('');setSaved(false);try{const r=await memberRequest('/api/accounts/me',ownPublicProfileSchema,{method:'PUT',body:parsed.data,user:user.id,signal:active.current?.signal});if(!mounted.current)return;const next={...parsed.data,expectedRevision:r.revision};setValue(next);setOriginal(next);setSaved(true);}catch(e){if(mounted.current)setError(e instanceof MemberClientError?e.code:'failed');}finally{if(mounted.current)setBusy(false);}}
  return <section id="public-profile-settings" className={css.card} aria-label={en?'Public profile':'公開プロフィール'}><h2>{en?'Public profile':'公開プロフィール'}</h2>
    <p className={css.intro}>{en?'Choose exactly what everyone can see. Your Google name, photo, email and account ID are not copied here.':'誰でも見られる名前と紹介を、ここで選びます。Googleの名前・写真・メール・アカウントIDは引き継ぎません。'}</p>
    {loaded?<form className={css.form} onSubmit={e=>{e.preventDefault();void save();}}>
      <label>{en?'Public ID':'公開ID'}<input name="public-handle" value={value.handle} required minLength={3} maxLength={30} autoComplete="off" pattern="[a-z][a-z0-9-]{2,29}" onChange={e=>{setValue({...value,handle:e.target.value.toLowerCase()});setSaved(false);}}/><small>{en?'3–30 lowercase letters, numbers and hyphens. Starts with a letter. Retired IDs stay reserved.':'英小文字で始まる3〜30文字の英小文字・数字・ハイフン。変更前のIDは他人へ再割当されません。'}</small></label>
      <label>{en?'Public display name':'公開表示名'}<input name="public-name" value={value.displayName} required maxLength={80} autoComplete="off" onChange={e=>{setValue({...value,displayName:e.target.value});setSaved(false);}}/></label>
      <label>{en?'Bio':'自己紹介'}<textarea name="public-bio" value={value.bio} maxLength={500} onChange={e=>{setValue({...value,bio:e.target.value});setSaved(false);}}/></label>
      <fieldset><legend>{en?'Public icon':'公開アイコン'}</legend><div className={css.icons}>{humanIconSchema.options.map(icon=><button type="button" key={icon} aria-label={icon} aria-pressed={value.icon===icon} onClick={()=>{setValue({...value,icon});setSaved(false);}}><ProfileAvatar small icon={icon}/>{icon}</button>)}</div></fieldset>
      <label className={css.check}><input name="public-timeline" type="checkbox" checked={value.timelinePublic} onChange={e=>{setValue({...value,timelinePublic:e.target.checked});setSaved(false);}}/>{en?'Show my public activity timeline':'公開活動のタイムラインを表示する'}</label>
      <p className={css.muted}>{en?'Restricted posts are always excluded, even when your timeline is public. Your private activity history stays under Account.':'オンにしても限定投稿は表示されません。本人用の活動・履歴は既存アカウントで確認できます。'}</p>
      <div className={css.actions}><button type="submit" data-variant="primary" disabled={busy||!parsed.success||!dirty}>{busy?(en?'Saving…':'保存中…'):(en?'Save public profile':'公開プロフィールを保存')}</button>{dirty&&<button type="button" disabled={busy} onClick={()=>{setValue(original);setError('');}}>{en?'Cancel':'キャンセル'}</button>}{original.expectedRevision>0&&<a href={profileHref(original.handle,locale)}>{en?'View public profile':'公開プロフィールを見る'} →</a>}<a href="/following">{en?'Following':'フォロー中'} →</a></div>
    </form>:<p role="status">{en?'Loading…':'確認中…'}</p>}
    {error&&<p role="alert">{error==='HANDLE_UNAVAILABLE'?(en?'This public ID is unavailable. Choose another.':'この公開IDは使えません。別のIDを選んでください。'):error==='REVISION_CONFLICT'?(en?'Your profile changed in another tab. Reload before saving.':'別の画面でプロフィールが変更されました。読み直してください。'):(en?'Could not complete this request. Retry or sign in again.':'処理を完了できませんでした。再試行するかログインし直してください。')} <button onClick={()=>{if(!dirty||confirm(en?'Discard edits and reload?':'入力を破棄して読み直しますか？'))void load();}}>{en?'Reload':'読み直す'}</button></p>}
    {saved&&<p role="status">{en?'Public profile saved.':'公開プロフィールを保存しました。'}</p>}
  </section>;
}
