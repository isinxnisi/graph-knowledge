"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {refreshMemberIdentity,updateMemberProfileDisplay} from '../lib/client/use-member-identity';
import {useUiLocale} from '../lib/client/ui-locale';
import {memberRequest,MemberClientError,type MemberUser} from '../lib/client/member-api';
import {ownPublicProfileSchema,publicProfileInput,profileHref,humanIconSchema,reservedPublicHandle} from '../lib/domain/public-profile';
import {usePublicProfilesEnabled} from './PublicProfileAvailability';
import ProfileAvatar from './ProfileAvatar';
import css from './PublicProfile.module.css';
const blank={handle:'',displayName:'',bio:'',icon:'google' as 'google'|'person'|'leaf'|'star'|'orbit',timelinePublic:true,expectedRevision:0};
export default function PublicProfileEditor({user,onDirtyChange}:{user:MemberUser;onDirtyChange?:(dirty:boolean)=>void}) {
  const enabled=usePublicProfilesEnabled();
  return enabled?<Editor key={user.id} user={user} onDirtyChange={onDirtyChange}/>:null;
}
function Editor({user,onDirtyChange}:{user:MemberUser;onDirtyChange?:(dirty:boolean)=>void}) {
  const {locale}=useUiLocale(),en=locale==='en';
  const iconNames={google:en?'Google photo':'Google画像',person:en?'Person':'ひと',leaf:en?'Leaf':'葉',star:en?'Star':'星',orbit:en?'Orbit':'軌道'};
  const [value,setValue]=useState(blank),[original,setOriginal]=useState(blank),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [googleImageUrl,setGoogleImageUrl]=useState<string|null>(null);
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  const load=useCallback(async()=>{active.current?.abort();const c=new AbortController();active.current=c;try{const r=await memberRequest('/api/accounts/me',ownPublicProfileSchema,{user:user.id,signal:c.signal});if(c.signal.aborted)return;setGoogleImageUrl(r.googleImageUrl??null);const next=r.profile?{handle:r.profile.handle,displayName:r.profile.displayName,bio:r.profile.bio,icon:humanIconSchema.parse(r.profile.icon),timelinePublic:r.profile.timelinePublic,expectedRevision:r.revision}:blank;setValue(next);setOriginal(next);setLoaded(true);}catch{if(!c.signal.aborted)setError('load');}},[user.id]);
  useEffect(()=>{mounted.current=true;const frame=requestAnimationFrame(()=>void load());return()=>{cancelAnimationFrame(frame);mounted.current=false;active.current?.abort();};},[load]);
  const dirty=JSON.stringify(value)!==JSON.stringify(original);
  useLayoutEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
  useLayoutEffect(()=>{
    const entry=location.href,entryState=history.state;
    let departing=false;
    const discard=()=>confirm(en?'Discard your profile edits?':'プロフィールの未保存の入力を破棄しますか？');
    const protect=(e:BeforeUnloadEvent)=>{if(dirty&&!departing){e.preventDefault();e.returnValue='';}};
    const navigate=(e:MouseEvent)=>{
      const a=(e.target as Element).closest('a');
      if(!dirty||!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank'||new URL(a.href,location.href).href===location.href)return;
      if(!discard()){e.preventDefault();e.stopPropagation();}else {departing=true;onDirtyChange?.(false);}
    };
    // Run before router/hash subscribers. Back/Forward within the personal
    // shell must not unmount the editor and silently discard its input.
    const historyNavigation=(e:Event)=>{
      if(!dirty||departing||location.href===entry)return;
      if(discard()){departing=true;onDirtyChange?.(false);return;}
      history.replaceState(entryState,'',entry);e.stopImmediatePropagation();
    };
    addEventListener('beforeunload',protect);document.addEventListener('click',navigate,true);
    addEventListener('popstate',historyNavigation,true);addEventListener('hashchange',historyNavigation,true);
    return()=>{removeEventListener('beforeunload',protect);document.removeEventListener('click',navigate,true);removeEventListener('popstate',historyNavigation,true);removeEventListener('hashchange',historyNavigation,true);};
  },[dirty,en,onDirtyChange]);
  const parsed=publicProfileInput.refine(v=>!reservedPublicHandle(v.handle)||v.handle===original.handle).safeParse(value);
  async function save(){if(!parsed.success||busy)return;setBusy(true);setError('');setSaved(false);try{const r=await memberRequest('/api/accounts/me',ownPublicProfileSchema,{method:'PUT',body:parsed.data,user:user.id,signal:active.current?.signal});if(!mounted.current)return;const next={...parsed.data,expectedRevision:r.revision};setValue(next);setOriginal(next);setSaved(true);if(r.profile)updateMemberProfileDisplay(user.id,r.profile);void refreshMemberIdentity(true).catch(()=>{});}catch(e){if(mounted.current)setError(e instanceof MemberClientError?e.code:'failed');}finally{if(mounted.current)setBusy(false);}}
  return <section id="public-profile-settings" className={css.card} aria-label={en?'Public profile':'公開プロフィール'}>
    <p className={css.intro}>{en?'Your display name is shared across your profile and comments. Its initial value may come from Google. You can change it here; no real name is required.':'プロフィール・コメントで同じ表示名を使います。初期値はGoogle等の名前を利用する場合があります。ここですぐ変更でき、実名である必要はありません。'}</p>
    {loaded?<form className={css.form} onSubmit={e=>{e.preventDefault();void save();}}>
      <label>{en?'Display name':'表示名'}<input name="public-name" disabled={busy} value={value.displayName} required maxLength={80} autoComplete="off" onChange={e=>{setValue({...value,displayName:e.target.value});setSaved(false);}}/></label>
      <label>{en?'Public ID':'公開ID'}<input name="public-handle" disabled={busy} value={value.handle} required minLength={3} maxLength={30} autoComplete="off" pattern="[a-z][a-z0-9-]{2,29}" onChange={e=>{setValue({...value,handle:e.target.value.toLowerCase()});setSaved(false);}}/><small>{en?'3–30 lowercase letters, numbers and hyphens. Starts with a letter. Retired IDs stay reserved.':'英小文字で始まる3〜30文字の英小文字・数字・ハイフン。変更前のIDは他人へ再割当されません。'}</small></label>
      <label>{en?'Bio':'自己紹介'}<textarea name="public-bio" disabled={busy} value={value.bio} maxLength={500} onChange={e=>{setValue({...value,bio:e.target.value});setSaved(false);}}/></label>
      <fieldset><legend>{en?'Public icon':'公開アイコン'}</legend><div className={css.icons}>{humanIconSchema.options.map(icon=><button type="button" disabled={busy} key={icon} aria-label={iconNames[icon]} aria-pressed={value.icon===icon} onClick={()=>{setValue({...value,icon});setSaved(false);}}><ProfileAvatar small icon={icon} imageUrl={googleImageUrl}/>{iconNames[icon]}</button>)}</div><small>{en?'Your Google photo is public by default. You can choose another icon. If no photo is available, a person icon is shown.':'初期設定はGoogleアカウント画像です。別のアイコンにも変更できます。画像を取得できない場合は人型で表示します。'}</small></fieldset>
      <label className={css.check}><input name="public-timeline" disabled={busy} type="checkbox" checked={value.timelinePublic} onChange={e=>{setValue({...value,timelinePublic:e.target.checked});setSaved(false);}}/>{en?'Show my public activity timeline':'公開活動のタイムラインを表示する'}</label>
      <p className={css.muted}>{en?'This controls only the activity collected on your profile. Public source posts remain public. Restricted activity is always excluded.':'プロフィール上の活動集約だけを切り替えます。非公開にしても元の公開投稿は公開のままです。限定活動は常に除外されます。'}</p>
      <div className={css.actions}><button type="submit" data-variant="primary" disabled={busy||!parsed.success||!dirty}>{busy?(en?'Saving…':'保存中…'):(en?'Save public profile':'公開プロフィールを保存')}</button>{dirty&&<button type="button" disabled={busy} onClick={()=>{setValue(original);setError('');}}>{en?'Cancel':'キャンセル'}</button>}{original.expectedRevision>0&&<a href={profileHref(original.handle,locale)}>{en?'View public profile':'公開プロフィールを見る'} →</a>}<a href="/following">{en?'Following':'フォロー中'} →</a></div>
    </form>:<p role="status">{en?'Loading…':'確認中…'}</p>}
    {error&&<p role="alert">{error==='HANDLE_UNAVAILABLE'?(en?'This public ID is unavailable. Choose another.':'この公開IDは使えません。別のIDを選んでください。'):error==='REVISION_CONFLICT'?(en?'Your profile changed in another tab. Reload before saving.':'別の画面でプロフィールが変更されました。読み直してください。'):(en?'Could not complete this request. Retry or sign in again.':'処理を完了できませんでした。再試行するかログインし直してください。')} <button onClick={()=>{if(!dirty||confirm(en?'Discard edits and reload?':'入力を破棄して読み直しますか？'))void load();}}>{en?'Reload':'読み直す'}</button></p>}
    {saved&&<p role="status">{en?'Public profile saved.':'公開プロフィールを保存しました。'}</p>}
  </section>;
}
