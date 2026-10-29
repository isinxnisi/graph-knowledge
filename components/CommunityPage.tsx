"use client";
import PageIdentity from "./PageIdentity";
import PersonIdentity from './PersonIdentity';

import {usePersonalHash,navigatePersonalHash} from '../lib/client/personal-location';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {communityCapsuleListingSchema,type Community} from '../lib/domain/community';
import {z} from 'zod';
import type {DatasetMode} from '../lib/domain/dataset';
import {memberCapsuleSchema,type MemberCapsule} from '../lib/domain/member-capsule';
import {memberRequest,memberItemSchema,memberListSchema,memberReaderCapsule,MemberClientError,type MemberUser,type MemberCapsuleSummary} from '../lib/client/member-api';
import {CapsuleReader} from './CapsuleDialog';
import {useCommunitySession,type CommunityMutation} from '../lib/client/use-community-session';


import {CommunityMark,CommunityMenu,WithdrawPost} from './CommunityPrimitives';
import Icon from './Icon';
import {PersonalMemberControls} from './PersonalFrame';
import {CommunityDialog,CommunityRevalidation} from './CommunityDialog';
import {useUiLocale} from '../lib/client/ui-locale';



import css from './CommunityPage.module.css';
import {CommunitySafetyActions,CommunityReportReceipts} from './CommunitySafety';
import CommunityContinuity from './CommunityContinuity';
function readRoute(hash:string){let next='';try{const raw=decodeURIComponent(hash);const u=new URL(raw||'/',location.origin);if(u.origin===location.origin&&/^\/(?:[a-f0-9-]{36}(?:\/(?:invitations|safety-log))?|threads\/[a-f0-9-]{36}|my-posts|invitations|participation|recoveries|reports)?$/.test(u.pathname)&&[...u.searchParams.keys()].every(k=>['mine','limit','cursor','membersCursor','tab','post','listing'].includes(k)))next=(u.pathname==='/'?'':u.pathname)+u.search;}catch{/* Invalid fragments never become API paths. */}return next;}
export default function CommunityPage({dataset}:{dataset:DatasetMode}){
 const {locale}=useUiLocale();const t=(ja:string,en:string)=>locale==='en'?en:ja;
 const hash=usePersonalHash();const [route,setRoute]=useState(''),[creating,setCreating]=useState(false),[tab,setTab]=useState('threads');
 const [pageTrail,setPageTrail]=useState<Record<string,string>>({});
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[visibility,setVisibility]=useState<'public'|'members'>('public'),[audience,setAudience]=useState<'public'|'cohort'>('cohort');
 const [leaveOpen,setLeaveOpen]=useState(false),[composing,setComposing]=useState(false),[discard,setDiscard]=useState(false);
 const [activityReturn,setActivityReturn]=useState<string|null>(null);
 const [capsuleReturn,setCapsuleReturn]=useState<{threadId:string;route:string}|null>(null);
 const localTabs=useRef<HTMLElement>(null);
 const localeRef=useRef(locale);
 const capsuleDirty=useRef(false),dirty=useRef(false);useEffect(()=>{dirty.current=!!(title.trim()||body.trim())||capsuleDirty.current;localeRef.current=locale;},[title,body,locale]);
 const scrolls=useRef(new Map<string,number>()),lastRoute=useRef(''),restoreScroll=useRef(true);
 const reset=useCallback(()=>{setTitle('');setBody('');setCreating(false);setComposing(false);setDiscard(false);setLeaveOpen(false);setVisibility('public');setAudience('cohort');},[]);
 const resetSession=useCallback(()=>{reset();dirty.current=false;setActivityReturn(null);setCapsuleReturn(null);scrolls.current.clear();setPageTrail({});},[reset]);
 const {data,user,authStatus,busy,blocked,error,notice,epoch,load,mutate:send}=useCommunitySession(route,resetSession,hash!==null&&route===readRoute(hash));
 useEffect(()=>{const change=()=>{const next=readRoute(location.hash.slice(1)||location.search);if(next===lastRoute.current)return;scrolls.current.set(lastRoute.current,window.scrollY);if(next!==lastRoute.current&&dirty.current&&!confirm(localeRef.current==='en'?'Discard your unsent draft?':'未送信の入力を破棄して移動しますか？')){history.replaceState(history.state,'','#'+encodeURIComponent(lastRoute.current));return;}lastRoute.current=next;restoreScroll.current=true;setRoute(next);reset();setTab(next.includes('/safety-log')?'safety':next.includes('/invitations')?'invitations':new URL(next||'/',location.origin).searchParams.get('tab')==='manage'?'manage':new URL(next||'/',location.origin).searchParams.get('tab')==='capsules'?'capsules':'threads');};change();addEventListener('hashchange',change);addEventListener('popstate',change);return()=>{removeEventListener('hashchange',change);removeEventListener('popstate',change);};},[reset,hash]);
 useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue='';}};addEventListener('beforeunload',protect);return()=>removeEventListener('beforeunload',protect);},[]);
 useEffect(()=>{if(data&&!blocked&&restoreScroll.current){restoreScroll.current=false;requestAnimationFrame(()=>{const post=new URL(lastRoute.current||'/',location.origin).searchParams.get('post');const target=post?document.getElementById('post-'+post):null;if(target){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}else scrollTo(0,scrolls.current.get(lastRoute.current)||0);});}},[data,blocked]);
 const mutate:CommunityMutation=async(path,input,idempotent=false)=>{const result=await send(path,input,idempotent);if(result.ok){if(path===''||path.endsWith('/threads')||path.endsWith('/posts')){dirty.current=false;setTitle('');setBody('');setCreating(false);setComposing(false);if(path.endsWith('/threads')&&result.receipt)navigatePersonalHash('/threads/'+result.receipt);if(path.endsWith('/posts')&&result.receipt)navigatePersonalHash(path.replace(/\/posts$/,'')+'?post='+result.receipt);}if(path.endsWith('/leave'))navigatePersonalHash('?mine=1');}return result;};
 useLayoutEffect(()=>{const rail=localTabs.current,item=rail?.querySelector<HTMLElement>('[aria-pressed="true"]');if(!rail||!item||blocked)return;const r=rail.getBoundingClientRect(),i=item.getBoundingClientRect();if(i.left<r.left)rail.scrollLeft-=r.left-i.left;else if(i.right>r.right)rail.scrollLeft+=i.right-r.right;},[data,blocked,tab,locale]);
 const c=data?.community,thread=data?.thread,active=c?.status==='active',member=!!c?.role;
 const change=(action:string,extra:Record<string,unknown>={})=>c&&mutate('/'+c.id+'/'+action,{expectedRevision:c.revision,...extra});
 const link=(path:string)=>'#'+encodeURIComponent(path);
 const selectTab=(value:string)=>{if(!c)return;navigatePersonalHash('/'+c.id+(value==='safety'?'/safety-log':value==='invitations'?'/invitations':value==='manage'?'?tab=manage':value==='capsules'?'?tab=capsules':''));};
 const nextPage=(cursor:string,members=false)=>{const u=new URL(route||'/','http://community.invalid');u.searchParams.set(members?'membersCursor':'cursor',cursor);const next=(u.pathname==='/'?'':u.pathname)+u.search;setPageTrail(previous=>({...previous,[next]:route}));navigatePersonalHash(next);};
 const isPaged=new URL(route||'/','http://community.invalid').searchParams.has('cursor')||route.includes('post=')||route.includes('membersCursor=');
 const paging=(cursor:string|null|undefined,members=false)=><nav className={css.paging} aria-label={members?t('メンバーのページ','Member pages'):t('一覧のページ','List pages')}>{isPaged&&<a href={link(pageTrail[route]??(route.split('?')[0]+(route.includes('mine=1')?'?mine=1':route.includes('tab=manage')?'?tab=manage':'')))}>← {Object.hasOwn(pageTrail,route)?t('前のページ','Previous page'):t('最初のページ','First page')}</a>}{cursor&&<button disabled={busy} onClick={()=>nextPage(cursor,members)}>{t('次のページ','Next page')} →</button>}</nav>;

 const row=(x:Community)=><article className={css.row} key={x.id}><div className={css.placeInfo}><CommunityMark name={x.title}/><div><a className={css.titleLink} href={link('/'+x.id)}>{x.title}</a>{x.creator&&<div className={css.creatorLine}><PersonIdentity person={x.creator}/></div>}<p>{x.description}</p><small>{x.visibility==='public'?t('公開','Public'):t('メンバー限定','Members only')} · {x.status==='active'?t('活動中','Active'):t('アーカイブ','Archived')}</small></div></div><a className={css.primary} href={link('/'+x.id)}>{t('この場所へ','Visit')} →</a></article>;
 const guard=useCallback(()=>{if(!dirty.current)return true;const yes=confirm(localeRef.current==='en'?'Discard your unsent draft?':'未送信の入力を破棄して移動しますか？');if(yes)dirty.current=false;return yes;},[]);
 const noLogout=useCallback(()=>{},[]);
 return <main className={css.shell} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const anchor=(event.target as Element).closest('a');if(anchor?.getAttribute('href')?.startsWith('#')){event.preventDefault();navigatePersonalHash(anchor.hash);}}}>
 <PersonalMemberControls guard={guard} logout={noLogout} busy={busy}/>{error&&<p role="alert">{/_RATE_LIMIT$/.test(error)?t('短時間の操作上限に達しました。しばらく待ってから再試行してください。','Too many requests in a short period. Please wait before retrying.'):t('取得・操作を完了できませんでした。権限や状態が変わった可能性があります。再読み込みしてください。','The request could not be completed. Permissions or state may have changed. Refresh and retry.')} <button onClick={()=>void load(true)}>{t('再読み込み','Refresh')}</button>{['INVALID_CURSOR','PAGE_CHANGED'].includes(error)&&<a href={link(route.split('?')[0]+(route.includes('mine=1')?'?mine=1':route.includes('tab=manage')?'?tab=manage':''))}>{t('最初のページから確認','Restart from the first page')}</a>}</p>}
 {busy&&!data&&<p role="status">{t('確認中…','Loading…')}</p>}
 {blocked&&data&&<p role="status">{t('閲覧権限を再確認しています。入力はこの画面内に保持しています。','Checking access. Your draft is kept in memory on this page.')}</p>}
 {notice&&!blocked&&<p className={css.notice} role="status">{notice==='REPORT_RECEIVED'?t('通報を受け付けました。自分の活動・履歴から受付状況を確認できます。','Report received. Track it under Your activity.'):t('変更を保存しました。','Changes saved.')}</p>}
 {authStatus==='guest'&&!busy&&!error&&<div className={css.loginPrompt}><p>{t('参加や投稿にはログインが必要です。公開の会話はそのまま閲覧できます。','Sign in to join or post. Public conversations are open to everyone.')}</p><a className={css.primary} href={'/member?returnTo='+encodeURIComponent('/communities'+(route?'#'+encodeURIComponent(route):''))}>{t('ログインして続ける','Sign in to continue')} →</a></div>}
 <CommunityRevalidation.Provider value={blocked}><div className={css.protected} style={blocked?{visibility:'hidden'}:undefined} inert={blocked} key={route+':'+epoch}>
 {data?.communities&&<><header className={css.heading}><div><PageIdentity area="community"/><h1>{route.includes('mine=1')?t('自分のコミュニティ','Your communities'):t('関心を持ち寄る場所','A place for shared curiosity')}</h1><p>{t('気になる話題を読んで、あなたの発見を会話へ。','Find a conversation. Bring your own discoveries.')}</p></div>{user&&<button className={css.primary} onClick={()=>setCreating(!creating)}>{t('＋ 作成','＋ Create')}</button>}</header>{creating&&<form className={css.form} onSubmit={e=>{e.preventDefault();void mutate('',{title,description:body,visibility},true);}}><label>{t('名前','Name')}<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('紹介','Description')}<textarea aria-label={t('紹介','Description')} maxLength={1000} value={body} onChange={e=>setBody(e.target.value)}/></label><fieldset><legend>{t('公開範囲','Visibility')}</legend>{(['public','members'] as const).map(v=><label key={v}><input type="radio" checked={visibility===v} onChange={()=>setVisibility(v)}/>{v==='public'?t('公開・自由参加','Public · open joining'):t('メンバー限定','Members only')}</label>)}</fieldset>{visibility==='members'&&<p>{t('作成後、アカウント宛ての招待から参加してもらえます。','After creation, invite members using their account IDs.')}</p>}<button disabled={busy} className={css.primary}>{t('作成する','Create')}</button></form>}{!data.communities.length&&<p className={css.empty}>{route.includes('mine=1')?t('参加中のコミュニティはありません。気になる場所を見つけるか、新しく作成できます。','You have not joined a community yet. Discover a place or create your own.'):t('まだコミュニティはありません。','No communities yet.')}</p>}{data.communities.map(row)}</>}
 {c&&<><div className={`${css.heading} ${css.communityHeading}`}>

 <PageIdentity area="community" href="#"/><div className={css.placeHeading}>{thread?<a className={css.belonging} href={link('/'+c.id)}><CommunityMark name={c.title}/>{c.title}</a>:<h1 className={css.placeTitle}><CommunityMark name={c.title}/>{c.title}</h1>}
 {user&&<CommunityMenu compact label={t('コミュニティの操作','Community actions')}><CommunitySafetyActions kind="community" id={c.id} revision={c.revision} t={t} mutate={mutate} busy={busy} reportable targetLabel={c.title}/></CommunityMenu>}</div>
 {!thread&&<div className={css.creatorLine}><PersonIdentity person={c.creator}/></div>}
 {!thread&&tab==='threads'&&<p>{c.description}</p>}
 <div className={css.placeStatus}><small>{c.visibility==='public'?t('公開','Public'):t('メンバー限定','Members only')} · {c.status==='active'?t('活動中','Active'):t('アーカイブ','Archived')}</small>
 {!member&&active&&user&&<button className={css.primary} onClick={()=>void change('join')}>{t('参加する','Join')}</button>}
 {member&&<CommunityMenu label={t('参加中','Joined')}><button disabled={busy} onClick={()=>setLeaveOpen(true)}>{t('退出する','Leave community')}</button></CommunityMenu>}</div></div>
 {leaveOpen&&<CommunityDialog title={t('このコミュニティを退出','Leave this community')} busy={busy} onCancel={()=>setLeaveOpen(false)}><p>{c.title}</p><p>{c.lastAdmin?t('最後の管理者が退出するため、管理者不在となり、コミュニティはアーカイブとして残ります。','You are the last administrator. Leaving will archive the community without an administrator.'):t('参加を終了します。以前の限定会話の閲覧権は、再参加しても自動では戻りません。','This ends your membership. Rejoining does not restore access to earlier restricted conversations.')}</p>{c.lastAdmin&&<p>{t('以前の限定会話の権限は自動復活しません。元管理者は運営復帰を申請できますが、サイト運営者の判断・本人承諾・場所の再開が別途必要です。','Earlier restricted conversations will not become accessible again. Former administrators may request recovery; operator approval, your acceptance and reopening are separate steps.')}</p>}<div className={css.actions}><button onClick={()=>setLeaveOpen(false)} disabled={busy}>{t('キャンセル','Cancel')}</button><button className={css.primary} disabled={busy} onClick={async()=>{const r=await change('leave');if(r?.ok)setLeaveOpen(false);}}>{t('退出を確定','Confirm leaving')}</button></div></CommunityDialog>}
 {c.adminOffered&&<button className={css.primary} onClick={()=>void change('accept-admin')}>{t('管理者の依頼を承諾','Accept administrator role')}</button>}
 {!thread&&<nav ref={localTabs} className={css.tabs} aria-label={t('このコミュニティ内','In this community')}><button aria-pressed={tab==='threads'} onClick={()=>selectTab('threads')}>{t('スレッド','Threads')}</button><button aria-pressed={tab==='capsules'} onClick={()=>selectTab('capsules')}>Capsule</button>{c.role==='admin'&&<button aria-pressed={tab==='manage'} onClick={()=>selectTab('manage')}>{t('管理','Manage')}</button>}{c.role==='admin'&&<button aria-pressed={tab==='invitations'} onClick={()=>selectTab('invitations')}>{t('メンバーを招待','Invite members')}</button>}{c.role==='admin'&&<button aria-pressed={tab==='safety'} onClick={()=>selectTab('safety')}>{t('管理履歴','Moderation log')}</button>}</nav>}
 {!thread&&tab==='threads'&&<>{!composing?<><header className={css.sectionHeading}><div><h2>{t('会話を見つける','Find a conversation')}</h2><p>{t('気になった話題から、読む・話す。','Start with a topic that catches your eye.')}</p></div>{member&&active&&<button className={css.primary} onClick={()=>setComposing(true)}><Icon name="plus"/>{t('スレッドを作成','New thread')}</button>}</header>{data?.threads?.length===0&&<p className={css.empty}>{t('まだ話題はありません。最初の問いや発見を持ち寄りませんか。','No conversations yet. Bring the first question or discovery.')}</p>}{data?.threads?.map(x=><article className={css.row} key={x.id}><div className={css.placeInfo}><span className={css.topicMark}><Icon name="list"/></span><div><a className={css.titleLink} href={link('/threads/'+x.id)}>{x.title}</a><span className={css.inlineCreator}><PersonIdentity person={x.creator}/></span><small>{x.audience==='public'?t('公開','Public'):t('作成時の参加者限定','Original participants only')}{x.closed?' · '+t('投稿停止','Closed'):''}{x.postCount!==undefined?' · '+x.postCount+' '+t('投稿','posts'):''}{x.updatedAt?' · '+new Date(x.updatedAt).toLocaleDateString(locale):''}</small></div></div><a className={css.readAction} href={link('/threads/'+x.id)}>{t('会話を読む','Read conversation')} <Icon name="arrow"/></a></article>)}{paging(data?.nextCursor)}</>:<section className={css.composer}><header className={css.sectionHeading}><div><small>{c.title}</small><h2>{t('新しい話題を持ち寄る','Start a conversation')}</h2></div></header><form className={css.form} onSubmit={e=>{e.preventDefault();void mutate('/'+c.id+'/threads',{title,body,audience,expectedRevision:c.revision},true);}}><label>{t('題名','Title')}<input autoFocus required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('本文','Message')}<textarea aria-label={t('本文','Message')} required maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/></label>{c.visibility==='public'?<fieldset><legend>{t('この会話の閲覧者','Who can read this thread')}</legend><label><input type="radio" checked={audience==='cohort'} onChange={()=>setAudience('cohort')}/>{t('現在の参加者だけ','Current members only')}</label><label><input type="radio" checked={audience==='public'} onChange={()=>setAudience('public')}/>{t('誰でも','Everyone')}</label></fieldset>:<p className={css.contextNote}>{t('この会話は現在の参加者だけが閲覧できます。後から参加した人へは自動公開されません。','Only current members can read this conversation. It will not automatically become visible to later members.')}</p>}<div className={css.actions}><button disabled={busy} className={css.primary}>{t('スレッドを作成する','Create thread')}</button><button type="button" disabled={busy} onClick={()=>{if(dirty.current)setDiscard(true);else setComposing(false);}}>{t('キャンセル','Cancel')}</button></div></form></section>}{discard&&<CommunityDialog title={t('入力を破棄しますか？','Discard your draft?')} onCancel={()=>setDiscard(false)}><p>{t('作成中のスレッドはまだ投稿されていません。','This conversation has not been posted yet.')}</p><div className={css.actions}><button onClick={()=>setDiscard(false)}>{t('入力に戻る','Keep editing')}</button><button onClick={()=>{dirty.current=false;setTitle('');setBody('');setComposing(false);setDiscard(false);}}>{t('破棄して一覧へ','Discard & return')}</button></div></CommunityDialog>}</>}
 {!thread&&tab==='capsules'&&<CommunityCapsules community={c} user={user} dataset={dataset} route={route} blocked={blocked} busy={busy} mutate={mutate} threads={data?.threads??[]} onDirty={value=>{capsuleDirty.current=value;dirty.current=value;}} onThread={threadId=>setCapsuleReturn({threadId,route})}/>}
 {!thread&&tab==='manage'&&c.role==='admin'&&<section className={css.form}><h2>{t('基本設定','Settings')}</h2><p>{t('現在の公開範囲','Current visibility')}: {c.visibility==='public'?t('公開','Public'):t('メンバー限定','Members only')}</p><button disabled={busy} onClick={()=>{if(confirm(t('過去の限定会話は公開されません。公開範囲を変更しますか？','Restricted conversations will stay restricted. Change visibility?')))void change('settings',{title:c.title,description:c.description,visibility:c.visibility==='public'?'members':'public'});}}>{t('公開／メンバー限定を切り替える','Switch public / members-only')}</button><button disabled={busy} onClick={()=>void change(active?'archive':'reopen')}>{active?t('アーカイブする','Archive'):t('再開する','Reopen')}</button><h2>{t('メンバー管理','Members')}</h2><p>{t('名簿は管理者にのみ表示します。','The roster is visible only to administrators.')}</p>{data?.members?.map(m=><div className={css.row} key={m.id}><span className={css.placeInfo}><span><PersonIdentity person={m.creator} label={m.name}/><small>{m.role==='admin'?t('管理者','Admin'):t('参加者','Member')}</small></span></span>{m.id!==user?.id&&<CommunityMenu label={t('メンバーの操作','Member actions')}><button disabled={busy||!active||m.role==='admin'||m.admin_offered} onClick={()=>void change('offer-admin',{userId:m.id})}>{t('管理者を依頼','Offer admin role')}</button><button disabled={busy} onClick={()=>{if(confirm(t('このメンバーを除外しますか？','Remove this member?')))void change('remove',{userId:m.id});}}>{t('除外','Remove')}</button>{m.role==='admin'&&<button disabled={busy} onClick={()=>void change('demote-admin',{userId:m.id})}>{t('参加者に戻す','Change to member')}</button>}{m.admin_offered&&<button disabled={busy} onClick={()=>void change('cancel-admin-offer',{userId:m.id})}>{t('依頼を取り消す','Cancel admin offer')}</button>}</CommunityMenu>}</div>)}{paging(data?.membersCursor,true)}<button disabled={busy} onClick={()=>{if(confirm(t('最後の管理者の場合はアーカイブになります。管理者を辞任しますか？','If you are the last admin, the community will be archived. Resign?')))void change('demote-admin',{userId:user?.id});}}>{t('管理者を辞任して参加者として残る','Resign as admin and stay a member')}</button></section>}
 </>}
 {thread&&<section className={css.conversation}>{capsuleReturn?.threadId===thread.id&&<a className={css.backLink} href={link(capsuleReturn.route)}>{t('← Capsuleへ戻る','← Back to Capsule')}</a>}{activityReturn&&<a className={css.backLink} href={link(activityReturn)}>{t('← 投稿一覧へ戻る','← Back to my posts')}</a>}<header className={css.heading}><div><h1>{thread.title}</h1><div className={css.creatorLine}><PersonIdentity person={thread.creator}/></div><small>{thread.audience==='public'?t('公開の会話','Public conversation'):t('作成時の参加者限定','Original participants only')}{thread.closed?' · '+t('投稿停止','Closed'):''}</small></div>{user&&<CommunityMenu compact label={t('スレッドの操作','Thread actions')}>{c?.role==='admin'&&<button disabled={busy} onClick={()=>void mutate('/threads/'+thread.id+'/close',{expectedRevision:thread.revision,closed:!thread.closed})}>{thread.closed?t('投稿を再開','Reopen thread'):t('投稿を停止','Close thread')}</button>}<CommunitySafetyActions kind="thread" id={thread.id} revision={thread.revision} t={t} mutate={mutate} busy={busy} reportable targetLabel={thread.title}/></CommunityMenu>}</header><CommunityCapsuleLinks listings={data?.capsules??[]}/>{data?.posts?.map(p=><article id={'post-'+p.id} tabIndex={-1} data-focused={new URL(route,location.origin).searchParams.get('post')===p.id?'true':undefined} key={p.id} className={css.post}><div className={css.postContent}><header className={css.postMeta}><div><PersonIdentity person={p.author&&p.name?{...p.author,displayName:p.name}:null} label={p.status==='withdrawn'?t('投稿者による撤回','Withdrawn by author'):p.status==='hidden'?t('管理による非表示','Hidden by moderation'):undefined}/>{p.createdAt&&<time dateTime={p.createdAt}>{new Date(p.createdAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time>}</div>{user&&<CommunityMenu compact label={t('投稿の操作','Post actions')}>{p.canWithdraw&&<WithdrawPost busy={busy} t={t} onConfirm={()=>mutate('/posts/'+p.id+'/withdraw',{})}/>}<CommunitySafetyActions kind="post" id={p.id} revision={p.revision??1} t={t} mutate={mutate} busy={busy} reportable={p.status==='visible'} moderate={c?.role==='admin'&&p.status!=='withdrawn'} hidden={p.status==='hidden'} hiddenBy={p.hiddenBy} targetLabel={t('この投稿','This post')}/></CommunityMenu>}</header><p>{p.body}</p></div></article>)}{paging(data?.nextCursor)}{member&&active&&!thread.closed&&<form className={`${css.form} ${css.reply}`} onSubmit={e=>{e.preventDefault();void mutate('/threads/'+thread.id+'/posts',{body,expectedRevision:thread.revision},true);}}><label>{t('返信','Reply')}<textarea aria-label={t('返信','Reply')} required maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/></label><div className={css.replyFooter}><small>{t('あなたの視点で、会話の続きを。','Add your perspective to the conversation.')}</small><button disabled={busy} className={css.primary}>{t('返信する','Reply')} <Icon name="arrow"/></button></div></form>}</section>}
 {route.split('?')[0]==='/my-posts'&&data?.posts&&<><header className={css.heading}><div><PageIdentity area="activity"/><h1>{t('コミュニティの投稿','Community posts')}</h1><p>{t('あの発言から、もう一度会話へ。','Pick up a conversation where you left off.')}</p></div></header>{!data.posts.length&&<p className={css.empty}>{t('まだ投稿はありません。参加先の会話から始められます。','No posts yet. Start a conversation in a community you joined.')}</p>}{data.posts.map(p=><article className={css.row} key={p.id}><div className={css.activityBody}>{p.readable&&<><small>{p.communityTitle}</small><a className={css.titleLink} href={link('/threads/'+p.threadId+'?post='+p.id)} onClick={()=>{setActivityReturn(route);}}>{p.threadTitle}</a></>}<p>{p.body||t('撤回・非表示','Withdrawn or hidden')}</p><small>{p.createdAt?new Date(p.createdAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'}):''}</small>{!p.readable&&<small>{t('現在この会話を閲覧できません。自分の投稿の撤回は可能です。','You cannot currently access this conversation. You may still withdraw your own post.')}</small>}</div><div className={css.actions}>{p.readable&&<a className={css.readAction} href={link('/threads/'+p.threadId+'?post='+p.id)} onClick={()=>{setActivityReturn(route);}}>{t('会話で読む','Read in conversation')}<Icon name="arrow"/></a>}{p.status!=='withdrawn'&&<CommunityMenu compact label={t('投稿の操作','Post actions')}><WithdrawPost busy={busy} t={t} onConfirm={()=>mutate('/posts/'+p.id+'/withdraw',{})}/></CommunityMenu>}</div></article>)}</>}
 {data?.reports&&<CommunityReportReceipts reports={data.reports} t={t}/>}
 {data?.audit&&<section className={css.form}><h2>{t('投稿の管理履歴','Post moderation log')}</h2><p>{t('現在閲覧できる会話への管理操作だけを表示します。サイト通報の本文は含みません。','Only actions on conversations you can currently access are shown. Private site reports are not included.')}</p>{!data.audit.length&&<p className={css.empty}>{t('表示できる管理履歴はありません。','No moderation history available.')}</p>}{data.audit.map(a=><article className={css.row} key={a.id}><div><strong>{a.action==='post-hide'?t('投稿を非表示','Post hidden'):t('非表示を解除','Post unhidden')}</strong><p>{a.reason}</p><small>{t('操作主体','Actor')}: {a.actorId??t('退会済み','Deleted account')} · {new Date(a.at).toLocaleString(locale)}<br/>{t('対象','Target')}: {a.targetId}</small></div></article>)}{paging(data.nextCursor)}</section>}
 {data&&<CommunityContinuity data={data} user={user} busy={busy} route={route} t={t} mutate={mutate}/>}
 {c&&!thread&&tab==='invitations'&&paging(data?.nextCursor)}
 {!c&&paging(data?.nextCursor)}

 </div></CommunityRevalidation.Provider></main>;
}

const capsuleListingSchema=communityCapsuleListingSchema;
type CapsuleListing=z.infer<typeof capsuleListingSchema>;
const capsuleListingsSchema=z.object({listings:z.array(capsuleListingSchema),nextCursor:z.string().nullable(),partial:z.boolean()});
const communityCapsuleSchema=z.object({listing:capsuleListingSchema,capsule:memberCapsuleSchema});
type CapsulePublication={capsule:MemberCapsule;listing?:CapsuleListing};
type CapsuleAttempt={path:string;input:Record<string,unknown>};
type CommunityCapsulesProps={threads?:{id:string;title:string;audience:string}[];community:Community;user:MemberUser|null;dataset:DatasetMode;route:string;blocked:boolean;busy:boolean;mutate:CommunityMutation;onDirty:(dirty:boolean)=>void;onThread:(id:string)=>void};

// A listing always resolves its own fixed version. Community membership alone
// must never substitute for the listing's independent Capsule authorization.
export function CommunityCapsules({community,user,dataset,route,blocked,busy,mutate,onDirty,onThread,threads=[]}:CommunityCapsulesProps){
 const {locale}=useUiLocale();const t=(ja:string,en:string)=>locale==='en'?en:ja;
 const listingId=new URL(route||'/','https://community.invalid').searchParams.get('listing');
 const validListing=listingId===null||z.uuid().safeParse(listingId).success;
 const [list,setList]=useState<z.infer<typeof capsuleListingsSchema>|null>(null);
 const [reading,setReading]=useState<z.infer<typeof communityCapsuleSchema>|null>(null);
 const [cursor,setCursor]=useState<string|null>(null),[trail,setTrail]=useState<(string|null)[]>([]);
 const [loading,setLoading]=useState(false),[loadError,setLoadError]=useState(''),[pageInvalid,setPageInvalid]=useState(false),[retryRead,setRetryRead]=useState(0);
 const [items,setItems]=useState<MemberCapsuleSummary[]>([]),[choosing,setChoosing]=useState(false),[choice,setChoice]=useState('');
 const [publication,setPublication]=useState<CapsulePublication|null>(null),[description,setDescription]=useState('');
 const [audience,setAudience]=useState<'public'|'cohort'>('cohort'),[threadId,setThreadId]=useState('');
 const [confirmed,setConfirmed]=useState(false),[withdraw,setWithdraw]=useState<CapsuleListing|null>(null);
 const [sending,setSending]=useState(false),[actionError,setActionError]=useState(''),[unknown,setUnknown]=useState(false),[notice,setNotice]=useState('');
 const readSequence=useRef(0),attempt=useRef<CapsuleAttempt|null>(null),picker=useRef<AbortController|null>(null);
 const base='/'+community.id+'?tab=capsules';
 const href=(path:string)=>'#'+encodeURIComponent(path);
 const localCapsule=useMemo(()=>reading?memberReaderCapsule(reading.capsule,dataset):null,[reading,dataset]);
 const publicationCapsule=useMemo(()=>publication?memberReaderCapsule(publication.capsule,dataset):null,[publication,dataset]);
 const errorText=(error:unknown)=>error instanceof MemberClientError&&['PAGE_CHANGED','INVALID_CURSOR'].includes(error.code)?t('一覧の状態が変わりました。最初のページから確認してください。','The list has changed. Restart from the first page.'):error instanceof MemberClientError&&error.code==='CAPSULES_UNAVAILABLE'
  ?t('この環境ではCapsule掲載をまだ利用できません。','Capsule publishing is not enabled in this environment yet.')
  :error instanceof MemberClientError&&[401,403,404].includes(error.status)
   ?t('現在このCapsuleを閲覧・操作できません。公開停止や参加状態の変更が考えられます。','This Capsule is not currently available to you. Publishing or membership may have changed.')
   :t('取得できませんでした。再試行してください。','Could not load. Please retry.');
 useEffect(()=>{onDirty(!!publication||choosing||!!withdraw);return()=>onDirty(false);},[publication,choosing,withdraw,onDirty]);
 useEffect(()=>()=>picker.current?.abort(),[]);
 useEffect(()=>{
  const seq=++readSequence.current,ac=new AbortController();
  if(blocked){picker.current?.abort();return()=>ac.abort();}
  if(!validListing){queueMicrotask(()=>{setReading(null);setList(null);setLoadError(t('掲載のURLが正しくありません。','This listing URL is invalid.'));});return()=>ac.abort();}
  queueMicrotask(()=>{setLoading(true);setLoadError('');setPageInvalid(false);});
  const endpoint=listingId?'/capsules/'+listingId:'/'+community.id+'/capsules'+(cursor?'?cursor='+encodeURIComponent(cursor):'');
  const schema=z.union([communityCapsuleSchema,capsuleListingsSchema]);
  memberRequest('/api/communities'+endpoint,schema,{...(user?{user:user.id}:{}),signal:ac.signal}).then(value=>{
   if(ac.signal.aborted||seq!==readSequence.current||document.hidden)return;
   if(!!listingId!==('capsule'in value))throw new Error('Unexpected listing response');
   if('capsule'in value){
    if(value.listing.communityId!==community.id||value.capsule.id!==value.listing.capsuleId||value.capsule.revision!==value.listing.capsuleRevision||value.capsule.content.dataset!==dataset)throw new Error('Listing context mismatch');
    setReading(previous=>JSON.stringify(previous)===JSON.stringify(value)?previous:value);
   }else setList(value);
  }).catch(error=>{if(ac.signal.aborted||seq!==readSequence.current)return;setReading(null);setList(null);setLoadError(errorText(error));setPageInvalid(error instanceof MemberClientError&&['PAGE_CHANGED','INVALID_CURSOR'].includes(error.code));}).finally(()=>{if(!ac.signal.aborted&&seq===readSequence.current)setLoading(false);});
  return()=>ac.abort();
 // Parent session revalidation supplies a new authorized Community object.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[community,user?.id,blocked,listingId,validListing,cursor,retryRead,dataset]);
 const beginChoose=async()=>{
  if(!user||blocked)return;picker.current?.abort();const ac=new AbortController();picker.current=ac;setLoading(true);setActionError('');setNotice('');
  try{
   const capabilities=await memberRequest('/api/member/capsule-capabilities',z.object({documents:z.boolean(),community:z.boolean()}),{user:user.id,signal:ac.signal});
   if(!capabilities.community)throw new MemberClientError(503,'CAPSULES_UNAVAILABLE');
   const value=await memberRequest('/api/member/capsules',memberListSchema,{user:user.id,signal:ac.signal});
   if(ac.signal.aborted||document.hidden)return;
   setItems(value.capsules.filter(c=>c.content.dataset===dataset));setChoosing(true);setChoice('');
  }catch(error){if(!ac.signal.aborted)setActionError(errorText(error));}finally{if(!ac.signal.aborted)setLoading(false);}
 };
 const beginPublication=(capsule:MemberCapsule,listing?:CapsuleListing)=>{
  setPublication({capsule,listing});setDescription(listing?.description??'');setAudience(listing?.audience??'cohort');setThreadId(listing?.threadId??'');setConfirmed(false);setChoosing(false);setActionError('');setUnknown(false);attempt.current=null;
 };
 const previewChoice=async()=>{
  if(!user||blocked||!choice)return;picker.current?.abort();const ac=new AbortController();picker.current=ac;setLoading(true);setActionError('');
  try{
   const current=await memberRequest('/api/member/capsules/'+choice,memberItemSchema,{user:user.id,signal:ac.signal});
   if(ac.signal.aborted||document.hidden)return;
   if(current.capsule.id!==choice||current.capsule.content.dataset!==dataset)throw new Error('Capsule context mismatch');
   beginPublication(current.capsule);
  }catch(error){if(!ac.signal.aborted)setActionError(errorText(error));}finally{if(!ac.signal.aborted)setLoading(false);}
 };
 const beginUpdate=async(listing:CapsuleListing)=>{
  if(!user||blocked)return;picker.current?.abort();const ac=new AbortController();picker.current=ac;setLoading(true);setActionError('');
  try{
   const current=await memberRequest('/api/member/capsules/'+listing.capsuleId,memberItemSchema,{user:user.id,signal:ac.signal});
   if(ac.signal.aborted||document.hidden)return;
   if(current.capsule.id!==listing.capsuleId||current.capsule.content.dataset!==dataset)throw new Error('Capsule context mismatch');
   beginPublication(current.capsule,listing);
  }catch(error){if(!ac.signal.aborted)setActionError(errorText(error));}finally{if(!ac.signal.aborted)setLoading(false);}
 };
 const apply=async(next:CapsuleAttempt)=>{
  if(sending||blocked)return;const value=attempt.current??next;attempt.current=value;setSending(true);setActionError('');
  const result=await mutate(value.path,value.input,true);setSending(false);
  if(result.ok){attempt.current=null;setUnknown(false);setPublication(null);setWithdraw(null);setChoosing(false);setNotice(value.path.endsWith('/withdraw')?t('掲載を撤去しました。Capsule本体と会話は保持しています。','Listing withdrawn. The Capsule and conversation are preserved.'):t('確認した版を掲載しました。今後の編集は自動反映されません。','The confirmed version is published. Later edits are not published automatically.'));setCursor(null);setTrail([]);setRetryRead(n=>n+1);if(value.path.endsWith('/withdraw')){onDirty(false);navigatePersonalHash(base);}}
  else {setUnknown(result.unknown);if(!result.unknown)attempt.current=null;setActionError(result.unknown?t('送信結果が不明です。入力を変えず、同じ操作を再確認してください。','The result is unknown. Retry the same operation without changing the input.'):t('保存できませんでした。内容は保持しています。現在の版・権限を確認して再試行してください。','Could not save. Your input is retained. Check the current version and permissions before retrying.')+' '+result.code);}
 };
 const cancel=()=>{
  if(sending)return;
  if(!window.confirm(unknown?t('処理済みの可能性があります。閉じた後は掲載一覧と現在の版を確認してください。入力を閉じますか？','This may already have been applied. Check the listing and current version after closing. Close this draft?'):t('掲載操作の入力を破棄して閉じますか？','Discard this publishing draft and close?')))return;
  setPublication(null);setWithdraw(null);setChoosing(false);setUnknown(false);setActionError('');attempt.current=null;
 };
 const manage=(listing:CapsuleListing)=><div className={css.actions}>
  {listing.canManage&&user&&<><button disabled={loading||busy||sending||community.status!=='active'} onClick={()=>void beginUpdate(listing)}>{t('掲載版を更新','Update published version')}</button><button disabled={busy||sending} onClick={()=>{setWithdraw(listing);setActionError('');setUnknown(false);attempt.current=null;}}>{t('掲載を撤去','Withdraw listing')}</button></>}
  {user&&<CommunitySafetyActions kind="capsule" id={listing.id} revision={listing.revision} t={t} mutate={mutate} busy={busy||sending} reportable targetLabel={listing.title}/>}
 </div>;
 return <section aria-label={t('コミュニティのCapsule','Community Capsules')}>
  {notice&&<p className={css.notice} role="status">{notice}</p>}
  {loadError&&<p role="alert">{loadError} <button disabled={loading} onClick={()=>setRetryRead(n=>n+1)}>{t('再確認','Retry')}</button>{pageInvalid&&<button onClick={()=>{setCursor(null);setTrail([]);setRetryRead(n=>n+1);}}>{t('最初のページから確認','Restart from the first page')}</button>}</p>}
  {actionError&&!publication&&!withdraw&&<p role="alert">{actionError}</p>}
  {loading&&!list&&!reading&&<p role="status">{t('Capsuleを確認しています…','Checking Capsules…')}</p>}
  {listingId?<><a className={css.backLink} href={href(base)}>{t('← Capsule一覧へ戻る','← Back to Capsule list')}</a>{reading&&localCapsule&&<>
   <header className={css.sectionHeading}><div><h2>{reading.listing.title}</h2><p>{t('掲載された固定版','Published fixed version')} · {reading.listing.capsuleRevision}</p></div></header>
   <p className={css.contextNote}>{reading.listing.description}</p><p className={css.contextNote}>{reading.listing.audience==='public'?t('誰でも閲覧できます。','Visible to everyone.'):t('掲載時の参加者だけが閲覧できます。再参加で以前の権限は戻りません。','Visible to the original participants. Rejoining does not restore earlier access.')}</p>
   {manage(reading.listing)}<CapsuleReader key={reading.listing.id+':'+reading.listing.capsuleRevision} capsule={localCapsule} explorationLinks noteAttribution="author"/>
   {reading.listing.threadId&&<a className={css.readAction} href={href('/threads/'+reading.listing.threadId)} onClick={()=>onThread(reading.listing.threadId!)}>{t('関連する会話へ','Open related conversation')} <Icon name="arrow"/></a>}
   <a className={css.backLink} href={href(base)}>{t('← Capsule一覧へ戻る','← Back to Capsule list')}</a>
  </>}</>:<>
   <header className={css.sectionHeading}><div><h2>{t('発見をCapsuleで持ち寄る','Share discoveries as Capsules')}</h2><p>{t('選んだ版だけを掲載します。編集権や本線知識への受入は移りません。','Publish the selected version. Ownership and Global KG acceptance stay separate.')}</p></div>{user&&community.role&&community.status==='active'&&<button className={css.primary} disabled={busy||loading||sending||!!loadError} onClick={()=>void beginChoose()}>{t('自分のCapsuleを掲載','Publish your Capsule')}</button>}</header>
   {list&&!list.listings.length&&<p className={css.empty}>{t('まだCapsuleは掲載されていません。','No Capsules have been published here yet.')}</p>}
   {list?.listings.map(item=><article key={item.id} className={css.row}><div><a className={css.titleLink} href={href(base+'&listing='+item.id)}>{item.title}</a><p>{item.description}</p><small>{t('内容版','Content version')} {item.capsuleRevision} · {item.entityCount} {t('対象','entities')} / {item.claimCount} {t('主張','claims')} · {item.audience==='public'?t('公開','Public'):t('掲載時の参加者限定','Original participants only')}</small></div><a className={css.readAction} href={href(base+'&listing='+item.id)}>{t('Capsuleを読む','Read Capsule')} <Icon name="arrow"/></a></article>)}
   {list&&<nav className={css.paging} aria-label={t('Capsule一覧のページ','Capsule pages')}><button disabled={!trail.length||loading} onClick={()=>{const previous=[...trail],value=previous.pop()??null;setTrail(previous);setCursor(value);}}>{t('前のページ','Previous page')}</button>{list.nextCursor&&<button disabled={loading} onClick={()=>{setTrail([...trail,cursor]);setCursor(list.nextCursor);}}>{t('次のページ','Next page')}</button>}</nav>}
  </>}
  {choosing&&<CommunityDialog title={t('掲載するCapsuleを選ぶ','Choose a Capsule to publish')} busy={sending} onCancel={cancel}><form className={css.form} onSubmit={e=>{e.preventDefault();void previewChoice();}}>
   <p>{t('自分が所有するCapsuleから、公開内容と版を確認して掲載します。','Choose a Capsule you own, then review its content and version before publishing.')}</p>
   {!items.length?<p>{t('掲載できるCapsuleがありません。アカウントで作成・保存してください。','No Capsules are available. Create or save one in your account.')}</p>:<fieldset><legend>{t('自分のCapsule','Your Capsules')}</legend>{items.map(item=><label key={item.id}><input type="radio" name="capsule-to-publish" checked={choice===item.id} onChange={()=>setChoice(item.id)}/>{item.content.title} · {t('内容版','version')} {item.revision}</label>)}</fieldset>}
   {actionError&&<p role="alert">{actionError}</p>}<div className={css.actions}><button className={css.primary} disabled={!choice||loading}>{t('掲載内容を確認','Review publication')}</button><button type="button" onClick={cancel}>{t('キャンセル','Cancel')}</button></div>
  </form></CommunityDialog>}
  {publication&&<CommunityDialog title={publication.listing?t('掲載する版を更新','Update published version'):t('Capsuleの掲載を確認','Confirm Capsule publication')} busy={sending} onCancel={cancel}>{publicationCapsule&&<CapsuleReader capsule={publicationCapsule} noteAttribution="author"/>}<form className={css.form} onSubmit={e=>{e.preventDefault();if(!confirmed&&!unknown)return;void apply({path:publication.listing?'/capsules/'+publication.listing.id+'/update':'/'+community.id+'/capsules',input:{expectedRevision:publication.listing?.revision??community.revision,capsuleRevision:publication.capsule.revision,description,...(!publication.listing?{capsuleId:publication.capsule.id,audience}:{}),...(threadId.trim()?{threadId:threadId.trim()}:{})}});}}>
   <p><strong>{publication.capsule.content.title}</strong> · {t('内容版','Content version')} {publication.capsule.revision}</p>
   <p>{publication.capsule.content.note||t('説明なし','No description')}</p><p>{publication.capsule.content.entityIds.length} {t('対象','entities')} / {publication.capsule.content.claimIds.length} {t('主張','claims')}</p>
   <p>{t('この版の説明・構成を固定して掲載します。以後の編集は、掲載版を明示更新するまで共有されません。Capsuleの所有者や編集権は変わりません。','This fixes the description and contents of this version. Later edits remain private until you explicitly update the publication. Ownership and editing rights are preserved.')}</p>
   {publication.listing?<p>{t('この掲載の公開範囲は変更しません。','The audience of this listing stays the same.')} {audience==='public'?t('公開','Public'):t('掲載時の参加者限定','Original participants only')}</p>:community.visibility==='public'?<fieldset disabled={unknown||sending}><legend>{t('このCapsuleを読める人','Who can read this Capsule')}</legend><label><input type="radio" checked={audience==='cohort'} onChange={()=>setAudience('cohort')}/>{t('現在の参加者だけ','Current members only')}</label><label><input type="radio" checked={audience==='public'} onChange={()=>setAudience('public')}/>{t('誰でも（一般公開）','Everyone (public)')}</label></fieldset>:<p>{t('現在の参加者だけに掲載します。後からの参加者へ自動公開しません。','Only current members can read this. It is not automatically shared with later members.')}</p>}
   <label>{t('この場所での紹介','Introduction in this community')}<textarea maxLength={1000} value={description} disabled={unknown||sending} onChange={e=>setDescription(e.target.value)}/></label>
   <label>{t('関連する会話（任意）','Related conversation (optional)')}<select value={threadId} disabled={unknown||sending} onChange={e=>setThreadId(e.target.value)}><option value="">{t('会話を関連付けない','No related conversation')}</option>{threadId&&!threads.some(thread=>thread.id===threadId)&&<option value={threadId}>{t('現在の掲載に関連する会話','Conversation linked to this listing')}</option>}{threads.map(thread=><option key={thread.id} value={thread.id}>{thread.title} · {thread.audience==='public'?t('公開','Public'):t('参加者限定','Original participants only')}</option>)}</select></label><p>{t('会話は独立した内容です。Capsuleを読めても、関連する会話を読めるとは限りません。','Conversations have their own access rules. Access to this Capsule does not grant access to a linked conversation.')}</p>
   <label><input type="checkbox" checked={confirmed} disabled={unknown||sending} onChange={e=>setConfirmed(e.target.checked)}/>{t('内容版と閲覧範囲を確認しました','I have reviewed this version and its audience')}</label>
   {actionError&&<p role="alert">{actionError}</p>}<div className={css.actions}><button className={css.primary} disabled={busy||sending||(!confirmed&&!unknown)}>{unknown?t('同じ操作の結果を再確認','Retry same request'):publication.listing?t('確認した版へ更新','Update to this version'):t('確認した版を掲載','Publish this version')}</button><button type="button" disabled={sending} onClick={cancel}>{t('キャンセル','Cancel')}</button></div>
  </form></CommunityDialog>}
  {withdraw&&<CommunityDialog title={t('Capsuleの掲載を撤去','Withdraw Capsule listing')} busy={sending} onCancel={cancel}><p>{withdraw.title}</p><p>{t('この場所の掲載と閲覧権を停止します。Capsule本体・別の共有・関連する会話は削除しません。','This withdraws the listing and its access in this community. The original Capsule, other shares and related conversations are preserved.')}</p>{actionError&&<p role="alert">{actionError}</p>}<div className={css.actions}><button disabled={busy||sending} onClick={()=>void apply({path:'/capsules/'+withdraw.id+'/withdraw',input:{expectedRevision:withdraw.revision}})}>{unknown?t('同じ操作の結果を再確認','Retry same request'):t('掲載を撤去する','Confirm withdrawal')}</button><button disabled={sending} onClick={cancel}>{t('キャンセル','Cancel')}</button></div></CommunityDialog>}
 </section>;
}


export function CommunityCapsuleLinks({listings}:{listings:CapsuleListing[]}){
 const {locale}=useUiLocale();const t=(ja:string,en:string)=>locale==='en'?en:ja;
 if(!listings.length)return null;
 return <section aria-label={t('この会話に関連するCapsule','Capsules in this conversation')}><header className={css.sectionHeading}><h2>{t('関連するCapsule','Related Capsules')}</h2><a href={'#'+encodeURIComponent('/'+listings[0].communityId+'?tab=capsules')}>{t('Capsule一覧へ','All Capsules')}</a></header>{listings.map(item=><article key={item.id} className={css.row}><div><a className={css.titleLink} href={'#'+encodeURIComponent('/'+item.communityId+'?tab=capsules&listing='+item.id)}>{item.title}</a><p>{item.description}</p><small>{t('内容版','Content version')} {item.capsuleRevision} · {item.audience==='public'?t('公開','Public'):t('掲載時の参加者限定','Original participants only')}</small></div></article>)}</section>;
}
