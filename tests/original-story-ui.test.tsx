// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClaimCard } from "../components/ClaimDetails";
import RelationFilter from "../components/RelationFilter";
import { UiLocaleProvider } from "../lib/client/ui-locale";
import { contributionLabels } from "../lib/i18n/contribution";
import { entryLabels } from "../lib/i18n/exploration-entry";
import { claimDetailSchema } from "../lib/domain/api";
import pending from "../datasets/manga-collection/original-story-r0002-20261017/candidates.json";
import release from "../datasets/public-kg/releases/20261017-manga-r0002-001/data.json";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); localStorage.clear(); });
it.each(["ja", "en"] as const)("原語・ISBN・Roleの日英詳細と探索条件を表示する %s", locale => {
  const row = pending.records.claims[0], citation = pending.records.citations[0];
  const claim = claimDetailSchema.parse({ ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "visibility")), sourceCount: 1, citations: [{ ...Object.fromEntries(Object.entries(citation).filter(([key]) => !["claimId", "sourceId"].includes(key))), source: release.sources.find(s => s.id === citation.sourceId) }] });
  const label = contributionLabels(locale).roles.ORIGINAL_STORY;
  const detail = render(<UiLocaleProvider initialLocale={locale}><ClaimCard claim={claim} nodes={{}} title="Review" /></UiLocaleProvider>);
  expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  expect(detail.container.textContent).toContain("稲垣理一郎 原作");
  expect(detail.container.textContent).toContain("ISBN 9784098610105");
  expect(detail.container.textContent).toContain(contributionLabels(locale).publicationOnly);
  detail.unmount();
  const onApply = vi.fn();
  render(<UiLocaleProvider initialLocale={locale}><RelationFilter value={["CONTRIBUTED_TO"]} roles={["ORIGINAL_STORY"]} onApply={onApply} /></UiLocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: entryLabels(locale).edit }));
  expect((screen.getByRole("checkbox", { name: label }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: contributionLabels(locale).roles.DRAWING }));
  fireEvent.click(screen.getByRole("button", { name: entryLabels(locale).apply }));
  expect(onApply).toHaveBeenCalledWith(["CONTRIBUTED_TO"], ["DRAWING", "ORIGINAL_STORY"], null, null);
});
