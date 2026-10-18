import { adjacentWorkspace } from "../adjacent-workspace";
import { test, expect } from "@playwright/test";
import { decodeExploration as decodeRawExploration } from "../../lib/client/exploration-url";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
for (const locale of ["ja", "en"]) for (const width of [1241, 390, 320]) test(`${locale} ${width}px 正式入口・はみ出し・一覧との往復・Role付きGraphとBack`, async ({ browser }, info) => {
  const en = locale === "en", root = en ? "/en" : "/";
  const context = await browser.newContext({ viewport: { width, height: 890 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(info.project.use.baseURL! + root); await page.getByTestId("discovery-search-entry").click();
  const dialog = page.getByRole("dialog"), body = page.getByTestId("prototype-body");
  await expect(dialog).toHaveAttribute("data-formal", "true");
  await expect(dialog.getByRole("button", { name: /Try staged layout|段階表示を試す/ })).toHaveCount(0);
  await expect(page.getByTestId("discovery-prototype-entry")).toHaveCount(0);
  await dialog.getByRole("tab", { name: en ? "Knowledge worlds" : "知識世界から", exact: true }).click();
  await dialog.locator('[data-world="manga"]').click();
  await dialog.getByLabel(en ? "Question suggestions" : "問いの候補").getByRole("button", { name: en ? "Creators and their other works" : "作品のつくり手・別作品へ", exact: true }).click();
  await dialog.locator("#prototype-name").fill("PLU");
  const names = page.getByTestId("prototype-results");
  await expect(names.getByRole("button", { name: en ? "Change subject to PLUTO" : "対象をPLUTOに変更", exact: true })).toBeVisible();
  // Inspect the actual scrolling body; clipping by the dialog masked this regression before.
  expect(await body.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await body.evaluate(el => getComputedStyle(el).overflowX)).not.toBe("hidden");
  await body.evaluate(el => { el.scrollLeft = 100; }); expect(await body.evaluate(el => el.scrollLeft)).toBe(0);
  await page.screenshot({ path: info.outputPath("names.png"), animations: "disabled" });
  await names.getByRole("button", { name: en ? "Change subject to PLUTO" : "対象をPLUTOに変更", exact: true }).click();
  await expect(page.getByTestId("prototype-claim").first()).toBeVisible();
  await dialog.locator('[data-role="AUTHORSHIP"]').click();
  await expect(page.getByTestId("prototype-claim")).toHaveCount(1);
  await dialog.getByRole("tab", { name: en ? "Browse & refine" : "一覧・条件から", exact: true }).click();
  await expect(page.getByTestId("discovery-results").locator("ul > li")).toHaveCount(20);
  await dialog.getByRole("group", { name: en ? "Search for" : "検索対象", exact: true }).getByRole("button", { name: en ? "Work" : "作品", exact: true }).click();
  await dialog.locator("#discovery-name").fill("PLUTO");
  await expect(page.getByTestId("discovery-results").locator("ul > li")).toHaveCount(1);
  await dialog.getByRole("tab", { name: en ? "Existing connections" : "今ある接点から", exact: true }).click();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await expect(dialog.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: en ? "Browse & refine" : "一覧・条件から", exact: true }).click();
  await expect(dialog.locator("#discovery-name")).toHaveValue("PLUTO");
  await expect(dialog.getByRole("group", { name: en ? "Search for" : "検索対象", exact: true }).getByRole("button", { name: en ? "Work" : "作品", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("tab", { name: en ? "Existing connections" : "今ある接点から", exact: true }).click();
  const link = page.getByTestId("prototype-graph"), href = new URL((await link.getAttribute("href"))!, page.url());
  expect(decodeExploration(href.searchParams.get("s")!, pluto, "public-kg").relation).toMatchObject({ predicates: ["CONTRIBUTED_TO"], contributionRoles: ["AUTHORSHIP"] });
  // Visibility/accessible-name assertions miss foreground equal to the filled background.
  await expect(link).toContainText(en ? "Open Graph" : "Graphで開く");
  for (const theme of ["light", "dark-brown", "dark-blue"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const state of ["normal", "hover", "focus"]) {
      await page.mouse.move(0, 0);
      if (state === "hover") await link.hover();
      if (state === "focus") await link.focus();
      const contrast = await link.evaluate(el => {
        const style = getComputedStyle(el);
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const foreground = luminance(style.color), background = luminance(style.backgroundColor);
        return { ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05), color: style.color, icons: Array.from(el.querySelectorAll("svg")).map(svg => getComputedStyle(svg).color), decoration: style.textDecorationLine };
      });
      expect(contrast.ratio, `${theme} ${state}: Graph link text contrast`).toBeGreaterThanOrEqual(4.5);
      expect(contrast.icons).toEqual([contrast.color, contrast.color]);
      expect(contrast.decoration).toBe("none");
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.screenshot({ path: info.outputPath("graph-button.png"), animations: "disabled" });
  await link.click(); await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
  await page.goBack(); await expect(dialog).toBeVisible();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await expect(dialog.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("discovery-search-entry")).toBeFocused();
  expect(errors).toEqual([]); await context.close();
});

function decodeExploration(...args: Parameters<typeof decodeRawExploration>) { return adjacentWorkspace(decodeRawExploration(...args)); }
