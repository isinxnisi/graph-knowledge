import type { ReactNode } from "react";
import type { WorldId } from "../lib/domain/discovery-prototype";

// Small navigation marks; these describe editorial worlds, not KG classifications.
const marks: Record<WorldId, ReactNode> = {
  manga: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 10h16M11 3v7M14 10v11"/></>,
  film: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 10h4m-4 4h4m10-4h4m-4 4h4"/></>,
  games: <><path d="M7 8h10a3 3 0 0 1 3 2l2 7a2 2 0 0 1-3 2l-3-3H8l-3 3a2 2 0 0 1-3-2l2-7a3 3 0 0 1 3-2Z"/><path d="M8 10v5m-2-2h4m6-2h.1m2 3h.1"/></>,
  music: <><path d="M9 17V6l11-3v11M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/></>,
  science: <><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
  technology: <><path d="M9 17a7 7 0 1 1 6 0M9 17h6v3H9Zm2 3v2m2-2v2M9 10l3 3 3-3m-3 3v4"/></>,
  history: <><path d="M6 3h12M6 21h12M7 3v4l10 10v4M17 3v4L7 17v4M7 7h10M7 17h10"/></>,
  arts: <><path d="M4 20c5 0 6-3 6-6L20 4c-5-1-9 2-11 6l-1 5M4 20l8-8M5 20H3v-2"/></>,
  industry: <><path d="M3 21h18M4 21V9l5 3V7l6 4V3h5v18M7 16h1m3 0h1m4 0h1"/></>,
  sports: <><circle cx="12" cy="12" r="9"/><path d="m12 8 4 3-2 5h-4l-2-5ZM12 8V3m4 8 5-2m-7 7 3 4m-7-4-3 4m1-9L3 9"/></>,
  geography: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></>,
};
export default function DiscoveryWorldIcon({ world }: { world: WorldId }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{marks[world]}</svg>;
}
