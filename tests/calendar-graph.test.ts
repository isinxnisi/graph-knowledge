import { expect, it } from "vitest";
import {
  calendarGraph,
  calendarLayoutBounds,
} from "../lib/domain/calendar-graph";
import type { ThemeRecord, ThemeTime } from "../lib/domain/theme-workbench";
const record = (id: string, time: ThemeTime): ThemeRecord => ({
  id,
  kind: "episode",
  subject: id,
  object: null,
  relation: "",
  assertion: id,
  scope: "",
  polarity: "affirmed",
  time,
  evidence: [],
  revision: 1,
  updatedAt: "",
  reason: "",
  mapping: null,
});

it("places overlapping periods on separate lanes spanning the intervening event rows", () => {
  const a = record("period", {
    kind: "calendar",
    meaning: "duration",
    from: "1901",
    to: "1904",
    label: "青の時代",
  });
  const b = record("window", {
    kind: "calendar",
    meaning: "occurrence-window",
    from: "1903",
    to: "1904",
    label: "制作時期",
  });
  const c = record("event", {
    kind: "calendar",
    meaning: "point",
    from: "1903-12-15",
    label: "別の出来事",
  });
  const before = JSON.stringify([a, b, c]),
    g = calendarGraph([a, b, c]);
  const [period, window, event] = g.ranges;
  expect(period.lane).not.toBe(window.lane);
  expect(event.startRow).toBeGreaterThan(period.startRow);
  expect(event.endRow).toBeLessThan(period.endRow);
  expect(period.endRow - period.startRow).toBeGreaterThan(2);
  expect(JSON.stringify([a, b, c])).toBe(before);
});

it("reuses lanes only after the previous range has ended", () => {
  const g = calendarGraph([
    record("a", {
      kind: "calendar",
      meaning: "duration",
      from: "2020",
      to: "2021",
      label: "",
    }),
    record("b", {
      kind: "calendar",
      meaning: "duration",
      from: "2022",
      to: "2023",
      label: "",
    }),
  ]);
  expect(g.laneCount).toBe(1);
  expect(g.ranges[0].lane).toBe(g.ranges[1].lane);
});

it("does not draw a certain interior when endpoint windows overlap", () => {
  const g = calendarGraph([
    record("a", {
      kind: "calendar",
      meaning: "duration",
      from: "2024-02-01",
      startLatest: "2024-02-20",
      endEarliest: "2024-02-10",
      to: "2024-02-28",
      label: "",
    }),
  ]);
  expect(g.ranges[0].startEndRow).toBeGreaterThan(g.ranges[0].endStartRow);
});

it("keeps mixed precision and early leap years without reverse rows or invented date labels", () => {
  expect(calendarLayoutBounds("0004-02")).toEqual([40201, 40229]);
  const records = [
    record("mixed", {
      kind: "calendar",
      meaning: "duration",
      from: "1903-12",
      to: "1903",
      label: "",
    }),
    record("coarse", {
      kind: "calendar",
      meaning: "point",
      from: "1903",
      label: "",
    }),
    record("day", {
      kind: "calendar",
      meaning: "point",
      from: "1903-12-15",
      label: "",
    }),
  ];
  const g = calendarGraph(records);
  const [mixed, coarse, day] = g.ranges;
  expect(mixed.endRow).toBeGreaterThan(mixed.startRow);
  expect(coarse.startRow).toBeLessThan(day.startRow);
  expect(coarse.endRow).toBe(coarse.startRow);
  expect(g.slices.map((s) => s.label)).not.toContain("1903-01-01");
});

it("projects a year event and a within-year occurrence window to separate points, without losing their meaning", () => {
  const records = [
    record("year", {
      kind: "calendar",
      meaning: "point",
      from: "1991",
      label: "1991年",
    }),
    record("window", {
      kind: "calendar",
      meaning: "occurrence-window",
      from: "1991-02-01",
      to: "1991-11-30",
      label: "1991年のどこか",
    }),
  ];
  const before = JSON.stringify(records);
  const year = calendarGraph(records, "year");
  expect(year.unit).toBe("year");
  expect(year.ranges.every((r) => r.start === r.end)).toBe(true);
  expect(year.ranges.map((r) => r.meaning)).toEqual([
    "point",
    "occurrence-window",
  ]);
  expect(year.ranges[0].anchorRow).not.toBe(year.ranges[1].anchorRow);
  expect(year.rows.map((r) => r.label)).toEqual(["1991", "1991"]);
  expect(calendarGraph(records, "day").ranges[1].end).toBeGreaterThan(
    calendarGraph(records, "day").ranges[1].start,
  );
  expect(JSON.stringify(records)).toBe(before);
});

it("uses the display unit rather than the presence of other events to collapse occurrence windows", () => {
  const window = record("window", {
    kind: "calendar",
    meaning: "occurrence-window",
    from: "2030-05-04",
    to: "2030-05-10",
    label: "",
  });
  const other = record("other", {
    kind: "calendar",
    meaning: "point",
    from: "2030-05-07",
    label: "",
  });
  for (const unit of ["year", "month", "day"] as const) {
    const alone = calendarGraph([window], unit).ranges[0];
    const together = calendarGraph([window, other], unit).ranges[0];
    expect([alone.start, alone.end]).toEqual([together.start, together.end]);
    expect(alone.start === alone.end).toBe(unit !== "day");
  }
});

it("retains a cross-year window and a within-bucket duration as different temporal meanings", () => {
  const window = record("window", {
    kind: "calendar",
    meaning: "occurrence-window",
    from: "1991-12-20",
    to: "1992-01-10",
    label: "",
  });
  const duration = record("duration", {
    kind: "calendar",
    meaning: "duration",
    from: "1991-05-04",
    to: "1991-05-10",
    label: "",
  });
  const [w, d] = calendarGraph([window, duration], "year").ranges;
  expect(w.end).toBeGreaterThan(w.start);
  expect(d.end).toBe(d.start);
  expect(d.meaning).toBe("duration");
});

it("anchors each shared-date record and each end to its own row, without changing record order", () => {
  const records = [
    record("duration", {
      kind: "calendar",
      meaning: "duration",
      from: "2030-05-04",
      to: "2030-05-10",
      label: "",
    }),
    record("point", {
      kind: "calendar",
      meaning: "point",
      from: "2030-05-04",
      label: "",
    }),
    record("atEnd", {
      kind: "calendar",
      meaning: "point",
      from: "2030-05-10",
      label: "",
    }),
  ];
  const graph = calendarGraph(records);
  expect(graph.slices[0].records.map((r) => r.id)).toEqual([
    "duration",
    "point",
  ]);
  for (const r of graph.ranges) {
    expect(graph.rows[r.anchorRow].record?.id).toBe(r.record.id);
    if (r.start !== r.end)
      expect(graph.rows[r.endAnchorRow].ending?.id).toBe(r.record.id);
  }
  const duration = graph.ranges[0];
  expect(duration.startBoundaryRow).toBe(duration.anchorRow);
  expect(duration.endBoundaryRow).toBe(duration.endAnchorRow);
  expect(duration.endAnchorRow).toBeGreaterThan(graph.ranges[2].anchorRow);
});

it("chooses the finest stored precision for automatic display and never guesses sub-year source dates", () => {
  const year = record("year", {
    kind: "calendar",
    from: "1991",
    label: "年だけ",
  });
  const month = record("month", {
    kind: "calendar",
    from: "1991-05",
    label: "月だけ",
  });
  expect(calendarGraph([year]).unit).toBe("year");
  expect(calendarGraph([year, month]).unit).toBe("month");
  expect(calendarGraph([year], "day").slices.map((s) => s.label)).toEqual(["1991"]);
});

it("keeps year/month events as single anchors alongside day-precise events in every display unit", () => {
  const records = [
    record("workshop", { kind: "calendar", meaning: "point", from: "1989-09", label: "検討会" }),
    record("recommendation", { kind: "calendar", meaning: "point", from: "1996", label: "提言" }),
    record("launch", { kind: "calendar", meaning: "point", from: "2021-12-25", label: "打上げ" }),
  ];
  const original = JSON.stringify(records);
  for (const resolution of ["auto", "year", "month", "day", "hour"] as const) {
    const graph = calendarGraph(records, resolution);
    expect(graph.ranges.every(range => range.start === range.end)).toBe(true);
    expect(graph.rows).toHaveLength(3);
    expect(graph.rows.every(row => row.record && !row.ending)).toBe(true);
    expect(graph.ranges.every(range => range.anchorRow === range.endAnchorRow)).toBe(true);
  }
  expect(calendarGraph(records).rows.map(row => row.label)).toEqual(["1989-09", "1996", "2021-12-25"]);
  expect(JSON.stringify(records)).toBe(original);
});

it("collapses identical coarse occurrence bounds without reclassifying real durations", () => {
  for (const value of ["1996", "1989-09"]) {
    const records = (["occurrence-window", "unclassified-range", "duration"] as const).map(meaning =>
      record(meaning, { kind: "calendar", meaning, from: value, to: value, label: "" }));
    const graph = calendarGraph(records, "day");
    expect(graph.ranges.slice(0, 2).every(range => range.start === range.end)).toBe(true);
    expect(graph.ranges[2].end).toBeGreaterThan(graph.ranges[2].start);
    expect(graph.ranges.map(range => range.meaning)).toEqual(["occurrence-window", "unclassified-range", "duration"]);
  }
});
