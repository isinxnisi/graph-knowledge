import {knowledgeDisplayTime} from "./knowledge-display";
import type { KnowledgeRecordVersion, KnowledgeSnapshot, KnowledgeTimeline } from "./knowledge-foundation";
import type { ThemeTimelineConfig } from "./theme-workbench";
import type { TimelineDisplayRecord, TimelineDisplayEntity } from "./timeline-display";

/** Only a drawing identity: never persisted as another factual Record. */
export const knowledgeTimelineRowId = (recordId: string, revision: number, timeId: string | null) =>
  encodeURIComponent(JSON.stringify([recordId, revision, timeId]));

export function knowledgeTimelineRows(records: KnowledgeRecordVersion[]) {
  return records.flatMap((record) => {
    const annotations = record.content.times.length ? record.content.times : [{ id: null, time: null }];
    return annotations.map(({ id, time }) => ({
      id: knowledgeTimelineRowId(record.id, record.revision, id),
      recordId: record.id, timeId: id, time,
    }));
  });
}

/** A layout projection only. Each time annotation is placed independently;
 * an inset belongs to the parent Record and appears once, never once per time.
 * Prefer a parent row outside the child axis/its descendants. No date or overlap
 * is used to invent a parent, a membership, or a causal relation. */
export function knowledgeTimelineLayout(records: KnowledgeRecordVersion[], timeline?: KnowledgeTimeline): ThemeTimelineConfig | undefined {
  if (!timeline) return undefined;
  const rows = knowledgeTimelineRows(records);
  const revisionById = new Map(records.map(r => [r.id, r.revision]));
  const rowId = (recordId: string, timeId: string) => knowledgeTimelineRowId(recordId, revisionById.get(recordId) ?? 0, timeId);
  const axisId = (id: string) => `knowledge-axis:${encodeURIComponent(id)}`;
  const placements = timeline.placements.map(p => ({ recordId: rowId(p.recordId, p.timeId), axisId: axisId(p.axisId) }));
  const axisByRow = new Map(placements.map(p => [p.recordId, p.axisId]));
  const nestedAxes = new Set(timeline.insets.map(i => axisId(i.axisId)));
  const insets = timeline.insets.map(inset => {
    // Consider all explicit parent-time alternatives when avoiding descendants.
    const descendants = new Set([axisId(inset.axisId)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of timeline.insets) {
        if (descendants.has(axisId(candidate.axisId))) continue;
        if (rows.some(r => r.recordId === candidate.parentRecordId && descendants.has(axisByRow.get(r.id) ?? ""))) {
          descendants.add(axisId(candidate.axisId)); changed = true;
        }
      }
    }
    const candidates = rows.filter(r => r.recordId === inset.parentRecordId&&(!inset.parentTimeId||r.timeId===inset.parentTimeId));
    const outside = candidates.filter(r => !descendants.has(axisByRow.get(r.id) ?? ""));
    const parent = outside.find(r => !nestedAxes.has(axisByRow.get(r.id) ?? "")) ?? outside[0] ?? candidates[0];
    return { ...inset, axisId: axisId(inset.axisId), parentRecordId: parent?.id ?? `missing:${inset.parentRecordId}` };
  });
  return { version: 1, axes: timeline.axes.map(a => ({ ...a, id: axisId(a.id), ...(a.order ? { order: [...a.order] } : {}) })), placements, insets };
}

/** Read only the supplied fixed snapshot. Never fetch current entity/source
 * heads and never create a fake subject, URL, quotation, or period entity. */
export function knowledgeTimelineProjection(snapshot: KnowledgeSnapshot, options: { untimedInContext?: boolean; locale?: string } = {}): {
  records: TimelineDisplayRecord[];
  entities: TimelineDisplayEntity[];
  timeline?: ThemeTimelineConfig;
  graphRecordIds: string[];
} {
  const insetParents = new Set(snapshot.timeline?.insets.map(i => i.parentRecordId));
  const displayedRecords = options.untimedInContext
    ? snapshot.records.filter(r => r.content.times.length > 0 || insetParents.has(r.id))
    : snapshot.records;
  const recordById = new Map(displayedRecords.map(r => [r.id, r]));
  const sourceByPin = new Map(snapshot.sources.map(s => [JSON.stringify([s.id, s.revision]), s]));
  const entityIds = new Set(snapshot.entities.map(e => e.id));
  const records = knowledgeTimelineRows(displayedRecords).map(row => {
    const record = recordById.get(row.recordId)!;
    const c = record.content;
    if ([c.subjectId, c.objectId].some(id => id !== null && !entityIds.has(id)))
      throw new Error("年表の固定版に対象がありません");
    return {
      ...row, ...(row.timeId&&options.locale?{displayTime:knowledgeDisplayTime(record,row.timeId,snapshot.translations,options.locale)}:{}), revision: record.revision, kind: c.kind,
      subject: c.subjectId, object: c.objectId,
      assertion: c.assertion, relation: c.relation, polarity: c.polarity, scope: c.scope,
      evidence: c.evidence.map(e => {
        const source = sourceByPin.get(JSON.stringify([e.source.id, e.source.revision]));
        if (!source) throw new Error("年表の固定版に引用資料の版がありません");
        return { sourceId: source.id, sourceRevision: source.revision,
          title: source.content.title, url: source.content.url, bibliography: source.content.bibliography,
          locator: e.locator, excerpt: e.excerpt, stance: e.stance };
      }),
    };
  });
  return {
    records,
    entities: snapshot.entities.map(e => ({ id: e.id, revision: e.revision, name: e.content.name, kind: e.content.kind, description: e.content.description })),
    timeline: knowledgeTimelineLayout(displayedRecords, snapshot.timeline),
    graphRecordIds: snapshot.records.filter(r => r.content.kind === "relation").map(r => r.id),
  };
}
