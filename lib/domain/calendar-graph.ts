import { calendarMeaning, type CalendarTime } from "./theme-time";
import type { TimelineTimedRow } from "./timeline-display";
import { calendarBounds, calendarValue } from "./calendar-value";

export type CalendarUnit = "year" | "month" | "day" | "hour";
export type CalendarResolution = "auto" | CalendarUnit;

const precision = { year: 4, month: 7, day: 10, hour: 13 };
// A range with identical source bounds may need a visible interval even when
// both ends project to one date bucket: a separate point at that same precision
// otherwise becomes indistinguishable from the occurrence window.
function coincidentPoint(time: CalendarTime, others: CalendarTime[]) {
  return ["occurrence-window", "unclassified-range"].includes(calendarMeaning(time)) && time.to === time.from &&
    others.some(other => calendarMeaning(other) === "point" && other.from === time.from);
}

const valuePrecision = ["year", "month", "day", "hour", "minute", "second"];
function singleAnchor(time: CalendarTime, others: CalendarTime[]) {
  const meaning = calendarMeaning(time);
  if (meaning !== "point" && !(meaning !== "duration" && time.to === time.from)) return false;
  if (coincidentPoint(time, others)) return false;
  const value = calendarValue(time.from)!;
  const [start, end] = calendarLayoutBounds(time.from);
  return !others.some(other =>
    [other.from, other.startLatest, other.endEarliest, other.to].some(raw => {
      if (!raw) return false;
      const finer = calendarValue(raw)!;
      return valuePrecision.indexOf(finer.precision) > valuePrecision.indexOf(value.precision) &&
        finer.bounds.some(bound => bound >= start && bound <= end);
    }),
  );
}

const bucket = (date: number, unit: CalendarUnit) =>
  unit === "year"
    ? Math.floor(date / 10000) * 10000 + 101
    : unit === "month"
      ? Math.floor(date / 100) * 100 + 1
      : unit === "day" ? Math.floor(date) : Math.floor(date) + Math.floor((date%1)*24+0.00001)/24;

/** Display coordinates only. Partial dates remain unchanged in the source. */
export function calendarLayoutBounds(value: string): [number, number] {
  const parsed = calendarValue(value);
  if (!parsed) return calendarBounds(value);
  const [start, end] = parsed.bounds;
  // A day-precise upper bound includes the whole day when clock entries are
  // visible. This is a layout extent, never a fabricated time in stored data.
  return [start, ["year", "month", "day"].includes(parsed.precision) ? end + 86399 / 86400 : end];
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
  const collapsed = new Map(dated.map(record => [record.id, singleAnchor(record.time,
    dated.filter(other => other.id !== record.id).map(other => other.time))]));
  const labels = new Map<number, string[]>();
  for (const { id, time } of dated) {
    for (const value of [
      time.from,
      time.startLatest,
      time.endEarliest,
      time.to,
    ]) {
      if (!value) continue;
      const displayedBounds = collapsed.get(id) ? bounds(value).slice(0, 1) : bounds(value);
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
      isPoint = collapsed.get(record.id)!;
    const end = isPoint ? start : bounds(time.to ?? time.from)[1];
    // A coarse start cannot be later than the latest possible end and vice versa.
    const startEnd = isPoint ? start : Math.min(end, bounds(time.startLatest ?? time.from)[1]);
    const endStart = isPoint ? start : Math.max(
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
      compactRange: start === end && coincidentPoint(time,
        dated.filter(other => other.id !== record.id).map(other => other.time)),
      uncertainBoundary: !isPoint && (
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
