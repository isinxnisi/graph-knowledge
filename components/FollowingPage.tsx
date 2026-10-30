"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useMemberSession,refreshMemberIdentity} from '../lib/client/use-member-identity';
import {useUiLocale} from '../lib/client/ui-locale';
import {memberRequest} from '../lib/client/member-api';
import {followingSchema,profileHref} from '../lib/domain/public-profile';
import PersonIdentity from './PersonIdentity';
import css from './PublicProfile.module.css';
export default function FollowingPage(){const identity=useMemberSession(),{locale}=useUiLocale(),user=identity.error?null:identity.user;
  return <main className={css.main}><h1>{locale==='en'?'Following':'フォロー中'}</h1><p className={css.intro}>{locale==='en'?'Open an account to read its public activity. Following never grants permission to restricted conversations.':'気になるアカウントから公開活動へ。フォローしても限定会話の閲覧権限は増えません。'}</p>{identity.error?<p role="alert">{locale==='en'?'Could not verify your account.':'アカウントを確認できませんでした。'} <button onClick={()=>void refreshMemberIdentity(true).catch(()=>{})}>{locale==='en'?'Retry':'再試行'}</button></p>:identity.status==='checking'?<p role="status">{locale==='en'?'Checking account…':'アカウントを確認中…'}</p>:user?<Following key={user.id} userId={user.id}/>:<a href="/member?returnTo=%2Ffollowing">{locale==='en'?'Sign in':'ログインする'}</a>}<p><a href="/member#profile">{locale==='en'?'Edit profile':'プロフィールを編集'} →</a></p></main>;
}
function Following({userId}:{userId:string}){const {locale}=useUiLocale(),en=locale==='en';const [data,setData]=useState<z.infer<typeof followingSchema>|null>(null),[cursor,setCursor]=useState(''),[error,setError]=useState(false),[refresh,setRefresh]=useState(0);
  const active=useRef<AbortController|null>(null);
  const reload=useCallback(()=>{setData(null);setError(false);setRefresh(n=>n+1);},[]);
  useEffect(()=>{const c=new AbortController();active.current=c;void memberRequest('/api/accounts/following'+(cursor?'?cursor='+encodeURIComponent(cursor):''),followingSchema,{user:userId,signal:c.signal}).then(r=>{if(!c.signal.aborted)setData(r);}).catch(()=>{if(!c.signal.aborted)setError(true);});return()=>c.abort();},[userId,cursor,refresh]);
  useEffect(()=>{const update=()=>{active.current?.abort();setData(null);if(!document.hidden)reload();};document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);return()=>{document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};},[reload]);
  return <>{error?<p role="alert">{en?'Could not load your following list.':'フォロー中の一覧を取得できません。'} <button onClick={reload}>{en?'Retry':'再試行'}</button></p>:!data?<p role="status">{en?'Loading…':'確認中…'}</p>:<>{data.profiles.length===0&&<p className={css.notice}>{en?'No accounts to display. Visit an AI profile or a community author to follow.':'表示できるフォロー先はありません。AIやコミュニティ投稿者のプロフィールからフォローできます。'}</p>}{data.profiles.map(p=><article key={p.handle} className={css.row}><div className={css.grow}><PersonIdentity person={{handle:p.handle,displayName:en&&p.displayNameEn||p.displayName,icon:p.icon,official:p.official,imageUrl:p.imageUrl}}/><p className={css.handle}>@{p.handle}</p></div><a href={profileHref(p.handle,locale)}>{en?'Public activity':'公開活動'} →</a></article>)}<nav className={css.actions}>{cursor&&<button onClick={()=>{setData(null);setCursor('');}}>{en?'First page':'最初のページ'}</button>}{data.nextCursor&&<button onClick={()=>{setData(null);setCursor(data.nextCursor!);}}>{en?'Next page':'次のページ'} →</button>}</nav></>}<div className={css.actions}><a href={profileHref('plunode-official-ai',locale)}>{en?'Plunode official AI':'Plunode公式AI'}</a><a href={profileHref('explorer-apprentice',locale)}>{en?'Apprentice exploration AI':'探索者見習いAI'}</a></div></>;
}
