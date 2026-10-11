"use client";
import { useEffect, useState } from "react";
import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { siteLabels } from "../lib/i18n/site";
import styles from "./SiteHeader.module.css";

export default function SiteHeader({ dataset, page = "explore" }: { dataset: DatasetMode; page?: "explore" | "member" | "shared" }) {
  const text = siteLabels(), data = datasetLabels(dataset);
  const [dark, setDark] = useState(false);
  const [palette, setPalette] = useState<"brown" | "blue">("brown");
  useEffect(() => {
    // 既に表示中のテーマと揃える。保存・会員設定への接続は別工程。
    const timer = window.setTimeout(() => {
      const theme = document.documentElement.dataset.theme;
      setDark(theme === "dark-brown" || theme === "dark-blue");
      setPalette(theme === "dark-blue" ? "blue" : "brown");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <header className={styles.header} data-testid="site-header">
    <div className={styles.identity}>
      {page === "explore" ? <h1 className={styles.brand}>{text.name}</h1> : <span className={styles.brand}>{text.name}</span>}
      <p className={styles.dataset}>{data.badge}</p>
    </div>
    <p className={styles.description}>{data.description}</p>
    <div className={styles.tools}>
      <nav aria-label={text.navigation} className={styles.navigation}>
        {page !== "explore" && <a href="/" target="_blank" rel="noopener noreferrer" aria-label={text.exploreLink}>{text.explore}<span aria-hidden="true"> ↗</span></a>}
        {page === "member" ? <span aria-current="page">{text.account}</span> : <a href="/member" target="_blank" rel="noopener noreferrer" aria-label={text.accountLink}>{text.account}<span aria-hidden="true"> ↗</span></a>}
      </nav>
      <div className={styles.appearance} role="group" aria-label={text.appearance}>
        <button aria-label={text.dark} aria-pressed={dark} onClick={() => {
          const next = !dark; setDark(next);
          document.documentElement.dataset.theme = next ? `dark-${palette}` : "light";
        }}>{dark ? text.toLight : text.toDark}</button>
        {dark && <label>{text.palette}<select value={palette} onChange={event => {
          const next = event.target.value === "blue" ? "blue" : "brown";
          setPalette(next); document.documentElement.dataset.theme = `dark-${next}`;
        }}><option value="brown">{text.brown}</option><option value="blue">{text.blue}</option></select></label>}
      </div>
    </div>
  </header>;
}
