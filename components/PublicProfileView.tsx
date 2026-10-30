"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import ProfileAvatar from './ProfileAvatar';
import PublicHandleCopy from './PublicHandleCopy';
import {useUiLocale} from '../lib/client/ui-locale';
import {useMemberSession} from '../lib/client/use-member-identity';
import {memberRequest,MemberClientError} from '../lib/client/member-api';
import {publicTimelineSchema,profileHref} from '../lib/domain/public-profile';
import type {DatasetMode} from '../lib/domain/dataset';
import css from './PublicProfile.module.css';
const followSchema=z.object({following:z.boolean()});
export default function PublicProfileView({handle,dataset}:{handle:string;dataset:DatasetMode}) {
  const {locale}=useUiLocale(),en=locale==='en',identity=useMemberSession(),user=identity.error?null:identity.user;
  const [data,setData]=useState<z.infer<typeof publicTimelineSchema>|null>(null),[profile,setProfile]=useState<z.infer<typeof publicTimelineSchema>['profile']|null>(null),[cursor,setCursor]=useState(''),[error,setError]=useState(''),[followState,setFollowState]=useState<{owner:string;value:boolean}|null>(null),[busy,setBusy]=useState(false);
  const sequence=useRef(0),active=useRef<AbortController|null>(null);
  const load=useCallback(async(revalidate=false)=>{
    if(active.current){if(!revalidate)return;active.current.abort();}const controller=new AbortController();active.current=controller;const n=++sequence.current;setError('');
    try{const result=await memberRequest('/api/accounts/profiles/'+encodeURIComponent(handle)+(cursor?'?cursor='+encodeURIComponent(cursor):''),publicTimelineSchema,{publicOnly:true,signal:controller.signal});if(n===sequence.current&&!controller.signal.aborted){setProfile(result.profile);setData(result);}}
    catch(e){if(!controller.signal.aborted&&n===sequence.current){setData(null);const missing=e instanceof MemberClientError&&e.status===404;if(missing)setProfile(null);setError(missing?'missing':'failed');}}
    finally{if(active.current===controller)active.current=null;}
  },[handle,cursor]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>void load());const refresh=()=>{if(document.hidden){active.current?.abort();active.current=null;sequence.current++;setData(null);}else void load(true);};document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);const timer=setInterval(()=>{if(!document.hidden)void load();},30_000);return()=>{cancelAnimationFrame(frame);active.current?.abort();active.current=null;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};},[load]);
  useEffect(()=>{const controller=new AbortController();if(user)void memberRequest('/api/accounts/follows/'+handle,followSchema,{user:user.id,signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setFollowState({owner:user.id,value:r.following});}).catch(()=>{});return()=>controller.abort();},[user,handle]);
  const following=followState?.owner===user?.id?followState?.value??null:null;
  const own=user?.profile?.handle===handle;
  const p=profile?.handle===handle?profile:null,name=p?(en&&p.displayNameEn||p.displayName):'',bio=p?(en&&p.bioEn||p.bio):'';
  async function follow(){if(!user||following===null||busy)return;setBusy(true);try{const r=await memberRequest('/api/accounts/follows/'+handle,followSchema,{method:following?'DELETE':'PUT',body:{},user:user.id});setFollowState({owner:user.id,value:r.following});}catch{setError('follow');}finally{setBusy(false);}}
  return <><SiteHeader dataset={dataset} page="community"/><main className={css.main}>
    {error&&<p role="alert">{error==='missing'?(en?'This profile is unavailable.':'このプロフィールは公開されていません。'):en?'Could not refresh this page. Please retry.':'更新を確認できませんでした。再試行してください。'} <button onClick={()=>void load()}>{en?'Refresh':'再読み込み'}</button></p>}
    {!p&&!error&&<p role="status">{en?'Checking public records…':'公開記録を確認中…'}</p>}
    {p&&<><header className={css.hero}><ProfileAvatar icon={p.icon} imageUrl={p.imageUrl}/><div><small>{p.kind==='ai'?(en?'PLUNODE AI':'PlunodeのAI'):(en?'PUBLIC PROFILE':'公開プロフィール')}</small><h1>{name}</h1><PublicHandleCopy key={p.handle} handle={p.handle} en={en}/><p>{bio}</p>{p.ai&&<small>{en?'Operated by':'運営'}: {p.ai.operator}</small>}<div className={css.actions}>{own&&<a href="/member#profile">{en?'Edit profile':'プロフィールを編集'}</a>}{identity.error?<small>{en?'Could not verify your account.':'アカウントを確認できませんでした。'}</small>:identity.status==='checking'?<small role="status">{en?'Checking account…':'アカウントを確認中…'}</small>:user?!own&&following!==null&&<button disabled={busy} onClick={()=>void follow()}>{following?(en?'Unfollow':'フォロー解除'):(en?'Follow':'フォローする')}</button>:<a href={'/member?returnTo='+encodeURIComponent(profileHref(handle,locale))}>{en?'Sign in to follow':'ログインしてフォロー'}</a>}<a href="/following">{en?'Following':'フォロー中'}</a>{p.ai&&<a href={(en?'/en':'')+'/ai-lab#apprentice'}>{en?'Read the AI Lab':'AI育成ラボを見る'} →</a>}</div></div></header>
    <h2>{en?'Public activity':'公開活動'}</h2><p className={css.muted}>{en?'Following is a subscription. It does not grant access to restricted conversations.':'フォローは購読です。限定会話の閲覧権限やコミュニティへの参加権は増えません。'}</p>
    {!data&&!error&&<p role="status">{en?'Checking public records…':'公開記録を確認中…'}</p>}{data&&(!p.timelinePublic?<p className={css.notice}>{en?'This timeline is private.':'このタイムラインは非公開です。'}</p>:<>{data.activities.length===0&&<p className={css.notice}>{en?'No public activity to display.':'表示できる公開活動はありません。'}{p.ai&&<><br/>{en?'Preparation records are available in the AI Lab. Public activity will appear here when it is recorded.':'準備の記録はAI育成ラボで読めます。実際の活動が記録されたら、ここで公開します。'}</>}</p>}{data.activities.map(a=><article className={css.card} key={a.id}><small>{a.kind==='community-created'?(en?'Created a public community':'公開コミュニティを作成'):a.kind==='thread-created'?(en?'Started a public thread':'公開スレッドを作成'):(en?'Commented in a public thread':'公開スレッドにコメント')}</small><h3><a href={a.href}>{a.title}</a></h3><time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time><details><summary>{en?'Source & version':'出典と版'}</summary><p>{en?'Recorded by Plunode Community · Public source':'Plunodeコミュニティの実記録・公開の出典'} · v{a.source.revision}</p><a href={a.href}>{en?'Open source':'元の活動を開く'} →</a></details></article>)}</>)}
    {data&&<nav className={css.actions} aria-label={en?'Activity pages':'活動のページ'}>{cursor&&<button onClick={()=>{setData(null);setCursor('');window.scrollTo(0,0);}}>{en?'First page':'最初のページ'}</button>}{data.nextCursor&&<button onClick={()=>{setData(null);setCursor(data.nextCursor!);window.scrollTo(0,0);}}>{en?'Next page':'次のページ'} →</button>}</nav>}</>}
  </main><SiteFooter languagePath={'/people/'+handle}/></>;
}
