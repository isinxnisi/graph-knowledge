"use client";
import { publicLocalePath } from "../lib/domain/public-routes";
import type { MouseEvent } from "react";
// The SSR links are canonical counterparts. Browsers keep the current Graph query.
export default function PublicPageLanguages({ path, label, beforeNavigation }: { path: string; label: string; beforeNavigation?: () => boolean }) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (beforeNavigation && !beforeNavigation()) { event.preventDefault(); return; }
    if (publicLocalePath(location.pathname, "ja") !== path) return;
    event.preventDefault(); location.assign(event.currentTarget.pathname + location.search + location.hash);
  }
  return <nav aria-label={label}><a href={path} hrefLang="ja" lang="ja" onClick={navigate}>日本語</a><a href={publicLocalePath(path, "en")!} hrefLang="en" lang="en" onClick={navigate}>English</a></nav>;
}
