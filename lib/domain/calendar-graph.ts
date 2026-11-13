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
function hasFinerDate(value: string, others: CalendarTime[]) {
  const parsed = calendarValue(value)!;
  const [start, end] = calendarLayoutBounds(value);
  return others.some(other =>
    [other.from, other.startLatest, other.endEarliest, other.to].some(raw => {
      if (!raw) return false;
      const finer = calendarValue(raw)!;
      return valuePrecision.indexOf(finer.precision) > valuePrecision.indexOf(parsed.precision) &&
        finer.bounds.some(bound => bound >= start && bound <= end);
    }),
  );
}

function singleAnchor(time: CalendarTime, others: CalendarTime[]) {
  const meaning = calendarMeaning(time);
  if (meaning !== "point" && !(meaning !== "duration" && time.to === time.from)) return false;
  return !coincidentPoint(time, others) && !hasFinerDate(time.from, others);
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
  const labels = new Map<number, string[]>();
  const label = (coordinate: number, value: string) => {
    labels.set(coordinate, [...new Set([
      ...(labels.get(coordinate) ?? []),
      calendarValue(value)?.zone ? value : value.slice(0, precision[unit]),
    ])]);
  };
  const ranges = dated.map((record) => {
    const time = record.time;
    const others = dated.filter(other => other.id !== record.id).map(other => other.time);
    const isPoint = singleAnchor(time, others);
    const [start] = bounds(time.from);
    // Judge each end of a genuine interval independently. A coarse endpoint
    // needs width only to place finer dates inside it. Explicitly different
    // earliest/latest values retain their stated uncertainty window.
    const distinctEnds = !!time.to && time.to !== time.from;
    const collapseStart = distinctEnds && (!time.startLatest || time.startLatest === time.from) &&
      !hasFinerDate(time.from, [time, ...others]);
    const endValue = time.to ?? time.from;
    const collapseEnd = distinctEnds && (!time.endEarliest || time.endEarliest === endValue) &&
      bounds(endValue)[0] >= start && !hasFinerDate(endValue, [time, ...others]);
    const end = isPoint ? start : bounds(endValue)[collapseEnd ? 0 : 1];
    // A coarse start cannot be later than the latest possible end and vice versa.
    const startEnd = isPoint || collapseStart ? start : Math.min(end, bounds(time.startLatest ?? time.from)[1]);
    const endStart = isPoint ? start : collapseEnd ? end : Math.max(
      start,
      bounds(time.endEarliest ?? endValue)[0],
    );
    // Only effective boundaries create rows; discarded precision extents must
    // not leave empty date rows behind. Source dates themselves are untouched.
    label(start, time.from);
    if (!isPoint) {
      label(startEnd, time.startLatest ?? time.from);
      label(endStart, time.endEarliest ?? endValue);
      label(end, endValue);
    }
    return {
      record,
      start,
      end,
      startEnd,
      endStart,
      meaning: calendarMeaning(time),
      compactRange: start === end && coincidentPoint(time, others),
      uncertainBoundary: !isPoint && (
        (!collapseStart && calendarLayoutBounds(time.startLatest ?? time.from)[1] >
          calendarLayoutBounds(time.from)[0]) ||
        (!collapseEnd && calendarLayoutBounds(endValue)[1] >
          calendarLayoutBounds(time.endEarliest ?? endValue)[0])),
      lane: 0,
    };
  });
  const coordinates = [...labels.keys()].sort((a, b) => a - b);
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
