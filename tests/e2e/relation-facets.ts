import { test, expect } from "@playwright/test";
import type { DatasetMode } from "../../lib/domain/dataset";

export function checkRelationFacets(dataset: DatasetMode, root: string, facets: string[], predicates: string[], qualifier: { toggle: string; mode: string; label: string; parameter: string; value: string } | null, expected: string) {
  test("Phase20: 関係の種類からdraft・精密条件・適用・開閉・広く見る・復帰", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: `${root}から探索を開始`, exact: true }).click();
    await expect(page.getByTestId("selection-status").locator("..")).not.toContainText("Graphを取得中", { timeout: 15000 });
    await expect(page.getByTestId("graph-counts")).not.toHaveText("Entity 1 / Claim 0");
    const original = await page.getByTestId("graph-counts").innerText();
    const requests: string[] = [];
    page.on("request", request => { if (request.url().includes("/neighbors")) requests.push(request.url()); });
    const edit = async () => {
      await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
      await page.getByRole("radio", { name: "関係の種類から選ぶ", exact: true }).check();
      for (const name of facets) await page.getByRole("checkbox", { name, exact: true }).check();
    };
    await edit();
    expect(requests).toHaveLength(0);
    await expect(page.getByTestId("graph-counts")).toHaveText(original);
    await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
    await page.getByRole("button", { name: "この3種類をすべて選択", exact: true }).click();
    await expect(page.getByTestId("draft-conditions")).toContainText("特定開催回への参加");
    await expect(page.getByTestId("draft-conditions")).not.toContainText("すべての関係");
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    expect(requests).toHaveLength(0);
    await edit();
    if (qualifier) {
      await page.getByRole("button", { name: qualifier.toggle, exact: true }).click();
      await page.getByRole("radio", { name: qualifier.mode, exact: true }).check();
      await page.getByRole("checkbox", { name: qualifier.label, exact: true }).check();
    }
    await expect(page.getByRole("button", { name: "適用", exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/phase20/${dataset}-editor.png` });
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "適用", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText(expected);
    expect(requests).toHaveLength(1);
    const query = new URL(requests[0]).searchParams;
    expect(query.get("predicates")?.split(",")).toEqual([...predicates].sort());
    expect(query.has("after")).toBe(false); expect(query.has("facets")).toBe(false);
    for (const parameter of ["contributionRoles", "organizationPositions", "eventRoles"]) {
      expect(query.get(parameter)).toBe(parameter === qualifier?.parameter ? qualifier.value : null);
    }
    for (const facet of facets) await expect(page.getByTestId("active-predicates")).toContainText(facet);
    const detail = page.getByRole("region", { name: "Entity詳細" });
    await detail.getByRole("button", { name: "展開を閉じる", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText("Entity 1 / Claim 0");
    await detail.getByRole("button", { name: "展開を再開", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText(expected);
    expect(requests).toHaveLength(1);
    const view = () => page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      return { nodes: cy.nodes().map(n => ({ id: n.id(), ...n.position() })).sort((a,b) => a.id.localeCompare(b.id)), pan: cy.pan(), zoom: cy.zoom(), selection: cy.elements(".chosen").map(e => e.id()) };
    });
    const savedView = await view();
    await page.screenshot({ path: `test-results/phase20/${dataset}-applied.png` });
    await detail.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
    await expect(page.getByTestId("active-predicates")).toContainText("追加条件なし");
    await expect(page.getByTestId("graph-counts")).toHaveText(original);
    await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
    await expect(page.getByTestId("graph-counts")).toHaveText(expected);
    await expect.poll(view).toEqual(savedView);
    expect(requests).toHaveLength(2);
    for (const facet of facets) await expect(page.getByTestId("active-predicates")).toContainText(facet);
  });
}
