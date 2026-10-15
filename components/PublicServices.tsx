"use client";
import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { advertisingAllowed, privacyKey, readPrivacy, type PrivacyPreferences } from "../lib/client/privacy-preferences";
import { AD_ORIGIN, PUBLIC_EVENTS, PUBLIC_ORIGIN, publicPagePath, type PublicServicesPolicy } from "../lib/domain/publication";
import { publicEventName } from "../lib/client/public-events";
import DialogCloseButton from "./DialogCloseButton";
import styles from "./PublicServices.module.css";

export default function PublicServices({ policy, inline = false, active = true, preferencesOnly = false, beforeNavigation }: { policy: PublicServicesPolicy; inline?: boolean; active?: boolean; preferencesOnly?: boolean; beforeNavigation?: () => boolean }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [choice, setChoice] = useState<PrivacyPreferences | null>(null), [ready, setReady] = useState(false), [storageFailed, setStorageFailed] = useState(false);
  const [draft, setDraft] = useState<PrivacyPreferences>({ analytics: false, ads: false });
  const [device, setDevice] = useState<"mobile" | "desktop" | null>(null), [adReady, setAdReady] = useState(false);
  const [adOrigin, setAdOrigin] = useState(AD_ORIGIN);
  const [adActivated, setAdActivated] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<"mobile" | "desktop" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), ad = useRef<HTMLIFrameElement>(null), analytics = useRef<HTMLIFrameElement>(null), metricReady = useRef(false);
  const measure = policy.analytics && choice?.analytics && !preferencesOnly;
  const defaultOn = policy.adDefault === true;
  const effectiveAds = advertisingAllowed(choice, defaultOn);
  const advertise = ready && adActivated && policy.ads && effectiveAds && !preferencesOnly;
  useEffect(() => {
    const media = matchMedia("(max-width: 800px)");
    const resize = () => {
      const width = container.current?.clientWidth ?? 0;
      const next = media.matches ? width >= 320 ? "mobile" : null : width >= 728 ? "desktop" : null;
      if (deviceRef.current === next) return;
      deviceRef.current = next; setAdReady(false); setDevice(next);
    };
    const initial = setTimeout(() => { try { setChoice(readPrivacy(localStorage.getItem(privacyKey))); } catch { /* No consent is assumed. */ } if (["127.0.0.1", "localhost"].includes(location.hostname)) setAdOrigin(`http://ads.localhost:${location.port}`); setReady(true); resize(); }, 0);
    const sync = (event: StorageEvent) => { if (event.key === privacyKey || event.key === null) { const next = readPrivacy(event.newValue); setChoice(next); if (next?.ads === false) setAdReady(false); } };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (container.current) observer?.observe(container.current);
    window.addEventListener("storage", sync); media.addEventListener?.("change", resize);
    return () => { clearTimeout(initial); observer?.disconnect(); window.removeEventListener("storage", sync); media.removeEventListener?.("change", resize); };
  }, []);
  // Mobile search/details take priority. Once shown, keep the frame mounted across tab changes.
  useEffect(() => { const timer = setTimeout(() => { if (device === "desktop" || active) setAdActivated(true); }, 0); return () => clearTimeout(timer); }, [active, device]);
  useEffect(() => {
    metricReady.current = false;
    if (!measure) return;
    const receive = (event: MessageEvent) => {
      if (event.source === analytics.current?.contentWindow && event.origin === PUBLIC_ORIGIN && event.data?.type === "plunode-analytics-ready") {
        metricReady.current = true;
        analytics.current?.contentWindow?.postMessage({ type: "plunode-metric", event: "page_view", path: publicPagePath(location.pathname) }, PUBLIC_ORIGIN);
      }
    };
    const send = (event: Event) => { const name = (event as CustomEvent).detail; if (metricReady.current && PUBLIC_EVENTS.includes(name)) analytics.current?.contentWindow?.postMessage({ type: "plunode-metric", event: name }, PUBLIC_ORIGIN); };
    window.addEventListener("message", receive); window.addEventListener(publicEventName, send);
    return () => { metricReady.current = false; window.removeEventListener("message", receive); window.removeEventListener(publicEventName, send); };
  }, [measure]);
  useEffect(() => {
    const receive = (event: MessageEvent) => { if (event.source === ad.current?.contentWindow && event.origin === adOrigin && event.data?.type === "plunode-ad-status" && typeof event.data.filled === "boolean" && event.data.height === (device === "mobile" ? 50 : 90)) setAdReady(event.data.filled); };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [device, adOrigin]);
  function save(value: PrivacyPreferences) {
    setChoice(value); if (!value.ads) setAdReady(false);
    try { localStorage.setItem(privacyKey, JSON.stringify(value)); setStorageFailed(false); } catch { setStorageFailed(true); }
    dialog.current?.close();
  }
  return <div ref={container} className={`${styles.services} ${inline ? styles.inline : ""}`} data-testid="public-services" data-ad-default={defaultOn ? "on" : "consent"}>
    {advertise && device && <div className={styles.adSlot} data-filled={adReady} data-device={device}>
      <span className={styles.adLabel}>{en ? "Advertisement" : "広告"}</span>
      {/* AdMax uses document.referrer when the parent is cross-origin. Send only the site origin, never the exploration path, query or hash. */}
      <iframe ref={ad} title={en ? "Advertisement" : "広告"} width={device === "mobile" ? 320 : 728} height={device === "mobile" ? 50 : 90} src={`${adOrigin}/integrations/ad/${device}`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="origin" scrolling="no" />
    </div>}
    {measure && <iframe ref={analytics} title="Analytics" hidden src="/integrations/analytics" referrerPolicy="no-referrer" onLoad={() => { metricReady.current = true; analytics.current?.contentWindow?.postMessage({ type: "plunode-metric", event: "page_view", path: publicPagePath(location.pathname) }, PUBLIC_ORIGIN); }} />}
    <footer className={styles.footer}>{!inline && <span>Plunode β</span>}{!preferencesOnly && <a href="/privacy" onClick={event => { if (beforeNavigation && !beforeNavigation()) event.preventDefault(); }}>{en ? "Privacy" : "プライバシー"}</a>}<button onClick={() => { setDraft({ analytics: choice?.analytics ?? false, ads: effectiveAds, adsConsent: choice?.ads === true && choice.adsConsent !== false }); dialog.current?.showModal(); }}>{en ? "Analytics & ads settings" : "計測・広告の設定"}</button></footer>
    {ready && device && !defaultOn && policy.ads && !preferencesOnly && (!choice || (choice.ads && choice.adsConsent === false)) && <div className={styles.notice}><p>{en ? "Ads support Plunode. With your permission, Ninja AdMax and its partners use cookies and device information for ad delivery, measurement and personalization. Exploration works without ads. Analytics is a separate setting." : "広告でPlunodeの運営を支えています。許可した場合、忍者AdMaxと配信事業者がCookie・端末情報等を広告配信・効果測定・パーソナライズに利用します。広告なしでも探索でき、利用状況の計測は別の設定です。"} <a href="https://corp.ninja.co.jp/privacy/tieup/" target="_blank" rel="noopener noreferrer">{en ? "Advertising partners" : "配信事業者の一覧"}</a></p><div><button onClick={() => save({ analytics: choice?.analytics ?? false, ads: true, adsConsent: true })}>{en ? "Allow ads" : "広告を許可"}</button><button onClick={() => save({ analytics: choice?.analytics ?? false, ads: false, adsConsent: false })}>{en ? "Continue without ads" : "広告なしで続ける"}</button></div></div>}
    {storageFailed && <p role="status">{en ? "Your choice applies in this tab; browser storage is unavailable." : "設定を保存できないため、このタブでのみ適用します。"}</p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="privacy-settings-title"><div className={styles.heading}><h2 id="privacy-settings-title">{en ? "Analytics & ads" : "計測と広告"}</h2><DialogCloseButton label={en ? "Close" : "閉じる"} onClick={() => dialog.current?.close()} /></div>
      <p>{en ? "Exploration and account features work with either option turned off. You can change your choice here at any time." : "どちらを使わなくても探索・会員機能を利用できます。設定はいつでも変更できます。"}</p>
      <label><input type="checkbox" checked={draft.analytics} onChange={event => setDraft(value => ({ ...value, analytics: event.target.checked }))} /><span><strong>{en ? "Usage analytics" : "利用状況の計測"}</strong><small>{en ? "Google Analytics 4 counts public page views and actions. Search text, account information and saved content are excluded." : "Google Analytics 4で公開ページの閲覧・操作を集計します。検索語・会員情報・保存内容は送りません。"}</small></span></label>
      <label><input type="checkbox" checked={draft.ads} onChange={event => setDraft(value => ({ ...value, ads: event.target.checked, adsConsent: event.target.checked }))} /><span><strong>{en ? "Advertising" : "広告"}</strong><small>{en ? "Ninja AdMax and its partners may use cookies and device information for ad delivery, measurement and personalization." : "忍者AdMaxと配信事業者が、Cookieや端末情報などを広告配信・効果測定・パーソナライズに利用する場合があります。"}</small></span></label>
      <p className={styles.regionNote}>{en ? "Ads start automatically in Japan; elsewhere or when the region is unknown, they require permission. Previous choices are respected." : "日本では広告を標準表示し、海外・地域不明の場合は許可後に読み込みます。以前の設定は維持します。"} <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">IP Geolocation by DB-IP</a></p>
      <p><a href="/privacy" target="_blank" rel="noopener noreferrer">{en ? "Privacy and external data transmission ↗" : "プライバシー・外部送信について ↗"}</a></p><button className={styles.save} onClick={() => save(draft)}>{en ? "Save settings" : "設定を保存"}</button>
    </dialog>
  </div>;
}
