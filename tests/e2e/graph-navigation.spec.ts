import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const root = examples.neighbors.nodes[0];
const work = examples.neighbors.nodes[1];

const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  const selected = cy.nodes(".chosen").first();
  return {
    positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])),
    selected: selected.id(), point: selected.renderedPosition(),
    width: cy.width(), height: cy.height(), zoom: cy.zoom(),
  };
});

test("表示中の対象へキーボードで移動し、展開・座標・起点を維持する", async ({ page }) => {
  const neighbors: string[] = [];
  await page.route("**/api/entities/**", async route => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[3];
    if (url.pathname.endsWith("/neighbors")) {
      neighbors.push(id);
      await route.fulfill({ json: { ...examples.neighbors, centerId: id } });
    } else {
      const entity = examples.neighbors.nodes.find(node => node.id === id);
      await route.fulfill({ json: { entity: { ...entity, aliases: [], event: null } } });
    }
  });
  await page.goto("/");
  const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
  const trigger = navigator.getByRole("button", { name: /表示中の対象へ移動/ });
  await expect(trigger).toBeDisabled();
  await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const before = await view(page);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(navigator.getByRole("searchbox")).toBeFocused();
  await page.keyboard.type("dummy");
  await expect(navigator.getByRole("status")).toContainText("表示中の対象に一致しません");
  await navigator.getByRole("searchbox").fill("架空漫画");
  await page.screenshot({ path: "test-results/graph-navigation-filter.png" });
  await page.keyboard.press("Tab");
  await expect(navigator.getByRole("button", { name: /星の航路.*位置と詳細へ移動/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "Entity詳細", exact: true }).getByRole("heading", { name: "星の航路" })).toBeVisible();
  const after = await view(page);
  expect(after.positions).toEqual(before.positions);
  expect(after.selected).toBe(work.id);
  expect(after.point.x).toBeCloseTo(after.width / 2, 0);
  expect(after.point.y).toBeCloseTo(after.height / 2, 0);
  expect(after.zoom).toBeGreaterThanOrEqual(1);
  expect(neighbors).toEqual([root.id]);
  await page.screenshot({ path: "test-results/graph-navigation-focus.png" });
  await expect(page.getByTestId("exploration-root")).toContainText(root.name);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");

  const detail = page.getByRole("region", { name: "Entity詳細", exact: true });
  // パネルを閉じてCanvasの画面内位置が変わった後も、中央のNodeをクリックできる。
  await page.getByTestId("graph-canvas").click({ position: after.point });
  await expect(detail.getByText("このEntityの近傍は取得済みです。")).toBeVisible();
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await trigger.click();
  await navigator.getByRole("button", { name: /星の航路.*位置と詳細へ移動/ }).click();
  await expect(detail.getByRole("button", { name: "展開を再開", exact: true })).toBeVisible();
  expect(neighbors).toEqual([root.id, work.id]);

  await trigger.click();
  await navigator.getByRole("searchbox").fill(root.name);
  await navigator.getByRole("button", { name: /青葉ハル.*位置と詳細へ移動/ }).click();
  await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
  await trigger.click();
  await navigator.getByRole("searchbox").fill("架空漫画");
  await expect(navigator.getByRole("status")).toContainText("表示中の対象に一致しません");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(neighbors).toEqual([root.id, work.id]);
});
