"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import type {
  ThemeEntity,
  ThemeRecord,
  ThemeTimelineConfig,
} from "../lib/domain/theme-workbench";
import { buildTimelineGroups } from "../lib/domain/theme-timeline";
import { calendarMeaning, themeTimeLabel } from "../lib/domain/theme-time";
import css from "./ThemeTimeline.module.css";

type Props = {
  records: ThemeRecord[];
  entities: ThemeEntity[];
  timeline?: ThemeTimelineConfig;
  focusedRecordId: string | null;
  onFocusRecord: (id: string | null) => void;
  selectedRecordIds: string[];
  onToggleSelected?: (id: string) => void;
  onEditRecord?: (record: ThemeRecord) => void;
  onShowGraph?: (record: ThemeRecord) => void;
  graphRecordIds?: readonly string[];
};
type Group = ReturnType<typeof buildTimelineGroups>[number];
type CalendarTime = Extract<
  NonNullable<ThemeRecord["time"]>,
  { kind: "calendar" }
>;
const colors = ["#376f9a", "#aa6b32", "#5b7e59", "#8b668f", "#537e84"];
const meaningLabels = {
  point: "時点",
  duration: "期間",
  "occurrence-window": "発生時期の幅",
  "unclassified-range": "時期の範囲 · 未区別",
};

// Layout coordinates only: never replace a saved partial date with these bounds.
// Numeric calendar coordinates avoid Date.UTC's special treatment of years 0–99.
function calendarLayoutBounds(value: string): [number, number] {
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

function calendarBoundariesOverlap(time: CalendarTime) {
  return (
    calendarLayoutBounds(time.startLatest ?? time.from)[1] >=
    calendarLayoutBounds(time.endEarliest ?? time.to ?? time.from)[0]
  );
}

function timeText(record: ThemeRecord) {
  const t = record.time;
  if (!t) return "時期なし";
  if (t.kind === "calendar") return t.from + (t.to ? ` → ${t.to}` : "");
  if (t.kind === "cycle")
    return `${t.from} → ${t.to} ${t.unit}${t.wrap ? "（折り返し）" : ""}`;
  return t.from + (t.to ? ` → ${t.to}` : "");
}

function orderedRecords(group: Group) {
  if (group.kind === "calendar") {
    return [...group.records].sort((a, b) =>
      (a.time?.kind === "calendar" ? a.time.from : "").localeCompare(
        b.time?.kind === "calendar" ? b.time.from : "",
      ),
    );
  }
  if (group.kind === "qualitative" && group.order?.length) {
    const rank = (r: ThemeRecord) =>
      r.time?.kind === "qualitative" ? group.order!.indexOf(r.time.from) : -1;
    return [...group.records].sort((a, b) => {
      const x = rank(a),
        y = rank(b);
      return (
        (x < 0 ? Number.MAX_SAFE_INTEGER : x) -
        (y < 0 ? Number.MAX_SAFE_INTEGER : y)
      );
    });
  }
  if (group.kind === "cycle") {
    return [...group.records].sort(
      (a, b) =>
        (a.time?.kind === "cycle" ? a.time.from : 0) -
        (b.time?.kind === "cycle" ? b.time.from : 0),
    );
  }
  return group.records;
}

function Period({ record }: { record: ThemeRecord }) {
  const t = record.time;
  if (t?.kind === "calendar") {
    const meaning = calendarMeaning(t);
    if (meaning === "point")
      return (
        <p className={css.pointTime}>
          <i aria-hidden="true" />
          時点
        </p>
      );
    const duration = meaning === "duration";
    return (
      <div
        className={css.calendarRange}
        data-meaning={meaning}
        aria-label={themeTimeLabel(t)}
      >
        <span className={css.rangeTitle}>{meaningLabels[meaning]}</span>
        <div className={css.period}>
          <span
            className={css.periodBar}
            data-overlapping-boundaries={
              (duration &&
                (t.startLatest ||
                  t.endEarliest ||
                  t.from.length < 10 ||
                  (t.to?.length ?? 10) < 10) &&
                calendarBoundariesOverlap(t)) ||
              undefined
            }
            aria-hidden="true"
          >
            {duration && t.startLatest && (
              <i className={css.uncertainEnd} data-edge="start" />
            )}
            {duration && t.endEarliest && (
              <i className={css.uncertainEnd} data-edge="end" />
            )}
          </span>
          <div>
            <small>{duration ? "開始" : "下限"}</small>
            <span>
              {t.from}
              {duration && t.startLatest ? `〜${t.startLatest}` : ""}
            </span>
          </div>
          <div>
            <small>{duration ? "終了" : "上限"}</small>
            <span>
              {duration && t.endEarliest ? `${t.endEarliest}〜` : ""}
              {t.to}
            </span>
          </div>
        </div>
        {meaning === "occurrence-window" && (
          <p className={css.rangeNote}>
            この間のどこかで発生 · 続いた期間ではありません
          </p>
        )}
        {meaning === "unclassified-range" && (
          <p className={css.rangeNote}>
            続いた期間か、発生時期の幅かは未区別です
          </p>
        )}
      </div>
    );
  }
  if (!t || (t.kind !== "cycle" && (!t.to || t.to === t.from))) return null;
  if (t.kind === "cycle" && t.from === t.to && !t.wrap) return null;
  return (
    <div className={css.period} aria-label={`期間 ${timeText(record)}`}>
      <span className={css.periodBar} aria-hidden="true" />
      <div>
        <small>開始</small>
        <span>
          {t.from}
          {t.kind === "cycle" && ` ${t.unit}`}
        </span>
      </div>
      {t.kind === "cycle" && t.wrap && (
        <p className={css.wrap}>↻ 周期の境界をまたぐ</p>
      )}
      <div>
        <small>終了</small>
        <span>
          {t.to}
          {t.kind === "cycle" && ` ${t.unit}`}
        </span>
      </div>
    </div>
  );
}

function CalendarComparison({
  records,
  onOpenRecord,
}: {
  records: ThemeRecord[];
  onOpenRecord: (id: string) => void;
}) {
  const dated = records.filter(
    (record): record is ThemeRecord & { time: CalendarTime } =>
      record.time?.kind === "calendar",
  );
  if (
    dated.filter((record) => calendarMeaning(record.time) !== "point").length <
    2
  )
    return null;
  const rawDates = [
    ...new Set(
      dated.flatMap(({ time }) =>
        [time.from, time.startLatest, time.endEarliest, time.to].filter(
          (value): value is string => !!value,
        ),
      ),
    ),
  ];
  const dates = [...new Set(rawDates.flatMap(calendarLayoutBounds))].sort(
    (a, b) => a - b,
  );
  if (dates.length < 2) return null;
  const position = (date: number) =>
    3 + (dates.indexOf(date) / (dates.length - 1)) * 94;
  const firstLabel = [...rawDates].sort(
    (a, b) => calendarLayoutBounds(a)[0] - calendarLayoutBounds(b)[0],
  )[0];
  const lastLabel = [...rawDates].sort(
    (a, b) => calendarLayoutBounds(b)[1] - calendarLayoutBounds(a)[1],
  )[0];
  return (
    <details className={css.comparison}>
      <summary>
        時期を並べて見る <span>各記録を同じ軸で比較</span>
      </summary>
      <p className={css.comparisonNote}>
        境界の日付順・間隔は等間隔。年・月だけの記録は薄い幅で示します。重なりから所属や因果は決まりません。
      </p>
      <div className={css.comparisonRows}>
        {dated.map((record) => {
          const time = record.time,
            meaning = calendarMeaning(time);
          const fromBounds = calendarLayoutBounds(time.from),
            toBounds = calendarLayoutBounds(time.to ?? time.from);
          const from = position(fromBounds[0]),
            to = position(toBounds[1]);
          const start = position(
              calendarLayoutBounds(time.startLatest ?? time.from)[1],
            ),
            end = position(
              calendarLayoutBounds(time.endEarliest ?? time.to ?? time.from)[0],
            );
          const coarsePoint =
            meaning === "point" && fromBounds[0] !== fromBounds[1];
          const precision = time.from.length === 4 ? "年精度" : "月精度";
          return (
            <div
              className={css.comparisonRow}
              key={record.id}
              data-meaning={meaning}
            >
              <button
                type="button"
                onClick={() => onOpenRecord(record.id)}
                aria-label={`記録を読む：${record.assertion}`}
                title={record.assertion}
              >
                {record.assertion}
              </button>
              <div
                className={css.comparisonTrack}
                role="img"
                aria-label={`${record.assertion} · ${themeTimeLabel(time)}${coarsePoint ? ` · ${precision}の幅（日付未確定）` : ""}`}
                style={
                  {
                    "--range-start": `${from}%`,
                    "--range-width": `${Math.max(0, to - from)}%`,
                  } as CSSProperties
                }
              >
                {meaning === "point" ? (
                  coarsePoint ? (
                    <i
                      className={css.precisionBand}
                      data-precision={precision}
                      style={{
                        left: `${from}%`,
                        width: `${Math.max(0, to - from)}%`,
                      }}
                    />
                  ) : (
                    <i className={css.comparisonPoint} />
                  )
                ) : (
                  <>
                    <i className={css.comparisonBand} />
                    {meaning === "duration" && (
                      <>
                        {(time.startLatest ||
                          fromBounds[0] !== fromBounds[1]) && (
                          <i
                            className={
                              time.startLatest
                                ? css.uncertainBand
                                : css.precisionBand
                            }
                            data-precision={
                              !time.startLatest ? "開始の精度幅" : undefined
                            }
                            style={{
                              left: `${from}%`,
                              width: `${Math.max(0, Math.min(to, start) - from)}%`,
                            }}
                          />
                        )}
                        {(time.endEarliest || toBounds[0] !== toBounds[1]) && (
                          <i
                            className={
                              time.endEarliest
                                ? css.uncertainBand
                                : css.precisionBand
                            }
                            data-precision={
                              !time.endEarliest ? "終了の精度幅" : undefined
                            }
                            style={{
                              left: `${Math.max(from, end)}%`,
                              width: `${Math.max(0, to - Math.max(from, end))}%`,
                            }}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
              <small>
                {meaningLabels[meaning]}
                {coarsePoint ? ` · ${precision}` : ""}
                {time.startLatest || time.endEarliest ? " · 境界に幅" : ""}
              </small>
            </div>
          );
        })}
      </div>
      <div className={css.comparisonDates}>
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </details>
  );
}

export default function ThemeTimeline({
  records,
  entities,
  timeline,
  focusedRecordId,
  onFocusRecord,
  selectedRecordIds,
  onToggleSelected,
  onEditRecord,
  onShowGraph,
  graphRecordIds,
}: Props) {
  const groups = useMemo(
    () => buildTimelineGroups(records, timeline),
    [records, timeline],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [trace, setTrace] = useState("");
  const prefix = useId();
  const subjects = [...new Set(records.map((r) => r.subject))];
  const activeTrace = subjects.includes(trace) ? trace : "";
  const name = (id: string | null) =>
    entities.find((e) => e.id === id)?.name ?? id ?? "";
  const color = (id: string) =>
    colors[Math.max(0, subjects.indexOf(id)) % colors.length];
  const children = (recordId: string) =>
    groups.filter((g) => g.parentRecordId === recordId);
  const hasFocusedChild = (
    recordId: string,
    visited = new Set<string>(),
  ): boolean => {
    if (visited.has(recordId)) return false;
    visited.add(recordId);
    return children(recordId).some((g) =>
      g.records.some(
        (r) => r.id === focusedRecordId || hasFocusedChild(r.id, visited),
      ),
    );
  };
  const toggle = (id: string, open: boolean) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
    onFocusRecord(open ? null : id);
  };
  const roots = groups.filter(
    (g) => !g.parentRecordId || !records.some((r) => r.id === g.parentRecordId),
  );

  function renderGroup(group: Group, ancestors: string[] = []) {
    if (ancestors.includes(group.id)) return null;
    const rows = orderedRecords(group);
    const subjectIds = [...new Set(rows.map((r) => r.subject))];
    const lanes = activeTrace
      ? subjectIds.filter((id) => id === activeTrace)
      : subjectIds.slice(0, 5);
    const ranges = lanes.map((id) => {
      const indexes = rows.flatMap((r, i) => (r.subject === id ? [i] : []));
      return { id, first: Math.min(...indexes), last: Math.max(...indexes) };
    });
    return (
      <section
        className={css.group}
        key={group.id}
        data-nested={ancestors.length > 0 || undefined}
        aria-label={group.label}
      >
        <header className={css.groupHeader}>
          <div>
            <h3>{group.label}</h3>
            <p>
              {group.kind === "none"
                ? "日付を補わず、背景や文脈として読む"
                : group.kind === "qualitative" && !group.order?.length
                  ? "順序の指定なし · 登録順で表示"
                  : "行の間隔は経過時間を表しません"}
              {group.originLabel ? ` · ${group.originLabel}` : ""}
            </p>
          </div>
          <span>{rows.length}件</span>
        </header>
        {group.kind === "calendar" && (
          <CalendarComparison
            records={rows}
            onOpenRecord={(id) => toggle(id, false)}
          />
        )}
        {lanes.length > 0 && group.kind !== "none" && (
          <div className={css.laneKey} aria-label="たどっている主語の対象">
            {lanes.map((id) => (
              <span key={id}>
                <i style={{ backgroundColor: color(id) }} />
                {name(id)}
              </span>
            ))}
            {!activeTrace && subjectIds.length > 5 && (
              <small>ほかの対象は上の選択欄から</small>
            )}
          </div>
        )}
        <ol
          className={css.rows}
          style={{ "--lane-count": Math.max(1, lanes.length) } as CSSProperties}
        >
          {rows.map((record, index) => {
            const nested = children(record.id);
            const open =
              expanded.has(record.id) ||
              focusedRecordId === record.id ||
              hasFocusedChild(record.id);
            const t = record.time;
            const label =
              group.kind === "none"
                ? "背景"
                : t?.kind === "calendar"
                  ? t.from
                  : t?.kind === "cycle"
                    ? `${t.from} ${t.unit}`
                    : t?.kind === "qualitative"
                      ? t.from
                      : "";
            return (
              <li
                className={css.row}
                key={record.id}
                data-focused={focusedRecordId === record.id || undefined}
              >
                <div className={css.date}>
                  {label}
                  {t?.kind === "calendar" && t.from.length < 10 && (
                    <small>
                      {t.from.length === 4 ? "年までの記録" : "月までの記録"}
                    </small>
                  )}
                </div>
                <div className={css.rail} aria-hidden="true">
                  {group.kind !== "none" &&
                    ranges.map((lane) => (
                      <span
                        key={lane.id}
                        className={css.lane}
                        style={
                          { "--trace-color": color(lane.id) } as CSSProperties
                        }
                      >
                        {index >= lane.first &&
                          index <= lane.last &&
                          lane.first !== lane.last && (
                            <i
                              className={css.traceLine}
                              data-first={index === lane.first || undefined}
                              data-last={index === lane.last || undefined}
                            />
                          )}
                        {record.subject === lane.id && (
                          <b className={css.point} />
                        )}
                      </span>
                    ))}
                </div>
                <div className={css.content}>
                  <div className={css.rowMain}>
                    {onToggleSelected && (
                      <input
                        type="checkbox"
                        aria-label={`Capsuleに含める：${record.assertion}`}
                        checked={selectedRecordIds.includes(record.id)}
                        onChange={() => onToggleSelected(record.id)}
                      />
                    )}
                    <button
                      type="button"
                      className={css.openRow}
                      aria-expanded={open}
                      aria-controls={`${prefix}-${encodeURIComponent(group.id)}-${record.id}`}
                      onClick={() => toggle(record.id, open)}
                    >
                      <span className={css.rowText}>
                        <span className={css.assertion}>
                          {record.assertion}
                        </span>
                        <span className={css.meta}>
                          {name(record.subject)}
                          {record.object ? ` → ${name(record.object)}` : ""}
                          {t?.label ? ` · ${t.label}` : ""}
                          {nested.length
                            ? ` · 詳しい時間軸 ${nested.length}件`
                            : ""}
                        </span>
                      </span>
                      <span
                        className={css.chevron}
                        aria-hidden="true"
                        data-open={open || undefined}
                      >
                        ⌄
                      </span>
                    </button>
                  </div>
                  <Period record={record} />
                  <div
                    id={`${prefix}-${encodeURIComponent(group.id)}-${record.id}`}
                    className={css.expansion}
                    data-open={open || undefined}
                    aria-hidden={!open}
                    inert={!open}
                  >
                    <div className={css.expansionInner}>
                      <div className={css.details}>
                        {record.scope && (
                          <p className={css.scope}>範囲：{record.scope}</p>
                        )}
                        {t?.kind === "qualitative" && (
                          <p className={css.note}>{t.coordinateMeaning}</p>
                        )}
                        {t?.kind === "calendar" &&
                          calendarMeaning(t) === "duration" &&
                          (t.startLatest || t.endEarliest) && (
                            <p className={css.note}>
                              {t.startLatest &&
                                `開始は ${t.from}〜${t.startLatest} のどこか。`}
                              {t.endEarliest &&
                                `終了は ${t.endEarliest}〜${t.to} のどこか。`}
                              境界の幅が、続いた期間そのものを表すわけではありません。
                            </p>
                          )}
                        {record.polarity !== "affirmed" && (
                          <p className={css.note}>
                            {record.polarity === "denied"
                              ? "否定されている内容"
                              : "推測・不確実な内容"}
                          </p>
                        )}
                        <div className={css.evidenceList}>
                          {record.evidence.map((e, i) => (
                            <div key={i} className={css.evidence}>
                              <a href={e.url} target="_blank" rel="noreferrer">
                                {e.title} <span aria-hidden="true">↗</span>
                              </a>
                              <p className={css.locator}>{e.locator}</p>
                              <p>{e.excerpt}</p>
                            </div>
                          ))}
                        </div>
                        <div className={css.actions}>
                          {onShowGraph &&
                            (graphRecordIds === undefined ||
                              graphRecordIds.includes(record.id)) && (
                              <button
                                type="button"
                                onClick={() => onShowGraph(record)}
                              >
                                関係図で見る <span aria-hidden="true">↗</span>
                              </button>
                            )}
                          {onEditRecord && (
                            <button
                              type="button"
                              onClick={() => onEditRecord(record)}
                            >
                              記録を訂正
                            </button>
                          )}
                          <span>内容版 {record.revision}</span>
                        </div>
                        {nested.map((g) =>
                          renderGroup(g, [...ancestors, group.id]),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  return (
    <div className={css.timeline}>
      <div className={css.controls}>
        <details className={css.guide}>
          <summary>線の見方</summary>
          <div className={css.legend}>
            <span>
              <i className={css.legendTrace} />
              同じ主語の記録
            </span>
            <span>
              <i className={css.legendPeriod} />
              明示された期間
            </span>
            <span>
              <i className={css.legendWindow} />
              発生時期の幅
            </span>
            <span>
              <i className={css.legendUncertain} />
              不確かな期間の境界
            </span>
          </div>
          <p className={css.help}>
            細い線で同じ対象の記録をたどれます。存続期間や因果関係は表しません。実期間は両端付きの実線、発生時期の幅は点線の範囲です。時間が重なるだけでは、所属や関連づけは作られません。詳しい時間軸は明示して結びつけたものだけを行内に表示します。
          </p>
        </details>
        {subjects.length > 1 && (
          <label className={css.traceSelect}>
            たどる対象
            <select
              aria-label="たどる対象"
              value={activeTrace}
              onChange={(e) => setTrace(e.target.value)}
            >
              <option value="">
                {subjects.length > 5 ? "先頭の5対象" : "すべて"}
              </option>
              {subjects.map((id) => (
                <option key={id} value={id}>
                  {name(id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {roots.length ? (
        roots.map((g) => renderGroup(g))
      ) : (
        <p className={css.empty}>表示する記録がありません。</p>
      )}
    </div>
  );
}
