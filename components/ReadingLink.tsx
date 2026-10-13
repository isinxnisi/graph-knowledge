"use client";
import { explorerLabels } from "../lib/i18n/explorer";
import { useUiLocale } from "../lib/client/ui-locale";

import type { ReactNode } from "react";
import { readingHref, type ReadingReference } from "../lib/client/reading-reference";
import { readingLabels } from "../lib/i18n/reading-reference";

export default function ReadingLink({ reference, children }: { reference: ReadingReference; children?: ReactNode }) {
  const href = readingHref(reference);
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  return <a href={href} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Native History API preserves the mounted Explorer and its graph viewport.
    window.history.pushState(null, "", href);
  }}>{children ?? (locale === "ja" ? readingLabels() : ui)[reference.kind === "entity" ? "entityLink" : "claimLink"]}</a>;
}
