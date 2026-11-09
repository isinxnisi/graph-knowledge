"use client";

import {useUiLocale} from "../lib/client/ui-locale";
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
import KnowledgeReadingBadge from "./KnowledgeReadingBadge";
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
  onFocusRecord: (id: string | null,timeId?:string) => void;
  selectedRecordIds: string[];
  onToggleSelected?: (id: string) => void;
  onEditRecord?: (record: R) => void;
  onShowGraph?: (record: R) => void;
  graphRecordIds?: readonly string[];
  compactControls?: boolean;
  embedded?: boolean;
  headerAction?: ReactNode;
  emptyMessage?: string;
  reading?: boolean;
  onReadEvidence?:(recordId:string,evidenceId:string)=>void;
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
  const {locale}=useUiLocale();const tr=(ja:string,en:string)=>locale==="en"?en:ja;
  const entity = (id: string) => {
    const value = entities.find((e) => e.id === id);
    return (
      <span className={css.entityTag} data-entity-id={id} data-subject-focus={focusedEntityId===id||undefined} title={focusedEntityId===id?tr("探索から選択している対象","Subject selected in exploration"):undefined}>
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
          {record.kind === "episode" ? tr("エピソード","Event") : tr("説明","Context")}
        </span>
      )}
      {record.polarity !== "affirmed" && (
        <span className={css.contextKind}>
          {record.polarity === "denied" ? tr("否定","Denied") : tr("推測・不確実","Uncertain")}
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

function timeText(record: TimelineDisplayRecord,locale:string="ja") {
  const tr=(ja:string,en:string)=>locale==="en"?en:ja;
  const t = record.displayTime ?? record.time;
  if (!t) return tr("時期なし","Undated");
  if (t.kind === "calendar") return t.from + (t.to ? ` → ${t.to}` : "");
  if (t.kind === "cycle")
    return `${t.from} → ${t.to} ${t.unit}${t.wrap ? tr("（折り返し）"," (wraps)") : ""}`;
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
  const {locale}=useUiLocale();const tr=(ja:string,en:string)=>locale==="en"?en:ja;
  const labels=locale==="en"?{point:"Point in time",duration:"Duration","occurrence-window":"Occurrence window","unclassified-range":"Time range · unclassified"}:meaningLabels;
  const t = record.displayTime ?? record.time;
  if (t?.kind === "calendar") {
    const meaning = calendarMeaning(t);
    if (meaning === "point")
      return (
        <p className={css.pointTime}>
          <i aria-hidden="true" />
          {tr("時点","Point in time")}
        </p>
      );
    const duration = meaning === "duration";
    return (
      <div
        className={css.calendarRange}
        data-meaning={meaning}
        aria-label={themeTimeLabel(t,locale)}
      >
        <span className={css.rangeTitle}>{labels[meaning]}</span>
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
            <small>{duration ? tr("開始","Start") : tr("下限","Earliest")}</small>
            <span>
              {t.from}
              {duration && t.startLatest ? `〜${t.startLatest}` : ""}
            </span>
          </div>
          <div>
            <small>{duration ? tr("終了","End") : tr("上限","Latest")}</small>
            <span>
              {duration && t.endEarliest ? `${t.endEarliest}〜` : ""}
              {t.to}
            </span>
          </div>
        </div>
        {meaning === "occurrence-window" && (
          <p className={css.rangeNote}>
            {tr("この間のどこかで発生 · 続いた期間ではありません","Occurs somewhere in this range \u00b7 not a duration")}
          </p>
        )}
        {meaning === "unclassified-range" && (
          <p className={css.rangeNote}>
            {tr("続いた期間か、発生時期の幅かは未区別です","Not classified as a duration or an occurrence window")}
          </p>
        )}
      </div>
    );
  }
  const original=record.time;
  if (!t || (original?.kind !== "cycle" && (!original?.to || original.to === original.from))) return null;
  if (original?.kind === "cycle" && original.from === original.to && !original.wrap) return null;
  return (
    <div className={css.period} aria-label={`${tr("期間","Duration")} ${timeText(record,locale)}`}>
      <span className={css.periodBar} aria-hidden="true" />
      <div>
        <small>{tr("開始","Start")}</small>
        <span>
          {t.from}
          {t.kind === "cycle" && ` ${t.unit}`}
        </span>
      </div>
      {t.kind === "cycle" && t.wrap && (
        <p className={css.wrap}>{tr("↻ 周期の境界をまたぐ","\u21bb Crosses the cycle boundary")}</p>
      )}
      <div>
        <small>{tr("終了","End")}</small>
        <span>
          {t.to}
          {t.kind === "cycle" && ` ${t.unit}`}
        </span>
      </div>
    </div>
  );
}

export default function ThemeTimeline<R extends TimelineDisplayRecord>({
  selectionLabel,
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
  emptyMessage,
  reading=false,
  onReadEvidence,
}: Props<R>) {
  const {locale}=useUiLocale();const tr=(ja:string,en:string)=>locale==="en"?en:ja;
  selectionLabel??=tr("Capsuleに含める","Include in Capsule");emptyMessage??=tr("表示する記録がありません。","No records to display.");
  const groups = useMemo(
    () => buildTimelineGroups(records, timeline,locale),
    [records, timeline,locale],
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
    if(reading){setActiveRowId(id);const record=records.find(r=>r.id===id);if(record)onFocusRecord(timelineRecordId(record),record.timeId??undefined);return;}
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
    if(group.id.startsWith("fallback:")&&(group.kind==="cycle"||group.kind==="qualitative")){const t=group.records[0]?.displayTime;if(t&&t.kind!=="calendar")group={...group,label:t.axis};}
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
      const t = record.displayTime ?? record.time;
      const label =
        group.kind === "none"
          ? tr("背景","Background")
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
                {t.from.length === 4 ? tr("年までの記録","Year precision") : tr("月までの記録","Month precision")}
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
                aria-expanded={reading?undefined:open}
                aria-pressed={reading?focusedRecordId===timelineRecordId(record):undefined}
                aria-controls={reading?undefined:`${prefix}-${encodeURIComponent(group.id)}-${record.id}`}
                onClick={() => toggle(record.id, open)}
              >
                <span className={css.rowText}>
                  <span className={css.assertion}>{reading?record.readingTitle||record.assertion:record.assertion}</span>
                  <RecordContext record={record} entities={entities} focusedEntityId={focusedEntityId}/>
                  {reading&&record.readingSummary&&<span className={css.readingSummary}>{record.readingSummary}</span>}{reading&&<KnowledgeReadingBadge kind={record.kind} polarity={record.polarity} en={locale==="en"}/>}
                  {(nested.length > 0 ||
                    (group.kind !== "calendar" && t?.label)) && (
                    <span className={css.meta}>
                      {group.kind !== "calendar" ? t?.label : ""}
                      {nested.length
                        ? ` · ${tr("詳しい時間軸","Detailed timelines")} ${nested.length}${tr("件","")}`
                        : ""}
                    </span>
                  )}
                </span>
                {!reading&&<span
                  className={css.chevron}
                  aria-hidden="true"
                  data-open={open || undefined}
                >
                  ⌄
                </span>}
              </button>
              {onShowGraph &&
                (graphRecordIds === undefined ||
                  graphRecordIds.includes(timelineRecordId(record))) && (
                  <button
                    type="button"
                    className={css.graphJump}
                    aria-label={`${tr("関係図で見る：","Show in relation diagram: ")}${record.assertion}`}
                    title={
                      record.kind === "relation"
                        ? tr("関係図のこの関係を見る","Show this relation in the diagram")
                        : tr("関係図のこの注記を見る","Show this note in the diagram")
                    }
                    onClick={() => onShowGraph(record)}
                  >
                    <Icon name="graph" />
                  </button>
                )}
            </div>
            {group.kind === "calendar" ? (
              <p className={css.meta}>{themeTimeLabel(record.displayTime ?? record.time,locale)}</p>
            ) : (
              <Period record={record} />
            )}
            {reading&&<div className={css.readingActions}>
              {record.evidence.map(e=><button key={e.evidenceId??e.sourceId} onClick={()=>e.evidenceId&&onReadEvidence?.(timelineRecordId(record),e.evidenceId)}><Icon name="link"/><span>{e.title}</span><Icon name="arrow"/></button>)}
              {nested.length>0&&<button aria-expanded={expanded.has(record.id)} onClick={()=>setExpanded(before=>{const next=new Set(before);if(next.has(record.id))next.delete(record.id);else next.add(record.id);return next;})}><Icon name="chevron"/>{tr("詳しい時間軸を開く","Open detailed timeline")} · {nested.length}</button>}
            </div>}
            {!reading&&<div
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
                    <p className={css.scope}>{tr("範囲：","Scope: ")}{record.scope}</p>
                  )}
                  {t?.kind === "qualitative" && (
                    <p className={css.note}>{t.coordinateMeaning}</p>
                  )}
                  {t?.kind === "calendar" &&
                    calendarMeaning(t) === "duration" &&
                    (t.startLatest || t.endEarliest) && (
                      <p className={css.note}>
                        {t.startLatest &&
                          tr(`開始は ${t.from}〜${t.startLatest} のどこか。`,`Starts between ${t.from} and ${t.startLatest}. `)}
                        {t.endEarliest &&
                          tr(`終了は ${t.endEarliest}〜${t.to} のどこか。`,`Ends between ${t.endEarliest} and ${t.to}. `)}
                        {tr("境界の幅が、続いた期間そのものを表すわけではありません。","Uncertain boundaries do not represent the duration itself.")}
                      </p>
                    )}
                  {record.polarity !== "affirmed" && (
                    <p className={css.note}>
                      {record.polarity === "denied"
                        ? tr("否定されている内容","Denied statement")
                        : tr("推測・不確実な内容","Uncertain statement")}
                    </p>
                  )}
                  <div className={css.evidenceList}>
                    {record.evidence.map((e, i) => (
                      <div key={i} className={css.evidence} data-source-id={e.sourceId} data-source-revision={e.sourceRevision}>
                        {e.url ? (
                          <ExternalSourceLink href={e.url} label={e.title}/>
                        ) : <span>{e.title}</span>}
                        {e.sourceRevision !== undefined && (
                          <p className={css.meta}>{tr("資料版","Source revision")} {e.sourceRevision}{e.stance ? ` · ${{ support: tr("支持","Supports"), refute: tr("反証","Refutes"), background: tr("背景","Background") }[e.stance]}` : ""}</p>
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
                        {tr("記録を訂正","Correct record")}
                      </button>
                    )}
                    <span>{tr("内容版","Content revision")} {record.revision}</span>
                  </div>
                  {nested.map((g) => renderGroup(g, [...ancestors, group.id]))}
                </div>
              </div>
            </div>}
            {reading&&expanded.has(record.id)&&nested.map(g=>renderGroup(g,[...ancestors,group.id]))}
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
                  ? tr("日付を補わず、背景や文脈として読む","Read as background or context without assigning a date")
                  : group.kind === "qualitative" && !group.order?.length
                    ? tr("順序の指定なし · 登録順で表示","No order specified · shown in registration order")
                    : group.kind === "calendar"
                      ? ""
                      : tr("行の間隔は経過時間を表しません","Row spacing does not represent elapsed time")}
                {group.originLabel
                  ? `${group.kind === "calendar" ? "" : " · "}${group.originLabel}`
                  : ""}
              </p>
            )}
          </div>
          <span>{new Set(rows.map(timelineRecordId)).size}{tr("件"," records")}{new Set(rows.map(timelineRecordId)).size < rows.length ? ` · ${rows.length}${tr("時期"," times")}` : ""}</span>
          {embedded && group.id === roots[0]?.id && !ancestors.length && (hasCalendar || subjects.length > 1) && <button className={css.headerSettings} aria-label={`${tr("年表の表示設定","Timeline display settings")}${settingsSummary ? `${locale==="en"?": ":"："}${settingsSummary}` : ""}`} aria-expanded={settingsOpen} aria-controls={`${prefix}-settings`} title={settingsSummary || undefined} onClick={() => setSettingsOpen(v => !v)}><Icon name="settings" /><span>{tr("表示設定","Display settings")}</span><Icon name="chevron" /></button>}
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
              <div className={css.laneKey} aria-label={tr("たどっている主語の対象","Subjects being followed")}>
                {lanes.map((id) => (
                  <span key={id}>
                    <i style={{ backgroundColor: color(id) }} />
                    {name(id)}
                  </span>
                ))}
                {!activeTrace && subjectIds.length > 5 && (
                  <small>{tr("ほかの対象は上の選択欄から","Choose other subjects above")}</small>
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
  const settingsSummary = [hasCalendar && resolution !== "auto" ? (locale==="en"?{year:"Year",month:"Month",day:"Day",hour:"Hour"}:{ year: "年", month: "月", day: "日",hour:"時間" })[resolution] : "", activeTrace ? name(activeTrace) : ""].filter(Boolean).join(" · ");
  const readingControls = <>
    {hasCalendar && <label className={css.resolutionSelect}>{tr("表示","Scale")}
      <select aria-label={tr("暦の表示単位","Calendar scale")} value={resolution} onChange={(e) => setResolution(e.target.value as CalendarResolution)}>
        <option value="auto">{tr("自動","Auto")}</option><option value="year">{tr("年","Year")}</option><option value="month">{tr("月","Month")}</option><option value="day">{tr("日","Day")}</option><option value="hour">{tr("時間","Hour")}</option>
      </select>
    </label>}
    {subjects.length > 1 && <label className={css.traceSelect}>{tr("たどる対象","Follow a subject")}
      <select aria-label={tr("たどる対象","Follow a subject")} value={activeTrace} onChange={(e) => setTrace(e.target.value)}>
        <option value="">{subjects.length > 5 ? tr("先頭の5対象","First 5 subjects") : tr("すべて","All")}</option>
        {subjects.map((id) => <option key={id} value={id}>{name(id)}</option>)}
      </select>
    </label>}
  </>;
  return (
    <div className={`${css.timeline} ${embedded ? css.embedded : ""} ${reading?css.reading:""}`}>
      <div className={`${css.controls} ${compactControls ? css.compactControls : ""}`}>
        <details className={css.guide}>
          <summary>{compactControls && <Icon name="chevron" />}{tr("線の見方","Timeline guide")}</summary>
          <div className={css.legend}>
            <span>
              <i className={css.legendTrace} />
              {tr("同じ主語の記録","Records about the same subject")}
            </span>
            <span>
              <i className={css.legendPeriod} />
              {tr("明示された期間","Explicit duration")}
            </span>
            <span>
              <i className={css.legendWindow} />
              {tr("発生時期の幅","Occurrence window")}
            </span>
            <span>
              <i className={css.legendUncertain} />
              {tr("不確かな期間の境界","Uncertain duration boundary")}
            </span>
          </div>
          <p className={css.help}>
            {tr("線の接続先が、その点・期間の記録です。両端付きの線は続いた期間、丸い端の破線は発生候補の幅です。不確かな期間境界だけを点線にします。表示単位の内に収まる出来事は点、期間は短い両端付きの線で示します。元の日付・意味は行を開いて確認できます。時間が重なっても所属や因果は作りません。暦以外の細い対象線は、同じ主語をたどる案内です。","Each connector leads to its record. Capped lines show durations; dashed lines with round ends show occurrence windows. Only uncertain duration boundaries are dotted. Events within one display unit appear as points; durations keep short capped lines. Open an entry for its original dates and meaning. Overlapping times do not imply membership or causality. Thin subject lines on non-calendar axes help you follow the same subject.")}
          </p>
        </details>
        {embedded ? null : compactControls ? (hasCalendar || subjects.length > 1) && <details className={css.displaySettings}>
          <summary aria-label={`${tr("年表の表示設定","Timeline display settings")}${settingsSummary ? `${locale==="en"?": ":"："}${settingsSummary}` : ""}`} title={settingsSummary || undefined}><Icon name="settings" /><span>{tr("表示設定","Display settings")}</span>{settingsSummary && <small>{settingsSummary}</small>}<span className={css.settingsChevron}><Icon name="chevron" /></span></summary>
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
