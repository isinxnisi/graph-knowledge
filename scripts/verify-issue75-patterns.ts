import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  temporalPatterns,
  examineTemporalPattern,
} from "../lib/domain/temporal-patterns";
import { calendarGraph } from "../lib/domain/calendar-graph";
const rows = temporalPatterns.map((pattern) => {
  const result = examineTemporalPattern(pattern);
  if (result.accepted !== pattern.expectedAcceptance)
    throw new Error(`受理結果不一致: ${pattern.id}`);
  for (const unit of ["auto", "year", "month", "day"] as const) {
    const graph = calendarGraph(result.records, unit);
    if (
      graph.ranges.some(
        (r) =>
          r.startRow < 0 ||
          r.endRow < r.startRow ||
          graph.rows[r.anchorRow]?.record?.id !== r.record.id ||
          r.endAnchorRow < r.anchorRow,
      )
    )
      throw new Error(`座標・接続不正: ${pattern.id}/${unit}`);
  }
  return {
    id: pattern.id,
    title: pattern.title,
    category: pattern.category,
    status: pattern.status,
    expectation: pattern.expectation,
    gap: pattern.gap,
    expectedAcceptance: pattern.expectedAcceptance,
    actualAcceptance: result.accepted,
    recordCount: result.records.length,
    validationIssues: result.issues,
  };
});
const cases = temporalPatterns.map((pattern) => ({
  ...rows.find((r) => r.id === pattern.id),
  package: examineTemporalPattern(pattern).input,
}));
const fixture =
  JSON.stringify(
    {
      notice:
        "すべて仮想データ。仕様不足と入力拒否のケースを含む。実在の事実・史実ではない。",
      cases,
    },
    null,
    2,
  ) + "\n";
writeFileSync("public/theme-examples/temporal-patterns.json", fixture);
const report = {
  checkedAt: new Date().toISOString(),
  caseCount: rows.length,
  checkedDisplayUnits: ["auto", "year", "month", "day"],
  statusCounts: Object.fromEntries(
    ["renderable", "gap", "rejected"].map((status) => [
      status,
      rows.filter((r) => r.status === status).length,
    ]),
  ),
  fixtureSha256: createHash("sha256").update(fixture).digest("hex"),
  scope:
    "共通schema・座標・元データの検証。見やすさの人間受入、全ケースの実ブラウザ確認、未対応機能の完成を意味しない。",
  cases: rows,
};
writeFileSync(
  "docs/research/issue75-themes/temporal-patterns-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({
    caseCount: report.caseCount,
    statusCounts: report.statusCounts,
    fixtureSha256: report.fixtureSha256,
  }) + "\n",
);
