import { describe, expect, it } from "vitest";
import {
  themePackageSchema,
  themeRecordInputSchema,
  themeRecordSearchText,
  themeTimeSchema,
  type ThemeRecord,
  type ThemeTime,
} from "../lib/domain/theme-workbench";
import { calendarMeaning, themeTimeLabel } from "../lib/domain/theme-time";
import { buildTimelineGroups } from "../lib/domain/theme-timeline";
import { themeDocument } from "../lib/server/theme-workbench";

function record(id: string, time: ThemeTime): ThemeRecord {
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
          title: "合成試験資料",
          locator: "時期の意味の構造試験",
          excerpt: "実資料の主張ではない",
          retrievedAt: "2026-11-01T00:00:00Z",
        },
      ],
    }),
    revision: 1,
    reason: "構造試験",
    updatedAt: "2026-11-01T00:00:00Z",
    mapping: null,
  };
}
const base = {
  kind: "calendar" as const,
  from: "1985",
  to: "1989",
  label: "資料の原表現",
};

describe("calendar time meaning and uncertainty", () => {
  it("keeps old ranges undecided and preserves their stored shape", () => {
    const parsed = themeTimeSchema.parse(base);
    expect(parsed).toEqual(base);
    expect(calendarMeaning(base)).toBe("unclassified-range");
    expect(themeTimeLabel(parsed)).toBe(
      "時期の範囲（未区別）：1985〜1989 · 資料の原表現",
    );
    expect(
      themeTimeSchema.parse({ kind: "calendar", from: "1985", label: "" }),
    ).toEqual({ kind: "calendar", from: "1985", label: "" });
  });

  it("distinguishes a real duration from a possible occurrence window with the same endpoints", () => {
    const duration = themeTimeSchema.parse({ ...base, meaning: "duration" });
    const window = themeTimeSchema.parse({
      ...base,
      meaning: "occurrence-window",
    });
    expect(themeTimeLabel(duration)).toBe("期間：1985 → 1989 · 資料の原表現");
    expect(themeTimeLabel(window)).toBe(
      "発生時期の幅：1985〜1989（この間のどこか） · 資料の原表現",
    );
    expect(
      themeTimeLabel({
        kind: "calendar",
        meaning: "point",
        from: "1985",
        label: "",
      }),
    ).toBe("1985");
  });

  it("requires explicit duration for uncertain endpoints and rejects conflicting meanings", () => {
    for (const time of [
      { ...base, meaning: "point" },
      { kind: "calendar", from: "1985", meaning: "duration" },
      { kind: "calendar", from: "1985", meaning: "occurrence-window" },
      { ...base, startLatest: "1986" },
      { ...base, endEarliest: "1988" },
      { ...base, meaning: "occurrence-window", startLatest: "1986" },
      { kind: "calendar", meaning: "point", from: "1985", endEarliest: "1985" },
    ])
      expect(themeTimeSchema.safeParse(time).success).toBe(false);
  });

  it("allows overlapping uncertain endpoints without claiming a guaranteed interior", () => {
    const time = {
      ...base,
      meaning: "duration" as const,
      startLatest: "1988",
      endEarliest: "1986",
    };
    expect(themeTimeSchema.parse(time)).toEqual(time);
    expect(themeTimeLabel(time)).toBe(
      "期間：開始 1985〜1988 · 終了 1986〜1989 · 資料の原表現",
    );
  });

  it("rejects reversed or impossible endpoint windows and nonexistent boundary dates", () => {
    for (const endpoints of [
      { startLatest: "1984" },
      { startLatest: "1990" },
      { endEarliest: "1984" },
      { endEarliest: "1990" },
      { startLatest: "1986-02-29" },
      { endEarliest: "1988-04-31" },
      { to: "1984" },
    ])
      expect(
        themeTimeSchema.safeParse({
          ...base,
          meaning: "duration",
          ...endpoints,
        }).success,
      ).toBe(false);
    expect(
      themeTimeSchema.safeParse({
        ...base,
        meaning: "duration",
        startLatest: "1988-02-29",
      }).success,
    ).toBe(true);
  });

  it("preserves partial precision and rejects only impossible mixed-precision ordering", () => {
    const time = {
      kind: "calendar" as const,
      meaning: "duration" as const,
      from: "1985-06",
      startLatest: "1985",
      endEarliest: "1986-01",
      to: "1986",
      label: "年月のみ",
    };
    expect(themeTimeSchema.parse(time)).toEqual(time);
    expect(themeTimeLabel(time)).not.toContain("1985-01-01");
    expect(
      themeTimeSchema.safeParse({ ...time, startLatest: "1985-05" }).success,
    ).toBe(false);
    expect(themeTimeSchema.safeParse({ ...time, to: "1984" }).success).toBe(
      false,
    );
    expect(
      themeTimeSchema.safeParse({ kind: "calendar", from: "0004-02-29" })
        .success,
    ).toBe(true);
    expect(
      themeTimeSchema.safeParse({ kind: "calendar", from: "0100-02-29" })
        .success,
    ).toBe(false);
  });

  it("makes endpoint bounds, original wording and time meaning searchable", () => {
    const r = record("duration", {
      ...base,
      meaning: "duration",
      startLatest: "1986-03",
      endEarliest: "1988-07",
    });
    const text = themeRecordSearchText(r, []);
    for (const needle of [
      "期間",
      "開始",
      "終了",
      "1986-03",
      "1988-07",
      "資料の原表現",
    ])
      expect(text).toContain(needle);
    expect(
      themeRecordSearchText(
        record("window", { ...base, meaning: "occurrence-window" }),
        [],
      ),
    ).toContain("発生時期の幅");
    expect(themeRecordSearchText(record("legacy", base), [])).toContain(
      "未区別",
    );
  });

  it("preserves different temporal meanings through package parsing and snapshot projection without inferring membership", () => {
    const rs = [
      record("duration", {
        ...base,
        meaning: "duration",
        startLatest: "1986",
        endEarliest: "1988",
      }),
      record("within", {
        kind: "calendar",
        meaning: "point",
        from: "1987",
        label: "同時期の独立記録",
      }),
      record("possible", { ...base, meaning: "occurrence-window" }),
    ];
    const pack = themePackageSchema.parse({
      schemaVersion: 1,
      id: "time-meaning",
      title: "構造試験",
      description: "時期の重複だけでは所属を推論しない構造試験",
      entities: [{ id: "subject", name: "対象", kind: "対象" }],
      records: rs.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(
            ([key]) =>
              !["revision", "reason", "updatedAt", "mapping"].includes(key),
          ),
        ),
      ),
    });
    expect(pack.records.map((r) => r.time)).toEqual(rs.map((r) => r.time));
    const snapshot = JSON.parse(
      JSON.stringify({
        themeId: pack.id,
        themeRevision: 1,
        entities: pack.entities,
        records: rs,
      }),
    );
    const groups = buildTimelineGroups(snapshot.records);
    expect(groups).toHaveLength(1);
    expect(groups[0].parentRecordId).toBeUndefined();
    expect(groups[0].records.map((r) => r.time)).toEqual(rs.map((r) => r.time));
    const document = themeDocument(snapshot);
    expect(document.relations).toEqual([]);
    expect(document.texts).toHaveLength(0);
    expect(document.nodes).toHaveLength(0);
  });
});


describe("time description locale",()=>{
 it("localizes duration and uncertainty words without translating or rewriting authored labels",()=>{
  const value={kind:"calendar" as const,meaning:"duration" as const,from:"2021-12-28",to:"2022-01-04",startLatest:"2021-12-29",label:"作者の期間名",expression:"原資料の表記"};
  const original=JSON.stringify(value),label=themeTimeLabel(value,"en");
  expect(label).toContain("Duration: start");expect(label).toContain("Source notation: 原資料の表記");expect(label).toContain("作者の期間名");expect(label).not.toContain("期間：");expect(JSON.stringify(value)).toBe(original);
  expect(themeTimeLabel({...value,meaning:"occurrence-window"},"en")).toContain("Occurrence window:");
  expect(themeTimeLabel({...value,meaning:"unclassified-range"},"en")).toContain("Time range (unclassified):");
  expect(themeTimeLabel(null,"en")).toBe("No time specified");expect(themeTimeLabel(value)).toContain("期間：開始");
 });
});
