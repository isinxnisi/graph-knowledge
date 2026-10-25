"use client";
import {AiLabEntry, AiLabRecordReturn} from "./AiLabLinks";
import {usePersonalHash,navigatePersonalHash} from "../lib/client/personal-location";
import { localizedPublicHref } from "../lib/domain/public-routes";
import {useCommunitiesEnabled} from "./CommunityAvailability";
import Link from "next/link";
import {personalNavigation,personalSection} from "../lib/client/personal-navigation";
import InvitationBadge from "./InvitationBadge";
import Icon from "./Icon";
import { useMemberSession, refreshMemberIdentity, useOperationsSummary } from "../lib/client/use-member-identity";
import { memberRequest, type MemberUser } from "../lib/client/member-api";
import { z } from "zod";
import { explorationReturnHref, notifyMemberSessionChange } from "../lib/client/account-navigation";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels } from "../lib/i18n/explorer";
import { useEffect, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { siteLabels } from "../lib/i18n/site";
import styles from "./SiteHeader.module.css";
import { supportLabels } from "../lib/i18n/support";
import { appearanceKey, defaultAppearance, readAppearance, type Appearance } from "../lib/client/appearance";

import ProfileAvatar from './ProfileAvatar';
import {usePublicProfilesEnabled} from './PublicProfileAvailability';
export default function SiteHeader({ dataset, page = "explore", onBeforeAccountNavigation, onPrivacySettings, onLogout, accountBusy = false }: { onBeforeAccountNavigation?: () => boolean; onPrivacySettings?: () => void; onLogout?: () => void; accountBusy?: boolean; user?: MemberUser | null; dataset: DatasetMode; page?: "explore" | "member" | "community" | "shared" | "support" | "ai-lab" }) {
  const communitiesEnabled=useCommunitiesEnabled(),profiles=usePublicProfilesEnabled();
  const { locale, setLocale, storageError: languageError } = useUiLocale();
  const ui = explorerLabels(locale), text = siteLabels(locale), data = datasetLabels(dataset, locale);
  const identity = useMemberSession();
  const currentUser = identity.user;
  const operations=useOperationsSummary();
  const operationsLabel=locale==='en'?'Site operations':'サイト運営';
  const pendingLabel=operations.status==='ready'?`${locale==='en'?'Pending':'未対応'} ${operations.data?.pendingCount}`:operations.status==='error'?(locale==='en'?'Pending count unavailable':'未対応件数を確認できません'):(locale==='en'?'Checking pending cases':'未対応件数を確認中');
  const operationsBadge=<span className={styles.operationsBadge} role="status" data-pending={operations.status==='ready'&&!!operations.data?.pendingCount} aria-label={pendingLabel} title={pendingLabel}>{operations.status==='ready'?(operations.data!.pendingCount>99?'99+':operations.data!.pendingCount):operations.status==='error'?'!':'…'}</span>;
  const displayName = currentUser?.name.trim() || text.account;
  const mark = currentUser ? <ProfileAvatar small compact icon={currentUser.profile?.icon??'person'}/> : <Icon name="person" />;
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [storageError, setStorageError] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const siteMenu = useRef<HTMLDetailsElement>(null);
  const hash=usePersonalHash();const selected=page==="member"||page==="community"?personalSection(page==="member",hash):undefined;
  const groups=personalNavigation(locale,identity.status!=="guest",communitiesEnabled,profiles,currentUser?.profile?.handle).sort((a,b)=>Number(b.items.some(i=>i.id==="capsules"))-Number(a.items.some(i=>i.id==="capsules")));
  const [returnHref, setReturnHref] = useState("/");
  // Lab returns use a document navigation so URL/revision-bound Graph pan can
  // verify the lab referrer, just as the former dedicated return link did.
  const ExplorationLink = page === "ai-lab" ? "a" : Link;
  const [signingOut, setSigningOut] = useState(false), [logoutError, setLogoutError] = useState(false);
  const dark = appearance.theme !== "light", palette = appearance.palette;
  useEffect(() => {
    const apply = (value: Appearance) => { document.documentElement.dataset.theme = value.theme; setAppearance(value); };
    const timer = window.setTimeout(() => {
      setReturnHref(explorationReturnHref() === "/" ? localizedPublicHref("/", locale) : explorationReturnHref());
      try { apply(readAppearance(localStorage.getItem(appearanceKey))); }
      catch { setStorageError(true); }
    }, 0);
    const sync = (event: StorageEvent) => { if (event.key === appearanceKey || event.key === null) apply(readAppearance(event.newValue)); };
    const outside = (event: PointerEvent) => { for (const ref of [menu, accountMenu, siteMenu]) if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") for (const ref of [menu, accountMenu, siteMenu]) if (ref.current?.open) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } };
    window.addEventListener("storage", sync); document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [locale]);
  function change(value: Appearance) {
    setAppearance(value); document.documentElement.dataset.theme = value.theme;
    try { localStorage.setItem(appearanceKey, JSON.stringify(value)); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function closeAccount(event: React.MouseEvent<HTMLAnchorElement>) {
    if (onBeforeAccountNavigation && !onBeforeAccountNavigation()) { event.preventDefault(); return; }
    const target=new URL(event.currentTarget.href,location.origin);if(target.pathname===location.pathname&&target.search===location.search&&(target.hash||location.hash)){event.preventDefault();navigatePersonalHash(target.hash);}
    if (accountMenu.current) accountMenu.current.open = false;
    if (siteMenu.current) siteMenu.current.open = false;
  }
  async function signOut() {
    if (onLogout) { if (accountMenu.current) accountMenu.current.open = false; onLogout(); return; }
    if (!currentUser || signingOut) return;
    setSigningOut(true); setLogoutError(false);
    try {
      await memberRequest("/api/auth/sign-out", z.unknown(), { method: "POST", body: {}, user: currentUser.id });
      if (accountMenu.current) accountMenu.current.open = false;
      notifyMemberSessionChange();
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-signed-in="false"]')?.focus());
    } catch { setLogoutError(true); }
    finally { setSigningOut(false); }
  }
  return <header className={styles.header} data-testid="site-header">
    <div className={styles.identity}>
      <Link className={styles.brandLink} href={localizedPublicHref("/", locale)} aria-label={locale === "en" ? "Plunode Home" : "Plunode ホーム"} onClick={closeAccount}>
      <span className={styles.brandMark}><Icon name="graph" /></span>
      {page === "explore" ? <h1 className={styles.brand}>{text.name}</h1> : <span className={styles.brand}>{text.name}</span>}
      </Link>
      <p className={styles.dataset}>{data.badge}</p>
    </div>
    <p className={styles.description}>{data.description}</p>
    <div className={styles.tools}>
      {currentUser?.siteOperator&&<Link className={styles.operationsEntry} href="/operations" onClick={closeAccount} aria-label={operationsLabel} title={operationsLabel+" · "+pendingLabel}><Icon name="shield"/><span className={styles.toolLabel}>{locale==='en'?'Operations':'運営'}</span>{operationsBadge}</Link>}
      <details className={`${styles.settings} ${styles.siteMenu}`} data-floating-menu ref={siteMenu} onToggle={event=>{if(event.currentTarget.open){if(accountMenu.current)accountMenu.current.open=false;if(menu.current)menu.current.open=false;}}}>
        <summary aria-label={locale==='en'?'Site menu':'サイトメニュー'} title={locale==='en'?'Explore & communities':'探索とコミュニティ'}><Icon name="list"/><span className={styles.toolLabel}>{locale==='en'?'Explore & connect':'探索・コミュニティ'}</span><Icon name="chevron"/></summary>
        <div className={styles.settingsPanel}><nav className={styles.settingsLinks} aria-label={text.navigation}>
          <ExplorationLink href={page==='explore'?localizedPublicHref('/',locale):returnHref} onClick={closeAccount}><Icon name="back"/>{page!=='explore'&&(/\/explore\//.test(returnHref)||returnHref.includes('?s='))?(locale==='en'?'Back to your exploration':'元の探索へ戻る'):(locale==='en'?'Start exploring':'探索を始める')}</ExplorationLink>
          {communitiesEnabled&&<Link href="/communities" onClick={closeAccount}><Icon name="search"/>{locale==='en'?'Discover communities':'コミュニティを見つける'}</Link>}
          <AiLabEntry onClick={closeAccount}/><AiLabRecordReturn/>
          <Link href={localizedPublicHref('/support',locale)} onClick={closeAccount}><Icon name="heart"/>{supportLabels(locale).link}</Link>
        </nav></div>
      </details>
      <details className={`${styles.settings} ${styles.accountMenu}`} data-floating-menu ref={accountMenu} onToggle={event=>{if(event.currentTarget.open){if(menu.current)menu.current.open=false;if(siteMenu.current)siteMenu.current.open=false;}}}>
        <summary aria-label={locale==='en'?'Account menu':'アカウントメニュー'} title={currentUser?text.signedInAs(displayName):text.accountLink} data-signed-in={currentUser?'true':identity.status==='guest'?'false':undefined}>
          {currentUser?mark:<Icon name="person"/>}<span className={styles.accountLabel}>{currentUser?displayName:identity.status==='guest'?(locale==='en'?'Account':'アカウント'):identity.error?(locale==='en'?'Unavailable':'確認失敗'):(locale==='en'?'Checking…':'確認中…')}</span>
          {currentUser&&communitiesEnabled&&<InvitationBadge/>}<Icon name="chevron"/>
          {!currentUser&&identity.status!=='guest'&&<span className={styles.srOnly} role="status">{identity.error?(locale==='en'?'Account unavailable':'認証確認に失敗'):(locale==='en'?'Checking account…':'認証を確認中…')}</span>}
        </summary>
        <div className={styles.settingsPanel}>
          {currentUser?<><p className={styles.accountIdentity}><strong>{displayName}</strong><span>{text.signedIn}</span></p>
          <nav aria-label={text.accountNavigation} className={styles.accountLinks}>{groups.map(g=><section key={g.label}><h2>{g.label}</h2>{g.items.map(i=><Link key={i.id} href={i.href} aria-label={i.label} aria-current={selected===i.id?'page':undefined} onClick={closeAccount}><Icon name={i.icon}/>{i.label}{i.id==='invitations'&&<InvitationBadge/>}</Link>)}</section>)}</nav>
          {currentUser.siteOperator&&<Link href="/operations" onClick={closeAccount}>{operationsLabel}{operationsBadge}</Link>}
          <button className={styles.logout} disabled={accountBusy||signingOut} onClick={()=>void signOut()}>{text.logout}</button>{logoutError&&<p role="alert">{text.logoutFailed}</p>}
          </>:identity.status==='guest'?<Link href="/member" onClick={closeAccount}><Icon name="person"/>{locale==='en'?'Sign in / Account':'ログイン・アカウント'}</Link>:<p role="status">{identity.error?(locale==='en'?'Account verification failed.':'認証を確認できませんでした。'):(locale==='en'?'Checking your account…':'アカウントを確認しています…')}{identity.error&&<button onClick={()=>void refreshMemberIdentity(true).catch(()=>{})}>{locale==='en'?'Retry':'再試行'}</button>}</p>}
        </div>
      </details>
      <details data-floating-menu className={styles.settings} ref={menu} onToggle={event => { if (event.currentTarget.open) {if(accountMenu.current) accountMenu.current.open = false;if(siteMenu.current)siteMenu.current.open=false;} }}>
        <summary aria-label={text.settings} title={text.settings}><Icon name="settings" /><span className={styles.toolLabel}>{text.settings}</span></summary>
        <div className={styles.settingsPanel}>
          <div className={styles.appearance} role="group" aria-label={text.appearance}>
            <button aria-label={text.dark} aria-pressed={dark} onClick={() => {
              change({ theme: dark ? "light" : `dark-${palette}`, palette });
            }}>{dark ? text.toLight : text.toDark}</button>
            {dark && <label>{text.palette}<select value={palette} onChange={event => {
              const next = event.target.value === "blue" ? "blue" : "brown";
              change({ theme: `dark-${next}`, palette: next });
            }}><option value="brown">{text.brown}</option><option value="blue">{text.blue}</option></select></label>}
          </div>
          <p>{text.appearanceHelp}</p>
          <label className={styles.language}>{ui.language}<select value={locale} onChange={event => {
            if (onBeforeAccountNavigation && !onBeforeAccountNavigation()) return;
            const next = event.target.value === "en" ? "en" : "ja";
            setLocale(next);
            const path = localizedPublicHref(location.pathname, next);
            if (path !== location.pathname) location.assign(path + location.search + location.hash);
          }}><option value="ja">日本語</option><option value="en">English</option></select></label>
          <p>{ui.languageHelp}</p>
          <p className={styles.dataHelp}>{text.datasetAbout}：{data.badge}<br />{data.description}</p>
          <div className={styles.privacyLinks}>
            {onPrivacySettings && <button onClick={() => { if (menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } onPrivacySettings(); }}>{locale === "en" ? "Analytics & ads settings" : "計測・広告の設定"}</button>}
            <Link href={localizedPublicHref("/privacy", locale)} onClick={closeAccount}>{locale === "en" ? "Privacy & external data transmission" : "プライバシー・外部送信について"}</Link>
          </div>
          <Link className={styles.supportMenuLink} href={localizedPublicHref("/support", locale)} onClick={closeAccount} aria-current={page === "support" ? "page" : undefined}><Icon name="heart" /><span>{supportLabels(locale).link}</span></Link>
          {languageError && <p role="status">{ui.languageFailed}</p>}
          {storageError && <p role="status">{text.appearanceFailed}</p>}
        </div>
      </details>
    </div>
  </header>;
}
