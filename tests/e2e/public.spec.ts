import { checkEditorialDesign } from "./editorial-design";
import { checkExplorerLocale } from "./explorer-locale";
import { checkContentLocale } from "./content-locale";
import { expect, test } from "@playwright/test";
import { checkSiteHeader } from "./site-header";
import { checkPhoneExplorer } from "./phone-explorer";
import { checkPhoneReading } from "./phone-reading";

checkSiteHeader("PLUTO", "Entity 4 / Claim 5");
checkEditorialDesign();
checkPhoneExplorer();
checkPhoneReading();
checkContentLocale();

test("同じ入口から漫画・科学・Eventを検索し、開始例・限定・根拠・概要・復帰へ進む", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("共通Knowledge Graph · 公開準備中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const graphBefore = await page.getByTestId("graph-canvas").evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.nodes().map(node => node.id()).sort());
  await page.getByLabel("名前・別名").fill("Heisenberg");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("button", { name: /^ヴェルナー・ハイゼンベルク —/ })).toBeVisible();
  expect(await page.getByTestId("graph-canvas").evaluate(el => (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.nodes().map(node => node.id()).sort())).toEqual(graphBefore);
  await page.getByRole("button", { name: /^ヴェルナー・ハイゼンベルク —/ }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 4");
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("関わりがあった");
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "第5回ソルヴェイ物理会議（1927）から探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("1927年10月24日〜1927年10月29日");
  const response = await page.request.get("/api/entities?q=ローレンツ");
  const id = (await response.json()).items[0].id;
  await page.getByTestId("graph-canvas").evaluate((el, id) => {
    (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy.getElementById(id).emit("tap");
  }, id);
  const detail = page.getByRole("region", { name: "Entity詳細" });
  await expect(detail).toContainText("ヘンドリック・ローレンツ");
  await detail.getByRole("button", { name: "この対象から広く見る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 2 / Claim 2");
  await page.getByRole("button", { name: "直前の探索へ戻る", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 3 / Claim 3");
  const edgeId = await page.getByTestId("graph-canvas").evaluate((el, id) => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    const edge = cy.edges().filter(edge => edge.source().id() === id).first(); edge.emit("tap"); return edge.id();
  }, id);
  expect(edgeId).toBeTruthy();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("会議議長");
  await expect(page.getByRole("region", { name: "Claim詳細" })).toContainText("Président");
  await expect(page.getByRole("region", { name: "Claim詳細" }).getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
});

test("単一APIで全kindを取得し、三限定とdataset境界を維持する", async ({ request }) => {
  for (const [query, kind] of [["PLUTO", "work"], ["University of Cambridge", "organization"], ["Dirac", "person"], ["ソルヴェイ", "event"]]) {
    const response = await request.get(`/api/entities?q=${encodeURIComponent(query)}&kind=${kind}`);
    expect(response.status()).toBe(200); const result = await response.json(); expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((entity: { kind: string }) => entity.kind === kind)).toBe(true);
    const overview = await request.get(`/api/entities/${result.items[0].id}/overview`);
    expect((await overview.json()).scope.dataset).toBe("public-kg");
  }
  for (const [id, condition, predicate] of [
    ["2b7c6289-d050-4dc0-93e3-9307681253cc", "contributionRoles=PRODUCING&organizationPositions=&eventRoles=", "CONTRIBUTED_TO"],
    ["1530af15-129d-40bf-a1ca-ce8343dc7491", "contributionRoles=&organizationPositions=VISITOR&eventRoles=", "AFFILIATED_WITH"],
    ["247d3efb-6172-4a3e-aa09-dad69914b47c", "contributionRoles=&organizationPositions=&eventRoles=CHAIR", "PARTICIPATED_IN"],
  ]) {
    const filtered = await request.get(`/api/entities/${id}/neighbors?${condition}`);
    expect(filtered.status()).toBe(200);
    const data = await filtered.json(); expect(data.claims).toHaveLength(1);
    expect(data.claims[0].predicate).toBe(predicate);
  }
  expect((await (await request.get("/api/entities?q=青葉ハル")).json()).items).toEqual([]);
});

test("更新失効では旧Graphへ混ぜず、同じ起点・条件を明示読み直しできる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  let rejected = false;
  await page.route("**/api/entities/*/neighbors*", async route => {
    if (rejected) return route.continue();
    rejected = true;
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "DATASET_CHANGED", message: "登録データが更新されました。" } }) });
  });
  await page.getByTestId("graph-canvas").evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    cy.nodes().filter(node => node.data("kind") === "person").first().emit("tap");
  });
  const reload = page.getByRole("button", { name: "更新データで探索を読み直す", exact: true });
  await expect(reload).toBeVisible();
  await expect(page.getByText("登録データが更新されました。古い探索へ混ぜず、同じ起点と条件で読み直してください。", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: "test-results/public-data-changed.png" });
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await reload.click();
  await expect(reload).toHaveCount(0);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
});

test("旧Claimリンクでは撤回理由・元の出典・明示差替え先を読める", async ({ page, request }) => {
  const search = await (await request.get("/api/entities?q=PLUTO")).json();
  const neighbors = await (await request.get(`/api/entities/${search.items[0].id}/neighbors`)).json();
  const old = await (await request.get(`/api/claims/${neighbors.claims[0].id}`)).json();
  const replacement = neighbors.claims[1].id;
  await page.route(`**/api/claims/${old.claim.id}`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...old,
    claim: { ...old.claim, withdrawal: { reason: "ブラウザ表示だけの撤回試験", release: "browser-test-only", replacementClaimId: replacement } },
  }) }));
  await page.goto(`/?read=claim&dataset=public-kg&id=${old.claim.id}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("撤回された主張");
  await expect(dialog).toContainText("ブラウザ表示だけの撤回試験");
  await expect(dialog.getByRole("link", { name: "出典のURLを開く" }).first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "差替え先の主張を読む" })).toHaveAttribute("href", `/?read=claim&dataset=public-kg&id=${replacement}`);
  await page.screenshot({ path: "test-results/public-withdrawn-reference.png" });
});

checkExplorerLocale();


test("隣接一覧: カードの列幅・折り畳み・根拠への移動を保つ", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const section = page.getByRole("region", { name: "選択Entityの隣接関係" });
  const disclosure = section.locator("details");
  const cards = section.locator("li");
  await expect(cards).toHaveCount(5);
  const ids = await cards.evaluateAll(elements => elements.map(el => el.getAttribute("data-testid")));
  const state = () => page.getByTestId("graph-canvas").evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { nodes: cy.nodes().map(n => ({ id: n.id(), position: n.position() })), pan: cy.pan(), zoom: cy.zoom() };
  });
  const before = await state();
  await section.scrollIntoViewIfNeeded();
  const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  const motion = await disclosure.evaluate(el => {
    el.querySelector("summary")!.click();
    const a = el.getAnimations().find(a => (a.effect as KeyframeEffect).target === el)!;
    return { duration: a.effect!.getTiming().duration, heights: (a.effect as KeyframeEffect).getKeyframes().map(frame => frame.height) };
  });
  expect(motion.duration).toBe(240);
  expect(motion.heights[0]).not.toEqual(motion.heights[1]);
  await expect(disclosure).not.toHaveAttribute("open");
  await expect(cards.first()).toBeHidden();
  expect(await state()).toEqual(before);
  await disclosure.locator("summary + div").evaluate(el => el.addEventListener("animationstart", () => el.setAttribute("data-animation-observed", "true"), { once: true }));
  await disclosure.locator("summary").focus();
  await disclosure.locator("summary").press("Enter");
  await expect(cards.first()).toBeVisible();
  await expect(disclosure.locator("summary + div")).toHaveAttribute("data-animation-observed", "true");
  expect(await cards.evaluateAll(elements => elements.map(el => el.getAttribute("data-testid")))).toEqual(ids);
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/graph-adjacency-desktop.png" });
  await cards.first().getByRole("button", { name: "主張と出典を見る" }).click();
  await expect(page.getByRole("region", { name: "Claim詳細" })).toBeVisible();
  await expect(cards).toHaveCount(5);
  expect(await cards.evaluateAll(elements => elements.map(el => el.getAttribute("data-testid")))).toEqual(ids);
  await expect(section.getByRole("heading")).toContainText("PLUTOの隣接関係");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await section.scrollIntoViewIfNeeded();
  const card = await cards.first().boundingBox();
  expect(card!.width).toBeLessThan(390);
  const overflow = await section.evaluate(el => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "/tmp/graph-adjacency-mobile.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await disclosure.evaluate(el => {
    el.querySelector("summary")!.click();
    return { open: (el as HTMLDetailsElement).open, moving: el.hasAttribute("data-motion-state") };
  });
  expect(reduced).toEqual({ open: false, moving: false });
});


test("モーダル: 開閉の動き・背景クリック・Escape・動きを減らす設定", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => getComputedStyle(el).animationDuration)).toBe("0.26s");
  await dialog.evaluate(el => {
    (el.querySelector('button') as HTMLButtonElement).click();
    el.setAttribute("data-dismiss-duration", String(el.getAnimations().find(a => a.effect?.getTiming().duration === 160)?.effect?.getTiming().duration));
  });
  await expect(dialog).toHaveAttribute("data-dismiss-duration", "160");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "関係概要を見る", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "見る関係を編集", exact: true }).click();
  expect(await dialog.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
});


for (const reduced of [false, true]) test(`関係概要: 遅延取得後の高さと中央位置を滑らかに変える（${reduced ? "動きを減らす・スマホ" : "通常・PC"}）`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.setViewportSize(reduced ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/entities/*/overview", async route => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  if (reduced) await page.getByRole("button", { name: "選択の詳細", exact: true }).click();
  await page.getByRole("region", { name: "Entity詳細" }).getByRole("button", { name: "関係概要を見る", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toBeVisible();
  await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  const before = await dialog.boundingBox();
  // 自動テスト環境のフレーム間引きに依存せず、描画上の中間サイズを確かめる。
  await dialog.evaluate(el => {
    const invoke = el.animate.bind(el);
    el.animate = (frames, options) => {
      const animation = invoke(frames, options);
      if (Array.isArray(frames) && frames[0]?.height) {
        animation.pause();
        (el as HTMLElement & { sizeAnimation?: Animation }).sizeAnimation = animation;
      }
      return animation;
    };
  });
  release();
  await expect(dialog.getByText("この対象へ向かう関係", { exact: true })).toBeAttached();
  if (!reduced) {
    const frames = await dialog.evaluate(el => {
      const animation = (el as HTMLElement & { sizeAnimation: Animation }).sizeAnimation;
      const boxes = [0, 80, 160, 240].map(time => {
        animation.currentTime = time;
        const box = el.getBoundingClientRect();
        return { height: box.height, y: box.y, scrollbar: getComputedStyle(el.querySelector('[class*="overviewBody"]')!).scrollbarWidth };
      });
      animation.currentTime = 0; animation.play();
      return boxes;
    });
    expect(frames.every(frame => frame.scrollbar === "none")).toBe(true);
    expect(frames[1].height).toBeGreaterThan(frames[0].height + 3);
    expect(frames[1].height).toBeLessThan(frames[3].height - 3);
    expect(frames[1].y).toBeLessThan(frames[0].y - 1);
    expect(frames[1].y).toBeGreaterThan(frames[3].y + 1);
  } else expect(await dialog.evaluate(el => !!(el as HTMLElement & { sizeAnimation?: Animation }).sizeAnimation)).toBe(false);
  await expect.poll(() => dialog.evaluate(el => el.getAnimations().length)).toBe(0);
  await expect(dialog).not.toHaveAttribute("data-size-animating");
  expect(await dialog.locator('[class*="overviewBody"]').evaluate(el => getComputedStyle(el).scrollbarWidth)).not.toBe("none");
  const after = await dialog.boundingBox();
  expect(after!.height).toBeGreaterThan(before!.height + 30);
  await expect(dialog.getByRole("button", { name: "閉じる", exact: true })).toBeVisible();
  if (!reduced) {
    await page.setViewportSize({ width: 1440, height: 500 });
    const body = dialog.locator('[class*="overviewBody"]');
    expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("対象ナビゲータ: 横幅を候補の列へ使い、検索と移動の契約を保つ", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
  const trigger = navigator.getByRole("button", { name: /^表示中の対象へ移動/ });
  await trigger.click();
  const cards = navigator.locator("li");
  await expect(cards).toHaveCount(4);
  const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  expect(first!.width).toBeLessThan(360);
  expect((await navigator.getByRole("searchbox").boundingBox())!.width).toBeLessThanOrEqual(441);
  await navigator.screenshot({ path: "/tmp/graph-navigator-pc.png" });
  await navigator.getByRole("button", { name: /長崎尚志/ }).click();
  await expect(page.getByRole("region", { name: "Entity詳細" })).toContainText("長崎尚志");
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await navigator.getByRole("searchbox").fill("長崎尚志");
  await expect(cards).toHaveCount(1);
  expect(await navigator.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await navigator.screenshot({ path: "/tmp/graph-navigator-phone.png" });
  await navigator.getByRole("searchbox").press("Escape");
  await expect(trigger).toBeFocused();
  await expect(navigator.getByRole("searchbox")).toBeHidden();
});

test("Graph内操作: アイコン配置・ズーム・対象一覧とpanを分離する", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "PLUTOから探索を開始", exact: true }).click();
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const surface = page.getByTestId("graph-canvas"), canvas = surface.locator("..");
  const controls = page.getByRole("group", { name: "Graphの表示操作", exact: true });
  const state = () => surface.evaluate(el => {
    const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
    return { zoom: cy.zoom(), pan: cy.pan(), positions: cy.nodes().map(n => ({ id: n.id(), position: n.position() })) };
  });
  const initial = await state();
  await controls.getByRole("button", { name: "Graphを拡大", exact: true }).click();
  expect((await state()).zoom).toBeGreaterThan(initial.zoom);
  await controls.getByRole("button", { name: "Graphを縮小", exact: true }).click();
  expect((await state()).zoom).toBeCloseTo(initial.zoom, 6);
  await controls.getByRole("button", { name: "全体を表示", exact: true }).click();
  await controls.getByRole("button", { name: "選択を表示", exact: true }).click();
  expect((await state()).positions).toEqual(initial.positions);
  await expect(page.getByTestId("graph-counts")).toHaveText("Entity 4 / Claim 5");
  const navigator = page.getByRole("region", { name: "表示中の対象へ移動", exact: true });
  const trigger = navigator.getByRole("button", { name: /^表示中の対象へ移動/ });
  const view = await state();
  await trigger.click();
  await navigator.getByRole("searchbox").click();
  await page.mouse.wheel(0, 100);
  expect(await state()).toEqual(view);
  await navigator.getByRole("searchbox").press("Escape");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + box.height - 70);
  await page.mouse.down();
  await page.mouse.move(box.x + 85, box.y + box.height - 50, { steps: 5 });
  await page.mouse.up();
  expect((await state()).pan).not.toEqual(view.pan);
  expect((await state()).positions).toEqual(initial.positions);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await controls.scrollIntoViewIfNeeded();
    await controls.getByRole("button", { name: "全体を表示", exact: true }).click();
    const frame = (await canvas.boundingBox())!, toolbar = (await controls.boundingBox())!, entry = (await trigger.boundingBox())!;
    expect(toolbar.x).toBeGreaterThan(frame.x + frame.width / 2);
    expect(toolbar.y + toolbar.height).toBeLessThan(frame.y + frame.height);
    expect(entry.x).toBeLessThan(frame.x + 20);
    expect(entry.y).toBeLessThan(frame.y + 20);
    for (const button of await controls.getByRole("button").all()) {
      expect(await button.innerText()).toBe("");
      expect(await button.getAttribute("title")).toBeTruthy();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await canvas.screenshot({ path: `/tmp/graph-overlay-tools-${width}.png` });
  }
});
