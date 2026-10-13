import { expect, test, type Locator } from "@playwright/test";

async function definedAnimation(locator: Locator) {
  return locator.evaluate(el => {
    const names = getComputedStyle(el).animationName.split(",").map(value => value.trim());
    const registered = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) registered.add(rule.name);
        else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
    return names.every(name => name !== "none" && registered.has(name));
  });
}

export function checkEditorialDesign() {
  test("デザイン刷新: 三テーマの可読性と条件・概要の往復で探索を保持する", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => {
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-editorial-face").split(",")[0].trim().replaceAll(/["']/g, "");
      return Array.from(document.fonts).some(font => font.family.replaceAll(/["']/g, "") === family && font.status === "loaded");
    })).toBe(true);
    await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
    const view = () => page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { nodes: cy.nodes().map(n => [n.id(), n.position()]), edges: cy.edges().map(e => e.id()), pan: cy.pan(), zoom: cy.zoom() };
    });
    const before = await view();
    const original = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-panel"));
    const settings = page.getByTestId("site-header").locator("details");
    const settingsPanel = settings.locator(":scope > div");
    await settingsPanel.evaluate(el => el.addEventListener("animationstart", event => { if (event.target === el) el.setAttribute("data-motion-observed", "true"); }));
    for (const theme of ["light", "brown", "blue"]) {
      if (!await settings.evaluate(el => (el as HTMLDetailsElement).open)) await settings.locator("summary").click();
      await expect(settingsPanel).toHaveAttribute("data-motion-observed", "true");
      expect(await definedAnimation(settingsPanel)).toBe(true);
      if (theme === "brown") await settings.getByRole("button", { name: "ダークモード", exact: true }).click();
      if (theme !== "light") await settings.getByLabel("ダーク配色").selectOption(theme);
      const ratios = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const luminance = (name: string) => {
          let hex = css.getPropertyValue(`--color-${name}`).trim().slice(1);
          if (hex.length === 3) hex = [...hex].map(character => character + character).join("");
          const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
            .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
        return { text: [ratio("text", "panel"), ratio("muted", "panel"), ratio("on-accent", "accent")], diagram: [ratio("edge", "canvas"), ratio("node-border", "person"), ratio("node-border", "work"), ratio("node-border", "organization")] };
      });
      ratios.text.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
      ratios.diagram.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(3));
      expect(await view()).toEqual(before);
      await page.keyboard.press("Escape");
    }
    await settings.locator("summary").click();
    await settings.getByRole("button", { name: "ダークモード", exact: true }).click();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-panel"))).toBe(original);
    await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    expect(await definedAnimation(modal)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await view()).toEqual(before);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
    expect(await modal.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Entity詳細", exact: true }).getByRole("button", { name: "関係概要を見る", exact: true }).click();
    await expect(modal).toContainText("制作に関わった");
    const statistics = modal.locator("details").first();
    const summaryHeight = await statistics.locator("summary").evaluate(el => el.getBoundingClientRect().height);
    await statistics.locator("summary").click();
    await expect.poll(() => statistics.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(summaryHeight + 20);
    await expect(statistics.locator("p").first()).toContainText("肯定");
    await page.keyboard.press("Escape");
    expect(await view()).toEqual(before);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 844 });
    const navigation = page.getByRole("navigation", { name: "探索画面の切り替え" });
    await navigation.getByRole("button", { name: "検索", exact: true }).click();
    const graphPane = page.locator("#explorer-graph");
    await graphPane.evaluate(el => el.addEventListener("animationstart", event => { if (event.target === el) el.setAttribute("data-motion-observed", "true"); }));
    await navigation.getByRole("button", { name: "Graph", exact: true }).click();
    await expect(graphPane).toHaveAttribute("data-motion-observed", "true");
    expect(await definedAnimation(graphPane)).toBe(true);
    expect(await view()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
