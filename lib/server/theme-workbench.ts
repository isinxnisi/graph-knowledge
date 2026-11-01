import { themeTimeLabel } from "../domain/theme-time";
import { Pool } from "pg";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  subsetThemeTimeline,
  themeTimelineIssues,
} from "../domain/theme-timeline";
import {
  capsuleDocumentSchema,
  type CapsuleDocument,
} from "../domain/capsule-document";
import {
  themePackageSchema,
  themeEntitySchema,
  themeRecordInputSchema,
  themeConceptSchema,
  themeDiff,
  type ThemeDetail,
  type ThemeCapsule,
  type ThemeRecord,
  type ThemeSnapshot,
} from "../domain/theme-workbench";

type State = {
  themes: ThemeDetail[];
  capsules: ThemeCapsule[];
  shares: Record<string, ThemeCapsule>;
  meanings?: z.infer<typeof themeConceptSchema>[];
};
let pool: Pool | undefined;
let initialized: Promise<void> | undefined;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export class ThemeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function themeGuard(request?: Request, write = false) {
  if (process.env.THEME_WORKBENCH_ENABLED !== "1")
    throw new ThemeError("この確認環境は無効です", 404);
  const origin = process.env.THEME_ORIGIN;
  if (origin !== "http://localhost:3276")
    throw new ThemeError("隔離環境のorigin設定が一致しません", 503);
  if (request) {
    const host = request.headers.get("host");
    if (host !== "localhost:3276" && host !== "127.0.0.1:3276")
      throw new ThemeError("ローカル確認環境だけで利用できます", 403);
    if (write && request.headers.get("origin") !== origin)
      throw new ThemeError("別のサイトからは変更できません", 403);
  }
}
async function db() {
  themeGuard();
  if (!pool) {
    const url = new URL(process.env.THEME_DATABASE_URL ?? "");
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55475" ||
      url.pathname !== "/plunode_theme75"
    )
      throw new ThemeError("専用DB設定が必要です", 503);
    pool = new Pool({
      connectionString: url.toString(),
      max: 3,
      statement_timeout: 10000,
    });
  }
  if (!initialized) {
    const target = pool;
    initialized = (async () => {
      const c = await target.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(7503276)");
        await c.query(`CREATE SCHEMA IF NOT EXISTS theme75;
 CREATE TABLE IF NOT EXISTS theme75.state(id integer PRIMARY KEY CHECK(id=1), body jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS theme75.events(id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), operation text NOT NULL, payload jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS theme75.receipts(id uuid PRIMARY KEY, digest text NOT NULL, response jsonb NOT NULL);
 INSERT INTO theme75.state VALUES(1,'{"themes":[],"capsules":[],"shares":{}}') ON CONFLICT DO NOTHING;`);
        // Preserve definitions independently of their current assignments. Recover
        // early preview definitions from retained commands exactly once.
        const state = (
          await c.query<{ body: State }>(
            "SELECT body FROM theme75.state WHERE id=1 FOR UPDATE",
          )
        ).rows[0].body;
        if (!state.meanings) {
          const meanings = new Map<
            string,
            z.infer<typeof themeConceptSchema>
          >();
          const events = await c.query(
            "SELECT payload->'input' AS input FROM theme75.events WHERE operation IN ('import','mapping') ORDER BY id",
          );
          for (const { input } of events.rows) {
            const candidates =
              input?.action === "import"
                ? (input.package?.mappings ?? []).map(
                    (m: { concept: unknown }) => m.concept,
                  )
                : [input?.concept];
            for (const candidate of candidates) {
              const parsed = themeConceptSchema.safeParse(candidate);
              if (parsed.success) meanings.set(parsed.data.id, parsed.data);
            }
          }
          state.meanings = [...meanings.values()];
          await c.query("UPDATE theme75.state SET body=$1 WHERE id=1", [
            JSON.stringify(state),
          ]);
        }
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    })().catch((e) => {
      initialized = undefined;
      throw e;
    });
  }
  await initialized;
  return pool;
}
export async function themeState() {
  const p = await db();
  return (
    await p.query<{ body: State }>("SELECT body FROM theme75.state WHERE id=1")
  ).rows[0].body;
}
const key = z.string().min(1).max(100);
const base = { requestId: z.uuidv4() };
export const themeCommand = z.discriminatedUnion("action", [
  z.strictObject({
    ...base,
    action: z.literal("import"),
    package: themePackageSchema,
  }),
  z.strictObject({
    ...base,
    action: z.literal("record"),
    themeId: key,
    expected: z.number().int(),
    record: themeRecordInputSchema,
    entities: z.array(themeEntitySchema).max(2).default([]),
    reason: z.string().trim().min(1).max(4000),
    detachTimelinePlacement: z.boolean().default(false),
  }),
  z.strictObject({
    ...base,
    action: z.literal("mapping"),
    themeId: key,
    expected: z.number().int(),
    recordId: key,
    concept: themeConceptSchema.nullable(),
    reason: z.string().trim().min(1).max(4000),
  }),
  z.strictObject({
    ...base,
    action: z.literal("capsule-create"),
    themeId: key,
    recordIds: z.array(key).min(1).max(400),
  }),
  z.strictObject({
    ...base,
    action: z.literal("capsule-save"),
    id: z.uuidv4(),
    expected: z.number().int(),
    title: z.string().trim().min(1).max(80),
    description: z.string().max(4000),
    document: capsuleDocumentSchema,
  }),
  z.strictObject({
    ...base,
    action: z.literal("capsule-clean-graph"),
    id: z.uuidv4(),
    expected: z.number().int(),
  }),
  z.strictObject({
    ...base,
    action: z.literal("capsule-restore-graph"),
    id: z.uuidv4(),
    expected: z.number().int(),
  }),
  z.strictObject({
    ...base,
    action: z.literal("capsule-refresh"),
    id: z.uuidv4(),
    expected: z.number().int(),
    themeRevision: z.number().int(),
    recordIds: z.array(key).min(1).max(400),
  }),
  z.strictObject({
    ...base,
    action: z.literal("share"),
    id: z.uuidv4(),
    expected: z.number().int(),
    stop: z.boolean().default(false),
  }),
]);
export function documentKey(themeId: string, id: string) {
  const s = hash([themeId, id]);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
export function themeRecordKeys(
  themeId: string,
  records: Pick<ThemeRecord, "id">[],
) {
  return Object.fromEntries(
    records.map((r) => [r.id, documentKey(themeId, "record:" + r.id)]),
  );
}
function projectThemeDocument(
  snapshot: ThemeSnapshot,
  supportingRecords: boolean,
): CapsuleDocument {
  const graphRecords = supportingRecords
    ? snapshot.records
    : snapshot.records.filter((r) => r.kind === "relation");
  const used = new Set(
    graphRecords.flatMap((r) => [r.subject, ...(r.object ? [r.object] : [])]),
  );
  const nodes = snapshot.entities
    .filter((e) => used.has(e.id))
    .map((e) => ({
      key: documentKey(snapshot.themeId, "entity:" + e.id),
      title: e.name,
      description: [
        e.description,
        ...graphRecords
          .filter((r) => r.kind !== "relation" && r.subject === e.id)
          .map(
            (r) =>
              r.assertion +
              (r.time ? "\n" + themeTimeLabel(r.time) : "") +
              (r.scope ? "\n範囲：" + r.scope : ""),
          ),
      ]
        .filter(Boolean)
        .join("\n\n"),
      badge: e.kind,
      shape:
        e.kind === "人物" ? ("circle" as const) : ("round-rectangle" as const),
      origin: { kind: "local" as const },
    }));
  const relations = graphRecords
    .filter((r) => r.kind === "relation" && r.object)
    .map((r) => ({
      key: documentKey(snapshot.themeId, "record:" + r.id),
      source: documentKey(snapshot.themeId, "entity:" + r.subject),
      target: documentKey(snapshot.themeId, "entity:" + r.object),
      label: r.relation,
      note:
        r.assertion +
        (r.time ? "\n" + themeTimeLabel(r.time) : "") +
        (r.scope ? "\n範囲：" + r.scope : "") +
        "\n" +
        { affirmed: "肯定", denied: "否定", uncertain: "推測・不確実" }[
          r.polarity
        ],
      origin: { kind: "local" as const },
    }));
  const texts = graphRecords
    .filter((r) => r.kind !== "relation")
    .map((r) => ({
      key: documentKey(snapshot.themeId, "record:" + r.id),
      text: r.assertion,
      style: "note" as const,
      width: 420,
      fontSize: 14,
    }));
  const evidence = graphRecords.flatMap((r) =>
    r.evidence.map((e, i) => ({
      key: documentKey(snapshot.themeId, `evidence:${r.id}:${i}`),
      targetKey: documentKey(
        snapshot.themeId,
        r.kind === "relation" ? "record:" + r.id : "entity:" + r.subject,
      ),
      supports:
        r.kind === "relation"
          ? ("relation" as const)
          : ("description" as const),
      title: e.title,
      url: e.url,
      locator: e.locator,
      note: e.excerpt,
      stance: "support" as const,
    })),
  );
  const positions = Object.fromEntries([
    ...nodes.map((n, i) => [
      n.key,
      {
        x: Math.cos((i * 2 * Math.PI) / Math.max(nodes.length, 1)) * 300 + 400,
        y: Math.sin((i * 2 * Math.PI) / Math.max(nodes.length, 1)) * 220 + 260,
      },
    ]),
    ...texts.map((n, i) => [n.key, { x: 400, y: 620 + i * 150 }]),
  ]);
  return capsuleDocumentSchema.parse({
    schemaVersion: 1,
    nodes,
    relations,
    texts,
    evidence,
    unresolvedClaimIds: [],
    layout: { positions, pan: { x: 0, y: 0 }, zoom: 1 },
  });
}

/** A theme is the source collection; its relationship diagram is one projection.
 * Non-relational records remain in the timeline/snapshot, not graph annotations. */
export function themeDocument(snapshot: ThemeSnapshot): CapsuleDocument {
  return projectThemeDocument(snapshot, false);
}

/** Explicit owner operation for old saved diagrams. Never rewrites a shared copy.
 * Authored text, positions, nodes, relationships and description edits are retained. */
export function themeGraphCleanup(
  cap: Pick<ThemeCapsule, "snapshot" | "document" | "sourceDocument">,
) {
  const before = cap.sourceDocument ?? projectThemeDocument(cap.snapshot, true);
  const document = structuredClone(cap.document);
  const supporting = cap.snapshot.records.filter((r) => r.kind !== "relation");
  const recordKeys = new Set(
    supporting.map((r) => documentKey(cap.snapshot.themeId, "record:" + r.id)),
  );
  let removedTexts = 0,
    cleanedDescriptions = 0,
    removedEvidence = 0;
  document.texts = document.texts.filter((text) => {
    const old = before.texts.find((t) => t.key === text.key);
    if (
      recordKeys.has(text.key) &&
      old &&
      isDeepStrictEqual(text, old) &&
      isDeepStrictEqual(
        document.layout.positions[text.key],
        before.layout.positions[text.key],
      )
    ) {
      delete document.layout.positions[text.key];
      removedTexts++;
      return false;
    }
    return true;
  });
  const unchangedDescriptionKeys = new Set<string>();
  for (const node of document.nodes) {
    const old = before.nodes.find((n) => n.key === node.key);
    const entity = cap.snapshot.entities.find(
      (e) => documentKey(cap.snapshot.themeId, "entity:" + e.id) === node.key,
    );
    if (old && entity && node.description === old.description) {
      unchangedDescriptionKeys.add(node.key);
      if (node.description !== entity.description) {
        node.description = entity.description;
        cleanedDescriptions++;
      }
    }
  }
  const supportingEvidenceKeys = new Set(
    supporting.flatMap((r) =>
      r.evidence.map((_, i) =>
        documentKey(cap.snapshot.themeId, `evidence:${r.id}:${i}`),
      ),
    ),
  );
  document.evidence = document.evidence.filter((evidence) => {
    const old = before.evidence.find((e) => e.key === evidence.key);
    if (
      supportingEvidenceKeys.has(evidence.key) &&
      unchangedDescriptionKeys.has(evidence.targetKey) &&
      old &&
      isDeepStrictEqual(evidence, old)
    ) {
      removedEvidence++;
      return false;
    }
    return true;
  });
  return {
    document: capsuleDocumentSchema.parse(document),
    sourceDocument: themeDocument(cap.snapshot),
    changed: removedTexts + cleanedDescriptions + removedEvidence > 0,
    removedTexts,
    cleanedDescriptions,
    removedEvidence,
  };
}
function conflict(actual: number, expected: number) {
  if (actual !== expected)
    throw new ThemeError(
      "別の変更が保存されています。入力を控えてから最新の内容を開き直してください。",
      409,
    );
}
function findTheme(s: State, id: string) {
  const t = s.themes.find((t) => t.id === id);
  if (!t) throw new ThemeError("テーマがありません", 404);
  return t;
}
function enrich(
  r: z.output<typeof themeRecordInputSchema>,
  revision: number,
  reason: string,
): ThemeRecord {
  return {
    ...r,
    revision,
    reason,
    updatedAt: new Date().toISOString(),
    evidence: r.evidence.map((e) => ({ ...e, hash: hash(e) })),
    mapping: null,
  };
}
export async function executeThemeCommand(raw: unknown) {
  const cmd = themeCommand.parse(raw),
    p = await db(),
    c = await p.connect(),
    digest = hash(raw);
  try {
    await c.query("BEGIN");
    const s = (
      await c.query<{ body: State }>(
        "SELECT body FROM theme75.state WHERE id=1 FOR UPDATE",
      )
    ).rows[0].body;
    const prior = await c.query(
      "SELECT digest,response FROM theme75.receipts WHERE id=$1",
      [cmd.requestId],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].digest !== digest)
        throw new ThemeError("再送IDと内容が一致しません", 409);
      await c.query("COMMIT");
      return prior.rows[0].response;
    }
    const knownMeanings = new Map([
      ...(s.meanings ?? []).map((m) => [m.id, m] as const),
      ...s.themes.flatMap((t) =>
        t.records.flatMap((r) =>
          r.mapping?.concept
            ? [[r.mapping.concept.id, r.mapping.concept] as const]
            : [],
        ),
      ),
    ]);
    const incoming =
      cmd.action === "import"
        ? cmd.package.mappings.map((m) => m.concept)
        : cmd.action === "mapping" && cmd.concept
          ? [cmd.concept]
          : [];
    for (const meaning of incoming) {
      const old = knownMeanings.get(meaning.id);
      if (
        old &&
        (old.label !== meaning.label || old.definition !== meaning.definition)
      )
        throw new ThemeError(
          "同じ意味IDに異なる定義があります。別の意味には新しいIDを使ってください。",
          409,
        );
      knownMeanings.set(meaning.id, meaning);
    }
    s.meanings = [...knownMeanings.values()];
    const now = new Date().toISOString();
    let result: unknown;
    if (cmd.action === "import") {
      const pack = cmd.package;
      if (s.themes.some((t) => t.id === pack.id))
        throw new ThemeError(
          "このテーマIDは登録済みです。訂正画面を利用してください。",
          409,
        );
      if (s.themes.length >= 100)
        throw new ThemeError("確認環境のテーマ上限100件に達しました", 409);
      const theme: ThemeDetail = {
        id: pack.id,
        title: pack.title,
        description: pack.description,
        revision: 1,
        entities: pack.entities,
        records: pack.records.map((r) => enrich(r, 1, "初回登録")),
        ...(pack.timeline ? { timeline: pack.timeline } : {}),
        createdAt: now,
        updatedAt: now,
        sourceHash: hash(pack),
      };
      for (const m of pack.mappings) {
        const r = theme.records.find((r) => r.id === m.recordId)!;
        r.mapping = {
          revision: 1,
          recordRevision: 1,
          concept: m.concept,
          reason: m.reason,
          updatedAt: now,
        };
      }
      s.themes.push(theme);
      result = theme;
    } else if (cmd.action === "record" || cmd.action === "mapping") {
      const t = findTheme(s, cmd.themeId);
      conflict(t.revision, cmd.expected);
      if (cmd.action === "record") {
        if (t.entities.length + cmd.entities.length > 200)
          throw new ThemeError("対象上限200件です");
        for (const e of cmd.entities) {
          if (t.entities.some((old) => old.id === e.id))
            throw new ThemeError("既存対象を暗黙に上書きできません");
          t.entities.push(e);
        }
        if (
          !t.entities.some((e) => e.id === cmd.record.subject) ||
          (cmd.record.object &&
            !t.entities.some((e) => e.id === cmd.record.object))
        )
          throw new ThemeError("対象がテーマにありません");
        const old = t.records.find((r) => r.id === cmd.record.id);
        if (cmd.detachTimelinePlacement) {
          if (
            !old ||
            !t.timeline?.placements.some((p) => p.recordId === old.id)
          )
            throw new ThemeError("この記録には外す年表の配置がありません");
          // The record and any child axes remain. Only its explicit placement is
          // removed, so an unknown or newly qualified time can use a fallback axis.
          t.timeline = subsetThemeTimeline(
            {
              ...t.timeline,
              placements: t.timeline.placements.filter(
                (p) => p.recordId !== old.id,
              ),
            },
            t.records.map((r) => r.id),
          );
        }
        const revised = enrich(
          cmd.record,
          (old?.revision ?? 0) + 1,
          cmd.reason,
        );
        // A changed proposition never inherits a semantic approval silently.
        revised.mapping = old?.mapping
          ? {
              revision: old.mapping.revision + 1,
              recordRevision: revised.revision,
              concept: null,
              reason: "内容訂正後の意味を再確認してください",
              updatedAt: now,
            }
          : null;
        if (old) t.records[t.records.indexOf(old)] = revised;
        else {
          if (t.records.length >= 400)
            throw new ThemeError("記録上限400件です");
          t.records.push(revised);
        }
        if (t.timeline) {
          const issues = themeTimelineIssues(t.records, t.timeline);
          if (issues.length)
            throw new ThemeError(
              "時期と年表の配置を確認してください：" +
                issues.map((i) => i.message).join(" / "),
            );
        }
      } else {
        const r = t.records.find((r) => r.id === cmd.recordId);
        if (!r) throw new ThemeError("記録がありません", 404);
        r.mapping = {
          revision: (r.mapping?.revision ?? 0) + 1,
          recordRevision: r.revision,
          concept: cmd.concept,
          reason: cmd.reason,
          updatedAt: now,
        };
      }
      t.revision++;
      t.updatedAt = now;
      result = t;
    } else if (cmd.action === "capsule-create") {
      const t = findTheme(s, cmd.themeId),
        records = t.records.filter((r) => cmd.recordIds.includes(r.id));
      if (new Set(cmd.recordIds).size !== records.length)
        throw new ThemeError("選択した記録がありません");
      const snapshot = {
        themeId: t.id,
        themeRevision: t.revision,
        entities: t.entities.filter((e) =>
          records.some((r) => r.subject === e.id || r.object === e.id),
        ),
        records,
        ...(t.timeline
          ? {
              timeline: subsetThemeTimeline(
                t.timeline,
                records.map((r) => r.id),
              ),
            }
          : {}),
      };
      const cap: ThemeCapsule = {
        id: randomUUID(),
        title: t.title.slice(0, 80),
        description: t.description.slice(0, 4000),
        revision: 1,
        document: themeDocument(snapshot),
        sourceDocument: themeDocument(snapshot),
        snapshot,
        createdAt: now,
        updatedAt: now,
        shareToken: null,
        sharedRevision: null,
      };
      s.capsules.push(cap);
      result = cap;
    } else {
      const cap = s.capsules.find((x) => x.id === cmd.id);
      if (!cap) throw new ThemeError("Capsuleがありません", 404);
      conflict(cap.revision, cmd.expected);
      if (cmd.action === "capsule-clean-graph") {
        const cleaned = themeGraphCleanup(cap);
        if (!cleaned.changed)
          throw new ThemeError("整理できる自動注記はありません");
        cap.graphCleanupUndo = {
          document: structuredClone(cap.document),
          ...(cap.sourceDocument
            ? { sourceDocument: structuredClone(cap.sourceDocument) }
            : {}),
        };
        cap.document = cleaned.document;
        cap.sourceDocument = cleaned.sourceDocument;
        cap.revision++;
        cap.updatedAt = now;
      }
      if (cmd.action === "capsule-restore-graph") {
        const undo = cap.graphCleanupUndo;
        if (!undo) throw new ThemeError("戻せる整理はありません");
        cap.document = undo.document;
        if (undo.sourceDocument) cap.sourceDocument = undo.sourceDocument;
        else delete cap.sourceDocument;
        delete cap.graphCleanupUndo;
        cap.revision++;
        cap.updatedAt = now;
      }
      if (cmd.action === "capsule-save") {
        delete cap.graphCleanupUndo;
        cap.title = cmd.title;
        cap.description = cmd.description;
        cap.document = cmd.document;
        cap.revision++;
        cap.updatedAt = now;
      }
      if (cmd.action === "capsule-refresh") {
        const t = findTheme(s, cap.snapshot.themeId);
        conflict(t.revision, cmd.themeRevision);
        const diffs = themeDiff(cap.snapshot, t).filter((d) =>
          cmd.recordIds.includes(d.recordId),
        );
        if (!diffs.length) throw new ThemeError("取り込める差分がありません");
        const oldDoc = cap.sourceDocument ?? themeDocument(cap.snapshot);
        const nextSnapshot = {
          ...cap.snapshot,
          entities: t.entities.filter((e) =>
            cap.snapshot.records.some((r) => {
              const next = cmd.recordIds.includes(r.id)
                ? (t.records.find((n) => n.id === r.id) ?? r)
                : r;
              return next.subject === e.id || next.object === e.id;
            }),
          ),
          themeRevision: t.revision,
          records: cap.snapshot.records.map((r) =>
            cmd.recordIds.includes(r.id)
              ? (t.records.find((n) => n.id === r.id) ?? r)
              : r,
          ),
        };
        if (cap.snapshot.timeline) {
          const selectedChanges = new Set(diffs.map((d) => d.recordId));
          const currentPlacements = new Map(
            t.timeline?.placements.map((p) => [p.recordId, p.axisId]),
          );
          // Import an explicit detachment only with that record's correction.
          // Other records keep the saved placement and axis definitions, even
          // when the source theme has since changed their configuration.
          nextSnapshot.timeline = subsetThemeTimeline(
            {
              ...cap.snapshot.timeline,
              placements: cap.snapshot.timeline.placements.filter(
                (p) =>
                  !selectedChanges.has(p.recordId) ||
                  currentPlacements.get(p.recordId) === p.axisId,
              ),
            },
            nextSnapshot.records.map((r) => r.id),
          );
          const issues = themeTimelineIssues(
            nextSnapshot.records,
            nextSnapshot.timeline,
          );
          if (issues.length)
            throw new ThemeError(
              "選択した訂正と保存済みの年表構成が合いません：" +
                issues.map((i) => i.message).join(" / "),
              409,
            );
        }
        // Keep the old projection contract until its owner explicitly cleans it.
        // A content refresh must not silently remove old annotations or lose the
        // baseline needed to distinguish them from authored notes later.
        const legacyProjection = cap.snapshot.records.some(
          (r) =>
            r.kind !== "relation" &&
            oldDoc.texts.some(
              (text) => text.key === documentKey(t.id, "record:" + r.id),
            ),
        );
        const nextDoc = projectThemeDocument(nextSnapshot, legacyProjection);
        for (const d of diffs) {
          if (d.after && d.before.kind !== d.after.kind)
            throw new ThemeError(
              "記録の種類が変わりました。現在の図を残したまま、元のテーマから新しいCapsuleを作成してください。",
              409,
            );
        }
        const newNodes = nextDoc.nodes.filter(
          (n) =>
            !oldDoc.nodes.some((o) => o.key === n.key) &&
            !cap.document.nodes.some((o) => o.key === n.key),
        );
        cap.document.nodes.push(...newNodes);
        for (const n of newNodes)
          cap.document.layout.positions[n.key] =
            nextDoc.layout.positions[n.key];
        for (const node of cap.document.nodes) {
          const old = oldDoc.nodes.find((n) => n.key === node.key);
          const next = nextDoc.nodes.find((n) => n.key === node.key);
          if (old && next && node.description === old.description)
            node.description = next.description;
        }
        // Apply source changes only where the author has not overridden that field.
        for (const d of diffs) {
          const key = documentKey(t.id, "record:" + d.recordId);
          const target = cap.document.relations.find((r) => r.key === key),
            old = oldDoc.relations.find((r) => r.key === key),
            next = nextDoc.relations.find((r) => r.key === key);
          if (target && old && next) {
            if (target.label === old.label) target.label = next.label;
            if (target.note === old.note) target.note = next.note;
            if (target.source === old.source) target.source = next.source;
            if (target.target === old.target) target.target = next.target;
          }
          const text = cap.document.texts.find((r) => r.key === key),
            ot = oldDoc.texts.find((r) => r.key === key),
            nt = nextDoc.texts.find((r) => r.key === key);
          if (text && ot && nt && text.text === ot.text) text.text = nt.text;
        }
        const oldKeys = new Set(oldDoc.evidence.map((e) => e.key));
        cap.document.evidence = cap.document.evidence.flatMap((e) => {
          const before = oldDoc.evidence.find((o) => o.key === e.key);
          if (before && JSON.stringify(e) === JSON.stringify(before)) {
            const next = nextDoc.evidence.find((n) => n.key === e.key);
            return next ? [next] : [];
          }
          return [e];
        });
        const targets = new Set(
          [...cap.document.nodes, ...cap.document.relations].map((x) => x.key),
        );
        cap.document.evidence.push(
          ...nextDoc.evidence.filter(
            (e) => !oldKeys.has(e.key) && targets.has(e.targetKey),
          ),
        );
        cap.document = capsuleDocumentSchema.parse(cap.document);
        cap.snapshot = nextSnapshot;
        cap.sourceDocument = nextDoc;
        delete cap.graphCleanupUndo;
        cap.revision++;
        cap.updatedAt = now;
      }
      if (cmd.action === "share") {
        if (cmd.stop) {
          if (cap.shareToken) delete s.shares[cap.shareToken];
          cap.shareToken = null;
          cap.sharedRevision = null;
        } else {
          cap.shareToken ??= randomBytes(24).toString("base64url");
          cap.sharedRevision = cap.revision;
          const published = structuredClone(cap);
          delete published.graphCleanupUndo;
          s.shares[cap.shareToken] = published;
        }
      }
      result = cap;
    }
    if (Buffer.byteLength(JSON.stringify(s)) > 25_000_000)
      throw new ThemeError("確認環境の保存上限に達しました");
    await c.query("UPDATE theme75.state SET body=$1 WHERE id=1", [
      JSON.stringify(s),
    ]);
    await c.query(
      "INSERT INTO theme75.events(operation,payload) VALUES($1,$2)",
      [cmd.action, JSON.stringify({ input: raw, result })],
    );
    await c.query(
      "INSERT INTO theme75.receipts(id,digest,response) VALUES($1,$2,$3)",
      [cmd.requestId, digest, JSON.stringify(result)],
    );
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
