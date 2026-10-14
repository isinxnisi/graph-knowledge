import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import examples from "../../docs/API_RESPONSE_EXAMPLES.json" with { type: "json" };

async function language(page: Page, locale: "ja" | "en") {
  const header = page.getByTestId("site-header");
  await header.getByLabel("表示設定", { exact: true }).click(); await header.locator("select").last().selectOption(locale);
  await page.keyboard.press("Escape"); await expect(page.locator("html")).toHaveAttribute("lang", locale);
}
export function checkMemberLocale(login: (page: Page) => Promise<void>, knowledge: (context: BrowserContext) => Promise<void>) {
  for (const width of [390, 1440]) test(`会員の日英: 編集・共有・コメント・削除確認を保ち、原文から探索へ進む ${width}px`, async ({ page, context, browser }, testInfo) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 1000 }); await knowledge(context);
    await page.goto("/member"); await login(page);
    const claim = examples.claim.claim;
    const content = { dataset: "demo", title: "題名と資料を原文で残す", note: "日本語の保存メモ", language: "ja", entityIds: [claim.subjectId, claim.objectId], claimIds: [claim.id] };
    const result = await page.request.post("/api/member/capsules", { headers: { Origin: "http://127.0.0.1:3221" }, data: { requestId: crypto.randomUUID(), content } });
    expect(result.status()).toBe(201); const { capsule } = await result.json();
    await page.goto(`/member?capsule=${capsule.id}`); await language(page, "en");
    await expect(page.getByText("Current graph: 2 entities / 1 claim", { exact: true })).toBeVisible();
    const controls = page.getByRole("region", { name: "Share by private link", exact: true });
    await expect(controls.getByText("No active sharing link. Only you can read this content.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit this Capsule", exact: true }).click();
    await page.getByRole("textbox", { name: "My description", exact: true }).fill("編集途中のメモは変えない");
    await page.getByLabel("Display name", { exact: true }).fill("未保存の表示名");
    let reads = 0; page.on("request", request => { if (request.url().includes("/api/member/") && request.method() === "GET") reads++; });
    await language(page, "ja");
    await expect(page.getByRole("textbox", { name: "自分の説明", exact: true })).toHaveValue("編集途中のメモは変えない");
    await expect(page.getByLabel("表示名", { exact: true })).toHaveValue("未保存の表示名");
    await language(page, "en"); expect(reads).toBe(0);
    const save = page.waitForRequest(request => request.url().endsWith(`/api/member/capsules/${capsule.id}`) && request.method() === "PUT");
    await page.getByRole("button", { name: "Save account changes", exact: true }).click();
    expect((await save).postDataJSON().content).toMatchObject({ language: "ja", title: content.title, note: "編集途中のメモは変えない" });
    await expect(page.getByText("Account Capsule updated.", { exact: true })).toBeVisible();
    // 表示名の草稿も残る。削除確認に入る前に明示的に取り消す。
    await page.getByRole("region", { name: "Account settings" }).getByRole("button", { name: "Cancel", exact: true }).click();
    await controls.getByRole("button", { name: "Create a link to this version", exact: true }).click();
    await controls.getByRole("button", { name: "Make this version readable by link", exact: true }).click();
    const field = controls.getByLabel("Sharing link", { exact: true }); await expect(field).toBeVisible(); const link = await field.inputValue();
    const before = reads; await language(page, "ja"); await language(page, "en"); expect(reads).toBe(before); await expect(field).toHaveValue(link);
    const readerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3221", viewport: { width, height: 1000 } });
    try {
      await readerContext.addInitScript(() => localStorage.setItem("graph-knowledge.ui-locale.v1", "en"));
      await knowledge(readerContext); const reader = await readerContext.newPage(); await reader.goto(link);
      await expect(reader.getByRole("heading", { name: "Shared Capsule", exact: true })).toBeVisible();
      await expect(reader.getByText("編集途中のメモは変えない", { exact: true })).toBeVisible();
      await reader.getByRole("button", { name: /青葉ハル → Was an assistant to → 黒川レン/ }).click();
      await expect(reader.getByRole("heading", { name: "青葉ハルへのインタビュー", exact: true })).toBeVisible();
      await reader.getByRole("button", { name: /青葉ハル · Person/ }).click();
      const popup = reader.waitForEvent("popup"); await reader.getByRole("link", { name: "Explore from this entity (new tab)", exact: true }).click();
      const exploration = await popup;
      await exploration.getByRole("dialog").getByRole("button", { name: "Explore relations from this entity", exact: true }).click();
      await expect(exploration.getByTestId("exploration-root")).toContainText("青葉ハル"); await exploration.close();
      expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await reader.screenshot({ path: testInfo.outputPath(`step16-shared-${width}.png`), fullPage: true });
    } finally { await readerContext.close(); }
    await page.getByRole("button", { name: "View comments on this version", exact: true }).click();
    await page.getByRole("button", { name: "Accept comments", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Comment text", exact: true })).toBeEnabled();
    await page.getByRole("textbox", { name: "Comment text", exact: true }).fill("送信前のコメント本文");
    const count = reads; await language(page, "ja"); await language(page, "en"); expect(reads).toBe(count);
    await expect(page.getByRole("textbox", { name: "Comment text", exact: true })).toHaveValue("送信前のコメント本文");
    await page.getByRole("button", { name: "Post to this version", exact: true }).click();
    await expect(page.getByText("Comment posted.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "View my comments", exact: true }).click();
    await expect(page.getByRole("region", { name: "My comments", exact: true })).toContainText("送信前のコメント本文");
    const deletion = page.getByRole("region", { name: "Delete account", exact: true });
    await deletion.getByRole("button", { name: "Review what will be deleted", exact: true }).click();
    await deletion.getByRole("checkbox").check();
    const requestCount = reads; await language(page, "ja"); await language(page, "en"); expect(reads).toBe(requestCount);
    await expect(deletion.getByRole("checkbox")).toBeChecked(); await expect(deletion.getByRole("button", { name: "Delete my account", exact: true })).toBeEnabled();
    await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`step16-member-${width}.png`) });
  });
}
