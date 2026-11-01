import { describe, expect, it } from "vitest";
import {
  themePackageSchema,
  themeRecordInputSchema,
  type ThemeRecord,
  type ThemeTime,
  type ThemeTimelineConfig,
} from "../lib/domain/theme-workbench";
import {
  buildTimelineGroups,
  subsetThemeTimeline,
  themeTimelineIssues,
} from "../lib/domain/theme-timeline";

function record(id: string, time: ThemeTime | null): ThemeRecord {
  return {
    ...themeRecordInputSchema.parse({
      id,
      kind: "episode",
      subject: "subject",
      assertion: id,
      time,
      evidence: [
        {
          url: "https://example.org/source",
          title: "試験資料",
          locator: "合成データ",
          excerpt: "構造確認用",
          retrievedAt: "2026-11-01T00:00:00Z",
        },
      ],
    }),
    revision: 1,
    reason: "初回",
    updatedAt: "2026-11-01T00:00:00Z",
    mapping: null,
  };
}
const calendar = (from: string, to?: string): ThemeTime => ({
  kind: "calendar",
  from,
  ...(to ? { to } : {}),
  label: "資料の時期表現",
});
const cycle = (period = 24, unit = "時間"): ThemeTime => ({
  kind: "cycle",
  axis: "一日の流れ",
  period,
  unit,
  from: 20,
  to: 4,
  wrap: true,
  label: "夜間",
});
const phase = (from = "早朝", to?: string): ThemeTime => ({
  kind: "qualitative",
  axis: "一日の段階",
  from,
  ...(to ? { to } : {}),
  coordinateMeaning: "生活の段階。距離を意味しない",
  label: "そのころ",
});
const records = () => [
  record("year", calendar("1989")),
  record("date", calendar("1989-07-10")),
  record("night", cycle()),
  record("phase", phase("早朝", "日中")),
  record("note", null),
];
const config = (): ThemeTimelineConfig => ({
  version: 1,
  axes: [
    { id: "years", kind: "calendar", label: "年ごとの記録" },
    {
      id: "day",
      kind: "cycle",
      label: "一日の周期",
      originLabel: "0はその日の午前0時",
    },
    {
      id: "phases",
      kind: "qualitative",
      label: "生活の段階",
      order: ["早朝", "日の出", "日中", "日の入り", "夜間"],
    },
  ],
  placements: [
    { recordId: "year", axisId: "years" },
    { recordId: "date", axisId: "years" },
    { recordId: "night", axisId: "day" },
    { recordId: "phase", axisId: "phases" },
  ],
  insets: [
    { parentRecordId: "year", axisId: "day", label: "この期間の一日" },
    { parentRecordId: "night", axisId: "phases", label: "その日の段階" },
  ],
});
function packageOf(rs: ThemeRecord[], timeline: ThemeTimelineConfig) {
  return {
    schemaVersion: 1,
    id: "timeline",
    title: "年表",
    description: "合成構造試験",
    entities: [{ id: "subject", name: "対象", kind: "人物" }],
    records: rs.map((r) =>
      Object.fromEntries(
        Object.entries(r).filter(
          ([key]) =>
            !["revision", "reason", "updatedAt", "mapping"].includes(key),
        ),
      ),
    ),
    timeline,
  };
}

describe("timeline projection and explicit context", () => {
  it("keeps original date precision, typed periods and undated records without synthetic coordinates", () => {
    const rs = records(),
      before = structuredClone(rs),
      groups = buildTimelineGroups(rs);
    expect(groups.map((g) => g.kind)).toEqual([
      "calendar",
      "cycle",
      "qualitative",
      "none",
    ]);
    expect(groups[0].records.map((r) => r.time)).toEqual([
      calendar("1989"),
      calendar("1989-07-10"),
    ]);
    expect(groups[1].records[0].time).toMatchObject({
      from: 20,
      to: 4,
      wrap: true,
    });
    expect(groups[3].records[0].id).toBe("note");
    expect(rs).toEqual(before);
  });
  it("does not merge incompatible fallback axes just because their names match", () => {
    const rs = [
      record("a", cycle()),
      record("b", cycle(48)),
      record("c", cycle(24, "区間")),
      record("d", phase()),
      record("e", {
        ...phase(),
        coordinateMeaning: "観測上の明るさ",
      } as ThemeTime),
    ];
    expect(buildTimelineGroups(rs)).toHaveLength(5);
  });
  it("accepts explicit nested axes and leaves unplaced records in fallback roots", () => {
    const rs = records(),
      c = config();
    expect(themePackageSchema.safeParse(packageOf(rs, c)).success).toBe(true);
    const groups = buildTimelineGroups(rs, c);
    expect(groups.find((g) => g.id === "day")).toMatchObject({
      parentRecordId: "year",
      originLabel: "0はその日の午前0時",
    });
    expect(groups.find((g) => g.id === "phases")).toMatchObject({
      parentRecordId: "night",
      order: c.axes[2].order,
    });
    expect(groups.flatMap((g) => g.records.map((r) => r.id))).toEqual(
      rs.map((r) => r.id),
    );
  });
  it("rejects missing references, duplicate axes and multiple placements instead of silently dropping records", () => {
    const bad = [config(), config(), config(), config(), config()];
    bad[0].axes.push({ ...bad[0].axes[0] });
    bad[1].placements.push({ recordId: "date", axisId: "years" });
    bad[2].placements[0].recordId = "missing";
    bad[3].placements[0].axisId = "missing";
    bad[4].insets[0].parentRecordId = "missing";
    for (const c of bad)
      expect(
        themePackageSchema.safeParse(packageOf(records(), c)).success,
      ).toBe(false);
  });
  it("checks kind, cycle units and period, qualitative membership and direction", () => {
    const wrongKind = config();
    wrongKind.placements[2].axisId = "years";
    expect(
      themeTimelineIssues(records(), wrongKind).some((i) =>
        i.message.includes("種類"),
      ),
    ).toBe(true);
    const incompatibleCycle = config();
    incompatibleCycle.placements.push({ recordId: "night2", axisId: "day" });
    for (const time of [cycle(48), cycle(24, "分")])
      expect(
        themeTimelineIssues(
          [...records(), record("night2", time)],
          incompatibleCycle,
        ).some((i) => i.message.includes("周期長")),
      ).toBe(true);
    const absent = config();
    absent.axes[2].order = ["日の出", "日中"];
    expect(
      themeTimelineIssues(records(), absent).some((i) =>
        i.message.includes("含まれて"),
      ),
    ).toBe(true);
    const reversed = config();
    reversed.axes[2].order = ["日中", "早朝"];
    expect(
      themeTimelineIssues(records(), reversed).some((i) =>
        i.message.includes("開始以降"),
      ),
    ).toBe(true);
    const duplicate = config();
    duplicate.axes[2].order = ["早朝", "日中", "早朝"];
    expect(
      themeTimelineIssues(records(), duplicate).some((i) =>
        i.message.includes("順序に重複"),
      ),
    ).toBe(true);
  });
  it("rejects self references, cycles, competing parents and more than three inset levels", () => {
    const self = config();
    self.insets[0].parentRecordId = "night";
    expect(
      themeTimelineIssues(records(), self).some((i) =>
        i.message.includes("循環"),
      ),
    ).toBe(true);
    const loop = config();
    loop.insets.push({
      parentRecordId: "phase",
      axisId: "years",
      label: "循環",
    });
    expect(
      themeTimelineIssues(records(), loop).some((i) =>
        i.message.includes("循環"),
      ),
    ).toBe(true);
    const duplicate = config();
    duplicate.insets.push({
      parentRecordId: "date",
      axisId: "day",
      label: "別親",
    });
    expect(
      themeTimelineIssues(records(), duplicate).some((i) =>
        i.message.includes("一つの親"),
      ),
    ).toBe(true);
    const rs = Array.from({ length: 5 }, (_, i) =>
      record("r" + i, calendar("1989")),
    );
    const c: ThemeTimelineConfig = {
      version: 1,
      axes: rs.map((_, i) => ({
        id: "a" + i,
        kind: "calendar",
        label: "段" + i,
      })),
      placements: rs.map((r, i) => ({ recordId: r.id, axisId: "a" + i })),
      insets: rs.slice(1).map((_, i) => ({
        parentRecordId: "r" + i,
        axisId: "a" + (i + 1),
        label: "内側",
      })),
    };
    expect(
      themeTimelineIssues(rs, c).some((i) => i.message.includes("3段")),
    ).toBe(true);
    c.insets.pop();
    expect(themeTimelineIssues(rs, c)).toEqual([]);
  });
  it("keeps origin and order while promoting saved children whose parents were not selected", () => {
    const c = config(),
      before = structuredClone(c),
      subset = subsetThemeTimeline(c, ["night", "phase"]);
    expect(subset?.axes.map((a) => a.id)).toEqual(["day", "phases"]);
    expect(subset?.axes[0].originLabel).toBe("0はその日の午前0時");
    expect(subset?.axes[1].order).toEqual(c.axes[2].order);
    expect(subset?.insets).toEqual([c.insets[1]]);
    const rs = records().filter((r) => ["night", "phase"].includes(r.id));
    expect(themeTimelineIssues(rs, subset)).toEqual([]);
    const groups = buildTimelineGroups(rs, subset);
    expect(groups[0].parentRecordId).toBeUndefined();
    expect(groups[0].label).toBe("一日の周期");
    expect(groups[1].parentRecordId).toBe("night");
    subset!.axes[1].order!.push("追加");
    expect(c).toEqual(before);
    expect(subsetThemeTimeline(undefined, ["night"])).toBeUndefined();
  });
  it("does not hide records when a locally filtered view omits a parent", () => {
    const rs = records().filter((r) => r.id === "phase");
    const groups = buildTimelineGroups(rs, config());
    expect(groups).toHaveLength(1);
    expect(groups[0].parentRecordId).toBeUndefined();
    expect(groups[0].records).toEqual(rs);
  });
});
