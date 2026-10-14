"use client";
import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { privacyKey, readPrivacy, type PrivacyPreferences } from "../lib/client/privacy-preferences";
import { AD_ORIGIN, PUBLIC_EVENTS, PUBLIC_ORIGIN, publicPagePath, type PublicServicesPolicy } from "../lib/domain/publication";
import { publicEventName } from "../lib/client/public-events";
import DialogCloseButton from "./DialogCloseButton";
import styles from "./PublicServices.module.css";

export default function PublicServices({ policy, preferencesOnly = false, beforeNavigation }: { policy: PublicServicesPolicy; preferencesOnly?: boolean; beforeNavigation?: () => boolean }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [choice, setChoice] = useState<PrivacyPreferences | null>(null), [ready, setReady] = useState(false), [storageFailed, setStorageFailed] = useState(false);
  const [draft, setDraft] = useState<PrivacyPreferences>({ analytics: false, ads: false });
  const [device, setDevice] = useState<"mobile" | "desktop" | null>(null), [adReady, setAdReady] = useState(false);
  const [adOrigin, setAdOrigin] = useState(AD_ORIGIN);
  const deviceRef = useRef<"mobile" | "desktop" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), ad = useRef<HTMLIFrameElement>(null), analytics = useRef<HTMLIFrameElement>(null), metricReady = useRef(false);
  const measure = policy.analytics && choice?.analytics && !preferencesOnly;
  const advertise = policy.ads && choice?.ads && !preferencesOnly;
  useEffect(() => {
    const media = matchMedia("(max-width: 800px)");
    const resize = () => { const next = media.matches ? "mobile" : "desktop"; if (deviceRef.current === next) return; deviceRef.current = next; setAdReady(false); setDevice(next); };
    const initial = setTimeout(() => { try { setChoice(readPrivacy(localStorage.getItem(privacyKey))); } catch { /* No consent is assumed. */ } if (["127.0.0.1", "localhost"].includes(location.hostname)) setAdOrigin(`http://ads.localhost:${location.port}`); setReady(true); resize(); }, 0);
    const sync = (event: StorageEvent) => { if (event.key === privacyKey || event.key === null) setChoice(readPrivacy(event.newValue)); };
    window.addEventListener("storage", sync); media.addEventListener?.("change", resize);
    return () => { clearTimeout(initial); window.removeEventListener("storage", sync); media.removeEventListener?.("change", resize); };
  }, []);
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
  return <div className={styles.services} data-testid="public-services">
    {advertise && device && <div className={styles.adSlot} data-filled={adReady} data-device={device}>
      <span className={styles.adLabel}>{en ? "Advertisement" : "広告"}</span>
      <iframe ref={ad} title={en ? "Advertisement" : "広告"} width={device === "mobile" ? 320 : 728} height={device === "mobile" ? 50 : 90} src={`${adOrigin}/integrations/ad/${device}`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" scrolling="no" />
    </div>}
    {measure && <iframe ref={analytics} title="Analytics" hidden src="/integrations/analytics" referrerPolicy="no-referrer" onLoad={() => { metricReady.current = true; analytics.current?.contentWindow?.postMessage({ type: "plunode-metric", event: "page_view", path: publicPagePath(location.pathname) }, PUBLIC_ORIGIN); }} />}
    <footer className={styles.footer}><span>Plunode β</span>{!preferencesOnly && <a href="/privacy" onClick={event => { if (beforeNavigation && !beforeNavigation()) event.preventDefault(); }}>{en ? "Privacy" : "プライバシー"}</a>}<button onClick={() => { setDraft(choice ?? { analytics: false, ads: false }); dialog.current?.showModal(); }}>{en ? "Analytics & ads settings" : "計測・広告の設定"}</button></footer>
    {ready && !choice && <div className={styles.notice}><p>{en ? "Optional analytics helps us improve Plunode. Ads support the service. Neither is loaded until you allow it." : "利用状況の計測と広告をサービスの改善・運営に使います。許可するまで読み込みません。"}</p><div><button onClick={() => save({ analytics: true, ads: true })}>{en ? "Allow both" : "両方を許可"}</button><button onClick={() => save({ analytics: false, ads: false })}>{en ? "Continue without them" : "使用せず続ける"}</button></div></div>}
    {storageFailed && <p role="status">{en ? "Your choice applies in this tab; browser storage is unavailable." : "設定を保存できないため、このタブでのみ適用します。"}</p>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="privacy-settings-title"><div className={styles.heading}><h2 id="privacy-settings-title">{en ? "Analytics & ads" : "計測と広告"}</h2><DialogCloseButton label={en ? "Close" : "閉じる"} onClick={() => dialog.current?.close()} /></div>
      <p>{en ? "Exploration and account features work with either option turned off. You can change your choice here at any time." : "どちらを使わなくても探索・会員機能を利用できます。設定はいつでも変更できます。"}</p>
      <label><input type="checkbox" checked={draft.analytics} onChange={event => setDraft(value => ({ ...value, analytics: event.target.checked }))} /><span><strong>{en ? "Usage analytics" : "利用状況の計測"}</strong><small>{en ? "Google Analytics 4 counts public page views and actions. Search text, account information and saved content are excluded." : "Google Analytics 4で公開ページの閲覧・操作を集計します。検索語・会員情報・保存内容は送りません。"}</small></span></label>
      <label><input type="checkbox" checked={draft.ads} onChange={event => setDraft(value => ({ ...value, ads: event.target.checked }))} /><span><strong>{en ? "Advertising" : "広告"}</strong><small>{en ? "Ninja AdMax and its partners may use cookies and device information to deliver ads." : "忍者AdMaxと配信事業者が、Cookieや端末情報などを広告配信に利用する場合があります。"}</small></span></label>
      <p><a href="/privacy" target="_blank" rel="noopener noreferrer">{en ? "Privacy and external data transmission ↗" : "プライバシー・外部送信について ↗"}</a></p><button className={styles.save} onClick={() => save(draft)}>{en ? "Save settings" : "設定を保存"}</button>
    </dialog>
  </div>;
}
