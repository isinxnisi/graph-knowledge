"use client";

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
import { themeTimeLabel } from "../lib/domain/theme-time";
import { timelineRecordId, type TimelineDisplayRecord } from "../lib/domain/timeline-display";
import css from "./CalendarTimelineGraph.module.css";

const colors = ["#397a85", "#aa713c", "#6878a2", "#8b668f", "#6d844f"];
const unitNames = { year: "年", month: "月", day: "日",hour:"時間" };

export default function CalendarTimelineGraph<R extends TimelineDisplayRecord>({
  records,
  resolution,
  focusedRecordId,
  highlightedSubject,
  onFocus,
  renderRecord,
}: {
  records: R[];
  resolution: CalendarResolution;
  focusedRecordId: string | null;
  highlightedSubject: string;
  onFocus: (id: string) => void;
  renderRecord: (record: R, index: number) => ReactNode;
}) {
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
  const shortName = (r: R) => r.time?.label || r.assertion;
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
    <div className={css.surface} ref={container}>
      <p className={css.caption}>
        {unitNames[graph.unit]}単位 ·
        同じ単位内の行順は前後関係を表しません。行間は日数に比例しません。
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
          aria-label="期間と出来事の年表グラフ"
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
                    {row.label}
                    {row.count > 1 && (
                      <small>
                        同じ
                        {row.label.length === 4
                          ? "年"
                          : row.label.length === 7
                            ? "月"
                            : "日"}
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
                {row.ending && (
                  <button
                    type="button"
                    className={css.ending}
                    data-focused={
                      focusedRecordId === timelineRecordId(row.ending) || undefined
                    }
                    onClick={() => open(row.ending!.id)}
                    title={themeTimeLabel(row.ending.time)}
                  >
                    <span>{shortName(row.ending)}</span>
                    <small>
                      {row.ending.time?.kind === "calendar" &&
                      row.ending.time.meaning === "duration"
                        ? "終了側"
                        : "候補の後端"}
                    </small>
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
                  title={`${record.assertion} · ${themeTimeLabel(record.time)}`}
                  aria-label={`時期の線を選ぶ：${record.assertion} · ${themeTimeLabel(record.time)}`}
                  aria-pressed={focusedRecordId === timelineRecordId(record)}
                  onClick={() => open(record.id)}
                >
                  <i />
                  <span className={css.srOnly}>
                    {themeTimeLabel(record.time)}
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
