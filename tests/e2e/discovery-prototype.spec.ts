import { writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { decodeExploration } from "../../lib/client/exploration-url";
const pluto = "2b7c6289-d050-4dc0-93e3-9307681253cc";
const princeton = "0820c3e8-7219-4e57-abb0-7d04e253fd4a";
async function open(page: Page, baseURL: string) {
  await page.goto(baseURL + "/discovery-lab");
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function chooseWorld(page: Page, id: string) {
  await page.getByRole("tab", { name: /知識世界から|Knowledge worlds/, exact: false }).click();
  await page.locator('[data-world="' + id + '"]').click();
  await page.getByRole("tab", { name: /今ある接点から|Existing connections/, exact: false }).click();
}
async function findSubject(page: Page, name: string, en = false) {
  await page.locator("#prototype-name").fill(name);
  const results = page.getByTestId("prototype-results");
  await results.getByRole("button", { name: en ? "Change subject to " + name : "対象を" + name + "に変更", exact: true }).click();
  await expect(results.getByTestId("prototype-claim").first()).toBeVisible();
  await expect(results).not.toHaveAttribute("data-updating", "true");
}
async function metrics(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector<HTMLElement>("[data-testid=prototype-body]")!, rect = body.getBoundingClientRect();
    const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top - rect.top + body.scrollTop;
    return { bodyHeight: rect.height, scrollHeight: body.scrollHeight, keywordTop: top("[data-testid=prototype-keyword]"), resultsTop: top("#prototype-results-title"),
      visibleClaims: [...document.querySelectorAll("[data-testid=prototype-claim]")].filter(el => { const r = el.getBoundingClientRect(); return r.top >= rect.top && r.bottom <= rect.bottom; }).length };
  });
}
for (const [locale, width, height] of [["ja", 1440, 900], ["ja", 390, 844], ["en", 320, 650]] as const) {
  test(locale + " " + width + "px: suggestions optional, direct criteria/name/result/Graph/Back", async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
    await context.addInitScript(locale => { localStorage.setItem("graph-knowledge.ui-locale.v1", locale); localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'); }, locale);
    const page = await context.newPage(), errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const en = locale === "en"; await open(page, info.project.use.baseURL!);
    const dialog = page.getByRole("dialog"), results = page.getByTestId("prototype-results");
    await expect(page.getByTestId("prototype-presets").getByRole("button").first()).toBeEnabled();
    await page.screenshot({ animations: "disabled", path: info.outputPath("initial-" + width + ".png") });
    const initial = await metrics(page);
    await expect(dialog.locator("details")).toHaveCount(0);
    const navTop = (await dialog.getByRole("tablist").boundingBox())!.y;
    const summaryTop = (await dialog.getByLabel(en ? "Selection summary" : "選択要約").boundingBox())!.y;
    expect(navTop).toBeLessThan(summaryTop);
    const entrances = await dialog.getByRole("tab").all();
    expect(Math.abs((await entrances[0].boundingBox())!.y - (await entrances[1].boundingBox())!.y)).toBeLessThan(2);
    // Every search step below uses the condition controls and name results, never recommendations.
    await chooseWorld(page, "science");
    await dialog.getByLabel(en ? "Relation criteria" : "関係の条件", { exact: true }).getByRole("button", { name: en ? "Production" : "制作", exact: true }).click();
    await findSubject(page, "PLUTO", en);
    await page.getByTestId("prototype-body").evaluate(el => { el.scrollTop = 0; });
    const selected = await metrics(page);
    expect(selected.resultsTop).toBeLessThan(width === 320 ? 950 : width === 390 ? 680 : 540);
    expect(selected.visibleClaims).toBeGreaterThanOrEqual(width === 320 ? 0 : 1);
    const criteriaBox = (await dialog.getByLabel(en ? "Edit relation criteria" : "関係の条件を編集", { exact: true }).boundingBox())!;
    const resultsBox = (await page.getByTestId("prototype-keyword").boundingBox())!;
    if (width > 850) expect(criteriaBox.x + criteriaBox.width).toBeLessThan(resultsBox.x);
    else expect((await page.getByTestId("prototype-next-targets").boundingBox())!.y).toBeGreaterThan(resultsBox.y);
    // Text must fit each segment, including narrow English labels.
    const segments = dialog.getByLabel(en ? "Relation criteria" : "関係の条件", { exact: true }).getByRole("button");
    for (const segment of await segments.all()) expect(await segment.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ animations: "disabled", path: info.outputPath("pluto-" + width + ".png") });
    await info.attach("density", { body: JSON.stringify({ width, height, initial, pluto: selected }), contentType: "application/json" });
    await writeFile(info.outputPath("metrics.json"), JSON.stringify({ width, height, initial, pluto: selected }, null, 2));
    console.log("density", JSON.stringify({ width, height, initial, pluto: selected }));
    const first = results.getByTestId("prototype-claim").first();
    await first.getByRole("button", { name: en ? "Read evidence ＋" : "根拠を開く ＋", exact: true }).click();
    await expect(first.getByRole("link", { name: en ? "Open the full record" : "この記録の詳細ページへ" })).toBeVisible();
    await dialog.locator('[data-role="AUTHORSHIP"]').click();
    await expect(results).not.toHaveAttribute("data-updating", "true");
    await expect(results.getByTestId("prototype-claim")).toHaveCount(1);
    const graph = page.getByTestId("prototype-graph");
    const target = new URL((await graph.getAttribute("href"))!, page.url());
    expect(decodeExploration(target.searchParams.get("s")!, pluto, "public-kg").conditions).toMatchObject({ predicates: ["CONTRIBUTED_TO"], contributionRoles: ["AUTHORSHIP"] });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.getByTestId("prototype-keyword").evaluate(el => el.nextElementSibling?.querySelector("h3") !== null)).toBe(true);
    await graph.click(); await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
    await page.goBack(); await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel(en ? "Selection summary" : "選択要約")).toContainText(en ? "Science & discovery" : "科学・発見");
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: en ? "Open prototype" : "試作を開く", exact: true })).toBeFocused();
    expect(errors).toEqual([]); await context.close();
  });
}
test("single-field removal, explicit bulk removal, role conflict and labelled undo", async ({ page }, info) => {
  await open(page, info.project.use.baseURL!); await findSubject(page, "PLUTO");
  const dialog = page.getByRole("dialog"), relations = dialog.getByLabel("関係の条件", { exact: true });
  await chooseWorld(page, "manga");
  await relations.getByRole("button", { name: "制作", exact: true }).click();
  await dialog.locator('[data-role="AUTHORSHIP"]').click();
  await dialog.getByRole("button", { name: "世界だけ外す", exact: true }).click();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await expect(dialog.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "取り消す：世界の解除", exact: true }).click();
  await expect(dialog.getByLabel("選択要約")).toContainText("漫画・アニメ");
  await relations.getByRole("button", { name: "所属", exact: true }).click();
  await expect(dialog.getByLabel("制作役割の条件")).toContainText("著者");
  await expect(page.getByTestId("prototype-unsupported")).toBeVisible();
  await dialog.getByRole("button", { name: "取り消す：関係・問いの変更", exact: true }).click();
  await expect(relations.getByRole("button", { name: "制作", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "すべての条件を解除", exact: true }).click();
  await expect(dialog.locator("#prototype-subject")).toContainText("名前から指定");
  await dialog.getByRole("button", { name: "取り消す：すべての条件の解除", exact: true }).click();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await expect(dialog.getByLabel("選択要約")).toContainText("漫画・アニメ");
  await expect(dialog.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed", "true");
});
test("name lookup preserves subject, question, role, world and page filter", async ({ page }, info) => {
  await open(page, info.project.use.baseURL!); await findSubject(page, "PLUTO");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "制作", exact: true }).click();
  await dialog.locator('[data-role="AUTHORSHIP"]').click(); await chooseWorld(page, "manga");
  await dialog.locator("#prototype-name").fill("浦沢");
  await dialog.locator("#prototype-subject").click();
  await dialog.locator("#prototype-name").fill("Princeton");
  await expect(page.getByTestId("prototype-results").getByText("Princeton University", { exact: true })).toBeVisible();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await expect(dialog.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("選択要約")).toContainText("漫画・アニメ");
  await dialog.getByRole("button", { name: "PLUTOの関係に戻る", exact: true }).click();
  await expect(dialog.locator("#prototype-name")).toHaveValue("浦沢");
  await expect(page.getByTestId("prototype-results").getByTestId("prototype-claim")).toHaveCount(1);
});
test("all eleven worlds, unsupported questions retained during name lookup", async ({ page }, info) => {
  await open(page, info.project.use.baseURL!); const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "知識世界から", exact: true }).click();
  await expect(dialog.locator("[data-world]")).toHaveCount(11);
  await expect(dialog.getByLabel("世界の選択").getByRole("button")).toHaveCount(12);
  for (const [world, question] of [["film", "映画監督と出演者を探す"], ["games", "ゲーム開発者と代表作品"], ["music", "音楽家の影響の系譜"]]) {
    await dialog.locator('[data-world="' + world + '"]').click();
    await dialog.getByLabel("問いの候補").getByRole("button", { name: new RegExp(question) }).click();
    await expect(page.getByTestId("prototype-unsupported")).toContainText("0件とは判定していません");
    await expect(dialog.getByLabel("選択要約")).toContainText(question);
    await expect(page.getByTestId("prototype-results")).toHaveCount(0);
  }
  await dialog.getByRole("button", { name: "条件を保って名前を探す", exact: true }).click();
  await dialog.locator("#prototype-name").fill("zz_no_such_789");
  await expect(dialog.getByText("この条件・取得範囲では該当なし", { exact: true })).toBeVisible();
  await dialog.locator("#prototype-name").fill("PLUTO");
  await expect(page.getByTestId("prototype-results").getByText("PLUTO", { exact: true })).toBeVisible();
  await expect(page.getByTestId("prototype-unsupported")).toContainText("条件は保持中");
  await page.getByTestId("prototype-results").getByRole("button", { name: "対象をPLUTOに変更", exact: true }).click();
  await expect(dialog.getByLabel("選択要約")).toContainText("音楽家の影響の系譜");
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await expect(page.getByTestId("prototype-results")).toHaveCount(0);
  await dialog.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "制作", exact: true }).click();
  await expect(page.getByTestId("prototype-results").getByTestId("prototype-claim").first()).toBeVisible();
});
test("PLUTO, other works, institution witnesses and graph actions beside records", async ({ page }, info) => {
  await open(page, info.project.use.baseURL!); const dialog = page.getByRole("dialog"), results = page.getByTestId("prototype-results");
  await dialog.locator('[data-seed="' + pluto + '"]').getByRole("button").click();
  await expect(dialog.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "制作", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("prototype-presets")).toHaveCount(0);
  await dialog.getByRole("button", { name: "取り消す：プリセットの適用", exact: true }).click();
  await expect(page.getByTestId("prototype-presets")).toBeVisible();
  await dialog.locator('[data-seed="' + pluto + '"]').getByRole("button").click();
  await page.getByTestId("prototype-next-targets").getByRole("button", { name: "長崎尚志を対象にする", exact: true }).click();
  await expect(results.locator('[data-claim="dbc08a85-9165-4cc8-a3af-d133c83d8f67"]')).toContainText("プロデュース");
  await expect(results.locator('[data-claim="29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1"]')).toContainText("ストーリー共同制作");
  await page.getByTestId("prototype-next-targets").getByRole("button", { name: "BILLY BATを対象にする", exact: true }).click();
  await expect(dialog.locator("#prototype-subject")).toContainText("BILLY BAT");
  await dialog.locator('[data-seed="' + princeton + '"]').getByRole("button").click();
  await dialog.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "所属", exact: true }).click();
  await expect(results.locator('[data-claim="11bbe5b7-0a51-4cab-b26a-771fd0b61d85"]')).toContainText("John F. Nash Jr.");
  const pauli = results.locator('[data-claim="554bbc81-73df-498e-b867-c90219496e2f"]');
  await expect(pauli.getByRole("link", { name: /Graphで開く/ })).toBeVisible();
  await pauli.getByRole("button", { name: "根拠を開く ＋", exact: true }).click();
  await expect(pauli.getByRole("link", { name: "この記録の詳細ページへ", exact: true })).toBeVisible();
  await expect(dialog.getByText(/同時在籍・交流・共同研究の証明ではありません/)).toBeVisible();
});
test("delayed requests, errors, revision conflict and retry keep old rows inert", async ({ page }, info) => {
  await open(page, info.project.use.baseURL!); await findSubject(page, "PLUTO");
  const dialog = page.getByRole("dialog"), relations = dialog.getByLabel("関係の条件", { exact: true }), results = page.getByTestId("prototype-results");
  await page.route("**/neighbors?**", async route => {
    const p = new URL(route.request().url()).searchParams.get("predicates");
    if (p === "INFLUENCED_BY") return route.fulfill({ status: 409, contentType: "application/json", body: '{"error":{"message":"Test revision changed"}}' });
    if (p === "CONTRIBUTED_TO") await new Promise(resolve => setTimeout(resolve, 650));
    await route.continue().catch(() => {});
  });
  const delayed = page.waitForRequest(r => r.url().includes("/neighbors?") && r.url().includes("CONTRIBUTED_TO"));
  await relations.getByRole("button", { name: "制作", exact: true }).click(); await delayed;
  await expect(results.locator("> [inert]")).toHaveCount(1);
  await relations.getByRole("button", { name: "所属", exact: true }).click();
  await expect(results).not.toHaveAttribute("data-updating", "true");
  await page.waitForTimeout(800); await expect(dialog.getByText("この条件・取得範囲では該当なし", { exact: true })).toBeVisible();
  await relations.getByRole("button", { name: "影響", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("公開KGの版が変わりました");
  await expect(results.locator("> [inert]")).toHaveCount(1);
  await page.unroute("**/neighbors?**"); await dialog.getByRole("button", { name: "再取得", exact: true }).click();
  await expect(results).not.toHaveAttribute("data-updating", "true"); await expect(dialog.getByRole("alert")).toHaveCount(0);
});
test("coexistence, IME, reduced motion and compact touch controls", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(info.project.use.baseURL! + "/"); await page.getByTestId("discovery-search-entry").click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByTestId("discovery-prototype-entry").click(); const dialog = page.getByRole("dialog"), input = dialog.locator("#prototype-name");
  const requests: string[] = []; page.on("request", r => { if (r.url().includes("/api/entities?")) requests.push(r.url()); });
  await input.dispatchEvent("compositionstart"); await input.fill("PLUTO"); await page.waitForTimeout(350); expect(requests).toHaveLength(0);
  await input.dispatchEvent("compositionend"); await page.getByTestId("prototype-results").getByRole("button", { name: "対象をPLUTOに変更", exact: true }).click();
  const tab = dialog.getByRole("tab", { name: "今ある接点から", exact: true }); await tab.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "知識世界から", exact: true })).toBeFocused();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  const mode = dialog.getByRole("button", { name: "段階表示を試す", exact: true });
  expect(await mode.evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
  await mode.click();
  await dialog.getByRole("button", { name: "接点から探す →", exact: true }).click();
  await expect(dialog.locator("#prototype-subject")).toContainText("PLUTO");
  await dialog.getByRole("button", { name: "知識世界から探す →", exact: true }).click();
  await expect(dialog.locator("[data-world]")).toHaveCount(11);
  await dialog.getByRole("button", { name: "タブ表示に戻す", exact: true }).click();
  await expect(dialog.getByRole("tab", { name: "知識世界から", exact: true })).toHaveAttribute("aria-selected", "true");
});
test("390px touch centers select only their intended condition", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page, info.project.use.baseURL!); await findSubject(page, "PLUTO");
  const relations = page.getByLabel("関係の条件", { exact: true });
  for (const name of ["制作", "所属", "影響", "すべて", "制作"]) {
    const button = relations.getByRole("button", { name, exact: true }); await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!; await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(relations.locator('[aria-pressed="true"]')).toHaveCount(1);
  }
  await context.close();
});

test("mobile subject navigation reveals new context without changing other criteria", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page, info.project.use.baseURL!);
  await page.locator('[data-seed="' + pluto + '"]').getByRole("button").click();
  const targets = page.getByTestId("prototype-next-targets");
  await targets.getByRole("button", { name: "長崎尚志を対象にする", exact: true }).click();
  await expect(page.locator("#prototype-subject")).toContainText("長崎尚志");
  await expect(page.getByTestId("prototype-results")).not.toHaveAttribute("data-updating", "true");
  expect(await page.getByTestId("prototype-body").evaluate(el => el.scrollTop)).toBe(0);
  await expect(page.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "制作", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "知識世界から", exact: true }).click();
  await expect(page.locator('[data-world="film"]')).toBeVisible();
  expect(await page.getByTestId("prototype-body").evaluate(el => el.scrollTop)).toBe(0);
  await expect(page.locator("#prototype-subject")).toContainText("長崎尚志");
  await context.close();
});
