"use client";
import {navigatePersonalHash} from "../lib/client/personal-location";
import Link from "next/link";
import {usePathname} from "next/navigation";
import InvitationBadge from "./InvitationBadge";
import {useMemberSession} from "../lib/client/use-member-identity";
import {useEffect,useRef} from 'react';
import {useUiLocale} from '../lib/client/ui-locale';
import css from './PersonalNavigation.module.css';
export type PersonalSection='capsules'|'settings'|'capsule-posts'|'discover'|'joined'|'invitations'|'participation'|'community-posts'|'reports';
export default function PersonalNavigation({selected,onNavigate}:{selected?:PersonalSection;onNavigate?:()=>boolean}){
 const pathname=usePathname();
 const identity=useMemberSession();const signedIn=identity.status!=='guest';
 const {locale}=useUiLocale();const t=(ja:string,en:string)=>locale==='en'?en:ja;
 const nav=useRef<HTMLElement>(null);
 useEffect(()=>{const node=nav.current,group=node?.querySelector('[aria-current="page"]')?.parentElement;if(!node||!group||node.scrollWidth<=node.clientWidth)return;const box=group.getBoundingClientRect(),outer=node.getBoundingClientRect();if(box.left<outer.left||box.right>outer.right)node.scrollLeft+=box.left-outer.left;},[selected,signedIn]);
 const item=(id:PersonalSection,destination:string,label:string)=>{const href=pathname==='/member'&&destination.startsWith('/member#')?destination.slice(7):destination;return <Link key={id} href={href} aria-label={label} scroll={false} onClick={event=>{if(onNavigate&&!onNavigate()){event.preventDefault();return;}const target=new URL(href,location.href);if(target.pathname===location.pathname&&target.search===location.search&&target.hash){event.preventDefault();navigatePersonalHash(target.hash);}}} aria-current={selected===id?'page':undefined}>{label}{id==='invitations'&&<InvitationBadge/>}</Link>;};
 return <nav ref={nav} className={css.navigation} aria-label={t('アカウントとコミュニティ','Account and communities')}>
 <div><h2>{t('見つける','Discover')}</h2>{item('discover','/communities',t('コミュニティを見つける','Discover communities'))}</div>
 <div><h2>{t('自分のスペース','Your space')}</h2>{item('capsules','/member#my-capsules',t('自分のCapsule','My Capsules'))}
 {signedIn&&<>{item('joined','/communities#%3Fmine%3D1',t('参加・運営','Joined & managed'))}{item('invitations','/communities#%2Finvitations',t('届いた招待','Received invitations'))}{item('settings','/member#account-settings',t('アカウント設定','Account settings'))}</>}</div>
 {signedIn&&<div><h2>{t('自分の活動・履歴','Your activity')}</h2>{item('community-posts','/communities#%2Fmy-posts',t('コミュニティの投稿','Community posts'))}{item('capsule-posts','/member#my-posts',t('Capsuleのコメント','Capsule comments'))}{item('participation','/communities#%2Fparticipation',t('参加履歴・運営復帰','Membership & continuity'))}{item('reports','/communities#%2Freports',t('自分の通報','My reports'))}</div>}
 </nav>;
}
