import type {
  ThemeRecord,
  ThemeTime,
  ThemeTimelineConfig,
} from "./theme-workbench";
import { calendarValue } from "./calendar-value";

export type ThemeTimelineGroup<R extends TimedRecord = ThemeRecord> = {
  id: string;
  kind: "calendar" | "cycle" | "qualitative" | "none";
  label: string;
  records: R[];
  order?: string[];
  originLabel?: string;
  parentRecordId?: string;
};
type TimedRecord = { id: string; time: ThemeTime | null };
export type ThemeTimelineIssue = { path: (string | number)[]; message: string };
export const MAX_TIMELINE_INSET_DEPTH = 3;

// Fallback groups never imply that two differently defined axes are comparable.
// The signature is a view key, not a new domain identity or a time coordinate.
function fallbackGroup(
  time: ThemeTime | null, locale: string = "ja",
): Omit<ThemeTimelineGroup, "records"> {
  if (!time)
    return { id: "fallback:none", kind: "none", label: locale==="en"?"Undated information":"時期を定めない情報" };
  if (time.kind === "calendar")
    return calendarValue(time.from)?.zone ? {id:"fallback:calendar:offset",kind:"calendar",label:locale==="en"?"Dates and durations (with time zone)":"日時・期間（時区指定あり）",originLabel:locale==="en"?"Times are compared using their stated offsets. Each entry retains the source notation.":"指定した時差で時刻を照合します。日時の原表記は各行に保持します。"} : { id: "fallback:calendar", kind: "calendar", label: locale==="en"?"Dates and durations":"年月日・期間",originLabel:locale==="en"?"No time zone is inferred for dates or times without one.":"時区未指定の日時に時差は補いません。" };
  if (time.kind === "cycle")
    return {
      id:
        "fallback:cycle:" + JSON.stringify([time.axis, time.period, time.unit]),
      kind: "cycle",
      label: time.axis,
    };
  return {
    id:
      "fallback:qualitative:" +
      JSON.stringify([time.axis, time.coordinateMeaning]),
    kind: "qualitative",
    label: time.axis,
  };
}

/** Cross-reference validation; the Zod schema validates the field shapes first. */
export function themeTimelineIssues(
  records: TimedRecord[],
  config?: ThemeTimelineConfig,
): ThemeTimelineIssue[] {
  if (!config) return [];
  const issues: ThemeTimelineIssue[] = [];
  const add = (path: (string | number)[], message: string) =>
    issues.push({ path, message });
  const recordMap = new Map(records.map((r) => [r.id, r]));
  const axes = new Map<string, ThemeTimelineConfig["axes"][number]>();
  config.axes.forEach((axis, i) => {
    if (axes.has(axis.id)) add(["axes", i, "id"], "年表の軸IDが重複しています");
    axes.set(axis.id, axis);
    if (axis.order && axis.kind !== "qualitative")
      add(["axes", i, "order"], "段階の順序は定性軸だけに指定できます");
    if (axis.order && new Set(axis.order).size !== axis.order.length)
      add(["axes", i, "order"], "段階の順序に重複があります");
  });
  const placementMap = new Map<string, string>();
  const cycleDefinitions = new Map<string, string>();
  const qualitativeDefinitions = new Map<string, string>();
  const calendarDefinitions = new Map<string, string>();
  config.placements.forEach((placement, i) => {
    if (placementMap.has(placement.recordId))
      add(
        ["placements", i, "recordId"],
        "同じ記録を複数の軸へ置くことはできません",
      );
    placementMap.set(placement.recordId, placement.axisId);
    const record = recordMap.get(placement.recordId),
      axis = axes.get(placement.axisId);
    if (!record)
      add(["placements", i, "recordId"], "年表に置く記録がありません");
    if (!axis)
      add(["placements", i, "axisId"], "指定された年表の軸がありません");
    if (!record || !axis) return;
    const time = record.time;
    if (!time || time.kind !== axis.kind) {
      add(["placements", i], "記録の時期表現と軸の種類が一致しません");
      return;
    }
    if (time.kind === "cycle") {
      const signature = JSON.stringify([time.period, time.unit]);
      const old = cycleDefinitions.get(axis.id);
      if (old && old !== signature)
        add(["placements", i], "同じ周期軸では周期長と単位を揃えてください");
      cycleDefinitions.set(axis.id, signature);
    }
    if(time.kind === "calendar") {
      const basis=calendarValue(time.from)?.basis??"civil",old=calendarDefinitions.get(axis.id);
      if(old&&old!==basis)add(["placements",i],"時区指定の日時と時区未指定の年月日は別の軸へ置いてください");
      calendarDefinitions.set(axis.id,basis);
    }
    if (time.kind === "qualitative") {
      const old = qualitativeDefinitions.get(axis.id);
      if (old && old !== time.coordinateMeaning)
        add(["placements", i], "同じ定性軸では座標の意味を揃えてください");
      qualitativeDefinitions.set(axis.id, time.coordinateMeaning);
      if (axis.order) {
        const start = axis.order.indexOf(time.from),
          end = time.to ? axis.order.indexOf(time.to) : start;
        if (start < 0 || end < 0)
          add(["placements", i], "記録の段階が軸の順序に含まれていません");
        else if (end < start)
          add(["placements", i], "期間の終了段階を開始以降にしてください");
      }
    }
  });
  const parents = new Map<string, string>();
  config.insets.forEach((inset, i) => {
    if (!axes.has(inset.axisId))
      add(["insets", i, "axisId"], "入れ子にする軸がありません");
    if (!recordMap.has(inset.parentRecordId))
      add(["insets", i, "parentRecordId"], "入れ子の親記録がありません");
    if (parents.has(inset.axisId))
      add(
        ["insets", i, "axisId"],
        "一つの軸には一つの親記録を指定してください",
      );
    parents.set(inset.axisId, inset.parentRecordId);
  });
  // An inset's parent record belongs either to another explicit axis or to a
  // fallback root. Never infer a parent from dates, names or entity identity.
  config.insets.forEach((inset, i) => {
    let axisId: string | undefined = inset.axisId;
    const visited = new Set<string>();
    let depth = 0;
    while (axisId && parents.has(axisId)) {
      if (visited.has(axisId)) {
        add(["insets", i], "年表の入れ子が循環しています");
        break;
      }
      visited.add(axisId);
      depth++;
      if (depth > MAX_TIMELINE_INSET_DEPTH) {
        add(["insets", i], "年表の入れ子は3段までにしてください");
        break;
      }
      axisId = placementMap.get(parents.get(axisId)!);
    }
  });
  return issues;
}

/** No sorting or synthetic dates: each original time value and precision survives. */
export function buildTimelineGroups<R extends TimedRecord>(
  records: R[],
  config?: ThemeTimelineConfig, locale: string = "ja",
): ThemeTimelineGroup<R>[] {
  const groups = new Map<string, ThemeTimelineGroup<R>>();
  const recordIds = new Set(records.map((r) => r.id));
  const placements = new Map(
    config?.placements.map((p) => [p.recordId, p.axisId]),
  );
  const insets = new Map(config?.insets.map((i) => [i.axisId, i]));
  for (const axis of config?.axes ?? []) {
    const inset = insets.get(axis.id);
    groups.set(axis.id, {
      ...axis,
      label: inset?.label ?? axis.label,
      records: [],
      ...(inset && recordIds.has(inset.parentRecordId)
        ? { parentRecordId: inset.parentRecordId }
        : {}),
    });
  }
  for (const record of records) {
    const explicit = groups.get(placements.get(record.id) ?? "");
    // A legacy or locally filtered snapshot must still display every record.
    if (explicit && record.time?.kind === explicit.kind)
      explicit.records.push(record);
    else {
      const descriptor = fallbackGroup(record.time,locale);
      if (!groups.has(descriptor.id))
        groups.set(descriptor.id, { ...descriptor, records: [] });
      groups.get(descriptor.id)!.records.push(record);
    }
  }
  return [...groups.values()].filter((group) => group.records.length > 0);
}

/** Freeze only the selected context. Missing parents promote the child to a root. */
export function subsetThemeTimeline(
  config: ThemeTimelineConfig | undefined,
  recordIds: readonly string[],
): ThemeTimelineConfig | undefined {
  if (!config) return undefined;
  const included = new Set(recordIds);
  const placements = config.placements.filter((p) => included.has(p.recordId));
  const axisIds = new Set(placements.map((p) => p.axisId));
  return {
    version: 1,
    axes: config.axes
      .filter((a) => axisIds.has(a.id))
      .map((a) => ({ ...a, ...(a.order ? { order: [...a.order] } : {}) })),
    placements: placements.map((p) => ({ ...p })),
    insets: config.insets
      .filter((i) => axisIds.has(i.axisId) && included.has(i.parentRecordId))
      .map((i) => ({ ...i })),
  };
}
