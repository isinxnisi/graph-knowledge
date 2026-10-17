import { test, expect } from "@playwright/test";
const pluto="2b7c6289-d050-4dc0-93e3-9307681253cc";
for (const locale of ["ja","en"]) for (const width of [1241,390]) test(`multi-step ${locale} ${width}px public route, evidence, Graph and Back`,async({browser},info)=>{
 const en=locale==="en",context=await browser.newContext({viewport:{width,height:890},isMobile:width<800,hasTouch:width<800});
 await context.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
 const page=await context.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(info.project.use.baseURL!+(en?"/en":"/"));await page.getByTestId("discovery-search-entry").click();
 await page.getByTestId("prototype-presets").locator(`[data-seed="${pluto}"] button`).first().click();
 const panel=page.getByTestId("discovery-paths"),toggle=panel.getByRole("button",{name:en?"Connections 2–3 steps away":"2〜3段先の接点"});
 await expect(toggle).toHaveAttribute("aria-expanded","false");await toggle.click();
 const routes=panel.getByRole("list",{name:en?"Found routes":"見つかった経路"});
 await expect(routes.getByRole("button")).toHaveCount(10);
 const route=routes.getByRole("button",{name:/PLUTO — 浦沢直樹 — MONSTER/});await route.click();
 const detail=page.getByTestId("discovery-path-detail");await expect(detail).toBeVisible();
 await detail.getByRole("button",{name:en?"Read evidence ＋":"根拠を開く ＋",exact:true}).first().click();
 await expect(detail.getByRole("link",{name:en?"Open the full record":"この記録の詳細ページへ"})).toBeVisible();
 await expect(detail).toContainText("ISBN");
 await panel.getByRole("button",{name:en?"3 steps":"3段",exact:true}).click();
 await expect(routes.getByRole("button")).toHaveCount(9);
 await routes.getByRole("button",{name:/PLUTO — 浦沢直樹 — MASTERキートン — 勝鹿北星/}).click();
 const href=new URL((await page.getByTestId("path-graph").getAttribute("href"))!,page.url());
 expect(href.pathname).toBe((en?"/en":"")+"/explore/"+pluto);
 expect(href.searchParams.has("via")).toBe(true);
 const witness=JSON.parse(Buffer.from(href.searchParams.get("via")!,"base64url").toString());
 expect(witness.nodeIds).toHaveLength(4);expect(witness.claimIds).toHaveLength(3);
 expect(await page.getByTestId("prototype-body").evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:info.outputPath("route.png"),animations:"disabled"});
 await page.getByTestId("path-graph").click();await expect(page.getByTestId("exploration-root")).toContainText("PLUTO");
 await expect(page).not.toHaveURL(/via=/);
 await expect(page.getByRole("alert").filter({hasText:/\S/})).toHaveCount(0);
 // The path's endpoint is selected after all three canonical connections are replayed.
 await expect(page.getByTestId("selection-status")).toContainText("勝鹿北星");
 if (width < 800) await page.getByRole("button",{name:en?"Selection details":"選択の詳細",exact:true}).click();
 await expect(page.getByTestId("graph-discovery-route")).toBeVisible();
 await expect(page.getByTestId("graph-discovery-route").locator("ol > li")).toHaveCount(3);
 await expect(page.getByTestId("graph-discovery-route")).toContainText("勝鹿北星");
 expect(await page.locator("#explorer-detail").evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:info.outputPath("graph.png"),animations:"disabled"});
 if(locale==="ja" && width===1241) {
   await page.getByTestId("graph-discovery-route").locator("li").last().getByRole("button").last().click();
   const record=page.getByTestId("claim-card-"+witness.claimIds[2].at(-1));
   await expect(record).toBeVisible();await expect(record).toContainText("ISBN");
   await expect(record.locator('a[target="_blank"]').first()).toBeVisible();
 }
 await page.goBack();await expect(page.getByRole("dialog")).toBeVisible();
 await expect(panel.getByRole("button",{name:en?"3 steps":"3段",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(detail).toContainText("勝鹿北星");
 await detail.getByRole("button",{name:en?"Clear route selection":"経路の選択を解除",exact:true}).click();
 await expect(detail).toHaveCount(0);await expect(page.locator("#prototype-subject")).toContainText("PLUTO");
 await expect(page.getByLabel(en?"Relation criteria":"関係の条件",{exact:true}).getByRole("button",{name:en?"Production":"制作",exact:true})).toHaveAttribute("aria-pressed","true");
 if (locale==="ja" && width===1241) {
   await routes.getByRole("button",{name:/PLUTO — 浦沢直樹 — BILLY BAT — 長崎尚志/}).click();
   await page.getByTestId("path-graph").click();
   await expect(page.getByTestId("graph-discovery-route").locator("ol > li")).toHaveCount(3);
   await expect(page.getByTestId("graph-discovery-route")).toContainText("BILLY BAT");
   await expect(page.getByText("表示中の最短経路（1関係）",{exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);await context.close();
});

test("multi-step science, bounded hub and revision conflict",async({page,request},info)=>{
 await page.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
 await page.setViewportSize({width:320,height:810});await page.goto(info.project.use.baseURL!+"/");await page.getByTestId("discovery-search-entry").click();
 await page.getByTestId("prototype-presets").locator('[data-seed="8e322435-4318-4ad0-835b-3f71d2537421"] button').first().click();
 const panel=page.getByTestId("discovery-paths");await panel.getByRole("button",{name:"2〜3段先の接点"}).click();
 await expect(panel.getByRole("list",{name:"見つかった経路"}).getByRole("button")).toHaveCount(6);
 await panel.getByRole("button",{name:/パウリ — Princeton/}).click();
 await expect(page.getByTestId("discovery-path-detail")).toContainText("1922年〜1923年");
 await expect(page.getByTestId("discovery-path-detail")).toContainText("期間不明");
 await page.getByTestId("discovery-path-detail").getByRole("button",{name:"根拠を開く ＋",exact:true}).first().click();
 await expect(page.getByTestId("discovery-path-detail").getByRole("link",{name:"この記録の詳細ページへ"})).toBeVisible();
 expect(await page.getByTestId("prototype-body").evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:info.outputPath("science-320.png"),animations:"disabled"});
 await page.route("**/api/discovery/paths?**",route=>route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({error:{code:"DATASET_CHANGED",message:"changed"}})}));
 await panel.getByRole("button",{name:"3段",exact:true}).click();
 await expect(panel.getByRole("alert")).toContainText("公開KGの版が変わりました");await expect(panel.getByRole("list")).toHaveCount(0);
 await page.unroute("**/api/discovery/paths?**");await panel.getByRole("button",{name:"記録と経路を再取得"}).click();
 await expect(panel.getByRole("list")).toBeVisible();
 const hub=await request.get("/api/discovery/paths?anchor=31e2b0cd-dcfc-48f5-b7fc-ebe1022f3e50&depth=3&predicates=AFFILIATED_WITH");expect(hub.ok()).toBe(true);
 const result=await hub.json();expect(result.scan.reasons).toContain("neighbors");expect(result.scan.expanded).toBeLessThanOrEqual(24);expect(result.paths.length).toBeLessThanOrEqual(12);
 const stale=await request.get(`/api/discovery/paths?anchor=${pluto}&revision=outdated`);expect(stale.status()).toBe(409);
 const invalid=await request.get(`/api/discovery/paths?anchor=${pluto}&world=manga`);expect(invalid.status()).toBe(400);
});
