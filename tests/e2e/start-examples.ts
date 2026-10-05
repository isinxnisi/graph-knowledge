import { expect, test } from "@playwright/test";
import type { DatasetMode } from "../../lib/domain/dataset";
import { START_EXAMPLES } from "../../lib/client/start-examples";
import { editConditions, editRoles } from "./conditions";

export function checkStartExamples(dataset: DatasetMode) {
  test("固定開始例から文字入力なしで探索し、条件を原子的に解除する", async ({ page }) => {
    await page.goto("/");
    const region = page.getByRole("region", { name: "探索してみる" });
    const entries = START_EXAMPLES[dataset];
    await expect(region.getByRole("button")).toHaveCount(entries.length);
    await expect(page.getByLabel("名前・別名")).toHaveValue("");
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 0 / Claim 0");
    for (const [index, entry] of entries.entries()) {
      const request = page.waitForRequest((request) => request.url().includes(`/entities/${entry.id}/neighbors`));
      await region.getByRole("button").nth(index).click();
      const url = new URL((await request).url());
      expect(url.searchParams.has("predicates")).toBe(false); expect(url.searchParams.has("contributionRoles")).toBe(false);
      await expect(page.getByTestId("exploration-root")).toContainText(entry.name);
      await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText(entry.description ?? entry.name);
      await expect(page.getByTestId("graph-counts")).not.toHaveText("Entity 1 / Claim 0");
    }
    await editRoles(page); await page.getByRole("checkbox", { name: "監修", exact: true }).check(); await page.getByRole("button", { name: "適用", exact: true }).click();
    await editConditions(page); await page.getByRole("button", { name: "選択を解除", exact: true }).click(); await page.getByRole("checkbox", { name: "制作に関わった", exact: true }).check(); await page.getByRole("button", { name: "適用", exact: true }).click();
    await expect(page.getByTestId("selection-status").locator("..")).not.toContainText("Graphを取得中", { timeout: 15000 });
    const target = entries[0];
    const requests: string[] = []; const collect = (request: import("@playwright/test").Request) => { if (request.url().includes("/neighbors")) requests.push(request.url()); };
    page.on("request", collect);
    await region.getByRole("button", { name: `${target.name}から探索を開始`, exact: true }).click();
    await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
    await expect(page.getByTestId("graph-counts")).not.toHaveText("Entity 1 / Claim 0");
    page.off("request", collect);
    expect(requests).toHaveLength(1); expect(new URL(requests[0]).pathname).toContain(target.id); expect(new URL(requests[0]).search).toBe("");
    await expect(page.getByLabel("名前・別名")).toHaveValue("");
    await page.screenshot({ path: `test-results/${dataset}-start-examples.png` });
  });
}
