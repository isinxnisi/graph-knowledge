import { test, expect } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

test("関連主張を順次読み、再試行でも根拠・番号・Graphを維持する", async ({ page }) => {
  const primary = examples.claim;
  const [slowId, fastId] = primary.relatedClaimIds;
  const claimRequests: string[] = [];
  let neighborRequests = 0;
  let slowAttempts = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/entities/**", async route => {
    if (new URL(route.request().url()).pathname.endsWith("/neighbors")) {
      neighborRequests++;
      await route.fulfill({ json: examples.neighbors });
    } else await route.fulfill({ json: examples.entity });
  });
  await page.route("**/api/claims/**", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    claimRequests.push(id);
    if (id === primary.claim.id) return route.fulfill({ json: primary });
    if (id === slowId && ++slowAttempts === 1) {
      await held;
      return route.fulfill({ status: 503, json: { error: { message: "取得失敗" } } });
    }
    // Artificial API responses isolate loading behavior from the database.
    return route.fulfill({ json: { claim: { ...primary.claim, id, sourceCount: 0, citations: [] }, relatedClaimIds: [] } });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
    await page.getByTestId("graph-canvas").evaluate((el, id) => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.edges().filter(edge => edge.data("claimIds").includes(id)).first().emit("tap");
    }, primary.claim.id);
    const detail = page.getByRole("region", { name: "Claim詳細", exact: true });
    const fastCard = page.getByTestId(`claim-card-${fastId}`);
    await expect(fastCard).toBeAttached();
    await expect(detail.getByRole("status")).toContainText("2 / 3件");
    const number = await fastCard.getByRole("heading", { level: 4 }).textContent();
    const primaryCard = page.getByTestId(`claim-card-${primary.claim.id}`);
    const metadata = primaryCard.locator("details").first();
    await metadata.locator("summary").click();
    await expect(metadata).toHaveAttribute("open", "");
    release();
    await expect(detail.getByRole("alert")).toContainText("1件の関連主張を取得できませんでした");
    // Development Strict Mode may send an aborted initial request. Compare only
    // the retry delta, which must never refetch a successfully displayed card.
    const beforeRetry = claimRequests.length;
    await detail.getByRole("button", { name: "他の主張を再試行", exact: true }).click();
    await expect(page.getByTestId(`claim-card-${slowId}`)).toBeAttached();
    await expect(detail.getByRole("alert")).toHaveCount(0);
    await expect(detail.getByRole("status")).toHaveCount(0);
    await expect(metadata).toHaveAttribute("open", "");
    await expect(fastCard.getByRole("heading", { level: 4 })).toHaveText(number!);
    expect(claimRequests.slice(beforeRetry)).toEqual([slowId]);
    expect(neighborRequests).toBe(1);
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  } finally {
    release();
  }
});
