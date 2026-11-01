import { expect, it } from "vitest";
import {
  examineTemporalPattern,
  temporalPatternPackage,
  temporalPatterns,
} from "../lib/domain/temporal-patterns";
import { calendarGraph } from "../lib/domain/calendar-graph";
import { themeDocument } from "../lib/server/theme-workbench";

function intervalRelation([a, b]: [number, number], [c, d]: [number, number]) {
  if (b < c) return "before";
  if (a > d) return "after";
  if (b === c) return "meets";
  if (a === d) return "met-by";
  if (a === c && b === d) return "equal";
  if (a === c) return b < d ? "starts" : "started-by";
  if (b === d) return a > c ? "finishes" : "finished-by";
  if (a > c && b < d) return "during";
  if (a < c && b > d) return "contains";
  return a < c ? "overlaps" : "overlapped-by";
}
it("covers each of the 13 interval relations once with independently checked endpoints", () => {
  const pairs = temporalPatterns.filter((p) => p.intervalPair);
  expect(pairs).toHaveLength(13);
  expect(new Set(pairs.map((p) => p.intervalPair!.relation)).size).toBe(13);
  for (const p of pairs)
    expect(intervalRelation(p.intervalPair!.a, p.intervalPair!.b)).toBe(
      p.intervalPair!.relation,
    );
});
it("has unique cases, defined expectations and a visible distinction between model gaps and invalid input", () => {
  expect(new Set(temporalPatterns.map((p) => p.id)).size).toBe(
    temporalPatterns.length,
  );
  for (const p of temporalPatterns) {
    expect(p.expectation.length).toBeGreaterThan(10);
    if (p.status === "gap") expect(p.gap).toBeTruthy();
    if (p.status === "rejected") expect(p.expectedAcceptance).toBe(false);
  }
  expect(
    temporalPatterns.find((p) => p.id === "first-half-label")
      ?.expectedAcceptance,
  ).toBe(true);
});
for (const pattern of temporalPatterns) {
  it(`${pattern.id}: matches the common package validator and never alters the original fixture`, () => {
    const original = JSON.stringify(pattern),
      input = temporalPatternPackage(pattern),
      inputBefore = JSON.stringify(input),
      examined = examineTemporalPattern(pattern);
    expect(examined.accepted).toBe(pattern.expectedAcceptance);
    expect(JSON.stringify(pattern)).toBe(original);
    expect(JSON.stringify(input)).toBe(inputBefore);
    if (!examined.accepted) {
      expect(examined.issues.length).toBeGreaterThan(0);
      expect(examined.records).toEqual([]);
      return;
    }
    for (const unit of ["auto", "year", "month", "day"] as const) {
      const graph = calendarGraph(examined.records, unit);
      for (const r of graph.ranges) {
        expect(r.startRow).toBeGreaterThanOrEqual(0);
        expect(r.endRow).toBeGreaterThanOrEqual(r.startRow);
        expect(r.startEndRow).toBeGreaterThanOrEqual(r.startRow);
        expect(r.endStartRow).toBeLessThanOrEqual(r.endRow);
        expect(graph.rows[r.anchorRow].record?.id).toBe(r.record.id);
        expect(r.endAnchorRow).toBeGreaterThanOrEqual(r.anchorRow);
      }
    }
    expect(JSON.stringify(pattern)).toBe(original);
    const doc = themeDocument({
      themeId: "test",
      themeRevision: 1,
      entities: examined.entities,
      records: examined.records,
    });
    expect(doc.relations.length).toBe(
      examined.records.filter((r) => r.kind === "relation").length,
    );
  });
}
it("keeps an explicit membership record separate from temporal containment", () => {
  for (const id of ["membership-none", "membership-explicit"]) {
    const p = temporalPatterns.find((p) => p.id === id)!,
      v = examineTemporalPattern(p);
    expect(v.records.filter((r) => r.kind === "relation")).toHaveLength(
      id.endsWith("none") ? 0 : 1,
    );
  }
});
