"use client";
import Icon from "./Icon";
import { useMemberIdentity } from "../lib/client/use-member-identity";
import type { MemberUser } from "../lib/client/member-api";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels } from "../lib/i18n/explorer";
import { useEffect, useRef, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { siteLabels } from "../lib/i18n/site";
import styles from "./SiteHeader.module.css";
import { appearanceKey, defaultAppearance, readAppearance, type Appearance } from "../lib/client/appearance";

export default function SiteHeader({ dataset, page = "explore", user }: { user?: MemberUser | null; dataset: DatasetMode; page?: "explore" | "member" | "shared" }) {
  const { locale, setLocale, storageError: languageError } = useUiLocale();
  const ui = explorerLabels(locale), text = siteLabels(locale), data = datasetLabels(dataset, locale);
  const identity = useMemberIdentity(page !== "member");
  const currentUser = page === "member" ? user ?? null : identity;
  const displayName = currentUser?.name.trim() || text.account;
  const mark = currentUser ? <span className={styles.memberMark} aria-hidden="true">{Array.from(displayName)[0]}</span> : <Icon name="person" />;
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [storageError, setStorageError] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const dark = appearance.theme !== "light", palette = appearance.palette;
  useEffect(() => {
    const apply = (value: Appearance) => { document.documentElement.dataset.theme = value.theme; setAppearance(value); };
    const timer = window.setTimeout(() => {
      try { apply(readAppearance(localStorage.getItem(appearanceKey))); }
      catch { setStorageError(true); }
    }, 0);
    const sync = (event: StorageEvent) => { if (event.key === appearanceKey || event.key === null) apply(readAppearance(event.newValue)); };
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    window.addEventListener("storage", sync); document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  function change(value: Appearance) {
    setAppearance(value); document.documentElement.dataset.theme = value.theme;
    try { localStorage.setItem(appearanceKey, JSON.stringify(value)); setStorageError(false); }
    catch { setStorageError(true); }
  }
  return <header className={styles.header} data-testid="site-header">
    <div className={styles.identity}>
      <span className={styles.brandMark}><Icon name="graph" /></span>
      {page === "explore" ? <h1 className={styles.brand}>{text.name}</h1> : <span className={styles.brand}>{text.name}</span>}
      <p className={styles.dataset}>{data.badge}</p>
    </div>
    <p className={styles.description}>{data.description}</p>
    <div className={styles.tools}>
      <nav aria-label={text.navigation} className={styles.navigation}>
        {page !== "explore" && <a href="/" target="_blank" rel="noopener noreferrer" aria-label={text.exploreLink}><Icon name="graph" />{text.explore}<span aria-hidden="true"> ↗</span></a>}
        {page === "member" ? <span aria-current="page" title={currentUser ? text.signedInAs(displayName) : text.account}>{mark}<span className={styles.accountLabel}>{displayName}</span></span> : <a href="/member" target="_blank" rel="noopener noreferrer" aria-label={currentUser ? text.memberLink(displayName) : text.accountLink} title={currentUser ? text.signedInAs(displayName) : text.account} data-signed-in={!!currentUser}>{mark}<span className={styles.accountLabel}>{displayName}</span><span className={styles.externalMark} aria-hidden="true"> ↗</span></a>}
      </nav>
      <details data-floating-menu className={styles.settings} ref={menu}>
        <summary aria-label={text.settings} title={text.settings}><Icon name="settings" /><span className={styles.toolLabel}>{text.settings}</span></summary>
        <div className={styles.settingsPanel}>
          {currentUser && <p className={styles.accountIdentity}><strong>{displayName}</strong><span>{text.signedIn}</span></p>}
          <nav aria-label={text.accountSettings} className={styles.settingsLinks}>
            <a href={page === "member" ? "#my-capsules" : "/member#my-capsules"} target={page === "member" ? undefined : "_blank"} rel="noopener noreferrer" onClick={() => { if (menu.current) menu.current.open = false; }}>{text.library}</a>
            <a href={page === "member" ? "#account-settings" : "/member#account-settings"} target={page === "member" ? undefined : "_blank"} rel="noopener noreferrer" onClick={() => { if (menu.current) menu.current.open = false; }}>{text.accountSettings}</a>
          </nav>
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
          <label className={styles.language}>{ui.language}<select value={locale} onChange={event => setLocale(event.target.value === "en" ? "en" : "ja")}><option value="ja">日本語</option><option value="en">English</option></select></label>
          <p>{ui.languageHelp}</p>
          <p className={styles.dataHelp}>{text.datasetAbout}：{data.badge}<br />{data.description}</p>
          {languageError && <p role="status">{ui.languageFailed}</p>}
          {storageError && <p role="status">{text.appearanceFailed}</p>}
        </div>
      </details>
    </div>
  </header>;
}
