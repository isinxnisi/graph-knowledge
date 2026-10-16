import { expect, test } from "@playwright/test";
import { entryLabels } from "../../lib/i18n/exploration-entry";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
test("対応Webで原作条件を選べ、旧KGと未公開4 Claimを保持する", async ({ page }) => {
  const dataset = await page.request.get("/api/dataset");
  expect(dataset.status()).toBe(200);
  const before = await dataset.json(); expect(before.dataset).toBe("public-kg");
  const filtered = await page.request.get(`/api/entities/${pluto}/neighbors?predicates=CONTRIBUTED_TO&contributionRoles=ORIGINAL_STORY&limit=1`);
  expect(filtered.status()).toBe(200); expect((await filtered.json()).claims).toEqual([]);
  for (const id of ["cf18d898-41e5-486f-8dcf-8a666bef83fe", "fe6d7c19-646b-474a-ad0a-3b20bc816866", "84cb19dd-9e8e-496f-abf6-674885abf185", "07da4e98-1047-46a4-b48a-30f3549c89f9"]) {
    const accepted = await page.request.get(`/api/claims/${id}`);
    expect(accepted.status()).toBe(404);
  }
  await page.goto(`/explore/${pluto}`);
  await expect(page.getByTestId("graph-counts")).toContainText(/Claim [1-9]/);
  const counts = await page.getByTestId("graph-counts").textContent();
  await page.getByRole("button", { name: entryLabels().edit, exact: true }).click();
  await page.getByRole("button", { name: entryLabels().roleEdit, exact: true }).click();
  await page.getByRole("radio", { name: entryLabels().specifyRole, exact: true }).check();
  await page.getByRole("checkbox", { name: "原作（漫画制作）", exact: true }).check();
  await expect(page.getByTestId("draft-conditions")).toContainText("原作（漫画制作）");
  await page.screenshot({ path: `test-results/manga-role-editor-${new URL(page.url()).hostname}.png` });
  await page.getByRole("button", { name: entryLabels().cancel, exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText(counts!);
  await page.screenshot({ path: `test-results/manga-role-current-kg-${new URL(page.url()).hostname}.png` });
  const after = await page.request.get("/api/dataset");
  expect(await after.json()).toEqual(before);
});
