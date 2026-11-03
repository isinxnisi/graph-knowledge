import { capsuleUpdateResponseSchema } from "../lib/domain/capsule-updates";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import neo4j from "neo4j-driver";
import { createKnowledgeFoundationService } from "../lib/server/knowledge-foundation";
import { createKnowledgePublicationService, ensureKnowledgePublicationSchema } from "../lib/server/knowledge-publication";
import { adaptLegacyKnowledge } from "../lib/domain/knowledge-legacy";
import { knowledgeEntityQuerySchema, knowledgeThemeReadQuerySchema } from "../lib/domain/knowledge-theme-reader";
import { knowledgeRecordContentSchema, type KnowledgeActor, type KnowledgeRecordVersion } from "../lib/domain/knowledge-foundation";

const url = process.env.KNOWLEDGE_TEST_DATABASE_URL;
const password = process.env.KNOWLEDGE_TEST_NEO4J_PASSWORD;
const operator: KnowledgeActor = { kind: "operator", id: "theme-reader-test" };
const command = (action: string, rest: Record<string, unknown>) => ({ requestId: randomUUID(), action, reason: "固定テーマ読取の検証", ...rest });
const evidence = (prefix: string) => [{ id: "e", source: { id: prefix + "s", revision: 1 }, locator: "第1章" }];
const relation = (prefix: string) => knowledgeRecordContentSchema.parse({ kind: "relation", subjectId: prefix + "a", objectId: prefix + "b", assertion: "具体的な支援", relation: "観測を手伝った", evidence: evidence(prefix) });

describe("public Theme reader input", () => {
  it("requires an exact positive revision and bounded entity query", () => {
    expect(knowledgeThemeReadQuerySchema.safeParse({ themeId: "theme", revision: 0 }).success).toBe(false);
    expect(knowledgeEntityQuerySchema.safeParse({ entityId: "../private" }).success).toBe(false);
    expect(knowledgeEntityQuerySchema.safeParse({ q: "a\nb" }).success).toBe(false);
    expect(knowledgeEntityQuerySchema.parse({ entityId: "entity-1" })).toMatchObject({ entityId: "entity-1", limit: 20 });
  });
});

describe.skipIf(!url || !password)("public fixed Theme and generation Entity reads", () => {
  const pool = new Pool({ connectionString: url, max: 5 });
  const driver = neo4j.driver("bolt://127.0.0.1:7698", neo4j.auth.basic("neo4j", password ?? "not-used"), { maxConnectionPoolSize: 2 });
  const foundation = createKnowledgeFoundationService(pool);
  const publication = createKnowledgePublicationService(pool, driver);
  const run = (action: string, rest: Record<string, unknown>) => foundation.execute(operator, command(action, rest));
  const seed = async (prefix: string, visibility = "public") => run("create-bundle", {
    entities: [{ id: prefix + "a", content: { name: prefix + "人物", aliases: [prefix + "同じ別名"], kind: "person" } }, { id: prefix + "b", content: { name: prefix + "組織", aliases: [prefix + "同じ別名"], kind: "organization" } }],
    sources: [{ id: prefix + "s", content: { title: prefix + "根拠", bibliography: "初版" } }],
    records: [{ id: prefix + "r", content: relation(prefix) }], visibility,
  });
  const theme = (prefix: string) => run("create-theme", { id: prefix + "t", title: prefix + "テーマ", description: "原本の名称と根拠版を保つ", recordPins: [{ id: prefix + "r", revision: 1 }], initialView: "graph" });
  const correct = (kind: string, id: string, expectedRevision: number, content: unknown) => run("correct", { kind, id, expectedRevision, content });
  const visibility = (kind: string, id: string, value: string, expectedStatusRevision = 1) => run("set-visibility", { kind, id, visibility: value, expectedStatusRevision });
  const publish = async () => { const r = await publication.publishPending(); expect(r.active).not.toBeNull(); return r.active!.id; };
  beforeAll(async () => {
    expect((await pool.query("SELECT current_database() AS n")).rows[0].n).toMatch(/^plunode_knowledge75_test_/);
    await driver.verifyConnectivity(); await ensureKnowledgePublicationSchema(pool);
  }, 90000);
  afterAll(async () => { await pool.end(); await driver.close(); });

  it("reads a fixed Theme before any public generation exists and preserves versioned meanings", async () => {
    await seed("fixed-");
    await run("set-mapping", { recordId: "fixed-r", expectedMappingRevision: 0, recordRevision: 1, concept: { id: "help", revision: 1, label: "旧意味", definition: "支援" } });
    await theme("fixed-");
    expect((await publication.status()).active).toBeNull();
    const old = await publication.theme({ themeId: "fixed-t", revision: 1 });
    expect(old.records[0].semantics.concept?.label).toBe("旧意味");
    const beforeGeneration=capsuleUpdateResponseSchema.parse(await publication.capsuleUpdates({recordIds:[],entityIds:[],theme:{id:"fixed-t",revision:1},includeTheme:true}));
    expect(beforeGeneration.generation).toBeNull();expect(beforeGeneration.snapshot).toEqual(old.snapshot);
    const first = await publish();
    await correct("entity", "fixed-a", 1, { name: "新版の人物名", kind: "person" });
    await correct("source", "fixed-s", 1, { title: "新版資料", bibliography: "第二版" });
    await correct("record", "fixed-r", 1, { ...relation("fixed-"), assertion: "訂正された記録", evidence: [{ ...evidence("fixed-")[0], source: { id: "fixed-s", revision: 2 } }] });
    await run("set-mapping", { recordId: "fixed-r", expectedMappingRevision: 1, recordRevision: 2, concept: { id: "help", revision: 2, label: "新版意味", definition: "新たな支援解釈" } });
    const current = await publish(); expect(current).not.toBe(first);
    expect(await publication.theme({ themeId: "fixed-t" })).toEqual(old);
    const diff = await foundation.diffTheme(operator, "fixed-t");
    await run("refresh-theme", { id: "fixed-t", expectedRevision: 1, refreshToken: diff.refreshToken });
    const newer = await publication.theme({ themeId: "fixed-t" });
    expect(newer.theme.revision).toBe(2);
    expect(newer.records[0].record.revision).toBe(2);
    expect(newer.records[0].entities.find(e => e.id === "fixed-a")?.content.name).toBe("新版の人物名");
    expect(newer.records[0].sources[0].revision).toBe(2);
    expect(newer.records[0].semantics.concept?.label).toBe("新版意味");
    expect(await publication.theme({ themeId: "fixed-t", revision: 1 })).toEqual(old);
    expect((await publication.themes({ entityId: "fixed-a" })).themes).toEqual([expect.objectContaining({ id: "fixed-t", revision: 2, hasTimeline: false })]);
  });

  it("compares captured records separately from fixed Theme composition and gates stopped references",async()=>{
    await seed("updates-");await theme("updates-");await publish();
    await correct("entity","updates-a",1,{name:"訂正した公開名",kind:"person"});
    await correct("record","updates-r",1,{...relation("updates-"),assertion:"訂正した原文"});
    // Unpublished current content must not be exposed through comparison.
    const pending=capsuleUpdateResponseSchema.parse(await publication.capsuleUpdates({recordIds:["updates-r"],entityIds:["updates-a"]}));
    expect(pending.snapshot.records[0].revision).toBe(1);expect(pending.snapshot.entities.find(e=>e.id==="updates-a")?.revision).toBe(1);
    await publish();
    const current=capsuleUpdateResponseSchema.parse(await publication.capsuleUpdates({recordIds:["updates-r"],entityIds:["updates-a"]}));
    expect(current.snapshot.records[0].revision).toBe(2);expect(current.snapshot.entities.find(e=>e.id==="updates-a")?.content.name).toBe("訂正した公開名");
    const fixed=capsuleUpdateResponseSchema.parse(await publication.capsuleUpdates({recordIds:["updates-r"],entityIds:[],theme:{id:"updates-t",revision:1},includeTheme:true}));
    expect(fixed.theme?.revision).toBe(1);expect(fixed.snapshot.records[0].revision).toBe(1);
    await visibility("source","updates-s","hidden");
    const stopped=capsuleUpdateResponseSchema.parse(await publication.capsuleUpdates({recordIds:["updates-r"],entityIds:[]}));
    expect(stopped.snapshot.records).toEqual([]);expect(stopped.unavailable).toEqual([{kind:"record",id:"updates-r"}]);
    expect(JSON.stringify(stopped)).not.toContain("訂正した原文");
    await expect(publication.capsuleUpdates({recordIds:[],entityIds:[],theme:{id:"updates-t",revision:1},includeTheme:true})).rejects.toMatchObject({status:404});
  });

  it("retains timeline-only periods and multiple annotations without inventing Entity nodes", async () => {
    await run("create-bundle", { sources: [{ id: "period-s", content: { title: "期間の資料", bibliography: "1901年から1904年" } }], records: [{ id: "period-r", content: { kind: "note", assertion: "青の時代についての記述", times: [{ id: "duration", time: { kind: "calendar", from: "1901", to: "1904", label: "青の時代" } }, { id: "occurrence", time: { kind: "calendar", from: "1902", label: "資料の記述" } }], evidence: evidence("period-") } }] });
    const timeline = { version: 1, axes: [{ id: "year", kind: "calendar", label: "暦年" }], placements: [{ recordId: "period-r", timeId: "duration", axisId: "year" }, { recordId: "period-r", timeId: "occurrence", axisId: "year" }], insets: [] };
    await run("create-theme", { id: "period-t", title: "期間を読む", recordPins: [{ id: "period-r", revision: 1 }], timeline, initialView: "split" });
    const read = await publication.theme({ themeId: "period-t" });
    expect(read.snapshot.timeline).toEqual(timeline);
    expect(read.snapshot.entities).toEqual([]);
    expect(read.records[0].entities).toEqual([]);
    expect(read.records[0].record.content.times).toHaveLength(2);
    expect(read.records[0].record.content.subjectId).toBeNull();
    expect((await publication.themes({ q: "期間" })).themes).toEqual([expect.objectContaining({ id: "period-t", hasTimeline: true, initialView: "split", entityIds: [] })]);
  });

  it.each(["theme", "record", "entity", "source"])("removes %s-stopped Themes from catalogs, related results and exact historical reads", async kind => {
    const prefix = "gate-" + kind + "-"; await seed(prefix); await theme(prefix);
    expect((await publication.themes({ entityId: prefix + "a" })).themes.map(t => t.id)).toEqual([prefix + "t"]);
    const id = prefix + ({ theme: "t", record: "r", entity: "a", source: "s" }[kind]!);
    await visibility(kind, id, "hidden");
    expect((await publication.themes({ q: prefix })).themes).toEqual([]);
    expect((await publication.themes({ entityId: prefix + "a" })).themes).toEqual([]);
    await expect(publication.theme({ themeId: prefix + "t", revision: 1 })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("does not disclose a never-public Theme revision when later content is published", async () => {
    await seed("draft-"); await theme("draft-"); await visibility("theme", "draft-t", "private");
    await correct("record", "draft-r", 1, { ...relation("draft-"), assertion: "private theme snapshot" });
    await run("refresh-theme", { id: "draft-t", expectedRevision: 1, refreshToken: (await foundation.diffTheme(operator, "draft-t")).refreshToken });
    await correct("record", "draft-r", 2, { ...relation("draft-"), assertion: "published theme snapshot" });
    await run("refresh-theme", { id: "draft-t", expectedRevision: 2, refreshToken: (await foundation.diffTheme(operator, "draft-t")).refreshToken });
    const status = (await foundation.list(operator)).statuses.find(s => s.kind === "theme" && s.id === "draft-t")!;
    await visibility("theme", "draft-t", "public", status.revision);
    expect((await publication.theme({ themeId: "draft-t" })).theme.revision).toBe(3);
    await expect(publication.theme({ themeId: "draft-t", revision: 2 })).rejects.toMatchObject({ status: 404 });
    expect((await publication.theme({ themeId: "draft-t", revision: 1 })).records[0].record.revision).toBe(1);
  });

  it("keeps legacy qualifiers pinned to the imported revision even after current record correction", async () => {
    const sample = JSON.parse(readFileSync(new URL("../docs/research/issue75-foundation/legacy-sample.json", import.meta.url), "utf8"));
    const adapted = adaptLegacyKnowledge(sample.fixture, sample.provenance);
    await run("create-bundle", { entities: adapted.entities, sources: adapted.sources, records: adapted.records, legacyLinks: adapted.legacyLinks });
    const id = "29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1";
    await run("create-theme", { id: "legacy-theme", title: "旧記録の範囲", recordPins: [{ id, revision: 1 }] });
    const old = await publication.theme({ themeId: "legacy-theme" });
    expect(old.records[0].legacyTyped?.contribution?.roleId).toBe("STORY_CO_CREATION");
    const r = await foundation.get(operator, "record", id) as KnowledgeRecordVersion;
    await correct("record", id, 1, { ...r.content, assertion: "新たな解釈" });
    expect(await publication.theme({ themeId: "legacy-theme" })).toEqual(old);
    expect(JSON.stringify(old)).not.toContain('"payload"');
  });

  it("searches fixed generation Entity names and aliases with kind/ID filters and cursor binding", async () => {
    await seed("entity-"); const old = await publish();
    const first = await publication.entities({ generation: old, q: "entity-同じ別名", limit: 1 });
    expect(first.entities.map(e => e.id)).toEqual(["entity-a"]); expect(first.nextCursor).not.toBeNull();
    expect((await publication.entities({ generation: old, q: "entity-", kind: "organization" })).entities.map(e => e.id)).toEqual(["entity-b"]);
    await correct("entity", "entity-a", 1, { name: "完全に新版の名前", aliases: ["new-name"], kind: "person" });
    const current = await publish();
    expect((await publication.entities({ generation: old, entityId: "entity-a" })).entities[0].revision).toBe(1);
    expect((await publication.entities({ generation: current, entityId: "entity-a" })).entities[0].revision).toBe(2);
    const next = await publication.entities({ q: "entity-同じ別名", limit: 1, cursor: first.nextCursor! });
    expect(next.generation).toBe(old); expect(next.entities.map(e => e.id)).toEqual(["entity-b"]);
    for (const change of [{ q: "else" }, { kind: "person" }, { entityId: "entity-b" }, { generation: current }, { limit: 2 }]) {
      await expect(publication.entities({ q: "entity-同じ別名", limit: 1, cursor: first.nextCursor!, ...change })).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    }
    await visibility("entity", "entity-b", "hidden");
    expect((await publication.entities({ q: "entity-同じ別名", limit: 1, cursor: first.nextCursor! })).entities).toEqual([]);
    expect((await publication.entities({ generation: old, entityId: "entity-b" })).entities).toEqual([]);
  });

  it("rechecks fifty visible candidates in bulk, excludes stopped entities and binds cursors to the same ID set", async () => {
    const allIds = Array.from({ length: 51 }, (_, i) => "bulk-" + String(i).padStart(3, "0"));
    const entityIds = allIds.slice(0, 50);
    await run("create-bundle", {
      entities: allIds.map(id => ({ id, content: { name: id, kind: "person" } })),
      sources: [{ id: "bulk-s", content: { title: "候補再確認の資料", bibliography: "検証用" } }],
      records: allIds.map(id => ({ id: id + "-r", content: { kind: "episode", subjectId: id, assertion: id + "の記録", evidence: evidence("bulk-") } })),
    });
    const generation = await publish();
    expect((await publication.entities({ generation, entityIds, limit: 50 })).entities.map(e => e.id)).toEqual(entityIds);
    const first = await publication.entities({ generation, entityIds, limit: 20 });
    expect(first.nextCursor).not.toBeNull();
    await visibility("entity", entityIds[21], "hidden"); await visibility("entity", entityIds[49], "hidden");
    const readable = entityIds.filter(id => id !== entityIds[21] && id !== entityIds[49]);
    const rechecked = await publication.entities({ generation, entityIds, limit: 50 });
    expect(rechecked.entities.map(e => e.id)).toEqual(readable); expect(rechecked.hasMore).toBe(false);
    const next = await publication.entities({ entityIds: [...entityIds].reverse(), limit: 20, cursor: first.nextCursor! });
    expect(next.entities.map(e => e.id)).toEqual(readable.slice(20, 40)); expect(next.generation).toBe(generation);
    await expect(publication.entities({ entityIds: [...entityIds.slice(0, 49), allIds[50]], limit: 20, cursor: first.nextCursor! })).rejects.toMatchObject({ code: "CURSOR_MISMATCH" });
    expect((await publication.entities({ generation, entityIds: [], limit: 50 })).entities).toEqual([]);
    expect(knowledgeEntityQuerySchema.safeParse({ entityIds: Array.from({ length: 201 }, (_, i) => "limit-" + i) }).success).toBe(false);
  });

  it("filters authorised themes by presentation and retains registration dates across revision updates",async()=>{
    await seed("discovery-");await theme("discovery-");
    const first=(await publication.themes({q:"discovery-",kind:"graph"})).themes[0];
    expect(first).toMatchObject({id:"discovery-t",hasRelations:true,hasTimeline:false});
    expect(first.publishedAt).toMatch(/^\d{4}-/);
    expect((await publication.themes({q:"discovery-",kind:"timeline"})).themes).toEqual([]);
    expect((await publication.themes({kind:"timeline"})).themes).toEqual(expect.arrayContaining([expect.objectContaining({id:"period-t",hasTimeline:true,hasRelations:false})]));
    await correct("record","discovery-r",1,{...relation("discovery-"),assertion:"訂正"});
    await run("refresh-theme",{id:"discovery-t",expectedRevision:1,refreshToken:(await foundation.diffTheme(operator,"discovery-t")).refreshToken});
    const current=(await publication.themes({q:"discovery-"})).themes[0];
    expect(current.revision).toBe(2);expect(current.publishedAt).toBe(first.publishedAt);
    const sorted=(await publication.themes({order:"name"})).themes;
    expect(sorted.map(t=>t.title)).toEqual(sorted.map(t=>t.title).sort((a,b)=>a.localeCompare(b,"ja")));
    await visibility("record","discovery-r","hidden",(await foundation.list(operator)).statuses.find(s=>s.id==="discovery-r")!.revision);
    expect((await publication.themes({q:"discovery-",kind:"graph"})).themes).toEqual([]);
  });

  it("escapes SQL wildcard literals in Theme and Entity searches", async () => {
    await seed("literal-");
    await correct("entity", "literal-a", 1, { name: "literal 100%_name", kind: "person" });
    await run("create-theme", { id: "literal-t", title: "100%_Theme", recordPins: [{ id: "literal-r", revision: 1 }] });
    const generation = await publish();
    expect((await publication.themes({ q: "%_" })).themes.map(t => t.id)).toEqual(["literal-t"]);
    expect((await publication.entities({ generation, q: "%_" })).entities.map(e => e.id)).toEqual(["literal-a"]);
  });
});
