"use client";
import { localizedPublicHref } from "../lib/domain/public-routes";
import { useUiLocale } from "../lib/client/ui-locale";
import { SUPPORT_URL, supportLabels } from "../lib/i18n/support";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import Icon from "./Icon";
import styles from "./SupportPage.module.css";

export default function SupportPage() {
  const { locale } = useUiLocale(), text = supportLabels(locale);
  return <div className={styles.screen}><SiteHeader dataset="public-kg" page="support" /><main lang={locale} className={styles.page}>
    <header className={styles.introduction}><p className={styles.eyebrow}>{text.eyebrow}</p><h1>{text.title}</h1><p className={styles.lead}>{text.introduction}</p><p>{text.invitation}</p></header>
    <div className={styles.content}>
      <section aria-labelledby="support-purpose"><h2 id="support-purpose">{text.purpose}</h2><ol className={styles.uses}>{text.uses.map((use, index) => <li key={index}><span aria-hidden="true">0{index + 1}</span><div><h3>{use.title}</h3><p>{use.description}</p></div></li>)}</ol></section>
      <section className={styles.contribution} aria-labelledby="support-contribution"><h2 id="support-contribution">{text.link}</h2><p>{text.optional}</p>
        <a className={styles.action} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-describedby="support-external"><span>{text.action}</span><Icon name="external" /></a>
        <p id="support-external" className={styles.note}>{text.external}</p><p className={styles.note}>{text.payment}</p>
        <a className={styles.privacy} href={localizedPublicHref("/privacy", locale)}>{text.privacy}</a>
      </section>
    </div>
  </main><SiteFooter /></div>;
}
