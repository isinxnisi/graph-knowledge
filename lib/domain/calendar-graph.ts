import { calendarMeaning, type CalendarTime } from "./theme-time";
import type { TimelineTimedRow } from "./timeline-display";
import { calendarBounds, calendarValue } from "./calendar-value";

export type CalendarUnit = "year" | "month" | "day" | "hour";
export type CalendarResolution = "auto" | CalendarUnit;

const precision = { year: 4, month: 7, day: 10, hour: 13 };
// A partial date limits precision; it does not turn a dated event into a period.
const singleAnchor = (time: CalendarTime) =>
  calendarMeaning(time) === "point" ||
  (calendarMeaning(time) !== "duration" && time.to === time.from);

const bucket = (date: number, unit: CalendarUnit) =>
  unit === "year"
    ? Math.floor(date / 10000) * 10000 + 101
    : unit === "month"
      ? Math.floor(date / 100) * 100 + 1
      : unit === "day" ? Math.floor(date) : Math.floor(date) + Math.floor((date%1)*24+0.00001)/24;

/** Display coordinates only. Partial dates remain unchanged in the source. */
export function calendarLayoutBounds(value: string): [number, number] {
  return calendarBounds(value);
}

export function calendarGraph<R extends TimelineTimedRow>(
  records: R[],
  resolution: CalendarResolution = "auto",
) {
  const dated = records.filter(
    (r): r is R & { time: CalendarTime } =>
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
      ? finest >= 13 ? "hour" : finest >= 10
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
      const displayedBounds = singleAnchor(time) ? bounds(value).slice(0, 1) : bounds(value);
      for (const bound of displayedBounds) {
        labels.set(bound, [
          ...new Set([
            ...(labels.get(bound) ?? []),
            calendarValue(value)?.zone ? value : value.slice(0, precision[unit]),
          ]),
        ]);
      }
    }
  }
  const coordinates = [...labels.keys()].sort((a, b) => a - b);
  const ranges = dated.map((record) => {
    const time = record.time,
      [start] = bounds(time.from),
      collapsed = singleAnchor(time);
    const end = collapsed ? start : bounds(time.to ?? time.from)[1];
    // A coarse start cannot be later than the latest possible end and vice versa.
    const startEnd = collapsed ? start : Math.min(end, bounds(time.startLatest ?? time.from)[1]);
    const endStart = collapsed ? start : Math.max(
      start,
      bounds(time.endEarliest ?? time.to ?? time.from)[0],
    );
    return {
      record,
      start,
      end,
      startEnd,
      endStart,
      meaning: calendarMeaning(time),
      uncertainBoundary: !collapsed && (
        calendarLayoutBounds(time.startLatest ?? time.from)[1] >
          calendarLayoutBounds(time.from)[0] ||
        calendarLayoutBounds(time.to ?? time.from)[1] >
          calendarLayoutBounds(time.endEarliest ?? time.to ?? time.from)[0]),
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
    const entries: { record?: R; ending?: R }[] = [
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
