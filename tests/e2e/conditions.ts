import type { Page } from "@playwright/test";
export async function editConditions(page: Page) {
  if (!await page.getByRole("dialog", { name: "見る関係の編集" }).isVisible()) await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  await page.getByRole("radio", { name: "個別の関係を指定", exact: true }).check();
}
export async function editRoles(page: Page) {
  await editConditions(page);
  const toggle = page.getByRole("button", { name: "制作の役割を調整", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.getByRole("radio", { name: "役割を指定する", exact: true }).check();
}
