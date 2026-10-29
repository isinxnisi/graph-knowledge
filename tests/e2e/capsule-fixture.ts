import { expect, type Locator, type Page } from "@playwright/test";
import type { LocalCapsule } from "../../lib/client/local-capsules";

export const studio = (page: Page) => page.getByRole("region", { name: "Capsule", exact: true });

export async function startCapsule(page: Page) {
  // The KG uses the real demo DB. Model the production guest identity response
  // separately from an intentionally disabled member service (which is 503).
  await page.route("**/api/member/profile", route => route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED" } } }));
  await page.goto("/");
  await page.getByRole("button", { name: "青葉ハルから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 5 / Claim 7");
  const graph = page.locator("#explorer-graph").getByTestId("graph-canvas");
  const before = await canvasState(graph);
  await page.getByRole("button", { name: "Capsule作成", exact: true }).click();
  await expect(studio(page)).toBeVisible();
  await expect(studio(page).getByRole("button", { name: "保存", exact: true })).toBeVisible();
  return before;
}

export async function canvasState(canvas: Locator) {
  return canvas.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return {
      nodes: cy.nodes().map(n => ({ id: n.id(), label: String(n.data("label")), kind: String(n.data("kind")) })),
      claims: cy.edges().map(edge => edge.data("claimIds") as string[]).flat().sort(),
      positions: Object.fromEntries(cy.nodes().map(n => [n.id(), { ...n.position() }])),
      selected: cy.elements(".chosen").map(n => n.id()).sort(),
      pan: { ...cy.pan() }, zoom: cy.zoom(),
    };
  });
}

export async function storedCapsules(page: Page): Promise<LocalCapsule[]> {
  return page.evaluate(async () => {
    // A read must not create an empty database before the app creates its stores.
    if (!(await indexedDB.databases()).some(db => db.name === "plunode-capsules")) return [];
    return new Promise<LocalCapsule[]>((resolve, reject) => {
      const open = indexedDB.open("plunode-capsules", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction("capsules").objectStore("capsules").getAll();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      };
    });
  });
}

export async function renameCapsule(page: Page, title: string) {
  await studio(page).getByRole("button", { name: "タイトル・説明", exact: true }).click();
  const editor = page.getByRole("dialog").last();
  await editor.getByLabel("タイトル", { exact: true }).fill(title);
  await editor.getByRole("button", { name: "適用", exact: true }).click();
  await expect(studio(page).getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function selectContent(page: Page, title: string) {
  const contents = studio(page).locator("details").filter({ has: page.locator("summary", { hasText: "Capsuleの内容一覧" }) }).last();
  if (!(await contents.evaluate(el => (el as HTMLDetailsElement).open))) await contents.locator("summary").click();
  await contents.getByRole("button", { name: title, exact: true }).click();
}

async function renderedPoint(canvas: Locator, id: string) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas is not visible");
  const point = await canvas.evaluate((el, nodeId) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return cy.getElementById(nodeId).renderedPosition();
  }, id);
  return { x: box.x + point.x, y: box.y + point.y };
}

export async function clickNode(page: Page, canvas: Locator, id: string, modifier?: "Control" | "Meta") {
  const point = await renderedPoint(canvas, id);
  if (modifier) await page.keyboard.down(modifier);
  try { await page.mouse.click(point.x, point.y); }
  finally { if (modifier) await page.keyboard.up(modifier); }
}

export async function dragNode(page: Page, canvas: Locator, id: string, dx = 45, dy = 32) {
  const point = await renderedPoint(canvas, id);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 10 });
  await page.mouse.up();
}

export async function openSavedCapsule(page: Page, title: string) {
  await page.getByRole("banner").getByRole("button", { name: "My Capsules", exact: true }).click();
  const list = page.getByRole("dialog", { name: "My Capsules", exact: true });
  await list.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).getByRole("button", { name: "開く", exact: true }).click();
  await expect(studio(page).getByRole("heading", { name: title, exact: true })).toBeVisible();
}
