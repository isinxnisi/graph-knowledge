"use client";
import {navigatePersonalHash} from '../lib/client/personal-location';
import {personalNavigation,type PersonalSection} from '../lib/client/personal-navigation';
export type {PersonalSection} from '../lib/client/personal-navigation';
import Link from 'next/link';
import Icon from './Icon';
import {usePublicProfilesEnabled} from './PublicProfileAvailability';
import InvitationBadge from './InvitationBadge';
import {useMemberSession} from '../lib/client/use-member-identity';
import {useUiLocale} from '../lib/client/ui-locale';
import css from './PersonalNavigation.module.css';
export default function PersonalNavigation({selected,onNavigate}:{selected?:PersonalSection;onNavigate?:()=>boolean}){
 const identity=useMemberSession(),{locale}=useUiLocale();
 const profiles=usePublicProfilesEnabled();const groups=personalNavigation(locale,identity.status!=='guest',true,profiles);
 const go=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(onNavigate&&!onNavigate()){event.preventDefault();return;}const target=new URL(event.currentTarget.href,location.href);if(target.pathname===location.pathname&&target.search===location.search&&(target.hash||location.hash)){event.preventDefault();navigatePersonalHash(target.hash);}};
 return <nav className={css.navigation} aria-label={locale==='en'?'Account and communities':'アカウントとコミュニティ'}>{groups.map(g=><section key={g.label}><h2>{g.label}</h2><div>{g.items.map(i=><Link key={i.id} href={i.href} aria-label={i.label} scroll={false} onClick={go} aria-current={selected===i.id?'page':undefined}><Icon name={i.icon}/>{i.label}{i.id==='invitations'&&<InvitationBadge/>}</Link>)}</div></section>)}</nav>;
}