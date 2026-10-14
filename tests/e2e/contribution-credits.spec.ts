import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Core } from "cytoscape";
const fixture = JSON.parse(readFileSync("datasets/public-kg/releases/20261014-credits-001/data.json", "utf8")) as { entities: { id: string; name: string }[] };
const id = (name: string) => fixture.entities.find(e => e.name === name)!.id;

async function start(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.getByLabel("名前・別名").fill(name);
  await page.locator("#explorer-search").getByRole("button", { name: "検索", exact: true }).click();
  await page.locator("#explorer-search").getByRole("button", { name: new RegExp(`^${name} —`) }).click();
  await expect.poll(() => page.getByTestId("graph-canvas").evaluate((el, center) => {
    const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
    return cy?.getElementById(center).length ?? 0;
  }, id(name))).toBe(1);
}
async function label(page: import("@playwright/test").Page, person: string, work: string) {
  return page.getByTestId("graph-canvas").evaluate((el, pair) => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    return cy.edges().filter(e => e.source().id() === pair[0] && e.target().id() === pair[1]).map(e => ({ text: e.data("canvasLabel"), badge: e.data("badge"), claims: e.data("claimIds").length }));
  }, [id(person), id(work)]);
}

test("浦沢の8作品で具体語を先に表示し、限定・原語・Sourceを読める", async ({ page }) => {
  await start(page, "浦沢直樹");
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 10 / Claim 17");
  for (const [work, text] of [["PLUTO", "著者"], ["MONSTER", "著者"], ["20世紀少年", "著者"], ["MASTERキートン", "著者"], ["BILLY BAT", "著者"], ["MASTERキートン Reマスター", "著者"], ["パイナップルARMY", "作画"], ["YAWARA!", "作"]]) {
    await expect.poll(() => label(page, "浦沢直樹", work)).toEqual([{ text, badge: "制作", claims: 2 }]);
  }
  await page.getByRole("button", { name: "全体を表示", exact: true }).click();
  await page.screenshot({ path: "test-results/credit-urasawa.png" });
  await page.getByTestId("graph-canvas").evaluate((el, pair) => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    cy.edges().filter(e => e.source().id() === pair[0] && e.target().id() === pair[1]).first().emit("tap");
  }, [id("浦沢直樹"), id("パイナップルARMY")]);
  const detail = page.getByRole("region", { name: "Claim詳細" });
  await expect(detail).toContainText("画: 浦沢直樹");
  await expect(detail).toContainText("9784091921116");
  await expect(detail).toContainText("役割指定なし");
  await expect(detail).toContainText("別の根拠が増えたことにはなりません");
  await expect(detail.getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
});

test("制作の役割条件に著者・作・作画を接続し、無指定と区別する", async ({ page }) => {
  await start(page, "浦沢直樹");
  await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  await page.getByRole("button", { name: "制作の役割を調整", exact: true }).click();
  await page.getByRole("radio", { name: "役割を指定する", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "作画", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "作", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "著者", exact: true }).check();
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 8 / Claim 7");
  await expect.poll(() => label(page, "浦沢直樹", "パイナップルARMY")).toEqual([]);
  await expect.poll(() => label(page, "浦沢直樹", "PLUTO")).toEqual([{ text: "著者", badge: "制作", claims: 1 }]);
});

test("長崎の著者表記と本人の漫画制作回想を、脚本や組織立場へ変換しない", async ({ page }) => {
  await start(page, "長崎尚志");
  await expect.poll(() => label(page, "長崎尚志", "MASTERキートン Reマスター")).toEqual([{ text: "著者", badge: "制作", claims: 2 }]);
  await expect.poll(() => label(page, "長崎尚志", "MASTERキートン")).toEqual([{ text: "脚本", badge: "制作", claims: 2 }]);
  await start(page, "手塚治虫");
  await expect.poll(() => label(page, "手塚治虫", "鉄腕アトム")).toEqual([{ text: "作画", badge: "制作", claims: 2 }]);
  await expect.poll(() => label(page, "手塚治虫", "手塚プロダクション")).toEqual([{ text: "関わりがあった", badge: "", claims: 1 }]);
});
