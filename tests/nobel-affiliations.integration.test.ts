import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, expect, it, vi } from "vitest";
import { chromium } from "@playwright/test";
import { openDatabase } from "../lib/server/neo4j";
import { loadPublicRelease } from "../lib/server/public-dataset";
import { applyPublicRelease, planPublicRelease } from "../lib/server/public-graph";
import { createPublicBackup, restorePublicBackup } from "../lib/server/public-backup";
import { searchEntities, getNeighbors, getEntityOverview, getClaim } from "../lib/server/graph";

vi.mock("server-only", () => ({}));
if (process.env.GRAPH_DATASET !== "public-kg" || process.env.NEO4J_URI !== "bolt://127.0.0.1:7695") throw Error("Only isolated public:integration DB is allowed");
const { driver, database } = openDatabase();
afterAll(async () => {
  await driver.close();
  await (globalThis as typeof globalThis & { graphReadDatabase?: ReturnType<typeof openDatabase> }).graphReadDatabase?.driver.close();
});

it("NobelとWikidataの実データを隔離DBへ追加し、冪等性・検索・ページング・根拠・実ブラウザ・復旧を確認", async () => {
  const started = Date.now();
  const mark = (stage: string) => console.log(JSON.stringify({ stage, elapsedMs: Date.now() - started }));
  const session = driver.session({ database });
  try { await session.run("MATCH (n) DETACH DELETE n"); } finally { await session.close(); }
  const base = await loadPublicRelease(), next = await loadPublicRelease("datasets/public-kg/releases/20261014-expanded-001");
  await applyPublicRelease(driver, database, base);
  const backup = await createPublicBackup(driver, database); mark("base backup");
  const plan = await planPublicRelease(driver, database, next);
  expect(plan.updated).toEqual([]);
  await applyPublicRelease(driver, database, next); mark("candidate applied");
  expect(await applyPublicRelease(driver, database, next)).toMatchObject({ unchanged: true, added: [], updated: [], relationshipsAdded: 0 });
  const current = await createPublicBackup(driver, database); mark("reapply and candidate backup");
  expect(current.payload.fixture.claims).toHaveLength(next.fixture.claims.length);
  const harvard = (await searchEntities("harvard university", 20, ["organization"])).items.find(e => e.name === "Harvard University")!;
  expect(harvard).toBeTruthy();
  const overview = await getEntityOverview(harvard.id);
  const group = overview.relations.find(r => r.predicate === "AFFILIATED_WITH")!;
  expect(group.perspective).toBe("object");
  const ids = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await getNeighbors(harvard.id, 5, cursor);
    for (const claim of page.claims) { expect(ids.has(claim.id)).toBe(false); ids.add(claim.id); }
    cursor = page.page.nextCursor;
  } while (cursor);
  expect(ids.size).toBe(group.counts.affirmed);
  expect(ids.size).toBeGreaterThan(20);
  const detail = await getClaim([...ids][0]);
  expect(JSON.stringify(detail)).toContain("受賞時");
  const filtered = await getNeighbors(harvard.id, 5, null, null, ["PRODUCING"]);
  expect(filtered.claims.length).toBe(5); // Contribution condition does not filter affiliation.
  const tokyo = (await searchEntities("東京大学", 20, ["organization"])).items.find(e => e.aliases.includes("東京大学"))!;
  expect(tokyo).toBeTruthy();
  const tokyoOverview = await getEntityOverview(tokyo.id);
  expect(tokyoOverview.relations.find(r => r.predicate === "AFFILIATED_WITH")!.counts.affirmed).toBeGreaterThan(900);
  mark("search, overview, pagination and Source verified");
  let web: ChildProcess | undefined;
  const browser = await chromium.launch({ headless: true });
  try {
    web = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3216"], { env: { ...process.env, MEMBER_STORAGE_ENABLED: "0" }, stdio: "ignore" });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (web.exitCode !== null) throw Error("Isolated Web exited; build .next-public first");
      try { const response = await fetch("http://127.0.0.1:3216/api/dataset"); if (response.ok) { ready = true; break; } } catch { /* bounded readiness */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    expect(ready).toBe(true);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    await page.goto("http://127.0.0.1:3216/"); mark("browser opened");
    await page.locator("#entity-search").fill("Harvard University");
    await page.locator("#explorer-search").getByRole("button", { name: "名前で検索", exact: true }).click();
    await page.locator("#explorer-search").getByRole("button", { name: /^Harvard University —/ }).click();
    await vi.waitFor(async () => expect(Number((await page.getByTestId("graph-counts").textContent())?.match(/Claim (\d+)/)?.[1] ?? 0)).toBeGreaterThan(0), { timeout: 15000 });
    mark("Harvard Graph loaded");
    const entityDetail = page.getByRole("region", { name: "Entity詳細" });
    await entityDetail.getByRole("button", { name: "関係概要を見る", exact: true }).click();
    await page.getByRole("dialog").getByText("Harvard University", { exact: true }).first().waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByTestId("graph-canvas").evaluate(el => {
      const cy = (el as unknown as { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy;
      cy.edges().first().emit("tap");
    });
    await page.getByRole("region", { name: "Claim詳細" }).getByText(/受賞時/).first().waitFor(); mark("browser Source verified");
    await page.screenshot({ path: "test-results/nobel-harvard.png" });
    console.log(JSON.stringify({ dataset: "isolated", entities: next.fixture.entities.length, claims: next.fixture.claims.length, harvardClaims: ids.size, browser: "Harvard search -> Graph -> overview -> Claim/Citation", elapsed: "measured by test runner" }));
  } finally {
    await browser.close();
    if (web && web.exitCode === null) { const stopped = new Promise<void>(resolve => web!.once("exit", () => resolve())); web.kill("SIGTERM"); const kill = setTimeout(() => web?.kill("SIGKILL"), 5000); await stopped; clearTimeout(kill); }
  }
  await restorePublicBackup(driver, database, backup, current.payload.revision);
  const restored = await createPublicBackup(driver, database);
  expect(restored.payload.fixture.claims).toHaveLength(27);
}, 300000);
