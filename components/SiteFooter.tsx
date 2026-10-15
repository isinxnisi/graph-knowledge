"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { supportLabels } from "../lib/i18n/support";
import styles from "./SiteFooter.module.css";
import type { MouseEvent } from "react";

export default function SiteFooter({ beforeNavigation }: { beforeNavigation?: () => boolean }) {
  const { locale } = useUiLocale(), text = supportLabels(locale);
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => { if (beforeNavigation && !beforeNavigation()) event.preventDefault(); };
  return <footer className={styles.footer} data-testid="site-footer" lang={locale}>
    <span>Plunode</span><nav aria-label={text.footer}>
      <a href="/support" onClick={navigate}>{text.link}</a><a href="/privacy" onClick={navigate}>{text.privacy}</a>
    </nav>
  </footer>;
}
