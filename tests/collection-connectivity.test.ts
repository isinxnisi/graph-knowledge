import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { analyzeConnectivity, connectivityMarkdown } from "../lib/analysis/collection-connectivity";
import { evaluateConnectivityInput, writeConnectivityReport } from "../scripts/collection-connectivity";
import type { Fixture } from "../lib/domain/fixture";
import { publicGraph, publicGraphDigest } from "../lib/server/public-graph";
import { sha256, stableJson } from "../lib/server/public-dataset";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-10-20T00:00:00.000Z";
function entity(n: number, kind: "person" | "work" = "person") {
  return { id: id(n), kind, name: `対象${n}`, description: null, aliases: [], externalIds: [], event: null, createdAt: time, updatedAt: time };
}
function claim(n: number, subject: number, object: number, predicate: "ASSISTANT_OF" | "CONTRIBUTED_TO" = "ASSISTANT_OF"): Fixture["claims"][number] {
  return { id: id(n), subjectId: id(subject), objectId: id(object), predicate, polarity: "affirmed", period: { from: null, to: null },
    visibility: "published", createdAt: time, updatedAt: time, contribution: predicate === "CONTRIBUTED_TO" ? { roleId: "AUTHORSHIP", scope: null } : null,
    organizationParticipation: null, eventParticipation: null };
}
function fixture(entities: ReturnType<typeof entity>[], claims: ReturnType<typeof claim>[]): Fixture {
  return { schemaVersion: 4, entities, claims, sources: [{ id: id(900), kind: "web", title: "支持資料", authors: [], publisher: null,
    url: "https://example.org/source", publishedAt: null, edition: null, note: null, isDemo: false }],
    citations: claims.map((c, i) => ({ id: id(1000 + i), claimId: c.id, sourceId: id(900), locator: `第${i + 1}節`, note: "原文を保持", accessedAt: "2026-10-20", stance: "support", roleEvidence: null, positionEvidence: null, eventParticipationEvidence: null })) };
}
function extended(before: Fixture, entities: ReturnType<typeof entity>[], claims: ReturnType<typeof claim>[]) {
  const extra = fixture(entities, claims);
  return structuredClone({ ...before, entities: [...before.entities, ...entities], claims: [...before.claims, ...claims],
    citations: [...before.citations, ...extra.citations.map((c, i) => ({ ...c, id: id(2000 + i) }))] });
}
const baseline = () => fixture([entity(1), entity(2, "work"), entity(3), entity(4, "work")], [claim(101, 1, 2, "CONTRIBUTED_TO"), claim(102, 3, 4, "CONTRIBUTED_TO")]);

describe("接続性評価の構造と根拠", () => {
  it("追加単独と既存を含む成分、既存への付着と新規島を分離", () => {
    const before = baseline();
    const after = extended(before, [entity(5, "work"), entity(6), entity(7), entity(8, "work")], [claim(103, 1, 5, "CONTRIBUTED_TO"), claim(104, 6, 5, "CONTRIBUTED_TO"), claim(105, 6, 4, "CONTRIBUTED_TO"), claim(106, 7, 8, "CONTRIBUTED_TO")]);
    const r = analyzeConnectivity(before, after);
    expect(r.before.componentCount).toBe(2); expect(r.after.componentCount).toBe(2); expect(r.additionOnly.componentCount).toBe(2);
    expect(r.delta.mergedBaselineComponents).toHaveLength(1); expect(r.delta.isolatedNewGroups).toHaveLength(1);
    expect(r.delta.newEntityAttachments).toEqual([id(5), id(6)]);
    expect(r.delta.directlyBridgingClaimIds).toEqual([]); // bridge emerges through multiple new Claims
    expect(r.groups[0].impact.connectedBaselineGroups).toHaveLength(1);
    expect(r.claimEffects.every(c => c.singleClaimImpact.connectedBaselineGroups.length === 0)).toBe(true);
    expect(r.delta.groupConnectingClaimIds).toContain(id(104));
    expect(r.claimEffects.find(c => c.claimId === id(104))!.representativePaths.some(p => p.kind === "different-works")).toBe(true);
  });
  it("1 Claimの直接橋渡しとテーマ全体の相互作用を区別", () => {
    const before = baseline(), after = extended(before, [], [claim(103, 1, 3)]);
    const r = analyzeConnectivity(before, after);
    expect(r.delta.directlyBridgingClaimIds).toEqual([id(103)]);
    expect(r.claimEffects[0].singleClaimImpact.componentDelta).toBe(-1);
    expect(r.claimEffects[0].connectsWorkOrPersonGroups).toBe(true);
  });
  it("既に到達できる対象への新Role経路を新規到達と水増ししない", () => {
    const before = baseline(), c = claim(103, 1, 2, "CONTRIBUTED_TO"); c.contribution!.roleId = "DRAWING";
    const after = extended(before, [], [c]), r = analyzeConnectivity(before, after);
    expect(r.delta.reachability.totals.added).toEqual([0, 0, 0]);
    expect(r.after.parallelClaims[0].claimIds).toEqual([id(101), id(103)]);
    expect(r.claimEffects[0].graphBridgeInCombined).toBe(false);
  });
  it("各段の方向・異なるRole・ISBN scope・複数Citation/Sourceをそのまま残す", () => {
    const before = baseline(), c = claim(103, 1, 4, "CONTRIBUTED_TO");
    c.contribution = { roleId: "ORIGINAL_STORY", scope: { kind: "publication", isbn13: "9784091926937", volumeLabel: "1", editionLabel: "資料の版", language: "ja" } };
    const after = extended(before, [], [c]); after.sources.push({ ...after.sources[0], id: id(901), title: "別の資料" });
    after.citations.push({ ...after.citations.at(-1)!, id: id(2999), sourceId: id(901), locator: "別の箇所" });
    const r = analyzeConnectivity(before, after, { roots: [id(2)] });
    expect(r.evidence.claims.find(row => row.id === c.id)).toEqual(c);
    expect(r.evidence.citations.filter(row => row.claimId === c.id)).toEqual(after.citations.filter(row => row.claimId === c.id));
    expect(r.evidence.sources).toEqual(after.sources);
    const p = r.paths.find(p => p.root === id(2))!.items.find(p => p.entityIds.at(-1) === id(4))!;
    expect(p.directions).toEqual(["reverse", "forward"]); expect(p.claimIds).toEqual([id(101), id(103)]);
    expect(connectivityMarkdown(r)).toContain(c.id);
    const filtered = analyzeConnectivity(before, after, { roleIds: ["ORIGINAL_STORY"] });
    expect(filtered.after.claimCount).toBe(1); expect(filtered.paths.every(p => !p.items.length)).toBe(true);
  });
  it("否定・非公開・保留・支持根拠なしを除外し理由を残す", () => {
    const before = baseline();
    const cs = [claim(103, 1, 3), claim(104, 1, 3), claim(105, 1, 3), claim(106, 1, 3)];
    cs[0].polarity = "denied"; cs[1].visibility = "hidden";
    const after = extended(before, [], cs); after.citations = after.citations.filter(c => c.claimId !== id(106));
    const r = analyzeConnectivity(before, after, { held: [{ claimId: id(105), reason: "同定保留" }] });
    expect(r.delta.eligibleClaims).toBe(0); expect(r.delta.reachability.totals.added).toEqual([0, 0, 0]);
    expect(r.classifications.filter(c => c.new).map(c => c.reasons[0])).toEqual(["denied", "hidden", "held: 同定保留", "no-supporting-non-demo-citation"]);
    expect(analyzeConnectivity(before, after, { includeHiddenCandidates: true }).delta.eligibleClaims).toBe(2);
    expect(r.evidence.claims).toHaveLength(4);
  });
  it("支持以外のCitation・demo資料を支持根拠として扱わない", () => {
    const before = baseline(), after = extended(before, [], [claim(103, 1, 3)]);
    after.citations.at(-1)!.stance = "background";
    expect(analyzeConnectivity(before, after).delta.eligibleClaims).toBe(0);
    after.citations.at(-1)!.stance = "support"; after.sources[0].isDemo = true;
    // Existing Source edits are rejected, even when the proposed change seems harmless.
    expect(() => analyzeConnectivity(before, after)).toThrow(/Existing sources/);
  });
  it("1〜3段以内の到達を終点の重複なく数え、自己ループ・循環を経路から除く", () => {
    const before = fixture([entity(1), entity(2), entity(3)], [claim(101, 1, 2)]);
    const after = extended(before, [entity(4)], [claim(102, 2, 3), claim(103, 3, 4), claim(104, 2, 2)]);
    const r = analyzeConnectivity(before, after);
    const root = r.delta.reachability.roots.find(r => r.entityId === id(1))!;
    expect(root.before).toEqual([1, 1, 1]); expect(root.after).toEqual([1, 2, 3]); expect(root.added).toEqual([0, 1, 2]);
    expect(r.after.selfLoopClaimIds).toEqual([id(104)]);
    expect(r.paths.flatMap(p => p.items).every(p => new Set(p.entityIds).size === p.entityIds.length)).toBe(true);
  });
  it("方向条件を到達計算と代表パスの全段に適用", () => {
    const before = fixture([entity(1), entity(2), entity(3)], [claim(101, 1, 2)]), after = extended(before, [], [claim(102, 3, 2)]);
    expect(analyzeConnectivity(before, after, { direction: "outgoing" }).paths.every(p => p.items.length === 0)).toBe(true);
    expect(analyzeConnectivity(before, after).paths.some(p => p.items.length > 0)).toBe(true);
    expect(analyzeConnectivity(before, after, { direction: "incoming" }).delta.reachability.roots.find(r => r.entityId === id(2))!.after[0]).toBe(2);
  });
  it("閉路の代替経路があれば橋と誤認しない", () => {
    const before = fixture([entity(1), entity(2), entity(3)], [claim(101, 1, 2)]);
    const after = extended(before, [], [claim(102, 2, 3), claim(103, 3, 1)]), r = analyzeConnectivity(before, after);
    expect(r.claimEffects.every(c => !c.graphBridgeInCombined)).toBe(true);
    expect(r.delta.reachability.roots.every(row => row.after.every(n => n === 2))).toBe(true);
    expect(r.paths.flatMap(p => p.items).every(p => new Set(p.entityIds).size === p.entityIds.length)).toBe(true);
  });
  it("高次数では経路上限を明示し、到達数の完全計算と区別", () => {
    const before = fixture([entity(1)], []);
    const after = extended(before, Array.from({ length: 40 }, (_, i) => entity(i + 2)), Array.from({ length: 40 }, (_, i) => claim(i + 101, 1, i + 2)));
    const r = analyzeConnectivity(before, after, { maxPathsPerRoot: 1, maxExpansionsPerRoot: 2 });
    expect(r.paths.some(p => !p.complete)).toBe(true);
    expect(r.delta.reachability.exact).toBe(true); expect(r.delta.reachability.roots.find(r => r.entityId === id(1))!.after).toEqual([40, 40, 40]);
    expect(r.paths.every(p => p.items.length <= 1 && p.expansions <= 2)).toBe(true);
    expect(() => analyzeConnectivity(before, after, { maxPathsPerRoot: 0 })).toThrow(/limits/);
    const total = analyzeConnectivity(before, after, { maxTotalPathExpansions: 3 });
    expect(total.paths.reduce((sum, row) => sum + row.expansions, 0)).toBe(3);
    expect(total.paths.some(p => p.limitedBy === "total-expansions")).toBe(true);
  });
  it("既存UUIDの意味変更・欠落・重複・根拠差替え・未知参照を拒否", () => {
    const before = baseline();
    const changed = structuredClone(before); changed.claims[0].polarity = "denied";
    expect(() => analyzeConnectivity(before, changed)).toThrow(/Existing claims/);
    const removed = structuredClone(before); removed.claims.pop(); removed.citations.pop();
    expect(() => analyzeConnectivity(before, removed)).toThrow(/Existing claims/);
    const duplicate = structuredClone(before); duplicate.entities.push(duplicate.entities[0]);
    expect(() => analyzeConnectivity(before, duplicate)).toThrow(/Duplicate/);
    const altered = structuredClone(before); altered.citations[0].locator += "補完";
    expect(() => analyzeConnectivity(before, altered)).toThrow(/Existing citations/);
    const noncanonical = structuredClone(before); noncanonical.entities[0].name += " ";
    expect(() => analyzeConnectivity(before, noncanonical)).toThrow(/Non-canonical/);
    const extraEvidence = structuredClone(before); extraEvidence.citations.push({ ...extraEvidence.citations[0], id: id(9999) });
    expect(() => analyzeConnectivity(before, extraEvidence)).toThrow(/New Citation/);
    expect(() => analyzeConnectivity(before, before, { roots: [id(999)] })).toThrow(/root/);
    expect(() => analyzeConnectivity(before, before, { held: [{ claimId: id(999), reason: "不明" }] })).toThrow(/held/);
  });
  it("変更なし・同名別UUIDを勝手に統合しない", () => {
    const before = baseline(), r = analyzeConnectivity(before, before);
    expect(r.delta.claims).toBe(0); expect(r.delta.reachability.totals.added).toEqual([0, 0, 0]);
    const other = entity(9); other.name = before.entities[0].name;
    const after = extended(before, [other, entity(10, "work")], [claim(103, 9, 10, "CONTRIBUTED_TO")]);
    const next = analyzeConnectivity(before, after);
    expect(next.delta.isolatedNewGroups).toHaveLength(1); expect(next.claimEffects[0].baselineEndpointIds).toEqual([]);
  });
  it("テーマ比較を指定でき、未収録・重複・未被覆のClaimを拒否", () => {
    const before = baseline(), after = extended(before, [], [claim(103, 1, 3), claim(104, 3, 1)]);
    const r = analyzeConnectivity(before, after, { groups: [{ id: "a", title: "企画A", claimIds: [id(103)] }, { id: "b", title: "企画B", claimIds: [id(104)] }] });
    expect(r.groups).toHaveLength(2);
    expect(() => analyzeConnectivity(before, after, { groups: [{ id: "a", title: "不完全", claimIds: [id(103)] }] })).toThrow(/cover/);
    expect(() => analyzeConnectivity(before, after, { groups: [{ id: "a", title: "不明", claimIds: [id(999)] }] })).toThrow(/unknown/);
  });
  it("同じ入力で同一出力・入力不変。報告の上書きを拒否", () => {
    const before = baseline(), after = extended(before, [], [claim(103, 1, 3)]), saved = JSON.stringify([before, after]);
    const r = analyzeConnectivity(before, after); expect(analyzeConnectivity(before, after)).toEqual(r); expect(JSON.stringify([before, after])).toBe(saved);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "connectivity-report-"));
    try {
      const out = path.join(directory, "result");
      const result = { report: { ...r, provenance: {} }, markdown: connectivityMarkdown(r) } as ReturnType<typeof evaluateConnectivityInput>;
      writeConnectivityReport(out, result); writeConnectivityReport(out, result, true);
      fs.appendFileSync(path.join(out, "README.md"), "changed");
      expect(() => writeConnectivityReport(out, result)).toThrow(/differs/);
    } finally { fs.rmSync(directory, { recursive: true }); }
  });
});

it("承認前hidden候補をオフライン仮評価し、公開baseが古ければ拒否", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "connectivity-candidate-"));
  try {
    const before = baseline(), hidden = claim(103, 1, 3); hidden.visibility = "hidden";
    const after = extended(before, [], [hidden]);
    const payload = { version: 1, dataset: "public-kg", savedAt: time, release: "unit-before", revision: "revision-before",
      graphDigest: publicGraphDigest(publicGraph(before)), fixture: before, withdrawals: [],
      receipts: [{ id: "unit-before", digest: "0".repeat(64), dataSha256: "0".repeat(64), reason: "test", appliedAt: time }], externalNodeIds: {} };
    const save = (file: string, data: unknown) => {
      const raw = JSON.stringify(data); fs.writeFileSync(path.join(directory, file), raw);
      return { file, sha256: sha256(raw) };
    };
    const observation = { dataset: "public-kg", revision: "revision-before", observedAt: time, origin: "https://example.org", evidence: "test-only", note: "saved observation" };
    const spec = { schemaVersion: 1, mode: "candidate", baseline: { backup: save("before.json", { payload, checksum: sha256(stableJson(payload)) }), release: "unit-before", revision: "revision-before" },
      comparison: { fixture: save("after.json", after) }, publicObservation: save("observation.json", observation), options: { includeHiddenCandidates: true } };
    const file = path.join(directory, "input.json"); fs.writeFileSync(file, JSON.stringify(spec));
    const result = evaluateConnectivityInput(file, "revision-before");
    expect(result.report.delta.eligibleClaims).toBe(1); expect(result.report.evidence.claims.find(c => c.id === hidden.id)!.visibility).toBe("hidden");
    spec.publicObservation = save("observation.json", { ...observation, revision: "revision-after" }); fs.writeFileSync(file, JSON.stringify(spec));
    expect(() => evaluateConnectivityInput(file, "revision-after")).toThrow(/baseline is stale/);
  } finally { fs.rmSync(directory, { recursive: true }); }
});

describe("固定した実公開50 Claimの回帰", () => {
  const file = "datasets/connectivity/issue-34/input.json", revision = "88437056-b74f-42ab-88c0-33ed435bdccc";
  it("公開前の検証済みsnapshot＋公開releaseを読み、21成分の単独結果を区別", () => {
    const r = evaluateConnectivityInput(file, revision);
    expect(r.report.delta.claims).toBe(50); expect(r.report.additionOnly.componentCount).toBe(21);
    expect(r.report.before.claimCount).toBe(1844); expect(r.report.after.claimCount).toBe(1894);
    expect(r.report.before.componentCount).toBe(294); expect(r.report.after.componentCount).toBe(312);
    expect(r.report.delta.directlyBridgingClaimIds).toEqual([]); expect(r.report.delta.isolatedNewGroups).toHaveLength(18);
    expect(r.report.delta.newEntityAttachments).toHaveLength(12);
    expect(r.report.delta.reachability.totals.added).toEqual([96, 186, 248]);
    expect(r.report.delta.creatorWorkGroupBridgeClaimIds).toHaveLength(9);
    expect(r.report.delta.reachability.roots.find(row => row.entityId === "2b7c6289-d050-4dc0-93e3-9307681253cc")).toMatchObject({ before: [3, 12, 15], after: [3, 13, 17] });
    expect(r.report.evidence.claims.filter(c => r.report.claimEffects.some(e => e.claimId === c.id))).toHaveLength(50);
  }, 30000);
  it("現行revisionの不一致を失敗表示", () => { expect(() => evaluateConnectivityInput(file, "old-revision")).toThrow(/revision/); });
  it("artifact改変を報告生成前に拒否", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "connectivity-invalid-"));
    try {
      const spec = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const ref of [spec.baseline.backup, spec.comparison.fixture, spec.comparison.manifest, spec.publicObservation]) ref.file = path.resolve(path.dirname(file), ref.file);
      spec.comparison.fixture.sha256 = createHash("sha256").update("tampered").digest("hex");
      const input = path.join(temp, "input.json"); fs.writeFileSync(input, JSON.stringify(spec));
      expect(() => evaluateConnectivityInput(input, revision)).toThrow(/checksum/);
    } finally { fs.rmSync(temp, { recursive: true }); }
  });
});
