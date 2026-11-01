import { calendarMeaning, type CalendarTime } from "./theme-time";
import type { ThemeRecord } from "./theme-workbench";

export type CalendarUnit = "year" | "month" | "day";
export type CalendarResolution = "auto" | CalendarUnit;

const precision = { year: 4, month: 7, day: 10 };
const bucket = (date: number, unit: CalendarUnit) =>
  unit === "year"
    ? Math.floor(date / 10000) * 10000 + 101
    : unit === "month"
      ? Math.floor(date / 100) * 100 + 1
      : date;

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

export function calendarGraph(
  records: ThemeRecord[],
  resolution: CalendarResolution = "auto",
) {
  const dated = records.filter(
    (r): r is ThemeRecord & { time: CalendarTime } =>
      r.time?.kind === "calendar",
  );
  const values = dated.flatMap(({ time }) =>
    [time.from, time.startLatest, time.endEarliest, time.to].filter(
      (v): v is string => !!v,
    ),
  );
  const finest = Math.max(4, ...values.map((v) => v.length));
  const unit: CalendarUnit =
    resolution === "auto"
      ? finest >= 10
        ? "day"
        : finest >= 7
          ? "month"
          : "year"
      : resolution;
  const bounds = (value: string) =>
    calendarLayoutBounds(value).map((v) => bucket(v, unit)) as [number, number];
  const labels = new Map<number, string[]>();
  for (const { time } of dated) {
    for (const value of [
      time.from,
      time.startLatest,
      time.endEarliest,
      time.to,
    ]) {
      if (!value) continue;
      for (const bound of bounds(value)) {
        labels.set(bound, [
          ...new Set([
            ...(labels.get(bound) ?? []),
            value.slice(0, precision[unit]),
          ]),
        ]);
      }
    }
  }
  const coordinates = [...labels.keys()].sort((a, b) => a - b);
  const ranges = dated.map((record) => {
    const time = record.time,
      [start, pointEnd] = bounds(time.from);
    const end = bounds(time.to ?? time.from)[1];
    // A coarse start cannot be later than the latest possible end and vice versa.
    const startEnd = Math.min(end, bounds(time.startLatest ?? time.from)[1]);
    const endStart = Math.max(
      start,
      bounds(time.endEarliest ?? time.to ?? time.from)[0],
    );
    return {
      record,
      start,
      end: time.to ? end : pointEnd,
      startEnd,
      endStart,
      meaning: calendarMeaning(time),
      uncertainBoundary:
        calendarLayoutBounds(time.startLatest ?? time.from)[1] >
          calendarLayoutBounds(time.from)[0] ||
        calendarLayoutBounds(time.to ?? time.from)[1] >
          calendarLayoutBounds(time.endEarliest ?? time.to ?? time.from)[0],
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
  const slices = coordinates.map((coordinate) => ({
    coordinate,
    // Never expose an invented month/day for a coarser source expression.
    label: labels.get(coordinate)!.toSorted((a, b) => b.length - a.length)[0],
    records: ranges.filter((r) => r.start === coordinate).map((r) => r.record),
    ending: ranges
      .filter((r) => r.end === coordinate && r.start !== r.end)
      .map((r) => r.record),
  }));
  // Every record and every interval end has its own anchor row. A date group
  // must not send all connectors to its first card when several records share it.
  const rows = slices.flatMap((slice) => {
    const entries: { record?: ThemeRecord; ending?: ThemeRecord }[] = [
      ...slice.records.map((record) => ({ record })),
      ...slice.ending.map((ending) => ({ ending })),
    ];
    if (!entries.length) entries.push({});
    return entries.map((entry, index) => ({
      ...entry,
      coordinate: slice.coordinate,
      label: slice.label,
      first: index === 0,
      count: entries.length,
    }));
  });
  return {
    unit,
    laneCount: Math.max(1, laneEnds.length),
    ranges: ranges.map((r) => {
      const anchorRow = rows.findIndex((row) => row.record?.id === r.record.id);
      const endAnchorRow =
        r.start === r.end
          ? rows.findIndex((row) => row.record?.id === r.record.id)
          : rows.findIndex((row) => row.ending?.id === r.record.id);
      const boundaryRow = (coordinate: number) =>
        coordinate === r.start
          ? anchorRow
          : coordinate === r.end
            ? endAnchorRow
            : rows.findIndex((row) => row.coordinate === coordinate);
      return {
        ...r,
        startRow: coordinates.indexOf(r.start),
        endRow: coordinates.indexOf(r.end),
        startEndRow: coordinates.indexOf(r.startEnd),
        endStartRow: coordinates.indexOf(r.endStart),
        anchorRow,
        endAnchorRow,
        startBoundaryRow: boundaryRow(r.startEnd),
        endBoundaryRow: boundaryRow(r.endStart),
      };
    }),
    slices,
    rows,
  };
}
