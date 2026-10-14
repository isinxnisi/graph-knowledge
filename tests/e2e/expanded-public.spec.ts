import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Core } from "cytoscape";

const fixture = JSON.parse(readFileSync("datasets/public-kg/releases/20261014-pluto-001/data.json", "utf8")) as {
  entities: { id: string; name: string }[];
  claims: { id: string; subjectId: string; objectId: string }[];
};
const id = (name: string) => fixture.entities.find(e => e.name === name)!.id;
const paths = [
  ["PLUTO", "浦沢直樹", "パイナップルARMY", "工藤かずや", "信長", "池上遼一"],
  ["PLUTO", "手塚眞", "手塚プロダクション", "手塚治虫", "鉄腕アトム"],
  ["PLUTO", "長崎尚志", "MASTERキートン Reマスター", "浦沢直樹", "20世紀少年"],
];

for (const path of paths) test(`実資料の枝を辿り根拠を読む: ${path.join(" → ")}`, async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const canvas = page.getByTestId("graph-canvas");
  for (const name of path.slice(1)) {
    await expect.poll(() => canvas.evaluate((el, target) => {
      const cy = (el as unknown as { _cyreg?: { cy: Core } })._cyreg?.cy;
      return cy?.getElementById(target).length ?? 0;
    }, id(name))).toBe(1);
    await canvas.evaluate((el, target) => {
      (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy.getElementById(target).emit("tap");
    }, id(name));
    await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText(name);
  }
  const [a, b] = path.slice(-2).map(id);
  await expect.poll(() => canvas.evaluate((el, pair) => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    return cy.edges().filter(e => [e.source().id(), e.target().id()].includes(pair[0]) && [e.source().id(), e.target().id()].includes(pair[1])).length;
  }, [a, b])).toBe(1);
  await canvas.evaluate((el, pair) => {
    const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
    cy.edges().filter(e => [e.source().id(), e.target().id()].includes(pair[0]) && [e.source().id(), e.target().id()].includes(pair[1])).first().emit("tap");
  }, [a, b]);
  const detail = page.getByRole("region", { name: "Claim詳細" });
  await expect(detail).toContainText("原表記（ja）");
  await expect(detail.getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
  // Selecting an Entity from Relation detail must preserve the expanded Graph.
  if (path[1] === "手塚眞") {
    await page.getByRole("button", { name: "全体を表示", exact: true }).click();
    await page.screenshot({ path: "test-results/expanded-pluto-path.png" });
  }
  const before = await page.getByTestId("graph-counts").textContent();
  await detail.getByRole("button", { name: /の詳細を見る$/ }).first().click();
  const entity = page.getByRole("region", { name: "Entity詳細" });
  await entity.getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("制作に関わった");
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText(before!);
  await entity.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("exploration-root")).not.toHaveText(/PLUTO$/);
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText(before!);
  await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
});

test("大量追加の検索・概要と三用途の限定が共存する", async ({ request }) => {
  const harvardResponse = await request.get("/api/entities?q=Harvard%20University&kind=organization");
  expect(harvardResponse.status()).toBe(200);
  const harvard = (await harvardResponse.json()).items.find((e: { name: string }) => e.name === "Harvard University");
  expect(harvard).toBeTruthy();
  const overview = await request.get(`/api/entities/${harvard.id}/overview`);
  expect(overview.status()).toBe(200);
  expect((await overview.json()).relations.find((r: { predicate: string }) => r.predicate === "AFFILIATED_WITH").counts.affirmed).toBe(29);
  for (const [center, condition, predicate] of [
    ["PLUTO", "contributionRoles=PRODUCING", "CONTRIBUTED_TO"],
    ["ニールス・ボーア研究所", "organizationPositions=VISITOR", "AFFILIATED_WITH"],
    ["第5回ソルヴェイ物理会議（1927）", "eventRoles=CHAIR", "PARTICIPATED_IN"],
  ]) {
    const response = await request.get(`/api/entities/${id(center)}/neighbors?${condition}`);
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].predicate).toBe(predicate);
  }
  const noLeak = await request.get(`/api/entities/${harvard.id}/neighbors?contributionRoles=PRODUCING`);
  expect(noLeak.status()).toBe(200);
  expect((await noLeak.json()).claims).toHaveLength(20);
});
