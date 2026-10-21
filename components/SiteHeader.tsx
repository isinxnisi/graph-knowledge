"use client";
import { localizedPublicHref } from "../lib/domain/public-routes";
import {useCommunitiesEnabled} from "./CommunityAvailability";
import Icon from "./Icon";
import { useMemberIdentity } from "../lib/client/use-member-identity";
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

export default function SiteHeader({ dataset, page = "explore", user, onBeforeAccountNavigation, onPrivacySettings, onLogout, accountBusy = false }: { onBeforeAccountNavigation?: () => boolean; onPrivacySettings?: () => void; onLogout?: () => void; accountBusy?: boolean; user?: MemberUser | null; dataset: DatasetMode; page?: "explore" | "member" | "shared" | "support" }) {
  const communitiesEnabled=useCommunitiesEnabled();
  const { locale, setLocale, storageError: languageError } = useUiLocale();
  const ui = explorerLabels(locale), text = siteLabels(locale), data = datasetLabels(dataset, locale);
  const identity = useMemberIdentity(page !== "member");
  const currentUser = page === "member" ? user ?? null : identity;
  const displayName = currentUser?.name.trim() || text.account;
  const mark = currentUser ? <span className={styles.memberMark} aria-hidden="true">{Array.from(displayName)[0]}</span> : <Icon name="person" />;
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [storageError, setStorageError] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [returnHref, setReturnHref] = useState("/");
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
    const outside = (event: PointerEvent) => { for (const ref of [menu, accountMenu]) if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") for (const ref of [menu, accountMenu]) if (ref.current?.open) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } };
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
    if (accountMenu.current) accountMenu.current.open = false;
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
      <a className={styles.brandLink} href={localizedPublicHref("/", locale)} aria-label={locale === "en" ? "Plunode Home" : "Plunode ホーム"} onClick={closeAccount}>
      <span className={styles.brandMark}><Icon name="graph" /></span>
      {page === "explore" ? <h1 className={styles.brand}>{text.name}</h1> : <span className={styles.brand}>{text.name}</span>}
      </a>
      <p className={styles.dataset}>{data.badge}</p>
    </div>
    <p className={styles.description}>{data.description}</p>
    <div className={styles.tools}>{communitiesEnabled&&<a href="/communities" onClick={closeAccount}>{locale==="en"?"Communities":"コミュニティ"}</a>}
      <a className={styles.supportLink} href={localizedPublicHref("/support", locale)} onClick={closeAccount} aria-current={page === "support" ? "page" : undefined}><Icon name="heart" /><span>{supportLabels(locale).link}</span></a>
      <nav aria-label={text.navigation} className={styles.navigation}>
        {page !== "explore" && <a className={styles.exploreReturn} href={returnHref} aria-label={text.exploreLink} title={text.exploreLink}><Icon name="back" /><span>{text.explore}</span></a>}
        {currentUser ? <details className={`${styles.settings} ${styles.accountMenu}`} data-floating-menu ref={accountMenu} onToggle={event => { if (event.currentTarget.open && menu.current) menu.current.open = false; }}>
          <summary aria-label={text.memberLink(displayName)} title={text.signedInAs(displayName)} data-signed-in="true">{mark}<span className={styles.accountLabel}>{displayName}</span><Icon name="chevron" /></summary>
          <div className={styles.settingsPanel}>
            <p className={styles.accountIdentity}><strong>{displayName}</strong><span>{text.signedIn}</span></p>
            <nav aria-label={text.accountNavigation} className={styles.settingsLinks}>
              <a href={page === "member" ? "#my-capsules" : "/member#my-capsules"} onClick={closeAccount}><Icon name="capsule" />{text.library}</a>
              <a href={page === "member" ? "#account-settings" : "/member#account-settings"} onClick={closeAccount}><Icon name="person" />{text.accountSettings}</a>
              <a href={page === "member" ? "#my-posts" : "/member#my-posts"} onClick={closeAccount}><Icon name="book" />{text.posts}</a>
            </nav>
            <button className={styles.logout} disabled={accountBusy || signingOut} onClick={() => void signOut()}>{text.logout}</button>
            {logoutError && <p role="alert">{text.logoutFailed}</p>}
          </div>
        </details> : <a href={page === "member" ? "#member-login" : "/member"} onClick={closeAccount} aria-label={text.accountLink} data-signed-in="false"><Icon name="person" /><span>{text.accountLink}</span></a>}
      </nav>
      <details data-floating-menu className={styles.settings} ref={menu} onToggle={event => { if (event.currentTarget.open && accountMenu.current) accountMenu.current.open = false; }}>
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
            <a href={localizedPublicHref("/privacy", locale)} onClick={closeAccount}>{locale === "en" ? "Privacy & external data transmission" : "プライバシー・外部送信について"}</a>
          </div>
          <a className={styles.supportMenuLink} href={localizedPublicHref("/support", locale)} onClick={closeAccount} aria-current={page === "support" ? "page" : undefined}><Icon name="heart" /><span>{supportLabels(locale).link}</span></a>
          {languageError && <p role="status">{ui.languageFailed}</p>}
          {storageError && <p role="status">{text.appearanceFailed}</p>}
        </div>
      </details>
    </div>
  </header>;
}
