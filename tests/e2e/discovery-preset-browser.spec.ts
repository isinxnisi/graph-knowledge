import {test,expect} from "@playwright/test";
for(const locale of ["ja","en"])for(const width of [1241,390])test(`preset browser ${locale} ${width}px catalogue, names, execution, Graph and return`,async({browser},info)=>{
 const en=locale==="en",ctx=await browser.newContext({viewport:{width,height:890},isMobile:width<800,hasTouch:width<800});
 await ctx.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
 const page=await ctx.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(info.project.use.baseURL!+(en?"/en":"/")+"?discovery=presets");await page.getByTestId("discovery-search-entry").click();
 const catalog=page.getByTestId("preset-browser");await expect(page.getByRole("tab")).toHaveCount(3);await expect(catalog).toBeVisible();
 await page.getByRole("button",{name:en?"Find presets":"プリセットを探す",exact:true}).click();await expect(catalog).toBeVisible();await expect(catalog.locator("[data-catalog-preset]")).toHaveCount(3);await expect(catalog.locator("[data-catalog-result]")).toHaveCount(5);
 await expect(catalog.getByLabel(en?"Search presets":"プリセットを検索",{exact:true})).toBeInViewport();
 await expect(catalog.locator("[data-catalog-result]").first().getByRole("heading")).toBeInViewport();
 await page.screenshot({path:info.outputPath("initial.png"),animations:"disabled"});
 expect(await page.getByTestId("prototype-body").evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await catalog.locator('[data-catalog-world="film"]').click();await expect(catalog.locator("[data-catalog-result]")).toHaveCount(0);await expect(catalog).toContainText(en?"not a count of KG data":"公開KGのデータが0件という意味ではありません");
 await catalog.locator('[data-catalog-world="manga"]').click();await expect(catalog.locator("[data-catalog-result]")).toHaveCount(5);
 await catalog.locator('[data-catalog-world="film"]').click();
 await page.getByLabel(en?"Preset order":"プリセットの並び順",{exact:true}).selectOption("popular");await expect(catalog).toContainText(en?"not been measured":"まだ未集計");
 await page.getByLabel(en?"Preset order":"プリセットの並び順",{exact:true}).selectOption("newest");
 await page.getByRole("button",{name:en?"Find by name":"名前から探す",exact:true}).click();await expect(page.locator("#prototype-name")).toBeVisible();await expect(page.getByText(en?"One name. Many connections.":"ひとつの名前から、その先へ。",{exact:true})).toBeVisible();
 await page.locator("#prototype-name").fill("PLUTO");await expect(page.getByRole("button",{name:en?"Change subject to PLUTO":"対象をPLUTOに変更",exact:true})).toBeVisible();
 await page.getByRole("button",{name:en?"Find presets":"プリセットを探す",exact:true}).click();await expect(catalog.locator('[data-catalog-world="manga"]')).toHaveAttribute("aria-pressed","true");await expect(page.getByLabel(en?"Preset order":"プリセットの並び順",{exact:true})).toHaveValue("newest");
 const item=catalog.locator('[data-catalog-result="work-creators"]');await item.scrollIntoViewIfNeeded();const savedScroll=await page.getByTestId("prototype-body").evaluate(el=>el.scrollTop);await item.getByRole("button",{name:en?"Try PLUTO":"PLUTOで試す",exact:true}).click();
 await expect(page.locator("#prototype-subject")).toContainText("PLUTO");await expect.poll(()=>page.evaluate(()=>history.state.discoveryWorkspace.catalog.scroll)).toBeCloseTo(savedScroll,0);const paths=page.getByTestId("discovery-paths"),routes=paths.getByRole("list",{name:en?"Found routes":"見つかった経路"});await expect(routes.getByRole("button")).toHaveCount(9);
 await expect(page.getByTestId("prototype-results")).toHaveCount(0);
 await routes.getByRole("button",{name:/PLUTO — 浦沢直樹 — MASTERキートン — 勝鹿北星/}).click();await expect(routes).toHaveCount(0);
 const detail=page.getByTestId("discovery-path-detail");await detail.getByRole("button",{name:en?"Read evidence ＋":"根拠を開く ＋",exact:true}).first().click();await expect(detail.getByRole("link",{name:en?"Open the full record":"この記録の詳細ページへ"})).toBeVisible();
 await page.screenshot({path:info.outputPath("route.png"),animations:"disabled"});
 await page.getByTestId("path-graph").click();await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");await page.goBack();await expect(detail).toContainText("勝鹿北星");
 await page.getByRole("button",{name:en?"← Back to preset search":"← プリセット検索へ戻る",exact:true}).click();await expect(catalog).toBeVisible();await expect.poll(()=>page.getByTestId("prototype-body").evaluate(el=>el.scrollTop)).toBeCloseTo(savedScroll,0);await expect(page.getByLabel(en?"Preset order":"プリセットの並び順",{exact:true})).toHaveValue("newest");await expect(catalog.locator('[data-catalog-world="manga"]')).toHaveAttribute("aria-pressed","true");
 // Role filters affect catalogue matching, not the selected execution implicitly.
 await catalog.locator('[data-catalog-role="AUTHORSHIP"]').click();await expect(catalog.locator("[data-catalog-result]")).toHaveCount(1);await catalog.locator('[data-catalog-result="authored-works"]').getByRole("button",{name:en?"Try PLUTO":"PLUTOで試す",exact:true}).click();await expect(page.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed","true");await expect(page.getByTestId("path-coverage")).toBeVisible();
 await page.getByRole("button",{name:en?"Undo: Preset application":"取り消す：プリセットの適用",exact:true}).click();await expect(page.locator('[data-role="AUTHORSHIP"]')).toHaveAttribute("aria-pressed","false");
 await page.getByRole("tab",{name:en?"Knowledge worlds":"知識世界から",exact:true}).click();await expect(page.getByLabel(en?"World interests":"世界の選択",{exact:true})).toBeVisible();await page.getByRole("tab",{name:en?"Browse & refine":"一覧・条件から",exact:true}).click();await expect(page.getByTestId("discovery-keyword")).toBeVisible();
 expect(errors).toEqual([]);await ctx.close();
});
test("preset browser reusable subject and fixed recommendation",async({page},info)=>{
 await page.setViewportSize({width:320,height:890});await page.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
 await page.goto(info.project.use.baseURL!+"/?discovery=presets");await page.getByTestId("discovery-search-entry").click();const catalog=page.getByTestId("preset-browser");await catalog.locator('[data-catalog-preset="pluto"]').click();await expect(page.getByTestId("prototype-results")).toContainText("浦沢直樹");await expect(page.getByTestId("prototype-graph")).toBeVisible();
 await page.getByRole("button",{name:"← プリセット検索へ戻る",exact:true}).click();await catalog.locator('[data-catalog-result="institution-bridge"]').getByRole("button",{name:"対象を選んで使う",exact:true}).click();await expect(page.getByText("この探し方に使う組織を選んでください。",{exact:true})).toBeVisible();await page.locator("#prototype-name").fill("Princeton");await page.getByRole("button",{name:"対象をPrinceton Universityに変更",exact:true}).click();await expect(page.getByTestId("path-coverage")).toContainText("2経路");await expect(page.getByTestId("path-purpose")).toContainText("Princeton");
 expect(await page.getByTestId("prototype-body").evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:info.outputPath("science-320.png"),animations:"disabled"});
});

test("preset browser failed verification and cancelled launch keep the user in control",async({page},info)=>{
 await page.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
 await page.goto(info.project.use.baseURL!+"/?discovery=presets");await page.getByTestId("discovery-search-entry").click();const catalog=page.getByTestId("preset-browser"),pluto="**/api/entities/2b7c6289-d050-4dc0-93e3-9307681253cc";
 await page.route(pluto,route=>route.fulfill({status:503,contentType:"application/json",body:'{"error":"unavailable"}'}));
 await catalog.locator('[data-catalog-preset="pluto"]').click();await expect(catalog.getByRole("alert")).toContainText("公開記録を確認できませんでした");await expect(catalog).toBeVisible();await page.unroute(pluto);
 await catalog.locator('[data-catalog-result="other-works"]').getByRole("button",{name:"対象を選んで使う",exact:true}).click();
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);await page.route(pluto,async route=>{await held;await route.continue().catch(()=>{});});
 const request=page.waitForRequest(r=>r.url().endsWith("/api/entities/2b7c6289-d050-4dc0-93e3-9307681253cc"));
 await page.getByRole("button",{name:"PLUTOで試す →",exact:true}).click();await request;await page.getByRole("button",{name:"探し方だけ外す",exact:true}).click();release();
 await expect(page.locator("#prototype-name")).toBeVisible();await expect(page.getByTestId("discovery-paths")).toHaveCount(0);await expect(page.getByRole("button",{name:"名前から探す",exact:true})).toHaveAttribute("aria-pressed","true");await page.unroute(pluto);
});
