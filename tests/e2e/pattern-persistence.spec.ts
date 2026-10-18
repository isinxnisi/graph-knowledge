import { test, expect } from "@playwright/test";
import { decodeExploration, encodeExploration } from "../../lib/client/exploration-url";
import { entryLabels } from "../../lib/i18n/exploration-entry";
import { relationText } from "../../lib/i18n/relation-condition";
const root="2b7c6289-d050-4dc0-93e3-9307681253cc";
test("old pattern URL restores verified references as Entity branches",async({page},info)=>{
  await page.goto(info.project.use.baseURL!+`/explore/${root}`);
  await page.locator("#explorer-graph").getByRole("button",{name:entryLabels("ja").edit,exact:true}).click();await page.getByRole("radio",{name:relationText("ja").pattern,exact:true}).check();await page.getByRole("button",{name:entryLabels("ja").apply,exact:true}).click();
  const model=()=>decodeExploration(new URL(page.url()).searchParams.get("s")!,root,"public-kg");await expect.poll(()=>model().relation.type).toBe("pattern");
  const legacy=model();if(legacy.execution.type!=="pattern")throw Error();delete legacy.execution.entityState;legacy.execution.routes.forEach(r=>{r.open=true;});
  await page.goto(info.project.use.baseURL!+`/explore/${root}?s=${encodeExploration(legacy)}`);
  const ids=[...new Set(legacy.execution.routes.flatMap(r=>r.route.nodeIds))].sort();
  await expect.poll(()=>page.getByTestId("graph-canvas").evaluate(el=>(el as unknown as {_cyreg:{cy:import("cytoscape").Core}})._cyreg.cy.nodes().map(n=>n.id()).sort())).toEqual(ids);
  await expect.poll(()=>{const ex=model().execution;return ex.type==="pattern"&&ex.entityState?.version;}).toBe(1);
  expect(model().relation).toEqual(legacy.relation);expect(model().observedRevision).toBe(legacy.observedRevision);
});
