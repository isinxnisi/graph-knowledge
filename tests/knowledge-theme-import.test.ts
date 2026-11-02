import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareThemeKnowledgeImport } from "../lib/server/knowledge-theme-import";
import { themePackageSchema } from "../lib/domain/theme-workbench";
import { legacyDigest } from "../lib/domain/knowledge-legacy";
import { knowledgeTimelineProjection } from "../lib/domain/knowledge-timeline";
import { buildKnowledgePublishedRecord } from "../lib/domain/knowledge-publication";
import type { KnowledgeCommand, KnowledgeSnapshot } from "../lib/domain/knowledge-foundation";

function observed(filename: string) {
  const p = themePackageSchema.parse(JSON.parse(readFileSync(new URL(`../public/theme-examples/${filename}.json`, import.meta.url), "utf8")));
  return { id: p.id, title: p.title, description: p.description, revision: 1, entities: p.entities, ...(p.timeline ? { timeline: p.timeline } : {}),
    createdAt: "2026-11-02T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z", sourceHash: legacyDigest(p),
    records: p.records.map(r => ({ ...r, revision: 1, updatedAt: "2026-11-02T00:00:00Z", reason: "試験内の観測版", mapping: p.mappings.find(m => m.recordId === r.id) ? { ...p.mappings.find(m => m.recordId === r.id)!, revision: 1, recordRevision: 1, updatedAt: "2026-11-02T00:00:00Z" } : null })),
  };
}
const bundle = (commands: KnowledgeCommand[]) => commands.find((c): c is Extract<KnowledgeCommand, { action: "create-bundle" }> => c.action === "create-bundle")!;
function projection(commands: KnowledgeCommand[]) {
  const b = bundle(commands), t = commands.find(c => c.action === "create-theme")!;
  const version = { revision: 1, createdAt: "2026-11-02T00:00:00Z", reason: "試験" };
  const s: KnowledgeSnapshot = { schemaVersion: 1, initialView: t.initialView, timeline: t.timeline, entities: b.entities.map(e => ({ ...e, ...version })), sources: b.sources.map(s => ({ ...s, ...version })), records: b.records.map(r => ({ ...r, ...version })), mappings: [] };
  return { snapshot: s, drawing: knowledgeTimelineProjection(s) };
}
describe("generic observed Theme import", () => {
  it("imports Webb deployment including EST child axis through the same ordinary commands", () => {
    const raw = observed("webb-timeline"), before = structuredClone(raw), plan = prepareThemeKnowledgeImport(raw, { namespace: "u3" });
    expect(plan.counts.records).toBe(11);
    expect(plan.commands.every(c => ["create-bundle", "set-mapping", "create-theme"].includes(c.action))).toBe(true);
    const { snapshot: s, drawing } = projection(plan.commands);
    expect(drawing.graphRecordIds).toHaveLength(5);
    expect(drawing.records).toHaveLength(11);
    expect(s.timeline?.axes[1].originLabel).toContain("EST");
    expect(s.timeline?.insets).toHaveLength(1);
    expect(s.records.map(r => r.content.times[0]?.time)).toEqual(raw.records.map(r => r.time));
    const b = bundle(plan.commands);
    expect(b.legacyLinks[0].payload).toMatchObject({ importKind: "theme75", record: { id: raw.records[0].id, evidence: raw.records[0].evidence } });
    expect(b.legacyLinks.every(l => legacyDigest(l.payload) === l.sha256)).toBe(true);
    const first = s.records[0];
    expect(buildKnowledgePublishedRecord(first, { entities: s.entities, sources: s.sources, mappings: [], legacyLink: b.legacyLinks[0] }).legacyTyped).toBeNull();
    expect(raw).toEqual(before);
  });
  it("uses the current observed revision and never restores the distributed baseline", () => {
    const raw = observed("webb");
    raw.revision = 5; raw.records.push({ ...structuredClone(raw.records[0]), id: "user-added-record", assertion: "利用者が加えた観測済みの記録", revision: 2 });
    const plan = prepareThemeKnowledgeImport(raw, { namespace: "u3" });
    expect(plan.origin.themeRevision).toBe(5);
    expect(plan.counts.records).toBe(raw.records.length);
    expect(bundle(plan.commands).records.some(r => r.content.assertion === "利用者が加えた観測済みの記録")).toBe(true);
    expect(plan.warnings.every(w => w.code === "stale-mapping-preserved-in-origin-only")).toBe(true);
  });
  it("reuses entities only from explicit pins and retains separate claim locators/excerpts", () => {
    const raw = observed("webb");
    const oldId = raw.records[0].subject;
    const bindings = { [oldId]: { id: "existing-webb", revision: 3 } };
    const plan = prepareThemeKnowledgeImport(raw, { namespace: "u3", entityBindings: bindings });
    const b = bundle(plan.commands);
    expect(b.entityPins).toEqual([{ id: "existing-webb", revision: 3 }]);
    expect(b.entities.some(e => e.id === "existing-webb")).toBe(false);
    expect(b.records[0].content.subjectId).toBe("existing-webb");
    expect(b.records.map(r => r.content.evidence.map(e => [e.locator, e.excerpt]))).toEqual(raw.records.map(r => r.evidence.map(e => [e.locator, e.excerpt])));
    expect(() => prepareThemeKnowledgeImport(raw, { namespace: "u3", entityBindings: { absent: { id: "other", revision: 1 } } })).toThrow("使われていない");
  });
  it("repeats exact plans safely and retains current mapping only for its matching content revision", () => {
    const raw = observed("webb");
    raw.records[0].mapping = { concept: { id: "free-concept", label: "協力", definition: "観測した意味" }, revision: 1, recordRevision: 1, reason: "試験", updatedAt: raw.updatedAt, recordId: raw.records[0].id };
    raw.records[1].mapping = { ...raw.records[0].mapping, recordId: raw.records[1].id, recordRevision: 4 };
    const a = prepareThemeKnowledgeImport(raw, { namespace: "u3" }), b = prepareThemeKnowledgeImport(raw, { namespace: "u3" });
    expect(a).toEqual(b);
    expect(legacyDigest(a.commands)).toBe(legacyDigest(JSON.parse(JSON.stringify(a.commands))));
    expect(a.commands.filter(c => c.action === "set-mapping").some(c => c.recordId === bundle(a.commands).records[0].id)).toBe(true);
    expect(a.commands.filter(c => c.action === "set-mapping").some(c => c.recordId === bundle(a.commands).records[1].id)).toBe(false);
    expect(a.warnings).toContainEqual({ recordId: raw.records[1].id, code: "stale-mapping-preserved-in-origin-only" });
    raw.revision++;
    expect(prepareThemeKnowledgeImport(raw, { namespace: "u3" }).themeId).not.toBe(a.themeId);
  });
});
