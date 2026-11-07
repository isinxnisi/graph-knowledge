import { describe, expect, it } from "vitest";
import { knowledgeRecordContentSchema, knowledgeTimelineIssues, type KnowledgeRecordVersion, type KnowledgeSnapshot, type KnowledgeTimeline } from "../lib/domain/knowledge-foundation";
import { knowledgeTimelineLayout, knowledgeTimelineProjection } from "../lib/domain/knowledge-timeline";
import { buildTimelineGroups } from "../lib/domain/theme-timeline";
import { calendarGraph } from "../lib/domain/calendar-graph";

const stamp = { revision: 1, createdAt: "2026-11-02T00:00:00Z", reason: "合成構造試験" };
export function record(id: string, input: Partial<KnowledgeRecordVersion["content"]> = {}): KnowledgeRecordVersion {
  return { id, ...stamp, content: knowledgeRecordContentSchema.parse({ kind: "note", assertion: `構造試験 ${id}`, evidence: [{ id: "citation", source: { id: "source", revision: 1 }, locator: "第1章", excerpt: "", stance: "background" }], ...input }) };
}
export function snapshot(records: KnowledgeRecordVersion[]): KnowledgeSnapshot {
  return { schemaVersion: 1, initialView: "split", entities: ["a", "b"].map(id => ({ id, ...stamp, content: { name: `対象${id}`, aliases: [], kind: "人物", description: "", language: "ja" } })), sources: [{ id: "source", ...stamp, content: { title: "原資料の固定版", url: null, bibliography: "試験資料集 第1版", language: "ja" } }], records, mappings: [] };
}
const date = (id: string, from: string) => ({ id, time: { kind: "calendar" as const, meaning: "point" as const, from, label: id } });

it("anchors a child axis to the explicitly selected parent time and rejects missing references",()=>{
 const records=[record("parent",{times:[date("first","1991"),date("second","1992")]}),record("child",{times:[date("event","1992-03")]})];
 const layout:KnowledgeTimeline={version:1,axes:[{id:"main",kind:"calendar",label:"親"},{id:"child",kind:"calendar",label:"子"}],placements:[{recordId:"parent",timeId:"first",axisId:"main"},{recordId:"parent",timeId:"second",axisId:"main"},{recordId:"child",timeId:"event",axisId:"child"}],insets:[{parentRecordId:"parent",parentTimeId:"second",axisId:"child",label:"詳細"}]};
 expect(knowledgeTimelineIssues(records,layout)).toEqual([]);expect(knowledgeTimelineLayout(records,layout)!.insets[0].parentRecordId).toContain(encodeURIComponent('second'));
 layout.insets[0].parentTimeId="missing";expect(knowledgeTimelineIssues(records,layout)).toContain("子軸を接続する親の時間注釈がありません");
});

describe("common fixed snapshot timeline", () => {
  it("projects multiple time annotations without duplicating the Record or losing exact citations", () => {
    const r = record("record:with.dots", { kind: "relation", subjectId: "a", objectId: "b", relation: "装画と挿絵", polarity: "denied", scope: "初版のみ", times: [date("a:b", "1991"), date("a", "1991-06-20")] });
    const s = snapshot([r]);
    s.sources.push({ ...s.sources[0], revision: 2, content: { ...s.sources[0].content, title: "引用していない新しい資料版" } });
    s.timeline = { version: 1, axes: [{ id: "years", kind: "calendar", label: "年表" }], placements: r.content.times.map(t => ({ recordId: r.id, timeId: t.id, axisId: "years" })), insets: [] };
    const before = structuredClone(s), p = knowledgeTimelineProjection(s);
    expect(new Set(p.records.map(r => r.id)).size).toBe(2);
    expect(p.records.map(r => r.recordId)).toEqual([r.id, r.id]);
    expect(p.records.map(r => r.time)).toEqual(r.content.times.map(t => t.time));
    expect(p.records[0]).toMatchObject({ polarity: "denied", scope: "初版のみ", relation: "装画と挿絵", evidence: [{ title: "原資料の固定版", sourceRevision: 1, url: null, excerpt: "", stance: "background" }] });
    expect(p.graphRecordIds).toEqual([r.id]);
    expect(knowledgeTimelineIssues(s.records, s.timeline)).toEqual([]);
    expect(buildTimelineGroups(p.records, p.timeline)[0].records).toHaveLength(2);
    expect(calendarGraph(p.records).ranges).toHaveLength(2);
    expect(s).toEqual(before);
  });
  it("keeps a subjectless duration and an undated note out of graph identity", () => {
    const s = snapshot([record("period", { times: [{ id: "duration", time: { kind: "calendar", meaning: "duration", from: "1901", to: "1904", label: "期間の説明" } }] }), record("undated")]);
    s.entities = [];
    const p = knowledgeTimelineProjection(s);
    expect(p.records.every(r => r.subject === null && r.object === null)).toBe(true);
    expect(p.records[1]).toMatchObject({ timeId: null, time: null });
    expect(p.entities).toEqual([]);
    expect(p.graphRecordIds).toEqual([]);
    expect(buildTimelineGroups(p.records).map(g => g.kind)).toEqual(["calendar", "none"]);
  });
  it("leaves undated context to the surrounding Theme when requested without changing the snapshot", () => {
    const s = snapshot([record("context"), record("dated", { times: [date("day", "1991")] })]);
    const before = structuredClone(s);
    expect(knowledgeTimelineProjection(s).records.map(r => r.recordId)).toEqual(["context", "dated"]);
    expect(knowledgeTimelineProjection(s, { untimedInContext: true }).records.map(r => r.recordId)).toEqual(["dated"]);
    expect(s).toEqual(before);
  });
  it("retains an explicitly required undated inset parent even when context lives beside the timeline", () => {
    const s = snapshot([record("parent"), record("context"), record("dated", { times: [date("day", "1991")] })]);
    s.timeline = { version: 1, axes: [{ id: "child", kind: "calendar", label: "背景に関連づけた年表" }], placements: [{ recordId: "dated", timeId: "day", axisId: "child" }], insets: [{ parentRecordId: "parent", axisId: "child", label: "詳細な時期" }] };
    const p = knowledgeTimelineProjection(s, { untimedInContext: true });
    expect(p.records.map(r => r.recordId)).toEqual(["parent", "dated"]);
    const groups = buildTimelineGroups(p.records, p.timeline);
    expect(groups.find(g => g.kind === "calendar")?.parentRecordId).toBe(p.records[0].id);
    expect(p.records[0].time).toBeNull();
  });
  it("never substitutes a newer source when the cited fixed source version is missing", () => {
    const s = snapshot([record("r")]); s.sources[0].revision = 2;
    expect(() => knowledgeTimelineProjection(s)).toThrow("引用資料の版");
  });
  it("places one explicitly nested axis once under a multi-time parent", () => {
    const parent = record("parent", { times: [date("first", "2022-01-05"), date("other", "2022-01-06")] });
    const child = record("child", { times: [{ id: "phase", time: { kind: "qualitative", axis: "工程", from: "昼", label: "表示用の段階", coordinateMeaning: "一日の工程" } }] });
    const t: KnowledgeTimeline = { version: 1, axes: [{ id: "calendar", kind: "calendar", label: "日付" }, { id: "day", kind: "qualitative", label: "一日の工程", order: ["朝", "昼", "夜"], originLabel: "EST（UTC−05:00）" }], placements: [{ recordId: "parent", timeId: "first", axisId: "calendar" }, { recordId: "parent", timeId: "other", axisId: "calendar" }, { recordId: "child", timeId: "phase", axisId: "day" }], insets: [{ parentRecordId: "parent", axisId: "day", label: "この日の工程" }] };
    expect(knowledgeTimelineIssues([parent, child], t)).toEqual([]);
    const p = knowledgeTimelineProjection({ ...snapshot([parent, child]), timeline: t });
    const groups = buildTimelineGroups(p.records, p.timeline);
    expect(groups.filter(g => g.parentRecordId)).toHaveLength(1);
    expect(groups.find(g => g.id === p.timeline!.axes[1].id)).toMatchObject({ parentRecordId: p.records[0].id, originLabel: "EST（UTC−05:00）" });
  });
  it("separates common axis IDs from renderer fallback identities", () => {
    const rs = [record("dated", { times: [date("day", "1991")] }), record("phase", { times: [{ id: "phase", time: { kind: "qualitative", axis: "工程", from: "朝", coordinateMeaning: "工程の段階", label: "朝" } }] })];
    const p = knowledgeTimelineProjection({ ...snapshot(rs), timeline: { version: 1, axes: [{ id: "fallback:calendar", kind: "qualitative", label: "工程" }], placements: [{ recordId: "phase", timeId: "phase", axisId: "fallback:calendar" }], insets: [] } });
    const groups = buildTimelineGroups(p.records, p.timeline);
    expect(groups.find(g => g.kind === "calendar")?.records.map(r => r.recordId)).toEqual(["dated"]);
    expect(groups.find(g => g.kind === "qualitative")?.records.map(r => r.recordId)).toEqual(["phase"]);
  });
  it("handles ambiguous IDs without treating different record/time pairs as duplicates", () => {
    const rs = [record("a:b", { times: [date("c", "1991")] }), record("a", { times: [date("b:c", "1991")] })];
    const t: KnowledgeTimeline = { version: 1, axes: [{ id: "years", kind: "calendar", label: "年" }], placements: rs.map(r => ({ recordId: r.id, timeId: r.content.times[0].id, axisId: "years" })), insets: [] };
    expect(knowledgeTimelineIssues(rs, t)).toEqual([]);
    expect(new Set(knowledgeTimelineLayout(rs, t)!.placements.map(p => p.recordId)).size).toBe(2);
  });
});

describe("common timeline semantics validation", () => {
  const phase = (from: string, meaning = "活動段階") => ({ id: "phase", time: { kind: "qualitative" as const, axis: "工程", from, coordinateMeaning: meaning, label: "表示用の段階" } });
  const config = (rs: KnowledgeRecordVersion[], kind: "calendar" | "qualitative" | "cycle"): KnowledgeTimeline => ({ version: 1, axes: [{ id: "axis", kind, label: "工程" }], placements: rs.flatMap(r => r.content.times.map(t => ({ recordId: r.id, timeId: t.id, axisId: "axis" }))), insets: [] });
  it("rejects incompatible cycle units and qualitative meanings/order", () => {
    const cycles = [24, 48].map((period, i) => record(`c${i}`, { times: [{ id: "cycle", time: { kind: "cycle", axis: "時刻", period, unit: "時間", from: 1, to: 3, wrap: false, label: "表示用の段階" } }] }));
    expect(knowledgeTimelineIssues(cycles, config(cycles, "cycle"))).toContain("同じ周期軸では周期長と単位を揃えてください");
    const rs = [record("a", { times: [phase("朝")] }), record("b", { times: [phase("夜", "照明の状態")] })];
    const t = config(rs, "qualitative");
    expect(knowledgeTimelineIssues(rs, t)).toContain("同じ定性軸では座標の意味を揃えてください");
    t.axes[0].order = ["朝", "昼"];
    expect(knowledgeTimelineIssues(rs, t)).toContain("記録の段階が軸の順序に含まれていません");
  });
  it("rejects inset cycles and depth beyond the existing three-level contract", () => {
    const rs = Array.from({ length: 5 }, (_, i) => record(`r${i}`, { times: [date("when", "1991")] }));
    const t: KnowledgeTimeline = { version: 1, axes: rs.map((r, i) => ({ id: `axis${i}`, kind: "calendar", label: r.id })), placements: rs.map((r, i) => ({ recordId: r.id, timeId: "when", axisId: `axis${i}` })), insets: rs.slice(1).map((_, i) => ({ parentRecordId: `r${i}`, axisId: `axis${i + 1}`, label: "内側" })) };
    expect(knowledgeTimelineIssues(rs, t)).toContain("年表の入れ子は3段までにしてください");
    t.insets.pop(); expect(knowledgeTimelineIssues(rs, t)).toEqual([]);
    t.insets = [{ parentRecordId: "r0", axisId: "axis0", label: "循環" }];
    expect(knowledgeTimelineIssues(rs, t)).toContain("年表の入れ子が循環しています");
  });
});
