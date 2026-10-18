"use client";
import { explorerLabels } from "../lib/i18n/explorer";
import { useUiLocale } from "../lib/client/ui-locale";

import type { ReactNode } from "react";
import { readingHref, type ReadingReference } from "../lib/client/reading-reference";
import { readingLabels } from "../lib/i18n/reading-reference";

export default function ReadingLink({ reference, children, preserveExploration = false }: { reference: ReadingReference; children?: ReactNode; preserveExploration?: boolean }) {
  const href = readingHref(reference);
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  return <a href={href} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Native History API preserves the mounted Explorer and its graph viewport.
    const target = new URL(window.location.href);
    if (preserveExploration) {
      const params = new URL(href, window.location.origin).searchParams;
      params.forEach((value, key) => target.searchParams.set(key, value));
    }
    window.history.pushState(null, "", preserveExploration ? target.pathname + target.search + target.hash : href);
  }}>{children ?? (locale === "ja" ? readingLabels() : ui)[reference.kind === "entity" ? "entityLink" : "claimLink"]}</a>;
}
