import { test, expect } from "@playwright/test";
import { decodeExploration } from "../../lib/client/exploration-url";
import { relationText } from "../../lib/i18n/relation-condition";
import { entryLabels } from "../../lib/i18n/exploration-entry";
import { graphNavigationLabels } from "../../lib/i18n/graph-navigation";
import { workspaceLabels } from "../../lib/i18n/workspace";
import { savedViewLabels } from "../../lib/i18n/saved-views";
import { overviewLabels } from "../../lib/i18n/entity-overview";
import { readingLabels } from "../../lib/i18n/reading-reference";
const root="2b7c6289-d050-4dc0-93e3-9307681253cc";
for(const [locale,width] of [["ja",1280],["en",390]] as const)test(`unified graph gestures ${locale} ${width}`,async({browser},info)=>{
  const mobile=width<800,ctx=await browser.newContext({viewport:{width,height:1000},isMobile:mobile,hasTouch:mobile});
  await ctx.addInitScript(()=>localStorage.setItem("plunode:privacy:v1",'{"analytics":false,"ads":false}'));
  const page=await ctx.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const text=relationText(locale),entry=entryLabels(locale),navText=graphNavigationLabels(locale),overview=overviewLabels(locale),ws=workspaceLabels(locale),views=savedViewLabels(locale);
  const graph=page.locator("#explorer-graph"),canvas=page.getByTestId("graph-canvas"),nav=page.locator('nav[aria-label="'+(locale==="en"?"Explorer panels":"探索画面の切り替え")+'"]');
  const model=()=>decodeExploration(new URL(page.url()).searchParams.get("s")!,root,"public-kg");
  const pattern=()=>{const x=model().execution;if(x.type!=="pattern")throw Error("Expected pattern");return x;};
  const snap=()=>canvas.evaluate(el=>{const cy=(el as unknown as {_cyreg:{cy:import("cytoscape").Core}})._cyreg.cy;return{ids:cy.nodes().map(n=>n.id()).sort(),edges:cy.edges().map(e=>e.id()).sort(),points:Object.fromEntries(cy.nodes().map(n=>[n.id(),{...n.position()}])),zoom:cy.zoom(),pan:cy.pan()};});
  const focus=async(id:string)=>{
    const label=await canvas.evaluate((el,id)=>(el as unknown as {_cyreg:{cy:import("cytoscape").Core}})._cyreg.cy.getElementById(id).data("label") as string,id);
    const navigator=graph.getByRole("region",{name:navText.title,exact:true});await navigator.getByRole("button",{name:new RegExp(navText.title)}).click();
    await navigator.locator("li button").filter({has:page.locator("strong").filter({hasText:new RegExp("^"+label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$")})}).first().click();await canvas.scrollIntoViewIfNeeded();
  };
  const tap=async(id:string,double=false)=>{
    const p=await canvas.evaluate((el,id)=>{const cy=(el as unknown as {_cyreg:{cy:import("cytoscape").Core}})._cyreg.cy,p=cy.getElementById(id).renderedPosition(),r=el.getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},id);
    if(mobile){await page.touchscreen.tap(p.x,p.y);if(double)await page.touchscreen.tap(p.x,p.y);}else if(double)await page.mouse.dblclick(p.x,p.y,{delay:70});else await page.mouse.click(p.x,p.y);
  };
  const doubleOverview=async(id:string)=>{await focus(id);const before=await snap();await tap(id,true);const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:overview.close,exact:true}).click();expect((await snap()).edges).toEqual(before.edges);};
  const repeatRoot=async()=>{await focus(root);const before=await snap();for(let n=0;n<2;n++){await tap(root);await expect.poll(async()=>(await snap()).ids).toEqual([root]);await tap(root);await expect.poll(async()=>(await snap()).edges).toEqual(before.edges);const after=await snap();expect(after.points).toEqual(before.points);expect(after.zoom).toBeCloseTo(before.zoom,5);expect(after.pan).toEqual(before.pan);}};
  const openTool=async(label:string)=>{if(mobile)await nav.getByRole("button",{name:locale==="en"?"Search":"検索",exact:true}).click();await page.locator("#explorer-search").getByRole("button",{name:label,exact:true}).click();};
  const returnGraph=async()=>{if(mobile)await nav.getByRole("button",{name:"Graph",exact:true}).click();};
  await page.goto(info.project.use.baseURL!+(locale==="en"?"/en":"")+`/explore/${root}`);await expect.poll(async()=>(await snap()).edges.length).toBeGreaterThan(0);
  await doubleOverview(root);await repeatRoot();await page.screenshot({path:info.outputPath("ordinary.png"),animations:"disabled"});
  await graph.getByRole("button",{name:entry.edit,exact:true}).click();await page.getByRole("radio",{name:text.pattern,exact:true}).check();await page.getByRole("button",{name:entry.apply,exact:true}).click();
  await expect.poll(()=>model().relation.type).toBe("pattern");const first=pattern(),creators=[...new Set(first.routes.map(r=>r.route.nodeIds[1]))];
  await expect.poll(async()=>(await snap()).ids).toEqual([root,...creators].sort());await expect(graph.getByRole("button",{name:/経路をもう1本開く|Open one more path/})).toHaveCount(0);
  await page.screenshot({path:info.outputPath("pattern-initial.png"),animations:"disabled"});await doubleOverview(root);await repeatRoot();
  const creator=creators[0];await focus(creator);await tap(creator);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===creator)?.open).toBe(true);
  const expanded=await snap();expect(expanded.ids.length).toBeGreaterThan(creators.length+1);await doubleOverview(creator);await focus(creator);
  for(let n=0;n<2;n++){await tap(creator);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===creator)?.open).toBe(false);expect((await snap()).ids).toContain(creator);await tap(creator);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===creator)?.open).toBe(true);await expect.poll(async()=>(await snap()).edges).toEqual(expanded.edges);expect((await snap()).points).toEqual(expanded.points);}
  const endpoint=first.routes.find(r=>r.route.nodeIds[1]===creator)!.route.nodeIds[2];await focus(endpoint);await tap(endpoint);
  await expect.poll(()=>pattern().entityState?.sources.some(s=>s.id===endpoint)).toBe(true);await doubleOverview(endpoint);
  await focus(endpoint);await tap(endpoint);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===endpoint)?.open).toBe(false);await tap(endpoint);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===endpoint)?.open).toBe(true);
  // The same endpoint remains supported when another creator owns its Claim.
  for(const id of creators){await focus(id);if(!pattern().entityState?.branches.find(b=>b.id===id)?.open){await tap(id);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===id)?.open).toBe(true);}}
  const shared=first.routes.find(r=>first.routes.some(other=>other.route.nodeIds[2]===r.route.nodeIds[2]&&other.route.nodeIds[1]!==r.route.nodeIds[1]))!;
  expect(shared).toBeTruthy();await focus(shared.route.nodeIds[1]);await tap(shared.route.nodeIds[1]);await expect.poll(()=>pattern().entityState?.branches.find(b=>b.id===shared.route.nodeIds[1])?.open).toBe(false);expect((await snap()).ids).toContain(shared.route.nodeIds[2]);
  const closed=pattern();await page.screenshot({path:info.outputPath("pattern-branches.png"),animations:"disabled"});
  const evidence=page.getByRole("region",{name:text.routes,exact:true});await evidence.getByRole("link").first().click();await expect(page.getByRole("dialog")).toContainText(locale==="en"?"Source":"出典");await page.getByRole("button",{name:readingLabels(locale).close,exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get("s")).toBeTruthy();await expect.poll(()=>model().execution).toEqual(closed);
  await openTool(ws.launch);let dialog=page.getByRole("dialog");await dialog.getByLabel(ws.name,{exact:true}).fill("unified branches");await dialog.getByRole("button",{name:ws.save,exact:true}).click();await expect(dialog).toContainText(ws.saved);await dialog.getByRole("button",{name:ws.close,exact:true}).click();
  await openTool(views.launch);dialog=page.getByRole("dialog");await dialog.getByLabel(views.name,{exact:true}).fill("unified pattern");await dialog.getByRole("button",{name:views.save,exact:true}).click();await expect(dialog).toContainText(views.saved);await dialog.getByRole("button",{name:views.close,exact:true}).click();await returnGraph();
  expect(new URL(page.url()).pathname).toBe((locale==="en"?"/en":"")+`/explore/${root}`);await page.reload();await expect.poll(()=>model().execution).toEqual(closed);await expect.poll(async()=>(await snap()).edges.length).toBeGreaterThan(0);
  await graph.getByRole("button",{name:text.free,exact:true}).click();await expect.poll(()=>model().relation.type).toBe("adjacent");await doubleOverview(root);await repeatRoot();
  await graph.getByRole("button",{name:overview.restore,exact:true}).click();await expect.poll(()=>model().execution).toEqual(closed);
  await openTool(views.launch);dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:views.openNamed("unified pattern"),exact:true}).click();await expect.poll(()=>pattern().entityState?.sources.length).toBe(1);await expect.poll(async()=>(await snap()).ids).toEqual([root,...creators].sort());
  await openTool(ws.launch);dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:ws.open,exact:true}).click();await expect.poll(()=>model().execution).toEqual(closed);
  expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await ctx.close();
});
