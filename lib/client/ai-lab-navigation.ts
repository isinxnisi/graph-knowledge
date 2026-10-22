import { z } from "zod";
import type { GraphView } from "./graph-view";

const entryKey = "plunode:ai-lab-entry:v1", departureKey = "plunode:ai-lab-departure:v1", viewKey = "plunode:ai-lab-view:v1";
export const labEntryEvent = "plunode:ai-lab-entry";
export function safeLabReturn(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 10000 || /[\\\r\n]/.test(value)) return false;
  return /^(?:\/(?:en(?:\/ai-lab|\/explore\/[a-f0-9-]{36})?|ai-lab|explore\/[a-f0-9-]{36}|member)?)(?:[?#]|$)/.test(value);
}
const position = z.number().finite().min(0).max(10_000_000);
const entrySchema = z.strictObject({ href: z.string().refine(safeLabReturn), scroll: position });
const locationPath = () => location.pathname + location.search + location.hash;
export function labEntry() {
  try { const result = entrySchema.safeParse(JSON.parse(sessionStorage.getItem(entryKey) || "null")); return result.success ? result.data : null; } catch { return null; }
}
export function rememberLabEntry() {
  if (/^\/(en\/)?ai-lab$/.test(location.pathname)) return;
  window.dispatchEvent(new Event(labEntryEvent));
  try { if (safeLabReturn(locationPath())) sessionStorage.setItem(entryKey, JSON.stringify({ href: locationPath(), scroll: scrollY })); } catch { /* Browser history remains available. */ }
}
export function saveLabExplorationView(href: string, revision: string | null, view: Pick<GraphView,"pan">) {
  try { sessionStorage.setItem(viewKey, JSON.stringify({ href, revision, pan: view.pan })); } catch { /* URL replay still preserves nodes and zoom. */ }
}
export function labExplorationPan(href: string, revision: string | null) {
  try {
    const value = z.strictObject({ href: z.string().refine(safeLabReturn), revision: z.string().nullable(), pan: z.strictObject({ x: z.number().finite(), y: z.number().finite() }) }).parse(JSON.parse(sessionStorage.getItem(viewKey) || "null"));
    if (value.href === href && value.revision === revision && labEntry()?.href === href && /^\/(en\/)?ai-lab$/.test(new URL(document.referrer).pathname) && new URL(document.referrer).origin === location.origin) return value.pan;
  } catch { /* Referrer/storage missing: use the normal URL restoration. */ }
  return null;
}
export function rememberLabDeparture(target: string) {
  if (!safeLabReturn(target)) return;
  try {
    sessionStorage.setItem(departureKey, JSON.stringify({ href: locationPath(), target, scroll: scrollY, details: [...document.querySelectorAll<HTMLDetailsElement>("[data-ai-lab] details")].map(d => d.open) }));
  } catch { /* Navigation itself remains available. */ }
}
export function labRecordReturn() {
  try {
    const value = z.strictObject({ href: z.string().refine(safeLabReturn), target: z.string().refine(safeLabReturn), scroll: position, details: z.array(z.boolean()).max(256) }).parse(JSON.parse(sessionStorage.getItem(departureKey) || "null"));
    if (/^\/(en\/)?ai-lab(?:[?#]|$)/.test(value.href) && value.target === locationPath() && new URL(document.referrer).origin === location.origin && /^\/(en\/)?ai-lab$/.test(new URL(document.referrer).pathname)) return value.href;
  } catch { /* No invented origin for direct readers. */ }
  return null;
}
export function restoreLabRecord() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(departureKey) || "null");
    if (!safeLabReturn(saved?.href) || saved.href !== locationPath() || !position.safeParse(saved.scroll).success || !Array.isArray(saved.details)) return;
    document.querySelectorAll<HTMLDetailsElement>("[data-ai-lab] details").forEach((d,i) => { d.open = saved.details[i] === true; });
    requestAnimationFrame(() => scrollTo(0,saved.scroll));
  } catch { /* Native history is still available. */ }
}
