import { assertDemoTestTarget } from "../lib/domain/dataset";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Driver } from "neo4j-driver";
import type { Fixture } from "../lib/domain/fixture";
import type { EntityOverviewResponse, ClaimResponse, EntityResponse, EntitySearchResponse, NeighborsResponse } from "../lib/domain/api";
import { openDatabase } from "../lib/server/neo4j";
import { graphSnapshot, loadFixture, seedFixture } from "../lib/server/seed";

vi.setConfig({ testTimeout: 30000 });

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
let fixture: Fixture;
let driver: Driver;
let database: string;
let app: ChildProcess | undefined;
let baseUrl: string;
let serverLog = "";
let stopped = false;
let initialSnapshot: Awaited<ReturnType<typeof graphSnapshot>>;
const examples: Record<string, unknown> = {};

async function request<T>(path: string, status = 200, method = "GET"): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { method, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  expect(response.status, `${path}: ${text}`).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return JSON.parse(text) as T;
}

async function write(query: string, params: Record<string, unknown>) {
  const session = driver.session({ database });
  try { await session.run(query, params); } finally { await session.close(); }
}

async function restartDb() {
  await exec("docker", ["compose", "up", "-d", "--wait", "--wait-timeout", "180", "neo4j"], { timeout: 190000 });
  stopped = false;
}

beforeAll(async () => {
  fixture = await loadFixture();
  ({ driver, database } = openDatabase());
  assertDemoTestTarget();
  await driver.verifyConnectivity();
  await seedFixture(driver, database, fixture);
  initialSnapshot = await graphSnapshot(driver, database);
  if (process.env.API_TEST_BASE_URL) { baseUrl = process.env.API_TEST_BASE_URL; return; }
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  baseUrl = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), detached: process.platform !== "win32",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"],
  });
  const log = (chunk: Buffer) => { serverLog = (serverLog + chunk.toString()).slice(-16000); };
  app.stdout?.on("data", log); app.stderr?.on("data", log);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error(`Next.js exited: ${serverLog}`);
    try {
      const response = await fetch(`${baseUrl}/api/entities?q=`, { signal: AbortSignal.timeout(10000) });
      if (response.status === 400) return;
    } catch { /* Wait for Next.js and initial route compilation. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not become ready: ${serverLog}`);
}, 150000);

afterAll(async () => {
  try {
    if (stopped) await restartDb();
    if (driver && initialSnapshot) expect(await graphSnapshot(driver, database)).toEqual(initialSnapshot);
    if (process.env.API_RESPONSE_EXAMPLES_PATH) {
      await writeFile(process.env.API_RESPONSE_EXAMPLES_PATH, JSON.stringify(examples, null, 2) + "\n");
    }
  } finally {
    if (app?.pid && app.exitCode === null) {
      if (process.platform === "win32") app.kill("SIGTERM");
      else {
        try { process.kill(-app.pid, "SIGTERM"); } catch { /* Already stopped. */ }
      }
      await Promise.race([new Promise((resolve) => app!.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    if (driver) await driver.close();
  }
}, 200000);

it("searches 青葉ハル by name and alias and includes works and organizations", async () => {
  const result = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("青葉ハル")}`);
  expect(result.items).toEqual([{ id: fixture.entities[0].id, kind: "person", name: "青葉ハル", description: fixture.entities[0].description, aliases: fixture.entities[0].aliases, event: null }]);
  expect(result.hasMore).toBe(false);
  const alias = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent(" あおば はる ")}`);
  expect(alias.items[0].id).toBe(fixture.entities[0].id);
  const work = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("星の航路")}`);
  expect(work.items[0].kind).toBe("work");
  expect((await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("青空出版")}`)).items[0].kind).toBe("organization");
  expect((await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("星の航路")}&kind=person`)).items).toEqual([]);
  expect((await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("星の航路")}&kind=work&limit=1`)).items).toEqual(work.items);
  examples.search = result;
});

it("returns two distinct 佐藤アキ entities and honors search limit", async () => {
  const path = `/api/entities?q=${encodeURIComponent("佐藤アキ")}`;
  const result = await request<EntitySearchResponse>(path);
  expect(result.items).toHaveLength(2);
  expect(new Set(result.items.map((entity) => entity.id)).size).toBe(2);
  expect(new Set(result.items.map((entity) => entity.description)).size).toBe(2);
  const limited = await request<EntitySearchResponse>(`${path}&limit=1`);
  expect(limited.items).toEqual(result.items.slice(0, 1));
  expect(limited.hasMore).toBe(true);
});

it("orders exact name/alias matches first, then name and ID", async () => {
  const partial = randomUUID(); const exact = randomUUID();
  try {
    await write(`CREATE (:Entity {id: $partial, kind: 'person', name: 'あ', searchNames: ['青葉ハル追加'], aliases: []}),
                        (:Entity {id: $exact, kind: 'person', name: 'い', searchNames: ['い', '青葉ハル'], aliases: ['青葉ハル']})`, { partial, exact });
    const result = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("青葉ハル")}`);
    expect(result.items.map((e) => e.id)).toEqual([exact, fixture.entities[0].id, partial]);
  } finally { await write("MATCH (e:Entity) WHERE e.id IN $ids DELETE e", { ids: [partial, exact] }); }
});

it("treats a Cypher-like search string as data", async () => {
  const result = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("' MATCH (n) DETACH DELETE n //")}`);
  expect(result.items).toEqual([]);
});

it("returns Entity detail without storage fields", async () => {
  const result = await request<EntityResponse>(`/api/entities/${fixture.entities[0].id}`);
  expect(result.entity.aliases).toEqual(["あおば はる"]);
  expect(Object.keys(result.entity).sort()).toEqual(["aliases", "description", "event", "id", "kind", "name"]);
  examples.entity = result;
});

it("gets one-hop neighbors from both directions with denied claims and distinct nodes", async () => {
  const id = fixture.entities[0].id;
  const result = await request<NeighborsResponse>(`/api/entities/${id}/neighbors`);
  const expected = fixture.claims.filter((claim) => claim.subjectId === id || claim.objectId === id).map((c) => c.id).sort();
  expect(result.claims.map((claim) => claim.id)).toEqual(expected);
  expect(result.claims.some((c) => c.subjectId === id)).toBe(true);
  expect(result.claims.some((c) => c.objectId === id)).toBe(true);
  expect(result.claims.some((c) => c.polarity === "denied")).toBe(true);
  expect(result.nodes[0].id).toBe(id);
  expect(new Set(result.nodes.map((e) => e.id)).size).toBe(result.nodes.length);
  expect(result.nodes.some((e) => e.id === fixture.entities[2].id)).toBe(false); // Two hops via P2/W1.
  expect(result.claims.find((c) => c.id === fixture.claims[0].id)?.sourceCount).toBe(2);
  examples.neighbors = result;
});

it("discovers the same assistant claim from its object and a work contribution from the work", async () => {
  const object = await request<NeighborsResponse>(`/api/entities/${fixture.entities[1].id}/neighbors`);
  expect(object.claims.some((c) => c.id === fixture.claims[0].id)).toBe(true);
  const work = await request<NeighborsResponse>(`/api/entities/${fixture.entities[8].id}/neighbors`);
  expect(work.claims.some((c) => c.id === fixture.claims[6].id)).toBe(true);
});

it("pages by Claim ID without gaps, duplicated claims, or extra endpoint nodes", async () => {
  const id = fixture.entities[0].id;
  const ids: string[] = [];
  let after: string | null = null;
  for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
    const result: NeighborsResponse = await request<NeighborsResponse>(`/api/entities/${id}/neighbors?limit=2${after ? `&after=${after}` : ""}`);
    expect(result.claims.length).toBeLessThanOrEqual(2);
    const expectedNodes = new Set([id, ...result.claims.flatMap((c) => [c.subjectId, c.objectId])]);
    expect(new Set(result.nodes.map((e) => e.id))).toEqual(expectedNodes);
    ids.push(...result.claims.map((claim) => claim.id));
    if (!result.page.hasMore) { expect(result.page.nextCursor).toBeNull(); break; }
    expect(result.page.nextCursor).toBe(result.claims.at(-1)?.id);
    after = result.page.nextCursor;
  }
  expect(ids).toEqual(fixture.claims.filter((c) => c.subjectId === id || c.objectId === id).map((c) => c.id).sort());
  expect(new Set(ids).size).toBe(ids.length);
  const end = await request<NeighborsResponse>(`/api/entities/${id}/neighbors?after=${ids.at(-1)}`);
  expect(end.claims).toEqual([]);
  expect(end.nodes.map((e) => e.id)).toEqual([id]);
});

it("only exposes published Claims, including relatedClaimIds", async () => {
  const id = fixture.claims[1].id;
  try {
    await write("MATCH (c:Claim {id: $id}) SET c.visibility = 'hidden'", { id });
    const neighbors = await request<NeighborsResponse>(`/api/entities/${fixture.entities[0].id}/neighbors`);
    expect(neighbors.claims.some((c) => c.id === id)).toBe(false);
    const related = await request<ClaimResponse>(`/api/claims/${fixture.claims[0].id}`);
    expect(related.relatedClaimIds).toEqual([fixture.claims[2].id]);
    await request(`/api/claims/${id}`, 404);
  } finally { await write("MATCH (c:Claim {id: $id}) SET c.visibility = 'published'", { id }); }
});

it("returns period, polarity, multiple Citation/Source and all other Claims of the same relation", async () => {
  const result = await request<ClaimResponse>(`/api/claims/${fixture.claims[0].id}`);
  expect(result.claim.period).toEqual({ from: { value: "2001", precision: "year" }, to: { value: "2003", precision: "year" } });
  expect(result.claim.polarity).toBe("affirmed");
  expect(result.claim.citations).toHaveLength(2);
  expect(new Set(result.claim.citations.map((r) => r.source.id)).size).toBe(2);
  expect(result.claim.citations.map((r) => r.locator).sort()).toEqual(["pp.12–13", "第2節"].sort());
  expect(result.relatedClaimIds).toEqual([fixture.claims[1].id, fixture.claims[2].id].sort());
  expect(JSON.stringify(result)).not.toMatch(/validFromValue|validFromPrecision|visibility|searchNames|elementId/);
  examples.claim = result;
  const denied = await request<ClaimResponse>(`/api/claims/${fixture.claims[2].id}`);
  expect(denied.claim.polarity).toBe("denied");
  expect(denied.claim.citations[0].stance).toBe("support");
});

it("preserves month precision, unknown endpoints, publication dates and nulls", async () => {
  const month = await request<ClaimResponse>(`/api/claims/${fixture.claims[7].id}`);
  expect(month.claim.period.from).toEqual({ value: "2006-04", precision: "month" });
  const unknownEnd = await request<ClaimResponse>(`/api/claims/${fixture.claims[8].id}`);
  expect(unknownEnd.claim.period.to).toBeNull();
  expect(unknownEnd.claim.citations[0].source.publishedAt).toEqual({ value: "2012-03-15", precision: "day" });
  expect(unknownEnd.claim.citations[0].source.url).toBeNull();
});

it("returns an unsourced Claim with sourceCount zero and citations empty", async () => {
  const result = await request<ClaimResponse>(`/api/claims/${fixture.claims[12].id}`);
  expect(result.claim.sourceCount).toBe(0);
  expect(result.claim.citations).toEqual([]);
  expect(result.claim.period).toEqual({ from: null, to: null });
  expect(result.relatedClaimIds).toEqual([]);
  examples.unsourced = result;
});

it("returns the center only for an isolated Entity", async () => {
  const id = fixture.entities[7].id;
  const result = await request<NeighborsResponse>(`/api/entities/${id}/neighbors`);
  expect(result.centerId).toBe(id);
  expect(result.nodes.map((e) => e.id)).toEqual([id]);
  expect(result.claims).toEqual([]);
  expect(result.page).toEqual({ nextCursor: null, hasMore: false });
});

it("returns 400 for invalid UUID/q/limit/cursor and 404 for absent IDs", async () => {
  for (const path of ["/api/entities/not-a-uuid", "/api/entities/not-a-uuid/neighbors", "/api/claims/not-a-uuid",
    "/api/entities", "/api/entities?q=", `/api/entities?q=${"x".repeat(101)}`, "/api/entities?q=x&limit=21",
    `/api/entities/${fixture.entities[0].id}/neighbors?limit=51`, `/api/entities/${fixture.entities[0].id}/neighbors?after=bad`]) {
    const result = await request<{ error: { code: string } }>(path, 400);
    expect(result.error.code).toBe("INVALID_ARGUMENT");
  }
  const missing = randomUUID();
  for (const path of [`/api/entities/${missing}`, `/api/entities/${missing}/neighbors`, `/api/claims/${missing}`]) {
    const result = await request<{ error: { code: string } }>(path, 404);
    expect(result.error.code).toBe("NOT_FOUND");
  }
});

it("returns 405 for every unsupported standard method on all routes", async () => {
  for (const path of ["/api/entities?q=x", `/api/entities/${fixture.entities[0].id}`, `/api/entities/${fixture.entities[0].id}/neighbors`, `/api/entities/${fixture.entities[0].id}/overview`, `/api/claims/${fixture.claims[0].id}`]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (method !== "HEAD") expect((await response.json()).error.code).toBe("INVALID_ARGUMENT");
      else expect(await response.text()).toBe("");
    }
  }
});

it("returns sanitized 500 for invalid stored data, not 400", async () => {
  const id = fixture.claims[0].id;
  try {
    await write("MATCH (c:Claim {id: $id}) SET c.predicate = 'INVALID_STORED_PREDICATE'", { id });
    const result = await request<{ error: { code: string; message: string } }>(`/api/claims/${id}`, 500);
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(result)).not.toMatch(/INVALID_STORED|Cypher|password|bolt/);
    examples.internalError = result;
  } finally { await write("MATCH (c:Claim {id: $id}) SET c.predicate = $predicate", { id, predicate: fixture.claims[0].predicate }); }
});

it("filters before LIMIT, pages both directions and retains denied Claims", async () => {
  const center = fixture.entities[0].id;
  const expected = fixture.claims.filter((claim) => (claim.subjectId === center || claim.objectId === center) && ["ASSISTANT_OF", "INFLUENCED_BY"].includes(claim.predicate)).map((claim) => claim.id).sort();
  const found: string[] = []; let cursor: string | null = null;
  for (let index = 0; index < 20; index++) {
    const params = new URLSearchParams({ predicates: index % 2 ? "INFLUENCED_BY,ASSISTANT_OF,ASSISTANT_OF" : "ASSISTANT_OF,INFLUENCED_BY", limit: "2" });
    if (cursor) params.set("after", cursor);
    const result = await request<NeighborsResponse>(`/api/entities/${center}/neighbors?${params}`);
    expect(result.claims.length).toBeLessThanOrEqual(2);
    expect(result.claims.every((claim) => ["ASSISTANT_OF", "INFLUENCED_BY"].includes(claim.predicate))).toBe(true);
    expect(new Set(result.nodes.map((node) => node.id))).toEqual(new Set([center, ...result.claims.flatMap((claim) => [claim.subjectId, claim.objectId])]));
    found.push(...result.claims.map((claim) => claim.id));
    if (!result.page.hasMore) break;
    cursor = result.page.nextCursor;
  }
  expect(found).toEqual(expected);
  const object = await request<NeighborsResponse>(`/api/entities/${fixture.entities[1].id}/neighbors?predicates=ASSISTANT_OF`);
  expect(object.claims.some((claim) => claim.polarity === "denied")).toBe(true);
});

it("rejects cross-condition cursors and distinguishes empty matches from all relations", async () => {
  const center = fixture.entities[0].id;
  const first = await request<NeighborsResponse>(`/api/entities/${center}/neighbors?predicates=ASSISTANT_OF&limit=1`);
  const cursor = encodeURIComponent(first.page.nextCursor!);
  for (const path of [
    `/api/entities/${center}/neighbors?predicates=INFLUENCED_BY&after=${cursor}`,
    `/api/entities/${fixture.entities[1].id}/neighbors?predicates=ASSISTANT_OF&after=${cursor}`,
    `/api/entities/${center}/neighbors?after=${cursor}`,
    `/api/entities/${center}/neighbors?predicates=ASSISTANT_OF&after=${fixture.claims[0].id}`,
    `/api/entities/${center}/neighbors?predicates=UNKNOWN`,
    `/api/entities/${center}/neighbors?predicates=ASSISTANT_OF&predicates=INFLUENCED_BY`,
    `/api/entities/${center}/neighbors?time=2000`,
  ]) await request(path, 400);
  const late = await request<NeighborsResponse>(`/api/entities/${center}/neighbors?predicates=CONTRIBUTED_TO&limit=1`);
  expect(late.claims.map((claim) => claim.id)).toEqual([fixture.claims[6].id]);
  const empty = await request<NeighborsResponse>(`/api/entities/${center}/neighbors?predicates=`);
  expect(empty.claims).toEqual([]); expect(empty.nodes.map((node) => node.id)).toEqual([center]);
  expect(empty.page).toEqual({ hasMore: false, nextCursor: null });
  const detail = await request<ClaimResponse>(`/api/claims/${fixture.claims[0].id}`);
  expect(detail.relatedClaimIds).toHaveLength(2);
  expect(detail.claim.citations).toHaveLength(2);
});

it("returns 503 with the real DB stopped, then recovers after restarting", async () => {
  stopped = true;
  try {
    await exec("docker", ["compose", "stop", "neo4j"], { timeout: 40000 });
    for (const path of [`/api/entities?q=${encodeURIComponent("青葉ハル")}`, `/api/entities/${fixture.entities[0].id}`,
      `/api/entities/${fixture.entities[0].id}/neighbors`, `/api/entities/${fixture.entities[0].id}/overview`, `/api/claims/${fixture.claims[0].id}`]) {
      const result = await request<{ error: { code: string; message: string } }>(path, 503);
      expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(JSON.stringify(result)).not.toMatch(/password|bolt|Neo4jError|ECONNREFUSED/);
      examples.unavailable = result;
    }
    await request("/api/entities?q=", 400); // Invalid requests still validate without DB access.
  } finally { await restartDb(); }
  // コンテナの疎通成功後も、アプリの既存driverの再接続を最大30秒待つ。
  await expect.poll(async () => {
    const response = await fetch(`${baseUrl}/api/entities?q=${encodeURIComponent("青葉ハル")}`, { signal: AbortSignal.timeout(10000) });
    return response.status;
  }, { timeout: 30000, interval: 1000 }).toBe(200);
  const recovered = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("青葉ハル")}`);
  expect(recovered.items[0].id).toBe(fixture.entities[0].id);
}, 240000);

it("overview counts all published Claims by viewpoint without citations/pages/filters", async () => {
  const id = fixture.entities[0].id;
  const overview = await request<EntityOverviewResponse>(`/api/entities/${id}/overview`);
  expect(overview.scope).toEqual({ dataset: "demo", visibility: "published", filtered: false, unit: "claim" });
  const assistant = overview.relations.find((r) => r.predicate === "ASSISTANT_OF" && r.perspective === "subject")!;
  expect(assistant.counts).toEqual({ affirmed: 2, denied: 1 });
  expect(overview.relations.filter((r) => r.predicate === "INFLUENCED_BY").map((r) => r.perspective).sort()).toEqual(["object", "subject"]);
  const first = await request<NeighborsResponse>(`/api/entities/${id}/neighbors?limit=1&predicates=CONTRIBUTED_TO`);
  expect(first.claims).toHaveLength(1);
  expect(overview.relations).toHaveLength(5);
  expect(JSON.stringify(overview)).not.toMatch(/citation|sourceCount|nextCursor|claimIds/);
  for (const entity of fixture.entities) {
    const value = await request<EntityOverviewResponse>(`/api/entities/${entity.id}/overview`);
    for (const row of value.relations) for (const polarity of ["affirmed", "denied"] as const) {
      expect(row.counts[polarity]).toBe(fixture.claims.filter((c) => c.visibility === "published" && c.predicate === row.predicate && c.polarity === polarity && (row.perspective === "subject" ? c.subjectId : c.objectId) === entity.id).length);
    }
    if (!fixture.claims.some((c) => [c.subjectId, c.objectId].includes(entity.id))) expect(value.relations).toEqual([]);
  }
  const ids = fixture.claims.filter((c) => c.subjectId === id && c.predicate === "ASSISTANT_OF" && c.polarity === "affirmed").map((c) => c.id);
  try {
    await write("MATCH(c:Claim) WHERE c.id IN $ids SET c.visibility='hidden'", { ids });
    const value = await request<EntityOverviewResponse>(`/api/entities/${id}/overview`);
    expect(value.relations.find((r) => r.predicate === "ASSISTANT_OF")?.counts).toEqual({ affirmed: 0, denied: 1 });
  } finally { await write("MATCH(c:Claim) WHERE c.id IN $ids SET c.visibility='published'", { ids }); }
  await request(`/api/entities/${id}/overview?predicates=CONTRIBUTED_TO`, 400);
  await request(`/api/entities/invalid/overview`, 400);
  await request(`/api/entities/${randomUUID()}/overview`, 404);
  await request(`/api/entities/${id}/overview`, 405, "POST");
  try {
    await write("MATCH(c:Claim {id:$id}) SET c.polarity='invalid'", { id: fixture.claims[0].id });
    await request(`/api/entities/${id}/overview`, 500);
  } finally { await write("MATCH(c:Claim {id:$id}) SET c.polarity=$polarity", { id: fixture.claims[0].id, polarity: fixture.claims[0].polarity }); }
});

it("filters search kind before limit and validates the generic search contract", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  try {
    await write(`UNWIND $rows AS row CREATE (e:Entity) SET e = row`, { rows: ids.map((id, index) => ({ id, kind: ["person", "work", "organization", "event"][index], name: "検索境界対象", aliases: ["共通別名"], searchNames: ["検索境界対象", "共通別名"], ...(index === 3 ? { eventGranularity: "occurrence" } : {}) })) });
    const all = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("共通別名")}`);
    expect(all.items).toHaveLength(4);
    expect(new Set(all.items.map((item) => item.kind))).toEqual(new Set(["person", "work", "organization", "event"]));
    for (const kind of ["person", "work", "organization", "event"]) {
      const result = await request<EntitySearchResponse>(`/api/entities?q=${encodeURIComponent("共通別名")}&kind=${kind}&limit=1`);
      expect(result.items).toHaveLength(1); expect(result.items[0].kind).toBe(kind); expect(result.hasMore).toBe(false);
      expect(result.items[0].aliases).toEqual(["共通別名"]);
    }
    expect((await request<EntitySearchResponse>("/api/entities?q=存在しない対象")).items).toEqual([]);
    for (const query of ["q=x&kind=future", "q=x&kind=", "q=x&kind=work&kind=person", "q=x&predicates=CONTRIBUTED_TO", "q=%20%20", `q=${"a".repeat(101)}`]) await request(`/api/entities?${query}`, 400);
  } finally { await write("MATCH (e:Entity) WHERE e.id IN $ids DETACH DELETE e", { ids }); }
});
