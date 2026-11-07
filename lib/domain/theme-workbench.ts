import { z } from "zod";
import type { CapsuleDocument } from "./capsule-document";
import { themeTimelineIssues } from "./theme-timeline";
import { themeTimeLabel } from "./theme-time";
import { calendarBounds, calendarValue } from "./calendar-value";

const id = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const short = z.string().trim().min(1).max(300);
export const themeEntitySchema = z.strictObject({
  id,
  name: short.max(200),
  kind: z.string().trim().min(1).max(60),
  description: z.string().max(4000).default(""),
});
export const themeEvidenceSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  title: short,
  locator: z.string().trim().min(1).max(1000),
  excerpt: z.string().trim().min(1).max(4000),
  retrievedAt: z.iso.datetime(),
});
function definitelyAfter(left: string, right: string) {
  return calendarBounds(left)[0] > calendarBounds(right)[1];
}
const calendarDate = z.string().max(32).refine(value=>!!calendarValue(value), "年月日、または日時を入力してください（例：2021-12-25T12:20Z）。時区は省略できます");
export const themeTimeSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("calendar"),
      from: calendarDate,
      to: calendarDate.optional(),
      meaning: z.enum(["point", "duration", "occurrence-window"]).optional(),
      startLatest: calendarDate.optional(),
      endEarliest: calendarDate.optional(),
      label: z.string().max(300).default(""),
      expression: z.string().max(300).optional(),
    }),
    z.strictObject({
      kind: z.literal("cycle"),
      axis: short,
      period: z.number().positive(),
      from: z.number().finite(),
      to: z.number().finite(),
      wrap: z.boolean(),
      unit: short,
      label: short,
    }),
    z.strictObject({
      kind: z.literal("qualitative"),
      axis: short,
      from: short,
      to: z.string().max(300).optional(),
      coordinateMeaning: short,
      label: short,
    }),
  ])
  .superRefine((t, c) => {
    if (t.kind === "calendar") {
      const issue = (path: string, message: string) =>
        c.addIssue({ code: "custom", path: [path], message });
      const values=[t.from,t.to,t.startLatest,t.endEarliest].filter((v):v is string=>!!v);
      if(new Set(values.map(v=>calendarValue(v)?.basis)).size>1)issue("to","同じ時期の境界では時区の指定を揃えてください。未指定の時区は補いません");
      if (t.to && definitelyAfter(t.from, t.to))
        issue("to", "時期の範囲の後端を前端以降にしてください");
      if (t.meaning === "point" && t.to)
        issue("to", "発生時点には範囲の後端を指定できません");
      if (
        (t.meaning === "duration" || t.meaning === "occurrence-window") &&
        !t.to
      )
        issue("to", "期間・発生時期の幅には範囲の後端が必要です");
      if (t.meaning !== "duration") {
        if (t.startLatest)
          issue("startLatest", "開始の不確かな幅は期間にだけ指定できます");
        if (t.endEarliest)
          issue("endEarliest", "終了の不確かな幅は期間にだけ指定できます");
      } else {
        if (t.startLatest && definitelyAfter(t.from, t.startLatest))
          issue("startLatest", "開始の最遅を最早以降にしてください");
        if (t.endEarliest && t.to && definitelyAfter(t.endEarliest, t.to))
          issue("endEarliest", "終了の最早を最遅以前にしてください");
        if (t.startLatest && t.to && definitelyAfter(t.startLatest, t.to))
          issue("startLatest", "開始の最遅を終了の最遅以前にしてください");
        if (t.endEarliest && definitelyAfter(t.from, t.endEarliest))
          issue("endEarliest", "終了の最早を開始の最早以降にしてください");
        // startLatest may be after endEarliest: overlapping endpoint windows
        // mean no guaranteed common interior, not an invalid duration.
      }
    }
    if (
      t.kind === "cycle" &&
      (t.from < 0 ||
        t.to < 0 ||
        t.from >= t.period ||
        t.to >= t.period ||
        (!t.wrap && t.to < t.from))
    )
      c.addIssue({
        code: "custom",
        message: "周期の座標と折り返し指定を確認してください",
      });
  });
export const themeConceptSchema = z.strictObject({
  id,
  label: short,
  definition: z.string().trim().min(1).max(4000),
});
export const themeTimelineSchema = z.strictObject({
  version: z.literal(1),
  axes: z
    .array(
      z.strictObject({
        id,
        kind: z.enum(["calendar", "cycle", "qualitative"]),
        label: short,
        order: z.array(short).min(1).max(400).optional(),
        originLabel: short.optional(),
      }),
    )
    .max(32),
  placements: z.array(z.strictObject({ recordId: id, axisId: id })).max(400),
  insets: z
    .array(z.strictObject({ parentRecordId: id, axisId: id, label: short }))
    .max(32),
});
export const themeRecordInputSchema = z
  .strictObject({
    id,
    kind: z.enum(["relation", "episode", "note"]),
    subject: id,
    object: id.nullable().default(null),
    assertion: z.string().trim().min(1).max(4000),
    relation: z.string().trim().max(200).default(""),
    scope: z.string().max(3000).default(""),
    polarity: z.enum(["affirmed", "denied", "uncertain"]).default("affirmed"),
    time: themeTimeSchema.nullable().default(null),
    evidence: z.array(themeEvidenceSchema).min(1).max(20),
  })
  .superRefine((r, c) => {
    if (r.kind === "relation" && (!r.object || !r.relation))
      c.addIssue({
        code: "custom",
        message: "関係には相手と具体的な関係名が必要です",
      });
  });
export const themePackageSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    title: short,
    description: z.string().max(8000),
    entities: z.array(themeEntitySchema).min(1).max(200),
    records: z.array(themeRecordInputSchema).min(1).max(400),
    timeline: themeTimelineSchema.optional(),
    mappings: z
      .array(
        z.strictObject({
          recordId: id,
          concept: themeConceptSchema,
          reason: z.string().trim().min(1).max(4000),
        }),
      )
      .max(400)
      .default([]),
  })
  .superRefine((p, c) => {
    const entities = new Set(p.entities.map((e) => e.id)),
      records = new Set(p.records.map((r) => r.id));
    if (
      entities.size !== p.entities.length ||
      records.size !== p.records.length
    )
      c.addIssue({ code: "custom", message: "対象・記録IDが重複しています" });
    for (const r of p.records)
      if (!entities.has(r.subject) || (r.object && !entities.has(r.object)))
        c.addIssue({
          code: "custom",
          message: `対象が見つかりません: ${r.id}`,
        });
    if (new Set(p.mappings.map((m) => m.recordId)).size !== p.mappings.length)
      c.addIssue({ code: "custom", message: "意味対応が重複しています" });
    for (const m of p.mappings)
      if (!records.has(m.recordId))
        c.addIssue({
          code: "custom",
          message: "意味対応の対象記録がありません",
        });
    for (const issue of themeTimelineIssues(p.records, p.timeline))
      c.addIssue({
        code: "custom",
        path: ["timeline", ...issue.path],
        message: issue.message,
      });
  });
export type ThemeEntity = z.infer<typeof themeEntitySchema>;
export type ThemeEvidence = z.infer<typeof themeEvidenceSchema> & {
  hash?: string;
};
export type ThemeTime = z.infer<typeof themeTimeSchema>;
export type ThemeConcept = z.infer<typeof themeConceptSchema>;
export type ThemeTimelineConfig = z.infer<typeof themeTimelineSchema>;
export type ThemeRecordInput = z.input<typeof themeRecordInputSchema>;
export type ThemePackage = z.input<typeof themePackageSchema>;
export type ThemeMapping = {
  revision: number;
  recordRevision: number;
  concept: ThemeConcept | null;
  reason: string;
  updatedAt: string;
};
export type ThemeRecord = z.output<typeof themeRecordInputSchema> & {
  revision: number;
  updatedAt: string;
  reason: string;
  evidence: ThemeEvidence[];
  mapping: ThemeMapping | null;
};
export type ThemeDetail = {
  id: string;
  title: string;
  description: string;
  revision: number;
  entities: ThemeEntity[];
  records: ThemeRecord[];
  createdAt: string;
  updatedAt: string;
  sourceHash: string;
  timeline?: ThemeTimelineConfig;
};
export type ThemeSummary = Pick<
  ThemeDetail,
  "id" | "title" | "description" | "revision" | "updatedAt"
> & { recordCount: number; unmappedCount: number };
export type ThemeSearchHit = {
  themeId: string;
  themeTitle: string;
  record: ThemeRecord;
  entities: ThemeEntity[];
  match: "text" | "meaning";
};
export type ThemeSnapshot = {
  themeId: string;
  themeRevision: number;
  entities: ThemeEntity[];
  records: ThemeRecord[];
  timeline?: ThemeTimelineConfig;
};
export type ThemeCapsule = {
  id: string;
  title: string;
  description: string;
  revision: number;
  document: CapsuleDocument;
  sourceDocument?: CapsuleDocument;
  graphCleanupUndo?: {
    document: CapsuleDocument;
    sourceDocument?: CapsuleDocument;
  };
  snapshot: ThemeSnapshot;
  createdAt: string;
  updatedAt: string;
  shareToken: string | null;
  sharedRevision: number | null;
};
export type ThemeCapsuleSummary = Pick<
  ThemeCapsule,
  "id" | "title" | "revision" | "updatedAt" | "shareToken" | "sharedRevision"
>;
export type ThemeCapsuleDiff = {
  recordId: string;
  before: ThemeRecord;
  after: ThemeRecord | null;
  kind: "content" | "meaning";
}[];
export function themeRecordSearchText(
  record: ThemeRecord,
  entities: ThemeEntity[],
) {
  return [
    record.assertion,
    record.relation,
    record.scope,
    themeTimeLabel(record.time),
    ...entities
      .filter((e) => e.id === record.subject || e.id === record.object)
      .map((e) => e.name),
    ...record.evidence.map((e) => e.excerpt),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase();
}
export function themeDiff(
  snapshot: ThemeSnapshot,
  theme: ThemeDetail,
): ThemeCapsuleDiff {
  return snapshot.records.flatMap<ThemeCapsuleDiff[number]>((before) => {
    const after = theme.records.find((r) => r.id === before.id);
    if (!after || after.revision !== before.revision)
      return [
        {
          recordId: before.id,
          before,
          after: after ?? null,
          kind: "content" as const,
        },
      ];
    if (after.mapping?.revision !== before.mapping?.revision)
      return [{ recordId: before.id, before, after, kind: "meaning" as const }];
    return [];
  });
}
