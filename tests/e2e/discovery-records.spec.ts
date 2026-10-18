import { adjacentWorkspace } from "../adjacent-workspace";
import { test, expect } from "@playwright/test";
import { decodeExploration as decodeRawExploration } from "../../lib/client/exploration-url";
for (const locale of ["ja", "en"]) for (const width of [1241, 390]) test(`${locale} ${width}px 対象未指定Role・一致理由・条件保全・根拠・Graph`, async ({ browser }, info) => {
  const en = locale === "en", context = await browser.newContext({ viewport: { width, height: 890 }, isMobile: width < 800, hasTouch: width < 800 });
  await context.addInitScript(() => localStorage.setItem("plunode:privacy:v1", '{"analytics":false,"ads":false}'));
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(info.project.use.baseURL! + (en ? "/en" : "/")); await page.getByTestId("discovery-search-entry").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("prototype-presets").locator('[data-seed="2b7c6289-d050-4dc0-93e3-9307681253cc"] button').first()).toBeEnabled();
  await dialog.getByRole("tab", { name: en ? "Browse & refine" : "一覧・条件から", exact: true }).click();
  await expect(page.getByTestId("discovery-results").locator("ul > li")).toHaveCount(20);
  await page.getByTestId("discovery-cuts").getByRole("button", { name: en ? "Making works" : "作品づくり", exact: true }).click();
  await dialog.locator('[data-record-role="DRAWING"]').click();
  await expect(page.getByTestId("discovery-results").locator("ul > li")).toHaveCount(4);
  const unit = dialog.getByRole("group", { name: en ? "Result unit" : "結果の種類" });
  await unit.getByRole("button", { name: en ? "Relation records" : "関係の記録", exact: true }).click();
  const claims = page.getByTestId("prototype-claim"); await expect(claims).toHaveCount(2);
  await expect(dialog.locator("#discovery-name")).toHaveValue("");
  await dialog.locator("#discovery-name").fill("PLUTO"); await expect(claims).toHaveCount(0);
  await expect(page.getByTestId("discovery-results")).toContainText(en ? "No published Claim" : "すべての条件に一致する公開Claimはありません");
  await dialog.locator("#discovery-name").fill("浦沢");
  const kinds = dialog.getByRole("group", { name: en ? "Search for" : "検索対象", exact: true });
  await kinds.getByRole("button", { name: en ? "Work" : "作品", exact: true }).click(); await expect(claims).toHaveCount(0);
  await kinds.getByRole("button", { name: en ? "Person" : "人物", exact: true }).click(); await expect(claims).toHaveCount(1);
  await expect(claims.first()).toContainText("パイナップルARMY");
  await dialog.locator("#discovery-name").fill(""); await expect(claims).toHaveCount(2);
  await dialog.locator('[data-record-preset="script"]').click(); await expect(claims).toHaveCount(2);
  await expect(claims.first()).toContainText("MASTERキートン");
  await expect(kinds.getByRole("button", { name: en ? "Person" : "人物", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.locator('[data-record-preset="drawing"]').click(); await expect(claims).toHaveCount(2);
  await page.getByTestId("discovery-cuts").getByRole("button", { name: en ? "Organizations" : "組織との関わり", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(en ? "only relation" : "だけを選んだ");
  await expect(dialog.locator('[data-record-role="DRAWING"]')).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: en ? "Use only Production" : "関係を作品づくりだけに戻す", exact: true }).click(); await expect(claims).toHaveCount(2);
  const row = claims.filter({ hasText: "パイナップルARMY" });
  await row.getByRole("button", { name: en ? "Read evidence ＋" : "根拠を開く ＋", exact: true }).click();
  await expect(row.getByRole("heading", { name: en ? "Published claim" : "公開された主張", exact: true })).toBeVisible();
  await expect(row).toContainText("ISBN"); await expect(row.getByRole("button", { name: en ? "Close evidence −" : "根拠を閉じる −", exact: true })).toBeVisible();
  expect(await page.getByTestId("prototype-body").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  // A restored document can receive popstate for its own modal history entry (BFCache).
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate", { state: history.state })));
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath("drawing-records.png"), animations: "disabled" });
  const link = row.getByRole("link", { name: en ? "Open 浦沢直樹 in Graph" : "浦沢直樹をGraphで開く", exact: true }), href = new URL((await link.getAttribute("href"))!, page.url());
  const id = href.pathname.split("/").at(-1)!;
  expect(decodeExploration(href.searchParams.get("s")!, id, "public-kg").relation).toMatchObject({ predicates: ["CONTRIBUTED_TO"], contributionRoles: ["DRAWING"] });
  await link.click(); await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  await page.goBack(); await expect(dialog).toBeVisible(); await expect(claims).toHaveCount(2);
  await expect(dialog.locator('[data-record-role="DRAWING"]')).toHaveAttribute("aria-pressed", "true");
  await expect(unit.getByRole("button", { name: en ? "Relation records" : "関係の記録", exact: true })).toHaveAttribute("aria-pressed", "true");
  await unit.getByRole("button", { name: en ? "Entities" : "対象の一覧", exact: true }).click();
  await expect(page.getByTestId("discovery-results").locator("ul > li")).toHaveCount(2);
  await expect(dialog.locator('[data-record-role="DRAWING"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("discovery-results").getByRole("button", { name: /^浦沢直樹 —/ }).click();
  await expect(page.getByTestId("exploration-root")).toContainText("浦沢直樹");
  const entityHref = new URL(page.url()), rootId = entityHref.pathname.split("/").at(-1)!;
  expect(decodeExploration(entityHref.searchParams.get("s")!, rootId, "public-kg").relation.contributionRoles).toEqual(["DRAWING"]);
  expect(errors).toEqual([]); await context.close();
});

test("既存の制作・Role条件から一覧の対象未指定検索へ渡し、元の入口も保つ", async ({ page }, info) => {
  await page.goto(info.project.use.baseURL! + "/"); await page.getByTestId("discovery-search-entry").click(); const dialog = page.getByRole("dialog");
  await dialog.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "制作", exact: true }).click();
  await dialog.locator('[data-role="DRAWING"]').click();
  await dialog.getByRole("button", { name: "この関係・役割で一覧の記録を探す", exact: true }).click();
  await expect(page.getByTestId("prototype-claim")).toHaveCount(2);
  await expect(dialog.getByRole("tab", { name: "一覧・条件から", exact: true })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "今ある接点から", exact: true }).click();
  await expect(dialog.locator('[data-role="DRAWING"]')).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator("#prototype-subject")).toContainText("名前から指定");
});

test("実データAPI：同一Claim／端点・Role・ページ条件・公開revision・根拠", async ({ request }, info) => {
  const base = info.project.use.baseURL!;
  const get = async (path: string) => { const r = await request.get(base + path); expect(r.ok()).toBeTruthy(); return r.json(); };
  const drawings = await get("/api/discovery/claims?predicates=CONTRIBUTED_TO&contributionRole=DRAWING");
  expect(drawings.claims).toHaveLength(2); expect(drawings.claims.every((c: { contribution: { roleId: string } }) => c.contribution.roleId === "DRAWING")).toBe(true);
  const noCross = await get("/api/discovery/claims?predicates=CONTRIBUTED_TO&contributionRole=DRAWING&q=pluto"); expect(noCross.claims).toHaveLength(0);
  const around = await get("/api/discovery/claims?predicates=CONTRIBUTED_TO&contributionRole=DRAWING&around=2b7c6289-d050-4dc0-93e3-9307681253cc"); expect(around.claims).toHaveLength(0);
  const entityAround = await get("/api/discovery/entities?predicates=CONTRIBUTED_TO&contributionRole=DRAWING&around=2b7c6289-d050-4dc0-93e3-9307681253cc"); expect(entityAround.items).toHaveLength(0);
  const endpoint = await get("/api/discovery/claims?predicates=CONTRIBUTED_TO&contributionRole=DRAWING&q=" + encodeURIComponent("浦沢") + "&kind=work"); expect(endpoint.claims).toHaveLength(0);
  const first = await get("/api/discovery/claims?predicates=AFFILIATED_WITH"), next = await get("/api/discovery/claims?predicates=AFFILIATED_WITH&after=" + first.page.nextCursor);
  expect(first.claims).toHaveLength(20); expect(next.claims).toHaveLength(20);
  const ids = [...first.claims, ...next.claims].map(c => c.id); expect(new Set(ids).size).toBe(40); expect(ids).toEqual([...ids].sort()); expect(next.revision).toBe(first.revision);
  for (const [path, status] of [["/api/discovery/claims?predicates=CONTRIBUTED_TO&after=" + first.page.nextCursor,400], ["/api/discovery/claims?revision=stale",409], ["/api/discovery/claims?world=manga",400], ["/api/discovery/claims?predicates=AFFILIATED_WITH&contributionRole=DRAWING",400]] as const) expect((await request.get(base + path)).status()).toBe(status);
  const detail = await get("/api/claims/" + drawings.claims[0].id + "?revision=" + drawings.revision); expect(detail.claim.citations.length).toBeGreaterThan(0);
  expect(detail.claim.contribution.roleId).toBe("DRAWING"); expect((await request.post(base + "/api/discovery/claims")).status()).toBe(405);
  const entities = await get("/api/discovery/entities?predicates=CONTRIBUTED_TO&contributionRole=DRAWING"); expect(entities.items).toHaveLength(4);
});

test("記録検索の失敗・版不一致・IME：旧結果を操作させず再取得する", async ({ page }, info) => {
  await page.goto(info.project.use.baseURL! + "/en"); await page.getByTestId("discovery-search-entry").click(); const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Browse & refine", exact: true }).click();
  await dialog.getByRole("group", { name: "Result unit" }).getByRole("button", { name: "Relation records", exact: true }).click();
  await dialog.locator('[data-record-preset="drawing"]').click(); await expect(page.getByTestId("prototype-claim")).toHaveCount(2);
  await page.route("**/api/discovery/claims?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "fixture failure" } }) }));
  await dialog.locator('[data-record-role="SCRIPT_WRITING"]').click(); await expect(dialog.getByRole("alert")).toContainText("Could not load records");
  expect(await page.getByTestId("discovery-results").locator("[inert]").count()).toBe(1);
  await page.unroute("**/api/discovery/claims?**"); await dialog.getByRole("button", { name: "Restart search", exact: true }).click();
  await expect(page.getByTestId("prototype-claim").first()).toContainText("MASTERキートン"); await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.route("**/api/discovery/claims?**", async route => { const response = await route.fetch(); const data = await response.json(); await route.fulfill({ response, json: { ...data, revision: "changed-fixture" } }); });
  await dialog.locator('[data-record-role="DRAWING"]').click(); await expect(dialog.getByRole("alert")).toContainText("public KG changed");
  await page.unroute("**/api/discovery/claims?**"); await dialog.getByRole("button", { name: "Restart search", exact: true }).click(); await expect(page.getByTestId("prototype-claim")).toHaveCount(2);
  const input = dialog.locator("#discovery-name"), requests: string[] = []; page.on("request", r => { if (r.url().includes("/api/discovery/claims?")) requests.push(r.url()); });
  await input.dispatchEvent("compositionstart"); await input.fill("no_such_record_789"); await page.waitForTimeout(350); expect(requests).toHaveLength(0);
  await input.dispatchEvent("compositionend"); await expect(page.getByTestId("prototype-claim")).toHaveCount(0);
});

test("Lab比較は既存の二入口を維持し、正式一覧への操作を混在させない", async ({ page }, info) => {
  await page.goto(info.project.use.baseURL! + "/discovery-lab"); const dialog = page.getByRole("dialog");
  await dialog.getByLabel("関係の条件", { exact: true }).getByRole("button", { name: "制作", exact: true }).click();
  await dialog.locator('[data-role="DRAWING"]').click();
  await expect(dialog.getByRole("tab")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "この関係・役割で一覧の記録を探す", exact: true })).toHaveCount(0);
});

function decodeExploration(...args: Parameters<typeof decodeRawExploration>) { return adjacentWorkspace(decodeRawExploration(...args)); }
