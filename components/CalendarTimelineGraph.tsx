"use client";

import {useUiLocale} from "../lib/client/ui-locale";
import {
  Fragment,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  calendarGraph,
  type CalendarResolution,
} from "../lib/domain/calendar-graph";
import { calendarMeaning, themeTimeLabel } from "../lib/domain/theme-time";
import { timelineRecordId, type TimelineDisplayRecord } from "../lib/domain/timeline-display";
import css from "./CalendarTimelineGraph.module.css";

const colors = ["#397a85", "#aa713c", "#6878a2", "#8b668f", "#6d844f"];

/** Keep the civil date intact; clock and offset can use their own lines in the gutter. */
function CalendarDateLabel({ label }: { label: string }) {
  const [date, clock] = label.split("T");
  const parts = clock?.match(/^([^Z+-]+)(Z|[+-]\d{2}:\d{2})?$/);
  return <time dateTime={label} className={css.dateLabel} aria-label={label}>
    <span className={css.dateValue}>{date}</span>
    {clock && <span className={css.dateClock}>T{parts?.[1] ?? clock}{parts?.[2] && <span className={css.dateZone}>{parts[2]}</span>}</span>}
  </time>;
}


export default function CalendarTimelineGraph<R extends TimelineDisplayRecord>({
  records,
  resolution,
  focusedRecordId,
  highlightedSubject,
  onFocus,
  renderRecord,
  compactDates = false,
}: {
  records: R[];
  resolution: CalendarResolution;
  focusedRecordId: string | null;
  highlightedSubject: string;
  onFocus: (id: string) => void;
  renderRecord: (record: R, index: number) => ReactNode;
  compactDates?: boolean;
}) {
  const {locale}=useUiLocale(),en=locale==="en";
  const unitNames = en?{year:"Year",month:"Month",day:"Day",hour:"Hour"}:{year:"年",month:"月",day:"日",hour:"時間"};
  const container = useRef<HTMLDivElement>(null);
  const open = (id: string) => {
    onFocus(id);
    requestAnimationFrame(() => {
      const row = [
        ...(container.current?.querySelectorAll<HTMLElement>(
          "[data-timeline-row-id]",
        ) ?? []),
      ].find((row) => row.dataset.timelineRowId === id);
      row?.scrollIntoView?.({ block: "nearest" });
    });
  };
  const graph = useMemo(
    () => calendarGraph(records, resolution),
    [records, resolution],
  );
  const shortName = (r: R) => (r.displayTime ?? r.time)?.label || r.assertion;
  const compactWindowEnd = (record: R) => {
    const time = record.displayTime ?? record.time;
    return compactDates && time?.kind === "calendar" && calendarMeaning(time) === "occurrence-window";
  };
  const lineStyle = (record: R) => {
    const range = graph.ranges.find((r) => r.record.id === record.id)!;
    return {
      "--lane": range.lane,
      "--line-color": colors[range.lane % colors.length],
      "--line-opacity":
        highlightedSubject && record.subject !== highlightedSubject ? 0.25 : 1,
    } as CSSProperties;
  };
  return (
    <div className={css.surface} ref={container} data-compact-dates={compactDates || undefined}>
      <p className={css.caption}>
        {en?`${unitNames[graph.unit]} scale · Order within one unit is unspecified. Spacing is not to scale.`:`${unitNames[graph.unit]}単位 · 同じ単位内の行順は前後関係を表しません。行間は日数に比例しません。`}
      </p>
      <div className={css.scroll}>
        <div
          className={css.graph}
          data-unit={graph.unit}
          style={
            {
              "--lanes": graph.laneCount,
              gridTemplateRows: `repeat(${graph.rows.length}, minmax(34px, auto))`,
            } as CSSProperties
          }
          aria-label={en?"Timeline of durations and events":"期間と出来事の年表グラフ"}
        >
          {graph.rows.map((row, index) => (
            <Fragment
              key={`${row.coordinate}-${row.record?.id ?? row.ending?.id ?? "boundary"}`}
            >
              {row.first && (
                <>
                  <div
                    className={css.date}
                    style={{ gridRow: `${index + 1} / span ${row.count}` }}
                  >
                    <CalendarDateLabel label={row.label} />
                    {row.count > 1 && (
                      <small>
                        {en?`Same ${row.label.length===4?'year':row.label.length===7?'month':row.label.length>10?'hour':'day'}`:`同じ${row.label.length===4?'年':row.label.length===7?'月':row.label.length>10?'時間':'日'}`}
                      </small>
                    )}
                  </div>
                  <div
                    className={css.axis}
                    data-grouped={row.count > 1 || undefined}
                    style={{ gridRow: `${index + 1} / span ${row.count}` }}
                    aria-hidden="true"
                  >
                    <i />
                  </div>
                </>
              )}
              <div
                className={css.records}
                data-anchor-record={row.record?.id ?? row.ending?.id}
                data-anchor-kind={
                  row.record ? "record" : row.ending ? "end" : "boundary"
                }
                style={{
                  gridRow: index + 1,
                  ...(row.record || row.ending
                    ? lineStyle((row.record ?? row.ending)!)
                    : {}),
                }}
              >
                {row.record && (
                  <ul className={css.recordList}>
                    {renderRecord(row.record, records.indexOf(row.record))}
                  </ul>
                )}
                {compactDates&&!row.record&&!row.ending&&<span className={css.mobileBoundaryDate}><CalendarDateLabel label={row.label}/></span>}
                {row.ending && (
                  <button
                    type="button"
                    className={css.ending}
                    aria-label={compactWindowEnd(row.ending) ? `${en ? "Latest possible date: " : "最も遅い時期："}${row.label} · ${shortName(row.ending)}` : undefined}
                    data-focused={
                      focusedRecordId === timelineRecordId(row.ending) || undefined
                    }
                    onClick={() => open(row.ending!.id)}
                    title={themeTimeLabel(row.ending.displayTime ?? row.ending.time,locale)}
                  >
                    {compactDates&&<span className={css.mobileEndingDate}><CalendarDateLabel label={row.label}/></span>}
                    {!compactWindowEnd(row.ending) && <><span>{shortName(row.ending)}</span>
                    <small>
                      {row.ending.time?.kind === "calendar" &&
                      row.ending.time.meaning === "duration"
                        ? en?"End":"終了"
                        : row.ending.time?.kind==="calendar" && row.ending.time.meaning==="occurrence-window" ? (en?"Latest possible date":"この日までのどこか") : (en?"Last date shown":"ここまで")}
                    </small></>}
                  </button>
                )}
              </div>
            </Fragment>
          ))}
          {graph.ranges.map((range) => {
            const { record, anchorRow, endAnchorRow, meaning } = range;
            const point = range.start === range.end;
            const startBoundary = Math.max(
              anchorRow,
              Math.min(endAnchorRow, range.startBoundaryRow),
            );
            const endBoundary = Math.max(
              anchorRow,
              Math.min(endAnchorRow, range.endBoundaryRow),
            );
            const style = {
              ...lineStyle(record),
              gridColumn: 2,
              gridRow: point
                ? anchorRow + 1
                : `${anchorRow + 1} / ${endAnchorRow + 1}`,
            } as CSSProperties;
            const segment = (start: number, end: number, kind: string) =>
              end > start ? (
                <span
                  key={kind}
                  className={css.segment}
                  data-kind={kind}
                  data-segment-record={record.id}
                  aria-hidden="true"
                  style={{ ...style, gridRow: `${start + 1} / ${end + 1}` }}
                />
              ) : null;
            const connector = (row: number, kind: "record" | "end") => (
              <span
                key={kind}
                className={css.connector}
                data-connector-id={record.id}
                data-anchor-kind={kind}
                style={{ ...style, gridRow: row + 1 }}
                aria-hidden="true"
              />
            );
            return (
              <Fragment key={record.id}>
                <button
                  type="button"
                  className={css.range}
                  data-range-id={record.id}
                  style={style}
                  data-meaning={meaning}
                  data-point={(point && !range.compactRange) || undefined}
                  data-compact-range={range.compactRange || undefined}
                  data-uncertain={range.uncertainBoundary || undefined}
                  data-focused={focusedRecordId === timelineRecordId(record) || undefined}
                  title={`${record.assertion} · ${themeTimeLabel(record.displayTime ?? record.time,locale)}`}
                  aria-label={`${en?"Select time marker: ":"時期の線を選ぶ："}${record.assertion} · ${themeTimeLabel(record.displayTime ?? record.time,locale)}`}
                  aria-pressed={focusedRecordId === timelineRecordId(record)}
                  onClick={() => open(record.id)}
                >
                  <i />
                  <span className={css.srOnly}>
                    {themeTimeLabel(record.displayTime ?? record.time,locale)}
                  </span>
                </button>
                {meaning === "duration" &&
                  !point &&
                  (startBoundary >= endBoundary ? (
                    segment(anchorRow, endAnchorRow, "uncertain")
                  ) : (
                    <>
                      {segment(anchorRow, startBoundary, "uncertain-start")}
                      {segment(startBoundary, endBoundary, "certain")}
                      {segment(endBoundary, endAnchorRow, "uncertain-end")}
                    </>
                  ))}
                {connector(anchorRow, "record")}
                {!point && connector(endAnchorRow, "end")}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
