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
  expect(coarse.endRow).toBeGreaterThan(day.endRow);
  expect(g.slices.map((s) => s.label)).not.toContain("1903-01-01");
});
