"use client";

import type { ReactNode } from "react";
import { readingHref, type ReadingReference } from "../lib/client/reading-reference";
import { readingLabels } from "../lib/i18n/reading-reference";

export default function ReadingLink({ reference, children }: { reference: ReadingReference; children?: ReactNode }) {
  const href = readingHref(reference);
  return <a href={href} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Native History API preserves the mounted Explorer and its graph viewport.
    window.history.pushState(null, "", href);
  }}>{children ?? readingLabels()[reference.kind === "entity" ? "entityLink" : "claimLink"]}</a>;
}
