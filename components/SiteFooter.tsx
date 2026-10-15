"use client";
import { localizedPublicHref } from "../lib/domain/public-routes";
import { useUiLocale } from "../lib/client/ui-locale";
import { supportLabels } from "../lib/i18n/support";
import styles from "./SiteFooter.module.css";
import type { MouseEvent } from "react";
import PublicPageLanguages from "./PublicPageLanguages";

export default function SiteFooter({ beforeNavigation, languagePath }: { beforeNavigation?: () => boolean; languagePath?: string }) {
  const { locale } = useUiLocale(), text = supportLabels(locale);
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => { if (beforeNavigation && !beforeNavigation()) event.preventDefault(); };
  return <footer className={styles.footer} data-testid="site-footer" lang={locale}>
    <div className={styles.content}><span>Plunode</span><nav aria-label={text.footer}>
      <a href={localizedPublicHref("/support", locale)} onClick={navigate}>{text.link}</a><a href={localizedPublicHref("/privacy", locale)} onClick={navigate}>{text.privacy}</a>
    </nav>{languagePath && <PublicPageLanguages path={languagePath} label={locale === "en" ? "Page language" : "ページの言語"} beforeNavigation={beforeNavigation} />}</div>
  </footer>;
}
