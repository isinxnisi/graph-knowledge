import { expect, test, type Page } from "@playwright/test";
import type { NeighborsResponse } from "../../lib/domain/api";
import { relationId } from "../../lib/client/graph-presentation";

const view = (page: Page) => page.getByTestId("graph-canvas").evaluate(el => {
  const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
  return { positions: Object.fromEntries(cy.nodes().map(node => [node.id(), node.position()])), pan: cy.pan(), zoom: cy.zoom(), selected: cy.elements(".chosen").map(element => element.id()) };
});

export function checkPhoneReading() {
  test.describe("スマホの閲覧と探索の往復", () => {
    test.use({ isMobile: true, hasTouch: true });
    for (const width of [320, 390]) {
      test(`${width}px: 実資料の閲覧末尾から探索へ戻り、選択と表示範囲を保つ`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 844 });
        let requests = 0;
        page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/neighbors")) requests++; });
        await page.goto("/");
        await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).tap();
        await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
        const response = await page.request.get("/api/entities/2b7c6289-d050-4dc0-93e3-9307681253cc/neighbors");
        expect(response.status()).toBe(200);
        const data = await response.json() as NeighborsResponse;
        const claim = data.claims.find(claim => claim.contribution?.roleId === "PRODUCING")!;
        expect(claim).toBeTruthy();
        await page.getByTestId("graph-canvas").evaluate((el, id) => {
          const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
          cy.getElementById(id).emit("tap");
        }, relationId(claim));
        const detail = page.getByRole("region", { name: "Claim詳細", exact: true });
        const link = detail.locator(`a[href*="read=claim"][href*="id=${claim.id}"]`);
        await expect(link).toBeVisible();
        const before = await view(page);
        await link.tap();
        const reader = page.getByRole("dialog", { name: "リンク先の対象・主張", exact: true });
        await expect(reader).toContainText("プロデュース");
        await expect(reader).toContainText("第1巻");
        await reader.getByText("閲覧URL", { exact: true }).first().tap();
        await reader.getByRole("textbox", { name: "閲覧URL", exact: true }).scrollIntoViewIfNeeded();
        await reader.evaluate(el => { el.scrollTop = el.scrollHeight; });
        const close = reader.getByRole("button", { name: "探索画面へ戻る", exact: true });
        // tapによる自動スクロール前にも、戻る操作が画面内に残っていること。
        await expect.poll(async () => close.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
        })).toBe(true);
        expect(await reader.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (width === 320) await page.screenshot({ path: testInfo.outputPath("reading-return-320.png") });
        await close.tap();
        await expect(reader).toHaveCount(0);
        await expect(link).toBeFocused();
        expect(await view(page)).toEqual(before);
        expect(requests).toBe(1);
      });
    }
    test("320px: 制作RoleのCapsuleを読み、badgeと根拠・一覧の往復を保つ", async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 844 });
      const response = await page.request.get("/api/entities/2b7c6289-d050-4dc0-93e3-9307681253cc/neighbors");
      expect(response.status()).toBe(200);
      const data = await response.json() as NeighborsResponse;
      const role = data.claims.find(claim => claim.contribution?.roleId === "PRODUCING")!;
      const claims = data.claims.filter(claim => claim.subjectId === role.subjectId);
      expect(claims).toHaveLength(2);
      await page.goto("/");
      await page.evaluate(({ role, claims }) => localStorage.setItem("graph-knowledge:capsules:public-kg", JSON.stringify({
        format: "local-capsules", version: 1, capsules: [{ id: crypto.randomUUID(), dataset: "public-kg", revision: 1, title: "PLUTOの制作と資料を読む", note: "受入済みの主張を読み返す。", language: "ja", createdAt: new Date().toISOString(), entityIds: [role.subjectId, role.objectId], claimIds: claims.map(claim => claim.id) }],
      })), { role, claims });
      await page.getByRole("button", { name: "Capsuleを作る・読む", exact: true }).tap();
      const reader = page.getByRole("dialog", { name: "自分のCapsule", exact: true });
      await reader.getByRole("button", { name: "読む", exact: true }).tap();
      await expect(reader.getByText("現在のGraph：対象 2件 / 主張 2件", { exact: true })).toBeVisible();
      const canvas = reader.getByTestId("graph-canvas");
      await expect.poll(() => canvas.evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.edges().length)).toBe(1);
      const badge = reader.locator("button[data-relation-id]");
      await expect(badge).toHaveText("制作");
      expect(await badge.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(30);
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("capsule-role-320.png") });
      // 図のbadgeが固定見出しの下を通っても、見出しを覆わないこと。
      await reader.evaluate(el => {
        const badge = el.querySelector("button[data-relation-id]")!;
        const heading = el.querySelector("h2")!;
        el.scrollTop += badge.getBoundingClientRect().top - heading.getBoundingClientRect().top;
      });
      await expect.poll(() => badge.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return !!top && !el.contains(top);
      })).toBe(true);
      const before = await canvas.evaluate(el => {
        const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
        return { positions: cy.nodes().map(node => [node.id(), node.position()]), pan: cy.pan(), zoom: cy.zoom() };
      });
      await reader.getByRole("button", { name: /長崎尚志 → 制作に関わった → PLUTO.*プロデュース/ }).tap();
      await expect(reader.getByTestId(`claim-card-${role.id}`)).toContainText("第1巻");
      await expect(reader.getByRole("link", { name: "出典のURLを開く", exact: true }).first()).toBeVisible();
      await reader.getByRole("button", { name: "関係図・一覧へ戻る", exact: true }).tap();
      await expect(reader.getByRole("region", { name: "関係図と一覧", exact: true })).toBeFocused();
      expect(await canvas.evaluate(el => {
        const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
        return { positions: cy.nodes().map(node => [node.id(), node.position()]), pan: cy.pan(), zoom: cy.zoom() };
      })).toEqual(before);
      await reader.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const close = reader.getByRole("button", { name: "探索へ戻る", exact: true });
      await expect.poll(() => close.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
      })).toBe(true);
      await close.tap();
      await expect(reader).toHaveCount(0);
      await expect(page.getByTestId("graph-counts")).toHaveText("Entity 0 / Claim 0");
    });
  });
}
