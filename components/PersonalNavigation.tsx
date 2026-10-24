"use client";
import {navigatePersonalHash} from "../lib/client/personal-location";
import Link from "next/link";
import {usePathname} from "next/navigation";
import Icon from './Icon';
import InvitationBadge from "./InvitationBadge";
import {useMemberSession} from "../lib/client/use-member-identity";
import {useEffect,useLayoutEffect,useRef} from 'react';
import {useUiLocale} from '../lib/client/ui-locale';
import css from './PersonalNavigation.module.css';
export type PersonalSection='capsules'|'settings'|'capsule-posts'|'discover'|'joined'|'invitations'|'participation'|'community-posts'|'reports'|'community-detail';
export default function PersonalNavigation({selected,onNavigate}:{selected?:PersonalSection;onNavigate?:()=>boolean}){
 const pathname=usePathname(),identity=useMemberSession(),signedIn=identity.status!=='guest';
 const {locale}=useUiLocale();const t=(ja:string,en:string)=>locale==='en'?en:ja;
 const nav=useRef<HTMLElement>(null),picker=useRef<HTMLDetailsElement>(null);
 const groups:{label:string;items:[PersonalSection,string,string][]}[]=[
  {label:t('コミュニティ','Communities'),items:[['discover','/communities',t('コミュニティを見つける','Discover communities')],...(signedIn?[['joined','/communities#%3Fmine%3D1',t('参加・運営','Joined & managed')]] as [PersonalSection,string,string][]:[])]},
  {label:t('アカウント','Account'),items:[['capsules','/member#my-capsules',t('自分のCapsule','My Capsules')],...(signedIn?[
   ['invitations','/communities#%2Finvitations',t('届いた招待','Received invitations')],['settings','/member#account-settings',t('アカウント設定','Account settings')]
  ] as [PersonalSection,string,string][]:[])]},
  ...(signedIn?[{label:t('活動・履歴','Activity & history'),items:[['community-posts','/communities#%2Fmy-posts',t('コミュニティの投稿','Community posts')],['capsule-posts','/member#my-posts',t('Capsuleのコメント','Capsule comments')],['participation','/communities#%2Fparticipation',t('参加履歴・運営復帰','Membership & continuity')],['reports','/communities#%2Freports',t('自分の通報','My reports')]] as [PersonalSection,string,string][]}]:[])
 ];
 const current=Math.max(0,groups.findIndex(g=>g.items.some(i=>i[0]===selected)));
 useLayoutEffect(()=>{
  if(picker.current)picker.current.open=false;
  const rail=nav.current?.querySelector<HTMLElement>('[data-active="true"] > div');const item=rail?.querySelector('[aria-current="page"]');
  if(rail){rail.scrollLeft=0;if(item){const box=item.getBoundingClientRect(),outer=rail.getBoundingClientRect();if(box.right>outer.right)rail.scrollLeft=box.right-outer.right+8;}}
 },[selected,signedIn]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(picker.current&&!picker.current.contains(e.target as Node))picker.current.open=false;};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&picker.current?.open){picker.current.open=false;picker.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[]);
 const go=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(onNavigate&&!onNavigate()){event.preventDefault();return;}if(picker.current)picker.current.open=false;const target=new URL(event.currentTarget.href,location.href);if(target.pathname===location.pathname&&target.search===location.search&&target.hash){event.preventDefault();navigatePersonalHash(target.hash);}};
 const item=([id,destination,label]:[PersonalSection,string,string])=><Link key={id} href={pathname==='/member'&&destination.startsWith('/member#')?destination.slice(7):destination} aria-label={label} scroll={false} onClick={go} aria-current={selected===id?'page':undefined}><Icon name={id==='capsules'?'capsule':id==='settings'?'settings':id==='discover'?'search':id==='joined'?'graph':id==='invitations'?'person':id==='reports'?'list':'history'}/>{label}{id==='invitations'&&<InvitationBadge/>}</Link>;
 return <nav ref={nav} className={css.navigation} aria-label={t('アカウントとコミュニティ','Account and communities')}>
  <details data-floating-menu className={css.categoryPicker} ref={picker}>
   <summary aria-label={t('カテゴリを切り替える','Switch category')}><span>{selected?groups[current].label:t('現在地を確認中…','Loading location…')}</span><Icon name="chevron"/></summary>
   <div className={css.categoryPanel}>{groups.map((g,i)=>i!==current&&<section key={g.label}><h3>{g.label}</h3>{g.items.map(item)}</section>)}</div>
  </details>
  {selected===undefined&&<div className={css.navPending} aria-hidden="true"/>}
  {groups.map((g,i)=><section key={g.label} className={css.group} data-active={selected!==undefined&&i===current}><h2>{g.label}</h2><div>{g.items.map(item)}</div></section>)}
 </nav>;
}
