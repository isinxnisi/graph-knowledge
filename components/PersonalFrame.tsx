"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import PersonalNavigation,{type PersonalSection} from './PersonalNavigation';
import {useCommunitiesEnabled} from './CommunityAvailability';
import {useMemberSession,refreshMemberIdentity} from '../lib/client/use-member-identity';
import {useUiLocale} from '../lib/client/ui-locale';
import {usePersonalHash} from '../lib/client/personal-location';
import type {DatasetMode} from '../lib/domain/dataset';
import css from './PersonalNavigation.module.css';
type Controls={logout:()=>void;guard:()=>boolean;busy:boolean};
const ControlsContext=createContext<{current:Controls|null;setBusy?:(value:boolean)=>void}>({current:null});
export function PersonalMemberControls({logout,guard,busy}:Controls){const ref=useContext(ControlsContext);useEffect(()=>{ref.current={logout,guard,busy};ref.setBusy?.(busy);return()=>{ref.current=null;ref.setBusy?.(false);};},[ref,logout,guard,busy]);return null;}
export default function PersonalFrame({children,dataset}:{children:ReactNode;dataset:DatasetMode}){
 const pathname=usePathname(),hash=usePersonalHash(),identity=useMemberSession(),enabled=useCommunitiesEnabled(),{locale}=useUiLocale();const [accountBusy,setBusy]=useState(false);const controls=useMemo(()=>({current:null as Controls|null,setBusy}),[]);
 const member=pathname==='/member';let raw='';try{raw=decodeURIComponent(hash??'');}catch{}
 const selected:PersonalSection=member?(raw==='account-settings'?'settings':raw==='my-posts'?'capsule-posts':'capsules'):raw.startsWith('/my-posts')?'community-posts':raw.startsWith('/reports')?'reports':raw.startsWith('/participation')||raw.startsWith('/recoveries')?'participation':raw.startsWith('/invitations')?'invitations':raw.includes('mine=1')?'joined':/^\/[a-f0-9-]{36}/.test(raw)||raw.startsWith('/threads/')?'community-detail':'discover';
 return <ControlsContext.Provider value={controls}><SiteHeader dataset={dataset} page={member?'member':'community'} accountBusy={accountBusy} onBeforeAccountNavigation={()=>controls.current?.guard()??true} onLogout={member?()=>{if(!controls.current?.busy)controls.current?.logout();}:undefined}/>
 <div className={css.shell}><div className={enabled?css.frame:undefined}>{enabled&&<PersonalNavigation selected={hash===null?undefined:selected} onNavigate={()=>controls.current?.guard()??true}/>}<div className={css.content}>
 {identity.error&&<p role="alert">{locale==='en'?'Could not verify your account. Private content remains protected.':'アカウントを確認できませんでした。非公開内容は保護しています。'} <button onClick={()=>void refreshMemberIdentity(true).catch(()=>{})}>{locale==='en'?'Retry':'再試行'}</button></p>}
 {children}</div></div></div><SiteFooter/></ControlsContext.Provider>;
}
