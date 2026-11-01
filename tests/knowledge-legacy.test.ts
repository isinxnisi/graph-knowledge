import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adaptLegacyKnowledge, legacyDigest } from "../lib/domain/knowledge-legacy";
const sample = JSON.parse(readFileSync(new URL("../docs/research/issue75-foundation/legacy-sample.json", import.meta.url), "utf8"));
const adapt = (fixture = sample.fixture) => adaptLegacyKnowledge(fixture, sample.provenance);

describe("published legacy knowledge import", () => {
  it("keeps real published IDs, fixed imported versions, all raw typed evidence and source metadata", () => {
    const result = adapt();
    expect(result.records).toHaveLength(6);
    for (const link of result.legacyLinks) {
      expect(link.importedRevision).toBe(1);
      expect(link.recordId).toBe(link.legacyClaimId);
      expect(link.payload.claim).toEqual(sample.fixture.claims.find((c: { id: string }) => c.id === link.legacyClaimId));
      expect(link.sha256).toBe(legacyDigest(link.payload));
      expect(link.payload.citations).toEqual(sample.fixture.citations.filter((c: { claimId: string }) => c.claimId === link.legacyClaimId));
    }
    expect(result.records.flatMap(r => r.content.evidence)).toHaveLength(8);
    expect(result.records.flatMap(r => r.content.evidence).every(e => e.excerpt === "")).toBe(true);
  });
  it("retains concrete typed role, publication scope, direction and original period precision", () => {
    const result = adapt();
    const role = result.records.find(r => r.id === "29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1")!;
    expect(role.content.relation).toBe("ストーリー共同制作");
    expect(role.content.scope).toContain("9784063729221");
    expect(role.content.scope).toContain("全巻・全版");
    const affiliation = result.records.find(r => r.id === "e71f548b-65c2-4032-a40f-342ab75b5d3e")!;
    expect(affiliation.content.relation).toContain("Visitor");
    expect(affiliation.content.times[0].time).toMatchObject({ from: "1924", to: "1925" });
    expect(affiliation.content.times[0].time).not.toHaveProperty("meaning");
    const event = result.records.find(r => r.id === "e84b2f8d-b173-47f9-8511-eb02bc0a2e39")!;
    expect(event.content.relation).toContain("会議議長");
    expect(event.content.times).toEqual([]); // Event dates do not establish full attendance.
    expect(result.legacyLinks.find(l => l.recordId === event.id)!.payload.entities.some(e => e.event)).toBe(true);
  });
  it("preserves synthetic denied polarity independently from citation stance without inventing a date", () => {
    const fixture = structuredClone(sample.fixture);
    fixture.claims[0].polarity = "denied";
    fixture.claims[0].period = { from: null, to: { value: "2000", precision: "year" } };
    const result = adapt(fixture), record = result.records.find(r => r.id === fixture.claims[0].id)!;
    expect(record.content.polarity).toBe("denied");
    expect(record.content.evidence[0].stance).toBe("support");
    expect(record.content.times).toEqual([]);
    expect(record.content.scope).toContain("終了境界 2000");
    expect(result.warnings).toHaveLength(1);
  });
  it("rejects hidden, demo and broken-reference inputs rather than silently publishing them", () => {
    const hidden = structuredClone(sample.fixture); hidden.claims[0].visibility = "hidden";
    expect(() => adapt(hidden)).toThrow(/published/);
    const demo = structuredClone(sample.fixture); demo.sources[0].isDemo = true;
    expect(() => adapt(demo)).toThrow(/Demo/);
    const missing = structuredClone(sample.fixture); missing.entities.pop();
    expect(() => adapt(missing)).toThrow();
  });
  it("hashes all source fields while remaining independent of JSON key order", () => {
    expect(legacyDigest({ b: 2, a: { z: 1, x: [2, 3] } })).toBe(legacyDigest({ a: { x: [2, 3], z: 1 }, b: 2 }));
    const left = adapt().legacyLinks[0];
    const changed = structuredClone(left.payload); changed.citations[0].locator += " corrected";
    expect(legacyDigest(changed)).not.toBe(left.sha256);
  });
});
