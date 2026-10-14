import { test, expect, type Page } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

const canvasView = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom() };
});

for (const width of [390, 1440]) for (const mode of ["claim", "relation"] as const) {
  test(`${width}pxの${mode}詳細から両端を確認し、枝を広げず起点切替へ進む`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let neighborRequests = 0;
    const claim = examples.claim.claim;
    const nodes = examples.neighbors.nodes;
    await page.route("**/api/entities/**", async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split("/")[3];
      const entity = nodes.find(node => node.id === id)!;
      if (url.pathname.endsWith("/neighbors")) {
        neighborRequests++;
        return route.fulfill({ json: id === examples.neighbors.centerId ? examples.neighbors : {
          centerId: id, nodes: [entity], claims: [], page: { hasMore: false, nextCursor: null },
        } });
      }
      return route.fulfill({ json: { entity: { ...entity, aliases: ["対象別の別名"], event: null } } });
    });
    await page.route("**/api/claims/**", route => mode === "relation"
      ? route.fulfill({ status: 503, json: { error: { message: "取得失敗" } } })
      : route.fulfill({ json: { claim, relatedClaimIds: [] } }));
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    const before = await canvasView(page);
    const requestsBefore = neighborRequests;
    const paneNavigation = page.getByRole("navigation", { name: "探索画面の切り替え" });
    // Check both directions. The object is still unexpanded, and the subject is the root.
    for (const id of [claim.objectId, claim.subjectId, claim.objectId]) {
      if (width < 800) await paneNavigation.getByRole("button", { name: "Graph", exact: true }).click();
      if (mode === "claim") {
        await page.getByTestId(`relation-${claim.id}`).getByRole("button", { name: "主張と出典を見る" }).click();
      } else {
        await page.getByTestId("graph-canvas").evaluate((el, id) => {
          const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
          cy.edges().filter(edge => edge.data("claimIds").includes(id)).first().emit("tap");
        }, claim.id);
        await expect(page.getByRole("region", { name: "Claim詳細", exact: true }).getByRole("alert")).toBeVisible();
      }
      const entity = nodes.find(node => node.id === id)!;
      const button = page.getByRole("navigation", { name: "この関係に出てくる対象" }).getByRole("button", { name: `${entity.name}の詳細を見る` });
      await button.focus();
      await page.keyboard.press("Enter");
      const detail = page.getByRole("region", { name: "Entity詳細", exact: true });
      await expect(detail.getByRole("heading", { name: entity.name, exact: true })).toBeVisible();
      await expect(detail).toContainText("対象別の別名");
      await expect(page.locator("#explorer-detail")).toBeFocused();
      await expect(detail.getByRole("button", { name: "関係概要を見る", exact: true })).toBeVisible();
      if (id === claim.objectId) await expect(detail.getByRole("button", { name: "近傍を展開", exact: true })).toBeVisible();
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
      expect(await canvasView(page)).toEqual(before);
      expect(neighborRequests).toBe(requestsBefore);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    // Root switching stays explicit, and its existing one-step restoration remains available.
    await page.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
    await expect(page.getByTestId("exploration-root")).toContainText(nodes.find(node => node.id === claim.objectId)!.name);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    expect(neighborRequests).toBe(requestsBefore + 1);
    await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    expect(await canvasView(page)).toEqual(before);
    expect(neighborRequests).toBe(requestsBefore + 1);
  });
}
