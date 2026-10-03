import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertDatasetTarget, assertDemoTestTarget, datasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { fixtureCounts } from "../lib/domain/fixture";
import { loadPilot, PILOT_DIRECTORY, projectPilot } from "../lib/server/pilot-dataset";
import ledger from "../datasets/pilot-urasawa/v1/ledger.json";

describe("reviewed frozen pilot", () => {
  it("reproduces the checked release, all raw hashes, supported names and IDs", async () => {
    const fixture = await loadPilot();
    expect(fixtureCounts(fixture)).toEqual({ nodes: { Entity: 8, Claim: 9, Source: 4, Citation: 9, ExternalIdentifier: 8 }, relationships: { SUBJECT: 9, OBJECT: 9, HAS_CITATION: 9, CITES: 9, HAS_EXTERNAL_ID: 8 } });
    expect(fixture).toEqual(JSON.parse(await readFile(`${PILOT_DIRECTORY}/data.json`, "utf8")));
    expect(fixture.claims.filter((claim) => claim.predicate === "INFLUENCED_BY")).toHaveLength(1);
    expect(fixture.claims.every((claim) => claim.period.from === null && claim.period.to === null)).toBe(true);
    expect(fixture.sources.every((source) => !source.isDemo && source.publishedAt === null)).toBe(true);
    for (const citation of fixture.citations) {
      expect(citation.note).toContain("確認範囲"); expect(citation.note).toContain("役割・内容");
    }
  });
  it("rejects contradictory IDs and unrecorded search names", () => {
    const mismatch = structuredClone(ledger); mismatch.entities[0].entity.externalIds[0].value = "Q339";
    expect(() => projectPilot(mismatch)).toThrow("identity");
    const alias = structuredClone(ledger); alias.entities[0].entity.aliases.push("unreviewed name");
    expect(() => projectPilot(alias)).toThrow("aliases");
  });
  it("rejects demo sources, unsupported citations and unreviewed Claims", () => {
    const source = structuredClone(ledger); source.sources[0].source.isDemo = true;
    expect(() => projectPilot(source)).toThrow("real sources");
    const claim = structuredClone(ledger); claim.claims[0].citation.stance = "background";
    expect(() => projectPilot(claim)).toThrow("supporting evidence");
    const pending = structuredClone(ledger); pending.claims[0].evidence.decision = "deferred";
    expect(() => projectPilot(pending)).toThrow();
  });
  it("derives role and qualification text from structured evidence", () => {
    const input = structuredClone(ledger); input.claims[0].evidence.roleSummary = "検証用の役割";
    expect(projectPilot(input).fixture.citations[0].note).toContain("検証用の役割");
    expect(projectPilot(ledger).fixture.claims).toHaveLength(ledger.claims.length);
  });
});
describe("dataset target separation", () => {
  it("rejects crossed environments and unknown dataset modes", () => {
    expect(() => datasetMode("pilot")).toThrow();
    expect(() => assertDatasetTarget("demo", "bolt://127.0.0.1:7688")).toThrow();
    expect(() => assertDatasetTarget("pilot-urasawa-v1", "bolt://127.0.0.1:7687")).toThrow();
    expect(() => assertDatasetTarget("pilot-urasawa-v1", "bolt://remote:7688")).toThrow();
    expect(() => assertDemoTestTarget({ GRAPH_DATASET: "pilot-urasawa-v1" })).toThrow();
    expect(() => assertDatasetTarget("pilot-urasawa-v1", "bolt://127.0.0.1:7688")).not.toThrow();
  });
  it("labels pilot and registration limits through the locale boundary", () => {
    expect(datasetLabels("demo").badge).toBe("架空のデモデータ");
    expect(datasetLabels("pilot-urasawa-v1", "en").badge).toContain("実データ");
    expect(datasetLabels("pilot-urasawa-v1").empty).toContain("登録範囲");
  });
});
