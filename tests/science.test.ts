import { describe, expect, it } from "vitest";
import ledger from "../datasets/pilot-science/v1/ledger.json";
import { loadSciencePilot, projectScience } from "../lib/server/science-dataset";
import { assertDatasetTarget, assertDemoTestTarget, datasetMode } from "../lib/domain/dataset";
import { decodeNeighborCursor, encodeNeighborCursor } from "../lib/server/neighbor-cursor";
import { fixtureCounts } from "../lib/domain/fixture";
import { datasetLabels } from "../lib/i18n/dataset";

describe("frozen science pilot acceptance/provenance", () => {
  it("projects exactly 8 accepted claims; preserves pending influence outside generated data", async () => {
    const fixture = await loadSciencePilot();
    expect(fixtureCounts(fixture)).toEqual({ nodes: { Entity: 8, Claim: 8, Source: 9, Citation: 9, ExternalIdentifier: 8 }, relationships: { SUBJECT: 8, OBJECT: 8, HAS_CITATION: 9, CITES: 9, HAS_EXTERNAL_ID: 8 } });
    expect(fixture.claims.every((c) => c.predicate === "AFFILIATED_WITH")).toBe(true);
    expect(fixture.claims.map((c) => c.id)).not.toContain(ledger.candidates[8].claim.id);
    expect(fixture.sources.some((s) => s.url?.includes("heisenberg-gesellschaft"))).toBe(false);
    const pauli = ledger.candidates.find((c) => c.ref === "C03")!;
    expect(fixture.citations.find((c) => c.claimId === pauli.claim.id)?.note).toContain("winter term 1921-1922");
    expect(ledger.entities.find((e) => e.ref === "O2")!.identity.reason).toContain("1965");
    for (const ref of ["C01", "C02", "C04"]) expect(fixture.claims.find((c) => c.id === ledger.candidates.find((c) => c.ref === ref)!.claim.id)!.period).toEqual({ from: null, to: null });
  });
  it("rejects pending promotion, missing human review, production-role fields, lost name record and citation sources", () => {
    const change = (modify: (input: typeof ledger) => void) => { const input = structuredClone(ledger); modify(input); return () => projectScience(input); };
    expect(change((x) => { x.candidates[8].acceptance.decision = "accepted"; })).toThrow("C09");
    expect(change((x) => { x.candidates[0].acceptance.reviewer = null as unknown as string; })).toThrow("reviewer");
    expect(change((x) => { Object.assign(x.candidates[0].claim, { contribution: { roleId: "SUPERVISION" } }); })).toThrow();
    expect(change((x) => { x.entities[0].entity.aliases.push("unrecorded"); })).toThrow("Aliases");
    expect(change((x) => { x.entities[0].names[0].origin = "S1"; })).toThrow("origin");
    expect(change((x) => { x.candidates[0].evidence[0].sourceRef = "S99"; })).toThrow("Source");
    expect(change((x) => { x.candidates[0].claim.predicate = "ASSISTANT_OF"; })).toThrow("predicate");
  });
  it("isolates the environment and cursor even without Role filters", () => {
    expect(datasetMode("pilot-science-v1")).toBe("pilot-science-v1");
    expect(datasetLabels("pilot-science-v1").description).toContain("同時在籍");
    expect(() => assertDatasetTarget("pilot-science-v1", "bolt://localhost:7690")).not.toThrow();
    for (const uri of ["bolt://localhost:7687", "bolt://localhost:7688", "bolt://localhost:7689", "bolt://remote:7690"]) expect(() => assertDatasetTarget("pilot-science-v1", uri)).toThrow();
    expect(() => assertDatasetTarget("demo", "bolt://localhost:7690")).toThrow();
    expect(() => assertDemoTestTarget({ GRAPH_DATASET: "pilot-science-v1" })).toThrow();
    const center = ledger.entities[5].entity.id, after = ledger.candidates[0].claim.id;
    const cursor = encodeNeighborCursor(center, null, after, null, "pilot-science-v1");
    expect(decodeNeighborCursor(cursor, center, null, null, "pilot-science-v1")).toBe(after);
    expect(() => decodeNeighborCursor(cursor, center, null, null, "pilot-urasawa-v2")).toThrow();
    expect(() => decodeNeighborCursor(after, center, null, null, "pilot-science-v1")).toThrow();
  });
});
