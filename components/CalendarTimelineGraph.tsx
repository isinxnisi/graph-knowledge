"use client";

import {
  Fragment,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { calendarGraph } from "../lib/domain/calendar-graph";
import { themeTimeLabel } from "../lib/domain/theme-time";
import type { ThemeRecord } from "../lib/domain/theme-workbench";
import css from "./CalendarTimelineGraph.module.css";

const colors = ["#397a85", "#aa713c", "#6878a2", "#8b668f", "#6d844f"];

export default function CalendarTimelineGraph({
  records,
  focusedRecordId,
  highlightedSubject,
  onFocus,
  renderRecord,
}: {
  records: ThemeRecord[];
  focusedRecordId: string | null;
  highlightedSubject: string;
  onFocus: (id: string) => void;
  renderRecord: (record: ThemeRecord, index: number) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const open = (id: string) => {
    onFocus(id);
    requestAnimationFrame(() => {
      const row = [
        ...(container.current?.querySelectorAll<HTMLElement>(
          "[data-record-id]",
        ) ?? []),
      ].find((row) => row.dataset.recordId === id);
      row?.scrollIntoView?.({ block: "nearest" });
    });
  };
  const graph = useMemo(() => calendarGraph(records), [records]);
  const shortName = (r: ThemeRecord) => r.time?.label || r.assertion;
  return (
    <div className={css.surface} ref={container}>
      <p className={css.caption}>
        日付順・行間は日数に比例しません。線と帯は各記録の時期を表します。
      </p>
      <div className={css.scroll}>
        <div
          className={css.graph}
          style={
            {
              "--lanes": graph.laneCount,
              gridTemplateRows: `repeat(${graph.slices.length}, minmax(58px, auto))`,
            } as CSSProperties
          }
          aria-label="期間と出来事の年表グラフ"
        >
          {graph.slices.map((slice, index) => (
            <Fragment key={slice.coordinate}>
              <div className={css.date} style={{ gridRow: index + 1 }}>
                {slice.label}
                {slice.label.length < 10 && (
                  <small>
                    {slice.label.length === 4 ? "年精度" : "月精度"}
                  </small>
                )}
              </div>
              <div
                className={css.axis}
                style={{ gridRow: index + 1 }}
                aria-hidden="true"
              >
                <i />
              </div>
              <div className={css.records} style={{ gridRow: index + 1 }}>
                {slice.records.length > 1 && (
                  <small className={css.sameDate}>
                    同じ時期の記録 · 行の順は前後関係を表しません
                  </small>
                )}
                {slice.records.length > 0 && (
                  <ul className={css.recordList}>
                    {slice.records.map((r) => (
                      <Fragment key={r.id}>
                        {renderRecord(r, records.indexOf(r))}
                      </Fragment>
                    ))}
                  </ul>
                )}
                {slice.ending.length > 0 && (
                  <div className={css.endings}>
                    {slice.ending.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => open(r.id)}
                        title={themeTimeLabel(r.time)}
                      >
                        <i
                          style={{
                            background:
                              colors[
                                graph.ranges.find((x) => x.record.id === r.id)!
                                  .lane % colors.length
                              ],
                          }}
                        />
                        <span>{shortName(r)}</span>{" "}
                        <small>
                          {r.time?.kind === "calendar" &&
                          r.time.meaning === "duration"
                            ? "終了側"
                            : "範囲の後端"}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Fragment>
          ))}
          {graph.ranges.map((range) => {
            const {
              record,
              startRow,
              endRow,
              startEndRow,
              endStartRow,
              lane,
              meaning,
            } = range;
            const point = startRow === endRow;
            const style = {
              gridColumn: 2,
              gridRow: point ? startRow + 1 : `${startRow + 1} / ${endRow + 1}`,
              "--lane": lane,
              "--line-color": colors[lane % colors.length],
              "--line-opacity":
                highlightedSubject && record.subject !== highlightedSubject
                  ? 0.25
                  : 1,
            } as CSSProperties;
            const segment = (start: number, end: number, kind: string) =>
              end > start ? (
                <span
                  key={kind}
                  className={css.segment}
                  data-kind={kind}
                  aria-hidden="true"
                  style={{ ...style, gridRow: `${start + 1} / ${end + 1}` }}
                />
              ) : null;
            return (
              <Fragment key={record.id}>
                <button
                  type="button"
                  className={css.range}
                  data-range-id={record.id}
                  style={style}
                  data-meaning={meaning}
                  data-point={point || undefined}
                  data-focused={focusedRecordId === record.id || undefined}
                  data-muted={
                    (highlightedSubject &&
                      record.subject !== highlightedSubject) ||
                    undefined
                  }
                  title={`${record.assertion} · ${themeTimeLabel(record.time)}`}
                  aria-label={`時期の線を選ぶ：${record.assertion} · ${themeTimeLabel(record.time)}`}
                  aria-pressed={focusedRecordId === record.id}
                  onClick={() => open(record.id)}
                >
                  <i />
                  <span className={css.srOnly}>
                    {themeTimeLabel(record.time)}
                  </span>
                </button>
                {meaning === "duration" && (
                  <>
                    {segment(startRow, startEndRow, "uncertain-start")}
                    {segment(endStartRow, endRow, "uncertain-end")}
                    {startEndRow < endStartRow &&
                      segment(startEndRow, endStartRow, "certain")}
                  </>
                )}
                <span
                  className={css.connector}
                  style={{ ...style, gridRow: startRow + 1 }}
                  aria-hidden="true"
                />
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
