"use client";
import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { localizedPublicHref } from "../lib/domain/public-routes";
import { labEntry, labRecordReturn, rememberLabEntry } from "../lib/client/ai-lab-navigation";

const Availability = createContext(false);
export function AiLabAvailability({ enabled, children }: { enabled: boolean; children: ReactNode }) { return <Availability.Provider value={enabled}>{children}</Availability.Provider>; }
export function AiLabEntry({ onClick }: { onClick: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const enabled = useContext(Availability), { locale } = useUiLocale(), [returning,setReturning] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setReturning(!!labRecordReturn())); return () => cancelAnimationFrame(frame); },[]);
  return enabled && !returning ? <a data-testid="lab-entry" href={localizedPublicHref("/ai-lab",locale)} onClick={event => { onClick(event); if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) rememberLabEntry(); }}>{locale === "en" ? "AI Lab" : "AI育成ラボ"}</a> : null;
}
export function AiLabEntryReturn() {
  const { locale } = useUiLocale(), [href,setHref] = useState<string | null>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => setHref(labEntry()?.href ?? null)); return () => cancelAnimationFrame(frame); },[]);
  return href ? <a data-testid="entry-return" href={href}>{locale === "en" ? "← Return to your exploration / account" : "← 元の探索・アカウントへ戻る"}</a> : null;
}
export function AiLabRecordReturn() {
  const enabled = useContext(Availability), { locale } = useUiLocale(), [href,setHref] = useState<string | null>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => {
    setHref(labRecordReturn());
    const entry = labEntry();
    try { if (entry?.href === location.pathname+location.search+location.hash && new URL(document.referrer).origin === location.origin && /^\/(en\/)?ai-lab$/.test(new URL(document.referrer).pathname)) scrollTo(0,entry.scroll); } catch { /* Direct navigation has no lab origin. */ }
  }); return () => cancelAnimationFrame(frame); },[]);
  return enabled && href ? <a data-testid="lab-record-return" href={href}>{locale === "en" ? "← Lab record" : "← ラボの記録へ"}</a> : null;
}
