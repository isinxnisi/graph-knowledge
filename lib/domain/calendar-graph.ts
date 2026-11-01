import { calendarMeaning, type CalendarTime } from "./theme-time";
import type { ThemeRecord } from "./theme-workbench";

/** Display coordinates only. Partial dates remain unchanged in the source. */
export function calendarLayoutBounds(value: string): [number, number] {
  const [year, month, day] = value.split("-").map(Number);
  const firstMonth = month ?? 1,
    lastMonth = month ?? 12;
  const days =
    lastMonth === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(lastMonth)
        ? 30
        : 31;
  return [
    year * 10000 + firstMonth * 100 + (day ?? 1),
    year * 10000 + lastMonth * 100 + (day ?? days),
  ];
}

export function calendarGraph(records: ThemeRecord[]) {
  const dated = records.filter(
    (r): r is ThemeRecord & { time: CalendarTime } =>
      r.time?.kind === "calendar",
  );
  const labels = new Map<number, string[]>();
  for (const { time } of dated) {
    for (const value of [
      time.from,
      time.startLatest,
      time.endEarliest,
      time.to,
    ]) {
      if (!value) continue;
      for (const bound of calendarLayoutBounds(value)) {
        labels.set(bound, [...new Set([...(labels.get(bound) ?? []), value])]);
      }
    }
  }
  const coordinates = [...labels.keys()].sort((a, b) => a - b);
  const ranges = dated.map((record) => {
    const time = record.time,
      [start, pointEnd] = calendarLayoutBounds(time.from);
    const end = calendarLayoutBounds(time.to ?? time.from)[1];
    // A coarse start cannot be later than the latest possible end and vice versa.
    const startEnd = Math.min(
      end,
      calendarLayoutBounds(time.startLatest ?? time.from)[1],
    );
    const endStart = Math.max(
      start,
      calendarLayoutBounds(time.endEarliest ?? time.to ?? time.from)[0],
    );
    return {
      record,
      start,
      end: time.to ? end : pointEnd,
      startEnd,
      endStart,
      meaning: calendarMeaning(time),
      lane: 0,
    };
  });
  const laneEnds: number[] = [];
  for (const range of [...ranges].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )) {
    let lane = laneEnds.findIndex((end) => end < range.start);
    if (lane < 0) lane = laneEnds.length;
    range.lane = lane;
    laneEnds[lane] = range.end;
  }
  return {
    laneCount: Math.max(1, laneEnds.length),
    ranges: ranges.map((r) => ({
      ...r,
      startRow: coordinates.indexOf(r.start),
      endRow: coordinates.indexOf(r.end),
      startEndRow: coordinates.indexOf(r.startEnd),
      endStartRow: coordinates.indexOf(r.endStart),
    })),
    slices: coordinates.map((coordinate) => ({
      coordinate,
      // Use an original expression, never expose the layout's invented day.
      label: labels.get(coordinate)!.toSorted((a, b) => b.length - a.length)[0],
      records: ranges
        .filter((r) => r.start === coordinate)
        .map((r) => r.record),
      ending: ranges
        .filter((r) => r.end === coordinate && r.start !== r.end)
        .map((r) => r.record),
    })),
  };
}
