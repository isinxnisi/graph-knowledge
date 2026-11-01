import { z } from "zod";
import type { CapsuleDocument } from "./capsule-document";

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
const calendarDate = z
  .string()
  .regex(/^\d{4}(-\d{2})?(-\d{2})?$/)
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    if (!y) return false;
    if (m !== undefined && (m < 1 || m > 12)) return false;
    if (d !== undefined) {
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (d < 1 || d > days) return false;
    }
    return true;
  }, "実在する年月日を入力してください");
export const themeTimeSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("calendar"),
      from: calendarDate,
      to: calendarDate.optional(),
      label: z.string().max(300).default(""),
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
    if (
      t.kind === "calendar" &&
      t.to &&
      t.from.padEnd(10, "-01") > t.to.padEnd(10, "-31")
    )
      c.addIssue({
        code: "custom",
        message: "期間の終了を開始以降にしてください",
      });
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
  });
export type ThemeEntity = z.infer<typeof themeEntitySchema>;
export type ThemeEvidence = z.infer<typeof themeEvidenceSchema> & {
  hash?: string;
};
export type ThemeTime = z.infer<typeof themeTimeSchema>;
export type ThemeConcept = z.infer<typeof themeConceptSchema>;
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
};
export type ThemeCapsule = {
  id: string;
  title: string;
  description: string;
  revision: number;
  document: CapsuleDocument;
  sourceDocument?: CapsuleDocument;
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
