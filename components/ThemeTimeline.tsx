"use client";

import ExternalSourceLink from "./ExternalSourceLink";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type {
  ThemeTimelineConfig,
} from "../lib/domain/theme-workbench";
import { timelineRecordId, type TimelineDisplayRecord, type TimelineDisplayEntity } from "../lib/domain/timeline-display";
import { buildTimelineGroups, type ThemeTimelineGroup } from "../lib/domain/theme-timeline";
import { calendarMeaning, themeTimeLabel } from "../lib/domain/theme-time";
import css from "./ThemeTimeline.module.css";
import CalendarTimelineGraph from "./CalendarTimelineGraph";
import Icon from "./Icon";
import {
  calendarLayoutBounds,
  type CalendarResolution,
} from "../lib/domain/calendar-graph";

type Props<R extends TimelineDisplayRecord> = {
  selectionLabel?: string;
  records: R[];
  entities: TimelineDisplayEntity[];
  timeline?: ThemeTimelineConfig;
  focusedRecordId: string | null;
  focusedEntityId?: string;
  onFocusRecord: (id: string | null) => void;
  selectedRecordIds: string[];
  onToggleSelected?: (id: string) => void;
  onEditRecord?: (record: R) => void;
  onShowGraph?: (record: R) => void;
  graphRecordIds?: readonly string[];
  compactControls?: boolean;
  embedded?: boolean;
  headerAction?: ReactNode;
  emptyMessage?: string;
};
type Group<R extends TimelineDisplayRecord> = ThemeTimelineGroup<R>;
type CalendarTime = Extract<
  NonNullable<TimelineDisplayRecord["time"]>,
  { kind: "calendar" }
>;
const colors = ["#376f9a", "#aa6b32", "#5b7e59", "#8b668f", "#537e84"];
const meaningLabels = {
  point: "時点",
  duration: "期間",
  "occurrence-window": "発生時期の幅",
  "unclassified-range": "時期の範囲 · 未区別",
};

function RecordContext({
  record,
  entities,
  focusedEntityId,
}: {
  record: TimelineDisplayRecord;
  entities: TimelineDisplayEntity[];
  focusedEntityId?: string;
}) {
  const entity = (id: string) => {
    const value = entities.find((e) => e.id === id);
    return (
      <span className={css.entityTag} data-entity-id={id} data-subject-focus={focusedEntityId===id||undefined} title={focusedEntityId===id?'探索から選択している対象':undefined}>
        <i
          className={css.entityShape}
          data-shape={value?.kind === "人物" ? "circle" : "round-rectangle"}
          aria-hidden="true"
        />
        <span>{value?.name ?? id}</span>
      </span>
    );
  };
  return (
    <span className={css.recordContext} data-record-kind={record.kind}>
      {record.subject && entity(record.subject)}
      {record.kind === "relation" && record.object ? (
        <>
          <span className={css.relationMark} data-relation-mark>
            <span>{record.relation}</span>
            <Icon name="arrow" />
          </span>
          {entity(record.object)}
        </>
      ) : (
        <span className={css.contextKind}>
          <Icon name={record.kind === "episode" ? "event" : "book"} />
          {record.kind === "episode" ? "エピソード" : "説明"}
        </span>
      )}
      {record.polarity !== "affirmed" && (
        <span className={css.contextKind}>
          {record.polarity === "denied" ? "否定" : "推測・不確実"}
        </span>
      )}
    </span>
  );
}

function calendarBoundariesOverlap(time: CalendarTime) {
  return (
    calendarLayoutBounds(time.startLatest ?? time.from)[1] >=
    calendarLayoutBounds(time.endEarliest ?? time.to ?? time.from)[0]
  );
}

function timeText(record: TimelineDisplayRecord) {
  const t = record.time;
  if (!t) return "時期なし";
  if (t.kind === "calendar") return t.from + (t.to ? ` → ${t.to}` : "");
  if (t.kind === "cycle")
    return `${t.from} → ${t.to} ${t.unit}${t.wrap ? "（折り返し）" : ""}`;
  return t.from + (t.to ? ` → ${t.to}` : "");
}

function orderedRecords<R extends TimelineDisplayRecord>(group: Group<R>) {
  if (group.kind === "calendar") {
    return [...group.records].sort((a,b)=>calendarLayoutBounds(a.time?.kind==="calendar"?a.time.from:"")[0]-calendarLayoutBounds(b.time?.kind==="calendar"?b.time.from:"")[0]);
  }
  if (group.kind === "qualitative" && group.order?.length) {
    const rank = (r: TimelineDisplayRecord) =>
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

function Period({ record }: { record: TimelineDisplayRecord }) {
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

export default function ThemeTimeline<R extends TimelineDisplayRecord>({
  selectionLabel = "Capsuleに含める",
  records,
  entities,
  timeline,
  focusedRecordId,
  focusedEntityId,
  onFocusRecord,
  selectedRecordIds,
  onToggleSelected,
  onEditRecord,
  onShowGraph,
  graphRecordIds,
  compactControls = false,
  embedded = false,
  headerAction,
  emptyMessage="表示する記録がありません。",
}: Props<R>) {
  const groups = useMemo(
    () => buildTimelineGroups(records, timeline),
    [records, timeline],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [trace, setTrace] = useState("");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<CalendarResolution>("auto");
  const prefix = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const subjects = [...new Set(records.map((r) => r.subject).filter((id): id is string => id !== null))];
  const focusedRow = records.find((r) => r.id === activeRowId && timelineRecordId(r) === focusedRecordId)
    ?? records.find((r) => timelineRecordId(r) === focusedRecordId);
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
        (r) => timelineRecordId(r) === focusedRecordId || hasFocusedChild(r.id, visited),
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
    setActiveRowId(open ? null : id);
    const record = records.find((r) => r.id === id);
    onFocusRecord(open || !record ? null : timelineRecordId(record));
  };
  const roots = groups.filter(
    (g) => !g.parentRecordId || !records.some((r) => r.id === g.parentRecordId),
  );

  function renderGroup(group: Group<R>, ancestors: string[] = []) {
    if (ancestors.includes(group.id)) return null;
    const rows = orderedRecords(group);
    const subjectIds = [...new Set(rows.map((r) => r.subject).filter((id): id is string => id !== null))];
    const lanes = activeTrace
      ? subjectIds.filter((id) => id === activeTrace)
      : subjectIds.slice(0, 5);
    const ranges = lanes.map((id) => {
      const indexes = rows.flatMap((r, i) => (r.subject === id ? [i] : []));
      return { id, first: Math.min(...indexes), last: Math.max(...indexes) };
    });
    const renderRow = (record: R, index: number) => {
      const nested = children(record.id);
      const open =
        expanded.has(record.id) ||
        focusedRow?.id === record.id ||
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
          data-record-id={timelineRecordId(record)}
          data-timeline-row-id={record.id}
          data-time-id={record.timeId ?? undefined}
          key={record.id}
          data-focused={focusedRecordId === timelineRecordId(record) || undefined}
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
                  style={{ "--trace-color": color(lane.id) } as CSSProperties}
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
                  {record.subject === lane.id && <b className={css.point} />}
                </span>
              ))}
          </div>
          <div className={css.content}>
            <div className={css.rowMain}>
              {onToggleSelected && (
                <input
                  type="checkbox"
                  aria-label={`${selectionLabel}：${record.assertion}`}
                  checked={selectedRecordIds.includes(timelineRecordId(record))}
                  onChange={() => onToggleSelected(timelineRecordId(record))}
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
                  <span className={css.assertion}>{record.assertion}</span>
                  <RecordContext record={record} entities={entities} focusedEntityId={focusedEntityId}/>
                  {(nested.length > 0 ||
                    (group.kind !== "calendar" && t?.label)) && (
                    <span className={css.meta}>
                      {group.kind !== "calendar" ? t?.label : ""}
                      {nested.length
                        ? ` · 詳しい時間軸 ${nested.length}件`
                        : ""}
                    </span>
                  )}
                </span>
                <span
                  className={css.chevron}
                  aria-hidden="true"
                  data-open={open || undefined}
                >
                  ⌄
                </span>
              </button>
              {onShowGraph &&
                (graphRecordIds === undefined ||
                  graphRecordIds.includes(timelineRecordId(record))) && (
                  <button
                    type="button"
                    className={css.graphJump}
                    aria-label={`関係図で見る：${record.assertion}`}
                    title={
                      record.kind === "relation"
                        ? "関係図のこの関係を見る"
                        : "関係図のこの注記を見る"
                    }
                    onClick={() => onShowGraph(record)}
                  >
                    <Icon name="graph" />
                  </button>
                )}
            </div>
            {group.kind === "calendar" ? (
              <p className={css.meta}>{themeTimeLabel(record.time)}</p>
            ) : (
              <Period record={record} />
            )}
            <div
              id={`${prefix}-${encodeURIComponent(group.id)}-${record.id}`}
              className={css.expansion}
              data-open={open || undefined}
              aria-hidden={!open}
              inert={!open}
            >
              <div className={css.expansionInner}>
                <div className={css.details}>
                  {group.kind === "calendar" && <Period record={record} />}
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
                      <div key={i} className={css.evidence} data-source-id={e.sourceId} data-source-revision={e.sourceRevision}>
                        {e.url ? (
                          <ExternalSourceLink href={e.url} label={e.title}/>
                        ) : <span>{e.title}</span>}
                        {e.sourceRevision !== undefined && (
                          <p className={css.meta}>資料版 {e.sourceRevision}{e.stance ? ` · ${{ support: "支持", refute: "反証", background: "背景" }[e.stance]}` : ""}</p>
                        )}
                        {e.bibliography && <p className={css.locator}>{e.bibliography}</p>}
                        <p className={css.locator}>{e.locator}</p>
                        {e.excerpt && <p>{e.excerpt}</p>}
                      </div>
                    ))}
                  </div>
                  <div className={css.actions}>
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
                  {nested.map((g) => renderGroup(g, [...ancestors, group.id]))}
                </div>
              </div>
            </div>
          </div>
        </li>
      );
    };
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
            {(group.kind !== "calendar" || group.originLabel) && (
              <p>
                {group.kind === "none"
                  ? "日付を補わず、背景や文脈として読む"
                  : group.kind === "qualitative" && !group.order?.length
                    ? "順序の指定なし · 登録順で表示"
                    : group.kind === "calendar"
                      ? ""
                      : "行の間隔は経過時間を表しません"}
                {group.originLabel
                  ? `${group.kind === "calendar" ? "" : " · "}${group.originLabel}`
                  : ""}
              </p>
            )}
          </div>
          <span>{new Set(rows.map(timelineRecordId)).size}件{new Set(rows.map(timelineRecordId)).size < rows.length ? ` · ${rows.length}時期` : ""}</span>
          {embedded && group.id === roots[0]?.id && !ancestors.length && (hasCalendar || subjects.length > 1) && <button className={css.headerSettings} aria-label={`年表の表示設定${settingsSummary ? `：${settingsSummary}` : ""}`} aria-expanded={settingsOpen} aria-controls={`${prefix}-settings`} title={settingsSummary || undefined} onClick={() => setSettingsOpen(v => !v)}><Icon name="settings" /><span>表示設定</span><Icon name="chevron" /></button>}
          {embedded && group.id === roots[0]?.id && !ancestors.length && <span className={css.headerAction}>{headerAction}</span>}
        </header>
        {embedded && group.id === roots[0]?.id && !ancestors.length && <div id={`${prefix}-settings`} className={css.headerSettingsBody} hidden={!settingsOpen}>{readingControls}</div>}
        {group.kind === "calendar" ? (
          <CalendarTimelineGraph
            records={rows}
            resolution={resolution}
            focusedRecordId={focusedRecordId}
            highlightedSubject={activeTrace}
            onFocus={(id) => toggle(id, false)}
            renderRecord={renderRow}
          />
        ) : (
          <>
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
              style={
                { "--lane-count": Math.max(1, lanes.length) } as CSSProperties
              }
            >
              {rows.map(renderRow)}
            </ol>
          </>
        )}
      </section>
    );
  }

  const hasCalendar = records.some((r) => r.time?.kind === "calendar");
  const settingsSummary = [hasCalendar && resolution !== "auto" ? ({ year: "年", month: "月", day: "日",hour:"時間" } as const)[resolution] : "", activeTrace ? name(activeTrace) : ""].filter(Boolean).join(" · ");
  const readingControls = <>
    {hasCalendar && <label className={css.resolutionSelect}>表示
      <select aria-label="暦の表示単位" value={resolution} onChange={(e) => setResolution(e.target.value as CalendarResolution)}>
        <option value="auto">自動</option><option value="year">年</option><option value="month">月</option><option value="day">日</option><option value="hour">時間</option>
      </select>
    </label>}
    {subjects.length > 1 && <label className={css.traceSelect}>たどる対象
      <select aria-label="たどる対象" value={activeTrace} onChange={(e) => setTrace(e.target.value)}>
        <option value="">{subjects.length > 5 ? "先頭の5対象" : "すべて"}</option>
        {subjects.map((id) => <option key={id} value={id}>{name(id)}</option>)}
      </select>
    </label>}
  </>;
  return (
    <div className={`${css.timeline} ${embedded ? css.embedded : ""}`}>
      <div className={`${css.controls} ${compactControls ? css.compactControls : ""}`}>
        <details className={css.guide}>
          <summary>{compactControls && <Icon name="chevron" />}線の見方</summary>
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
            線の接続先が、その点・期間の記録です。両端付きの線は続いた期間、丸い端の破線は発生候補の幅です。不確かな期間境界だけを点線にします。表示単位の内に収まる出来事は点、期間は短い両端付きの線で示します。元の日付・意味は行を開いて確認できます。時間が重なっても所属や因果は作りません。暦以外の細い対象線は、同じ主語をたどる案内です。
          </p>
        </details>
        {embedded ? null : compactControls ? (hasCalendar || subjects.length > 1) && <details className={css.displaySettings}>
          <summary aria-label={`年表の表示設定${settingsSummary ? `：${settingsSummary}` : ""}`} title={settingsSummary || undefined}><Icon name="settings" /><span>表示設定</span>{settingsSummary && <small>{settingsSummary}</small>}<span className={css.settingsChevron}><Icon name="chevron" /></span></summary>
          <div className={css.displaySettingsBody}>{readingControls}</div>
        </details> : readingControls}
      </div>
      <div className={css.readingBody}>
      {roots.length ? (
        roots.map((g) => renderGroup(g))
      ) : (
        <p className={css.empty}>{emptyMessage}</p>
      )}
      </div>
    </div>
  );
}
