import {editorialReferenceError,retainedThemeEditorial} from './theme-editorial';
import {knowledgeTextTargetSchema,knowledgeOriginalText,type KnowledgeTextTarget} from "../domain/knowledge-translation";
import {assertTranslationSchema} from "./knowledge-translation-migrate";
import {putTranslation,storedTranslation,translationId,translationHash} from "./knowledge-translation-storage";
import { createHash } from "node:crypto";
import {duplicateMeaning} from '../domain/knowledge-duplicate';
import {appendKnowledgeTimelineRecord} from "../domain/knowledge-timeline-append";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import {
  knowledgeCommandSchema, knowledgeEntityContentSchema, knowledgeSourceContentSchema,
  knowledgeRecordContentSchema, knowledgeMappingContentSchema, knowledgeThemeContentSchema,
  knowledgeRecordSearchText, knowledgeTimelineIssues,
  type KnowledgeActor, type KnowledgeKind, type KnowledgeContentByKind, type KnowledgeVersion,
  type KnowledgePin, type KnowledgeStatus, type KnowledgeList, type KnowledgeSnapshot,
  type KnowledgeThemeResolved, type KnowledgeThemeDiff, type KnowledgeRecordVersion,
  type KnowledgeEntityVersion, type KnowledgeSourceVersion, type KnowledgeThemeVersion,
  type KnowledgeMappingVersion, type KnowledgeThemeContent,
} from "../domain/knowledge-foundation";

export class KnowledgeError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_INPUT") { super(message); }
}
export function knowledgeStableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(knowledgeStableJson).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ":" + knowledgeStableJson(v)).join(",") + "}";
  return JSON.stringify(value);
}
export const knowledgeDigest = (value: unknown) => createHash("sha256").update(knowledgeStableJson(value)).digest("hex");
const schemas = { entity: knowledgeEntityContentSchema, source: knowledgeSourceContentSchema, record: knowledgeRecordContentSchema, theme: knowledgeThemeContentSchema, mapping: knowledgeMappingContentSchema };
const kinds: KnowledgeKind[] = ["entity", "source", "record", "theme", "mapping"];
const date = (v: unknown) => v instanceof Date ? v.toISOString() : String(v);
const pin = (v: { id: string; revision: number }): KnowledgePin => ({ id: v.id, revision: v.revision });
function assertUnique(pins: KnowledgePin[], label: string) {
  if (new Set(pins.map(p => p.id)).size !== pins.length) throw new KnowledgeError(label + "のIDが重複しています");
}
function expected(actual: number, requested: number) {
  if (actual !== requested) throw new KnowledgeError("内容が更新されています。差分を確認して再試行してください", 409, "REVISION_CONFLICT");
}
function actorAllowed(actor: KnowledgeActor, action: string) {
  if (!actor.id || actor.id.length > 200) throw new KnowledgeError("認証された操作主体が必要です", 403, "FORBIDDEN");
  if(action==='capture-legacy'){if(actor.kind==='organizer')return;throw new KnowledgeError('旧KGの正本照合を伴う内部処理が必要です',403,'FORBIDDEN');}
  if(actor.kind==='organizer'&&action==='set-mappings')return;
  if (action === "accept-translation" && (actor.kind === "submission"||actor.kind === "import")) return;
  if (action === "accept-record") { if(actor.kind === "submission"||actor.kind === "collection"||actor.kind === "import")return;throw new KnowledgeError("知識投稿の内部受理処理が必要です",403,"FORBIDDEN"); }
  if (actor.kind === "operator") return;
  if (actor.kind === "collector" && action === "create-bundle") return;
  throw new KnowledgeError(actor.kind === "user" ? "利用者の変更は知識投稿の審査経路へ提出してください" : "この操作の権限がありません", 403, "SUBMISSION_REQUIRED");
}

// Explicit, checksummed migration. No member schema or old theme75 state is used.
export async function ensureKnowledgeFoundationSchema(pool: Pool) {
  const sql = await readFile(path.join(process.cwd(), "migrations/knowledge-foundation/001-records.sql"), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const c = await pool.connect();
  try {
    const db = (await c.query("SELECT current_database() AS name")).rows[0].name as string;
    if (db !== "plunode_theme75" && !db.startsWith("plunode_knowledge75_")) throw new KnowledgeError("独立した知識検証DBが必要です", 503, "WRONG_DATABASE");
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7500001)");
    await c.query("CREATE SCHEMA IF NOT EXISTS knowledge75; CREATE TABLE IF NOT EXISTS knowledge75.migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    const old = (await c.query("SELECT checksum FROM knowledge75.migrations WHERE name=$1", ["001-records.sql"])).rows[0];
    if (old && old.checksum !== checksum) throw new KnowledgeError("適用済みmigrationのchecksumが変わっています", 503, "MIGRATION_CHANGED");
    if (!old) {
      await c.query(sql);
      await c.query("INSERT INTO knowledge75.migrations(name,checksum) VALUES($1,$2)", ["001-records.sql", checksum]);
    }
    for(const referenceName of ["004-submission-references.sql","007-acquisition-inventory.sql"]){
      const referenceSql=await readFile(path.join(process.cwd(),"migrations/knowledge-foundation",referenceName),"utf8");
      const referenceChecksum=createHash("sha256").update(referenceSql).digest("hex");
      const referenceOld=(await c.query("SELECT checksum FROM knowledge75.migrations WHERE name=$1",[referenceName])).rows[0];
      if(referenceOld&&referenceOld.checksum!==referenceChecksum)throw new KnowledgeError("参照migrationのchecksumが変わっています",503,"MIGRATION_CHANGED");
      if(!referenceOld){await c.query(referenceSql);await c.query("INSERT INTO knowledge75.migrations(name,checksum) VALUES($1,$2)",[referenceName,referenceChecksum]);}
    }
    await c.query("COMMIT");
    return { name: "001-records.sql", checksum, applied: !old };
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

type Head = { kind: KnowledgeKind; id: string; current_revision: number; status_revision: number; visibility: KnowledgeStatus["visibility"]; confirmation: KnowledgeStatus["confirmation"] };
async function head(c: PoolClient, kind: KnowledgeKind, id: string, lock = ""): Promise<Head> {
  const row = (await c.query(`SELECT kind,id,current_revision,status_revision,visibility,confirmation FROM knowledge75.objects WHERE kind=$1 AND id=$2 ${lock}`, [kind, id])).rows[0];
  if (!row) throw new KnowledgeError("参照先がありません: " + id, 404, "NOT_FOUND");
  return row as Head;
}
function asVersion<K extends KnowledgeKind>(row: QueryResultRow, kind: K): KnowledgeVersion<KnowledgeContentByKind[K]> {
  return { id: row.id, revision: Number(row.revision), content: schemas[kind].parse(row.content) as KnowledgeContentByKind[K], createdAt: date(row.created_at), reason: row.reason };
}
async function version<K extends KnowledgeKind>(c: PoolClient, kind: K, id: string, revision?: number): Promise<KnowledgeVersion<KnowledgeContentByKind[K]>> {
  const row = (await c.query("SELECT r.* FROM knowledge75.revisions r JOIN knowledge75.objects o ON o.kind=r.kind AND o.id=r.id WHERE r.kind=$1 AND r.id=$2 AND r.revision=COALESCE($3::integer,o.current_revision)", [kind, id, revision ?? null])).rows[0];
  if (!row) throw new KnowledgeError("指定された版がありません: " + id, 404, "NOT_FOUND");
  return asVersion(row, kind);
}
function references(r: KnowledgeRecordVersion) { return [r.content.subjectId, r.content.objectId].filter((v): v is string => v !== null); }
async function visible(c: PoolClient, kind: KnowledgeKind, id: string) {
  return (await head(c, kind, id)).visibility === "public";
}
async function assertPublic(c: PoolClient, kind: KnowledgeKind, id: string) {
  if (!await visible(c, kind, id)) throw new KnowledgeError("公開できない参照が含まれています", 403, "REFERENCE_NOT_PUBLIC");
}
async function revisionPublic(c: PoolClient, kind: KnowledgeKind, id: string, revision: number) {
  if (!await visible(c, kind, id)) return false;
  return Boolean((await c.query("SELECT 1 FROM knowledge75.published_revisions WHERE kind=$1 AND id=$2 AND revision=$3", [kind, id, revision])).rowCount);
}
async function assertRevisionPublic(c: PoolClient, kind: KnowledgeKind, id: string, revision: number) {
  if (!await revisionPublic(c, kind, id, revision)) throw new KnowledgeError("公開されていない版は閲覧できません", 403, "REVISION_NOT_PUBLIC");
}
export async function recordReadable(c: PoolClient, r: KnowledgeRecordVersion) {
  if (!await revisionPublic(c, "record", r.id, r.revision)) return false;
  for (const id of references(r)) if (!await visible(c, "entity", id)) return false;
  for (const e of r.content.evidence) if (!await revisionPublic(c, "source", e.source.id, e.source.revision)) return false;
  if(r.content.aboutRecord&& !await revisionPublic(c,"record",r.content.aboutRecord.id,r.content.aboutRecord.revision))return false;
  if(r.content.aboutTheme&& !await visible(c,"theme",r.content.aboutTheme))return false;
  return true;
}
async function validateRecord(c: PoolClient, r: KnowledgeRecordVersion, entityPins: KnowledgePin[] | undefined, publicRecord: boolean) {
  if (entityPins) assertUnique(entityPins, "対象の観測版");
  for (const id of references(r).sort()) {
    const h = await head(c, "entity", id, "FOR SHARE");
    if (entityPins) {
      const observed = entityPins.find(p => p.id === id);
      if (!observed) throw new KnowledgeError("既存対象の観測版を明示してください: " + id);
      expected(h.current_revision, observed.revision);
    }
    if (publicRecord) await assertPublic(c, "entity", id);
  }
  if(r.content.aboutRecord){
    if(r.content.aboutRecord.id===r.id)throw new KnowledgeError("自分自身を補足先にはできません");
    await version(c,"record",r.content.aboutRecord.id,r.content.aboutRecord.revision);
    if(publicRecord)await assertRevisionPublic(c,"record",r.content.aboutRecord.id,r.content.aboutRecord.revision);
  }
  if(r.content.aboutTheme){await head(c,"theme",r.content.aboutTheme,"FOR SHARE");if(publicRecord)await assertPublic(c,"theme",r.content.aboutTheme);}
  for (const e of r.content.evidence) {
    await head(c, "source", e.source.id, "FOR SHARE");
    await version(c, "source", e.source.id, e.source.revision);
    if (publicRecord) await assertRevisionPublic(c, "source", e.source.id, e.source.revision);
  }
}
async function capture(c: PoolClient, recordPins: KnowledgePin[], options: { entityPins?: KnowledgePin[]; sourcePins?: KnowledgePin[]; mappingPins?: KnowledgePin[]; timeline?: KnowledgeThemeContent["timeline"]; initialView?: KnowledgeThemeContent["initialView"]; publicOnly?: boolean } = {}): Promise<KnowledgeSnapshot> {
  assertUnique(recordPins, "記録の選択");
  const records: KnowledgeRecordVersion[] = [];
  for (const p of recordPins) {
    const r = await version(c, "record", p.id, p.revision);
    if (options.publicOnly && !await recordReadable(c, r)) throw new KnowledgeError("公開できない記録が含まれています", 403, "REFERENCE_NOT_PUBLIC");
    records.push(r);
  }
  const entityIds = [...new Set(records.flatMap(references))].sort();
  const sourceRefs = [...new Map(records.flatMap(r => r.content.evidence.map(e => [e.source.id + "@" + e.source.revision, e.source] as const))).values()];
  for (const [selected, required, label] of [[options.entityPins, entityIds, "対象"]] as const) {
    if (selected) {
      assertUnique(selected, label);
      if (selected.length !== required.length || selected.some(p => !required.includes(p.id))) throw new KnowledgeError(label + "の観測版が記録の参照と一致しません");
    }
  }
  const entities: KnowledgeEntityVersion[] = [];
  const sources: KnowledgeSourceVersion[] = [];
  for (const id of entityIds) entities.push(await version(c, "entity", id, options.entityPins?.find(p => p.id === id)?.revision));
  if (options.sourcePins) {
    const expectedSources = new Set(sourceRefs.map(p => p.id + "@" + p.revision));
    const selectedSources = new Set(options.sourcePins.map(p => p.id + "@" + p.revision));
    if (selectedSources.size !== options.sourcePins.length || selectedSources.size !== expectedSources.size || [...selectedSources].some(p => !expectedSources.has(p)))
      throw new KnowledgeError("資料版は根拠の参照先と一致させてください。新しい資料へは記録の根拠を訂正してから取り込みます", 409, "SOURCE_PIN_CONFLICT");
  }
  for (const ref of sourceRefs) sources.push(await version(c, "source", ref.id, ref.revision));
  if (options.publicOnly) {
    for (const e of entities) await assertRevisionPublic(c, "entity", e.id, e.revision);
    for (const s of sources) await assertRevisionPublic(c, "source", s.id, s.revision);
  }
  const mappings: KnowledgeMappingVersion[] = [];
  for (const r of records) {
    const p = options.mappingPins?.find(p => p.id === r.id);
    if (options.mappingPins && !p) continue;
    const exists = (await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='mapping' AND id=$1", [r.id])).rows[0];
    if (!exists) { if (p) throw new KnowledgeError("意味対応の版がありません"); continue; }
    const m = await version(c, "mapping", r.id, p?.revision);
    if (m.content.recordRevision === r.revision) mappings.push(m);
  }
  const issues = knowledgeTimelineIssues(records, options.timeline);
  if (issues.length) throw new KnowledgeError(issues.join(" / "), 409, "TIMELINE_CONFLICT");
  return { schemaVersion: 1, entities, sources, records, mappings, ...(options.timeline ? { timeline: options.timeline } : {}), initialView: options.initialView ?? "graph" };
}
async function refreshObservation(c: PoolClient, theme: KnowledgeThemeVersion, lock = false): Promise<string> {
  const observed: Head[] = [];
  const entities = new Set<string>(), sources = new Set<string>();
  const recordIds = theme.content.recordPins.map(p => p.id).sort();
  for (const id of recordIds) {
    const h = await head(c, "record", id, lock ? "FOR SHARE" : ""); observed.push(h);
    const r = await version(c, "record", id, h.current_revision);
    references(r).forEach(id => entities.add(id));
    r.content.evidence.forEach(e => sources.add(e.source.id));
  }
  for (const [kind, ids] of [["entity", [...entities].sort()], ["source", [...sources].sort()]] as const)
    for (const id of ids) observed.push(await head(c, kind, id, lock ? "FOR SHARE" : ""));
  // Record locks also serialize creating a previously absent meaning mapping.
  for (const id of recordIds) {
    const exists = (await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='mapping' AND id=$1", [id])).rows[0];
    if (exists) observed.push(await head(c, "mapping", id, lock ? "FOR SHARE" : ""));
  }
  return knowledgeDigest({ theme: { id: theme.id, revision: theme.revision }, observed });
}
function snapshotPins(s: KnowledgeSnapshot) { return { recordPins: s.records.map(pin), entityPins: s.entities.map(pin), sourcePins: s.sources.map(pin), mappingPins: s.mappings.map(pin) }; }
async function resolve(c: PoolClient, id: string, revision: number | undefined, publicOnly: boolean): Promise<KnowledgeThemeResolved> {
  const theme = await version(c, "theme", id, revision);
  if (publicOnly) await assertRevisionPublic(c, "theme", id, theme.revision);
  return { theme, snapshot: await capture(c, theme.content.recordPins, { ...theme.content, publicOnly }) };
}

/** Public Theme reads can share the caller's read transaction with DTO construction. */
export function resolvePublicKnowledgeTheme(client: PoolClient, id: string, revision?: number) {
  return resolve(client, id, revision, true);
}

export function createKnowledgeFoundationService(pool: Pool,options:{prepareSchema?:()=>Promise<unknown>}={}) {
  let initialized: Promise<unknown> | undefined;
  const ready = () => initialized ??= (options.prepareSchema?options.prepareSchema():ensureKnowledgeFoundationSchema(pool)).catch(e => { initialized = undefined; throw e; });
  async function read<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    await ready(); const c = await pool.connect();
    try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const result = await fn(c); await c.query("COMMIT"); return result; }
    catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  async function listIn(c: PoolClient, actor: KnowledgeActor): Promise<KnowledgeList> {
    const rows = (await c.query("SELECT r.*,o.visibility,o.confirmation,o.status_revision FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision ORDER BY o.kind,o.id")).rows;
    const result: KnowledgeList = { entities: [], sources: [], records: [], themes: [], statuses: [] };
    for (const row of rows) {
      const kind = row.kind as KnowledgeKind;
      if (kind === "mapping") continue;
      if (actor.kind !== "operator") {
        if (row.visibility !== "public") continue;
        if (kind === "record" && !await recordReadable(c, asVersion(row, "record"))) continue;
        if (kind === "theme") { try { await resolve(c, row.id, Number(row.revision), true); } catch (e) { if (e instanceof KnowledgeError && e.status === 403) continue; throw e; } }
      }
      if (kind === "entity") result.entities.push(asVersion(row, kind));
      if (kind === "source") result.sources.push(asVersion(row, kind));
      if (kind === "record") result.records.push(asVersion(row, kind));
      if (kind === "theme") result.themes.push(asVersion(row, kind));
      result.statuses.push({ kind, id: row.id, revision: Number(row.status_revision), visibility: row.visibility, confirmation: row.confirmation });
    }
    return result;
  }
  async function execute(actor: KnowledgeActor, raw: unknown, internal?:{verify:(c:PoolClient)=>Promise<void>;prepare:(result:unknown)=>Promise<void>;retain?:(c:PoolClient,result:unknown)=>Promise<void>}): Promise<unknown> {
    const cmd = knowledgeCommandSchema.parse(raw);
    actorAllowed(actor, cmd.action);
    if (actor.kind === "collector" && cmd.action === "create-bundle" && (cmd.legacyLinks.length || cmd.visibility !== "public")) throw new KnowledgeError("収集実行者にはこの操作を許可していません", 403, "FORBIDDEN");
    if (Buffer.byteLength(JSON.stringify(raw)) > 2_000_000) throw new KnowledgeError("入力が2MBを超えています", 413);
    await ready(); const c = await pool.connect();
    const digest = knowledgeDigest({ actorKind: actor.kind, command: cmd });
    try {
      await c.query("BEGIN");
      // The pilot has one small public write stream. Serialize its final
      // candidate recheck with record creation/correction/withdrawal, including
      // collection writes; never hold this lock during an AI or source fetch.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge-record-writes-v1',0))");
      // Identity decisions use the exclusive form of this lock. Hold the shared
      // lock through final duplicate recheck and commit, before any entity rows.
      await c.query("SELECT pg_advisory_xact_lock_shared(7500600)");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [actor.id + ":" + cmd.requestId]);
      const prior = (await c.query("SELECT digest,result FROM knowledge75.operations WHERE actor_id=$1 AND request_id=$2", [actor.id, cmd.requestId])).rows[0];
      if (prior) { if (prior.digest !== digest) throw new KnowledgeError("再送IDと内容が一致しません", 409, "REQUEST_CONFLICT"); await c.query("COMMIT"); return prior.result; }
      async function changed(kind: KnowledgeKind, id: string) {
        const h = await head(c, kind, id);
        await c.query("INSERT INTO knowledge75.changes(kind,id,content_revision,status_revision,operation,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [kind, id, h.current_revision, h.status_revision, cmd.action, actor.id, cmd.requestId]);
      }
      async function put<K extends KnowledgeKind>(kind: K, id: string, content: KnowledgeContentByKind[K], revision: number, reason: string, visibility: KnowledgeStatus["visibility"] = "public"): Promise<KnowledgeVersion<KnowledgeContentByKind[K]>> {
        if (revision === 1) await c.query("INSERT INTO knowledge75.objects(kind,id,current_revision,visibility) VALUES($1,$2,1,$3)", [kind, id, visibility]);
        else await c.query("UPDATE knowledge75.objects SET current_revision=$3,confirmation='unreviewed',status_revision=status_revision+1,updated_at=clock_timestamp() WHERE kind=$1 AND id=$2", [kind, id, revision]);
        await c.query("INSERT INTO knowledge75.revisions(kind,id,revision,content,reason,actor_id,actor_kind) VALUES($1,$2,$3,$4,$5,$6,$7)", [kind, id, revision, JSON.stringify(content), reason, actor.id, actor.kind]);
        if ((await head(c, kind, id)).visibility === "public") await c.query("INSERT INTO knowledge75.published_revisions(kind,id,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [kind, id, revision]);
        await changed(kind, id);
        return version(c, kind, id, revision);
      }
      if((actor.kind==='collection'||actor.kind==='import'||actor.kind==='organizer')&&!internal)throw new KnowledgeError('固定範囲と根拠の内部照合が必要です',403,'FORBIDDEN');
      if(internal)await internal.verify(c);
      let result: unknown;
      if(cmd.action==='capture-legacy'){
        const pins:KnowledgePin[]=[];
        async function captured(kind:'entity'|'source',v:{id:string;content:unknown}){
          const old=(await c.query('SELECT o.*,v.content FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=1 WHERE o.kind=$1 AND o.id=$2 FOR SHARE OF o',[kind,v.id])).rows[0];
          if(old){if(old.visibility!=='public'||knowledgeDigest(old.content)!==knowledgeDigest(v.content))throw new KnowledgeError('旧KGと共通原本の内容が異なります',409,'CONFLICT');return old.current_revision as number;}
          if(kind==='entity')await put('entity',v.id,knowledgeEntityContentSchema.parse(v.content),1,cmd.reason);
          else await put('source',v.id,knowledgeSourceContentSchema.parse(v.content),1,cmd.reason);
          return 1;
        }
        for(const e of [...cmd.entities].sort((a,b)=>a.id.localeCompare(b.id))){
          await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['legacy-entity:'+e.id]);
          if(knowledgeDigest(e.payload)!==e.sha256)throw new KnowledgeError('旧KG対象の原本hashが異なります');
          const revision=await captured('entity',e);pins.push({id:e.id,revision});
          const old=(await c.query("SELECT payload FROM knowledge75.legacy_identity WHERE kind='entity' AND id=$1",[e.id])).rows[0];
          if(old&&knowledgeDigest(old.payload.entity)!==knowledgeDigest((e.payload as {entity:unknown}).entity))throw new KnowledgeError('旧KG対象の原本が更新されています',409,'CONFLICT');
          if(!old)await c.query("INSERT INTO knowledge75.legacy_identity(kind,id,dataset,legacy_id,publication_revision,payload,sha256) VALUES('entity',$1,'public-kg',$1,$2,$3,$4)",[e.id,e.revision,JSON.stringify(e.payload),e.sha256]);
        }
        for(const s of cmd.sources)await captured('source',s);
        for(const r of [...cmd.records].sort((a,b)=>a.id.localeCompare(b.id))){
          await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['legacy-record:'+r.id]);
          if(knowledgeDigest(r.payload)!==r.sha256)throw new KnowledgeError('旧KG知識の原本hashが異なります');
          const old=(await c.query("SELECT o.visibility,v.content FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=1 WHERE o.kind='record' AND o.id=$1 FOR SHARE OF o",[r.id])).rows[0];
          if(old){if(old.visibility!=='public'||knowledgeDigest(old.content)!==knowledgeDigest(r.content))throw new KnowledgeError('旧KG知識と共通原本が異なります',409,'CONFLICT');}
          else{await validateRecord(c,{id:r.id,revision:1,content:r.content,createdAt:'',reason:cmd.reason},pins,true);await put('record',r.id,r.content,1,cmd.reason);}
          const prior=(await c.query("SELECT payload FROM knowledge75.legacy_identity WHERE kind='record' AND id=$1",[r.id])).rows[0];
          const canonical=(v:{canonical?:Record<string,unknown>})=>{if(!v.canonical)return null;const {revision:_release,...body}=v.canonical;void _release;return body;};
          if(prior&&knowledgeDigest(canonical(prior.payload))!==knowledgeDigest(canonical(r.payload as {canonical?:Record<string,unknown>})))throw new KnowledgeError('旧KG知識の原本が更新されています',409,'CONFLICT');
          if(!prior)await c.query("INSERT INTO knowledge75.legacy_identity(kind,id,dataset,legacy_id,publication_revision,payload,sha256) VALUES('record',$1,'public-kg',$1,$2,$3,$4)",[r.id,r.revision,JSON.stringify(r.payload),r.sha256]);
          await c.query("INSERT INTO knowledge75.legacy_links(dataset,legacy_claim_id,record_id,imported_revision,payload,sha256) VALUES('public-kg',$1,$1,1,$2,$3) ON CONFLICT DO NOTHING",[r.id,JSON.stringify(r.payload),r.sha256]);
        }
        result={entities:pins,records:cmd.records.map(r=>({id:r.id,revision:1}))};
      }else if(cmd.action === "accept-translation") {
        await assertTranslationSchema(c);if(actor.kind==='submission'&&!internal)throw new KnowledgeError('翻訳投稿の確認が必要です',403,'SUBMISSION_REQUIRED');
        const original=await readKnowledgeTextOriginal(c,cmd.target,true,true);
        try{result=await putTranslation(c,cmd,actor,original.content);}catch(e){throw new KnowledgeError((e as Error).message,409,'TRANSLATION_CONFLICT');}
      } else if(cmd.action === "set-translation-visibility") {
        await assertTranslationSchema(c);const h=(await c.query('SELECT * FROM knowledge75.text_translation_heads WHERE id=$1 FOR UPDATE',[cmd.id])).rows[0];
        if(!h)throw new KnowledgeError('訳文がありません',404,'NOT_FOUND');expected(h.status_revision,cmd.expectedStatusRevision);
        if(cmd.visibility==='public')await readKnowledgeTextOriginal(c,h.target);
        await c.query('UPDATE knowledge75.text_translation_heads SET visibility=$2,status_revision=status_revision+1 WHERE id=$1',[cmd.id,cmd.visibility]);result={id:cmd.id,revision:h.status_revision+1,visibility:cmd.visibility};
      } else if(cmd.action === "accept-record") {
        const entityPins=cmd.entityPins.map(pin=>({...pin}));
        async function acceptedReference(kind:"entity"|"source",value:{id:string;content:unknown}){
          const old=(await c.query("SELECT o.*,r.content FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=1 WHERE o.kind=$1 AND o.id=$2 FOR SHARE OF o",[kind,value.id])).rows[0];
          if(old){if(old.visibility!=="public"||(kind==="entity"&&old.current_revision!==1)||knowledgeDigest(old.content)!==knowledgeDigest(value.content))throw new KnowledgeError("投稿内の共有対象・資料が変わりました",409,"CONFLICT");return;}
          if(kind==="entity")await put(kind,value.id,knowledgeEntityContentSchema.parse(value.content),1,cmd.reason);else await put(kind,value.id,knowledgeSourceContentSchema.parse(value.content),1,cmd.reason);
        }
        // Serialize identical KG bridges across independently accepted submissions.
        for(const e of [...(cmd.legacyEntities??[])].sort((a,b)=>a.id.localeCompare(b.id))){
          await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['legacy-entity:'+e.id]);
          if(knowledgeDigest(e.payload)!==e.sha256)throw new KnowledgeError("旧KG原本のhashが一致しません");
          await acceptedReference("entity",e);
          const prior=(await c.query("SELECT * FROM knowledge75.legacy_identity WHERE kind='entity' AND id=$1",[e.id])).rows[0];
          if(prior&&(prior.legacy_id!==e.id||prior.dataset!=='public-kg'||knowledgeDigest(prior.payload?.entity)!==knowledgeDigest((e.payload as {entity?:unknown})?.entity)))throw new KnowledgeError("既存KG対象の原本が変わりました。取得し直してください",409,"CONFLICT");
          if(!prior)await c.query("INSERT INTO knowledge75.legacy_identity(kind,id,dataset,legacy_id,publication_revision,payload,sha256) VALUES('entity',$1,'public-kg',$1,$2,$3,$4)",[e.id,e.revision,JSON.stringify(e.payload),e.sha256]);
          if(!entityPins.some(p=>p.id===e.id))entityPins.push({id:e.id,revision:1});
        }
        for(const e of cmd.entities){await acceptedReference("entity",e);entityPins.push({id:e.id,revision:1});}
        for(const s of [...(cmd.legacySources??[]),...cmd.sources])await acceptedReference("source",s);
        for(const original of [...(cmd.legacyRecords??[])].sort((a,b)=>a.id.localeCompare(b.id))){
          await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['legacy-record:'+original.id]);
          if(knowledgeDigest(original.payload)!==original.sha256)throw new KnowledgeError("旧KG関係のhashが一致しません");
          const old=(await c.query("SELECT o.*,r.content FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=1 WHERE o.kind='record' AND o.id=$1 FOR SHARE OF o",[original.id])).rows[0];
          if(old){if(old.visibility!=='public'||knowledgeDigest(old.content)!==knowledgeDigest(original.content))throw new KnowledgeError("既存の関係と旧KG原本が異なります",409,"CONFLICT");}
          else {await validateRecord(c,{id:original.id,revision:1,content:original.content,createdAt:'',reason:cmd.reason},entityPins,true);await put('record',original.id,original.content,1,'既存KGの公開原本を同一IDで参照');}
          const identity=(await c.query("SELECT * FROM knowledge75.legacy_identity WHERE kind='record' AND id=$1",[original.id])).rows[0];
          const originalCanonical=(original.payload as {canonical?:Record<string,unknown>}).canonical;const previousCanonical=identity?.payload?.canonical;
          const rawWithoutRelease=(value:Record<string,unknown>|undefined)=>{if(!value)return null;const {revision:_release,...raw}=value;void _release;return raw;};
          if(identity&&knowledgeDigest(rawWithoutRelease(previousCanonical))!==knowledgeDigest(rawWithoutRelease(originalCanonical)))throw new KnowledgeError("旧KG関係の原本が変わりました",409,"CONFLICT");
          if(!identity)await c.query("INSERT INTO knowledge75.legacy_identity(kind,id,dataset,legacy_id,publication_revision,payload,sha256) VALUES('record',$1,'public-kg',$1,$2,$3,$4)",[original.id,original.revision,JSON.stringify(original.payload),original.sha256]);
          const link=(await c.query("SELECT * FROM knowledge75.legacy_links WHERE record_id=$1",[original.id])).rows[0];
          if(!link)await c.query("INSERT INTO knowledge75.legacy_links(dataset,legacy_claim_id,record_id,imported_revision,payload,sha256) VALUES('public-kg',$1,$1,1,$2,$3)",[original.id,JSON.stringify(original.payload),original.sha256]);
        }
        if(cmd.entityCorrection){
          if(!internal)throw new KnowledgeError('対象情報の訂正には根拠・内容の照合が必要です',403,'FORBIDDEN');
          const correction=cmd.entityCorrection,h=await head(c,'entity',correction.id,'FOR UPDATE');expected(h.current_revision,correction.expectedRevision);await assertRevisionPublic(c,'entity',correction.id,correction.expectedRevision);
          const old=await version(c,'entity',correction.id,correction.expectedRevision);
          if(old.content.kind!==correction.content.kind||cmd.record.content.kind!=='note'||cmd.record.content.subjectId!==correction.id||cmd.record.content.objectId||!correction.reason.trim())throw new KnowledgeError('対象の訂正範囲を確認してください',409,'ENTITY_CORRECTION_CONFLICT');
          if(knowledgeDigest(old.content)===knowledgeDigest(correction.content))throw new KnowledgeError('対象の内容は既に同じです',409,'UNCHANGED_ENTITY');
          await put('entity',correction.id,correction.content,correction.expectedRevision+1,correction.reason);
          const pin=entityPins.find(p=>p.id===correction.id);if(pin)pin.revision=correction.expectedRevision+1;else entityPins.push({id:correction.id,revision:correction.expectedRevision+1});
        }
        for(const pin of cmd.sourcePins){await head(c,"source",pin.id,"FOR SHARE");await version(c,"source",pin.id,pin.revision);await assertRevisionPublic(c,"source",pin.id,pin.revision);}
        const r=structuredClone(cmd.record.content);
        if(cmd.expectedRevision&&cmd.preserveLegacySemantics){
          const link=(await c.query("SELECT * FROM knowledge75.legacy_links WHERE record_id=$1",[cmd.record.id])).rows[0];
          if(link?.payload?.claim){
            const old=await version(c,'record',cmd.record.id,cmd.expectedRevision);
            if(['kind','subjectId','objectId','relation','polarity','scope','times','aboutRecord','aboutTheme'].some(k=>knowledgeDigest((old.content as Record<string,unknown>)[k]??null)!==knowledgeDigest((r as Record<string,unknown>)[k]??null)))throw new KnowledgeError("旧KGの型付き限定を変更する場合は、対象の関係を保って別の情報として投稿してください",409,"TYPED_SEMANTICS_CONFLICT");
            if(knowledgeDigest(link.payload)!==link.sha256)throw new KnowledgeError("旧KG原本のhashが一致しません");
            r.legacySemantics={recordRevision:Number(link.imported_revision),sha256:link.sha256};
          }
        }
        if(!r.subjectId&&!r.objectId&&!r.aboutRecord&&!r.aboutTheme)throw new KnowledgeError("公開後に辿れる対象・関係・テーマが必要です");
        let revision=1,unchanged=false,themeChanged=false,retainsThemeContext=false;
        const appliedThemes:{id:string;revision:number}[]=[];
        if(cmd.expectedRevision){const h=await head(c,"record",cmd.record.id,"FOR UPDATE");expected(h.current_revision,cmd.expectedRevision);await assertPublic(c,"record",cmd.record.id);
          const old=await version(c,'record',cmd.record.id,h.current_revision);
          retainsThemeContext=old.content.aboutTheme===r.aboutTheme;
          // Language metadata does not make a new fact, but correcting it does
          // require a content revision. Keep semantic duplicate reuse separate.
          unchanged=knowledgeDigest(duplicateMeaning(old.content))===knowledgeDigest(duplicateMeaning(r))&&knowledgeDigest(old.content.evidence)===knowledgeDigest(r.evidence)&&knowledgeDigest(old.content.textLanguages??null)===knowledgeDigest(r.textLanguages??null);
          revision=unchanged?h.current_revision:h.current_revision+1;
        }
        if(cmd.deferredTheme){
          if(actor.kind!=='import'||!internal||r.aboutTheme!==cmd.deferredTheme.id)throw new KnowledgeError('テーマ構成を保留する内部受付が必要です',403,'FORBIDDEN');
          const theme=await head(c,'theme',cmd.deferredTheme.id,'FOR SHARE');expected(theme.current_revision,cmd.deferredTheme.revision);
          await assertRevisionPublic(c,'theme',cmd.deferredTheme.id,cmd.deferredTheme.revision);
        }
        if(r.aboutTheme&&!retainsThemeContext&&!cmd.themes?.some(t=>t.id===r.aboutTheme)&&cmd.deferredTheme?.id!==r.aboutTheme)throw new KnowledgeError("テーマへの追加と情報の公開を同時に行ってください");
        await validateRecord(c,{...cmd.record,revision,createdAt:"",reason:cmd.reason},entityPins,true);
        result=unchanged?await version(c,'record',cmd.record.id,revision):await put("record",cmd.record.id,r,revision,cmd.reason);
        for(const p of [...(cmd.themes??[])].sort((a,b)=>a.id.localeCompare(b.id))){
          const h=await head(c,'theme',p.id,'FOR UPDATE');if(!internal)expected(h.current_revision,p.revision);await assertRevisionPublic(c,'theme',p.id,p.revision);
          const old=await version(c,'theme',p.id,h.current_revision);
          if(old.content.recordPins.some(v=>v.id===cmd.record.id&&v.revision===revision)){appliedThemes.push({id:p.id,revision:h.current_revision});continue;}
          themeChanged=true;
          const recordPins=old.content.recordPins.some(v=>v.id===cmd.record.id)?old.content.recordPins.map(v=>v.id===cmd.record.id?{id:v.id,revision}:v):[...old.content.recordPins,{id:cmd.record.id,revision}];
          let timeline=old.content.timeline?structuredClone(old.content.timeline):undefined;
          if(timeline){
            const previous=new Map(old.content.recordPins.map(p=>[p.id,p.revision]));
            const definitions=(await c.query("SELECT id,revision,content->'times' AS times FROM knowledge75.revisions WHERE kind='record' AND id=ANY($1::text[])",[[...previous.keys()]])).rows.filter(v=>previous.get(v.id)===v.revision).map(v=>({id:v.id,content:{times:v.times}}));
            timeline=appendKnowledgeTimelineRecord(timeline,cmd.record.id,r.times,definitions,knowledgeDigest);
          }
          const snapshot=await capture(c,recordPins,{timeline,initialView:old.content.initialView,publicOnly:true});
          await put('theme',p.id,{...old.content,readingBaseRevision:undefined,...snapshotPins(snapshot),...(timeline?{timeline}:{})},h.current_revision+1,'確認済みの投稿をテーマへ追加');
          appliedThemes.push({id:p.id,revision:h.current_revision+1});
        }
        result={...(result as object),...(appliedThemes.length?{themes:appliedThemes}:{}),disposition:unchanged?(themeChanged?'theme-linked':'existing'):cmd.expectedRevision?'updated':'created'};
      } else if (cmd.action === "create-bundle") {
        for (const [rows, label] of [[cmd.entities, "対象"], [cmd.sources, "資料"], [cmd.records, "記録"]] as const) if (new Set(rows.map(r => r.id)).size !== rows.length) throw new KnowledgeError(label + "IDが重複しています");
        assertUnique(cmd.entityPins, "対象の観測版");
        const entities: KnowledgeEntityVersion[] = [], sources: KnowledgeSourceVersion[] = [], records: KnowledgeRecordVersion[] = [];
        for (const e of cmd.entities) entities.push(await put("entity", e.id, e.content, 1, cmd.reason, cmd.visibility));
        for (const s of cmd.sources) sources.push(await put("source", s.id, s.content, 1, cmd.reason, cmd.visibility));
        const entityPins = [...cmd.entityPins, ...entities.map(pin)];
        assertUnique(entityPins, "対象の観測版");
        for (const r of cmd.records) {
          const candidate = { ...r, revision: 1, createdAt: "", reason: cmd.reason };
          await validateRecord(c, candidate, entityPins, cmd.visibility === "public");
          records.push(await put("record", r.id, r.content, 1, cmd.reason, cmd.visibility));
        }
        for (const link of cmd.legacyLinks) {
          if (!records.some(r => r.id === link.recordId) || knowledgeDigest(link.payload) !== link.sha256) throw new KnowledgeError("旧Claim対応の対象またはhashが一致しません");
          await c.query("INSERT INTO knowledge75.legacy_links(dataset,legacy_claim_id,record_id,imported_revision,payload,sha256) VALUES($1,$2,$3,$4,$5,$6)", [link.dataset, link.legacyClaimId, link.recordId, link.importedRevision, JSON.stringify(link.payload), link.sha256]);
        }
        result = { entities, sources, records };
      } else if (cmd.action === "correct") {
        const h = await head(c, cmd.kind, cmd.id, "FOR UPDATE"); expected(h.current_revision, cmd.expectedRevision);
        const content = schemas[cmd.kind].parse(cmd.content);
        if (cmd.kind === "record") await validateRecord(c, { id: cmd.id, revision: cmd.expectedRevision + 1, content: knowledgeRecordContentSchema.parse(content), createdAt: "", reason: cmd.reason }, cmd.entityPins, h.visibility === "public");
        result = await put(cmd.kind, cmd.id, content, cmd.expectedRevision + 1, cmd.reason);
      } else if (cmd.action === "create-theme") {
        const snapshot = await capture(c, cmd.recordPins, { entityPins: cmd.entityPins, sourcePins: cmd.sourcePins, timeline: cmd.timeline, initialView: cmd.initialView, publicOnly: true });
        if(cmd.reading){const issue=editorialReferenceError(cmd.reading,snapshot);if(issue)throw new KnowledgeError(issue,400,'THEME_EDITORIAL_REFERENCE');}
        result = await put("theme", cmd.id, { ...(cmd.reading?{reading:cmd.reading}:{}),title: cmd.title, description: cmd.description, ...(cmd.productPins ? {productPins:cmd.productPins}:{}), ...(cmd.textLanguages ? { textLanguages: cmd.textLanguages } : {}), ...snapshotPins(snapshot), ...(cmd.timeline ? { timeline: cmd.timeline } : {}), initialView: cmd.initialView }, 1, cmd.reason);
      } else if (cmd.action === "edit-theme") {
        const h = await head(c, "theme", cmd.id, "FOR UPDATE"); expected(h.current_revision, cmd.expectedRevision);
        if(h.visibility!=="public")throw new KnowledgeError("公開中のテーマを選び直してください",409,"REFERENCE_NOT_PUBLIC");
        const old = await version(c,"theme",cmd.id);
        const observed = await capture(c,cmd.recordPins,{timeline:cmd.timeline,initialView:cmd.initialView,publicOnly:true});
        // Retain observed names/mappings of retained records. An unrelated
        // source/entity correction must not be silently imported by an edit.
        const entityPins=observed.entities.map(e=>old.content.entityPins.find(p=>p.id===e.id)??pin(e));
        const mappingPins=observed.records.flatMap(r=>{
          const retained=old.content.recordPins.some(p=>p.id===r.id&&p.revision===r.revision);
          const p=retained?old.content.mappingPins.find(p=>p.id===r.id):observed.mappings.find(p=>p.id===r.id);
          return p?[{id:p.id,revision:p.revision}]:[];
        });
        const snapshot=await capture(c,cmd.recordPins,{entityPins,mappingPins,timeline:cmd.timeline,initialView:cmd.initialView,publicOnly:true});
        const reading=cmd.reading??retainedThemeEditorial(old.content.reading,snapshot);
        if(reading){const issue=editorialReferenceError(reading,snapshot);if(issue)throw new KnowledgeError(issue,400,'THEME_EDITORIAL_REFERENCE');}
        const content={...(reading?{reading}:{}),title:cmd.title,description:cmd.description,...((cmd.productPins??old.content.productPins)?{productPins:cmd.productPins??old.content.productPins}:{}),...(cmd.textLanguages?{textLanguages:cmd.textLanguages}:{}),...snapshotPins(snapshot),...(cmd.timeline?{timeline:cmd.timeline}:{}),initialView:cmd.initialView};
        // Product selection is editorial metadata: preserve the checked reading/SEO
        // presentation only when every knowledge/text/time pin is unchanged.
        const readingBody=(value:Record<string,unknown>)=>{const {productPins,readingBaseRevision,...body}=value;void productPins;void readingBaseRevision;return knowledgeDigest(body);};
        if((cmd.productPins!==undefined||old.content.productPins!==undefined)&&readingBody(content)===readingBody(old.content)){
          const editions=(await c.query("SELECT revision,content FROM knowledge75.revisions WHERE kind='theme' AND id=$1 AND revision<=$2 ORDER BY revision DESC LIMIT 50",[cmd.id,old.revision])).rows;
          const origin=old.content.readingBaseRevision??[...editions].reverse().find(v=>readingBody(v.content)===readingBody(content))?.revision??old.revision;
          Object.assign(content,{readingBaseRevision:Number(origin)});
        }
        result=knowledgeDigest(content)===knowledgeDigest(old.content)?old:await put("theme",cmd.id,content,cmd.expectedRevision+1,cmd.reason);
      } else if (cmd.action === "refresh-theme") {
        const h = await head(c, "theme", cmd.id, "FOR UPDATE"); expected(h.current_revision, cmd.expectedRevision);
        const old = await version(c, "theme", cmd.id);
        if (cmd.refreshToken !== await refreshObservation(c, old, true)) throw new KnowledgeError("差分の表示後に元記録が更新されました。もう一度差分を確認してください", 409, "REFRESH_CONFLICT");
        const records: KnowledgePin[] = [];
        if (cmd.recordPins) {
          if (cmd.recordPins.length !== old.content.recordPins.length || cmd.recordPins.some(p => !old.content.recordPins.some(o => o.id === p.id))) throw new KnowledgeError("更新取込で選択した記録の集合は変更できません");
          records.push(...cmd.recordPins);
        } else for (const p of old.content.recordPins) records.push(pin(await version(c, "record", p.id)));
        const snapshot = await capture(c, records, { entityPins: cmd.entityPins, sourcePins: cmd.sourcePins, timeline: old.content.timeline, initialView: old.content.initialView, publicOnly: h.visibility === "public" });
        result = await put("theme", cmd.id, { ...old.content, reading:retainedThemeEditorial(old.content.reading,snapshot), readingBaseRevision:undefined, ...snapshotPins(snapshot) }, cmd.expectedRevision + 1, cmd.reason);
      } else if (cmd.action === "set-visibility" || cmd.action === "set-confirmation") {
        const h = await head(c, cmd.kind, cmd.id, "FOR UPDATE"); expected(h.status_revision, cmd.expectedStatusRevision);
        if (cmd.action === "set-confirmation") expected(h.current_revision, cmd.expectedContentRevision);
        if (cmd.action === "set-visibility" && cmd.visibility === "public") {
          if (cmd.kind === "record") await validateRecord(c, await version(c, "record", cmd.id), undefined, true);
          if (cmd.kind === "theme") { const t = await version(c, "theme", cmd.id); await capture(c, t.content.recordPins, { ...t.content, publicOnly: true }); }
        }
        const visibility = cmd.action === "set-visibility" ? cmd.visibility : h.visibility;
        const confirmation = cmd.action === "set-confirmation" ? cmd.confirmation : h.confirmation;
        await c.query("UPDATE knowledge75.objects SET visibility=$3,confirmation=$4,status_revision=status_revision+1,updated_at=clock_timestamp() WHERE kind=$1 AND id=$2", [cmd.kind, cmd.id, visibility, confirmation]);
        if (cmd.action === "set-visibility" && visibility === "public") await c.query("INSERT INTO knowledge75.published_revisions(kind,id,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [cmd.kind, cmd.id, h.current_revision]);
        await changed(cmd.kind, cmd.id);
        result = { kind: cmd.kind, id: cmd.id, revision: h.status_revision + 1, visibility, confirmation } satisfies KnowledgeStatus;
      } else if (cmd.action === "set-mapping" || cmd.action === "set-mappings") {
        const entries = cmd.action === "set-mapping" ? [cmd] : cmd.entries;
        if (new Set(entries.map(e => e.recordId)).size !== entries.length) throw new KnowledgeError("同じ記録を二度選択できません");
        // Lock records first, in a stable order: absent mapping creation and
        // corrections serialize on the same parent. A conflict rolls back all.
        for (const e of [...entries].sort((a,b) => a.recordId.localeCompare(b.recordId))) {
          const r = await head(c, "record", e.recordId, "FOR UPDATE"); expected(r.current_revision, e.recordRevision);
          if (cmd.action === "set-mappings" && !await recordReadable(c, await version(c,"record",e.recordId,e.recordRevision))) throw new KnowledgeError("公開対象が変わりました。再取得してください",409,"REFERENCE_NOT_PUBLIC");
          const existing = (await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='mapping' AND id=$1 FOR UPDATE", [e.recordId])).rows[0];
          expected(existing?.current_revision ?? 0, e.expectedMappingRevision);
        }
        if (cmd.concept) {
          await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["concept:"+cmd.concept.id+"@"+cmd.concept.revision]);
          const old = (await c.query("SELECT body FROM knowledge75.concepts WHERE id=$1 AND revision=$2", [cmd.concept.id, cmd.concept.revision])).rows[0];
          if (old && knowledgeDigest(old.body) !== knowledgeDigest(cmd.concept)) throw new KnowledgeError("同じ概念版に異なる定義を保存できません", 409, "CONCEPT_CONFLICT");
          if (!old) await c.query("INSERT INTO knowledge75.concepts(id,revision,body) VALUES($1,$2,$3)", [cmd.concept.id, cmd.concept.revision, JSON.stringify(cmd.concept)]);
        }
        const mappings: KnowledgeMappingVersion[] = [];
        for (const e of entries) mappings.push(await put("mapping", e.recordId, { recordRevision: e.recordRevision, concept: cmd.concept }, e.expectedMappingRevision + 1, cmd.reason));
        result = cmd.action === "set-mapping" ? mappings[0] : { mappings };
      }
      await c.query("INSERT INTO knowledge75.operations(actor_id,request_id,actor_kind,digest,input,result) VALUES($1,$2,$3,$4,$5,$6)", [actor.id, cmd.requestId, actor.kind, digest, JSON.stringify(raw), JSON.stringify(result)]);
      if(internal?.retain)await internal.retain(c,result);
      if(internal)await internal.prepare(result);
      await c.query("COMMIT"); return result;
    } catch (e) {
      await c.query("ROLLBACK");
      if (e instanceof KnowledgeError || e instanceof z.ZodError) throw e;
      if (e && typeof e === "object" && "code" in e && ["23505", "40001", "40P01"].includes(String(e.code))) throw new KnowledgeError("同じIDの登録、または同時更新と競合しました。内容を確認してください", 409, "CONFLICT");
      throw e;
    } finally { c.release(); }
  }
  return {
    execute,
    list: (actor: KnowledgeActor) => read(c => listIn(c, actor)),
    get: <K extends KnowledgeKind>(actor: KnowledgeActor, kind: K, id: string, revision?: number) => read(async c => {
      if (!kinds.includes(kind)) throw new KnowledgeError("対象の種類が不正です");
      const value = await version(c, kind, id, revision);
      if (actor.kind !== "operator") {
        await assertRevisionPublic(c, kind, id, value.revision);
        if (kind === "record" && !await recordReadable(c, value as KnowledgeRecordVersion)) throw new KnowledgeError("閲覧できません", 404, "NOT_FOUND");
        if (kind === "theme") await resolve(c, id, revision, true);
        if (kind === "mapping" && !await recordReadable(c, await version(c, "record", id, (value as KnowledgeMappingVersion).content.recordRevision))) throw new KnowledgeError("閲覧できません", 404, "NOT_FOUND");
      }
      return value;
    }),
    resolveTheme: (actor: KnowledgeActor, id: string, revision?: number) => read(c => resolve(c, id, revision, actor.kind !== "operator")),
    diffTheme: (actor: KnowledgeActor, id: string) => read(async c => {
      if (actor.kind !== "operator") throw new KnowledgeError("差分確認の権限がありません", 403, "FORBIDDEN");
      const { theme, snapshot } = await resolve(c, id, undefined, false);
      const diff: KnowledgeThemeDiff = { themeId: id, revision: theme.revision, refreshToken: await refreshObservation(c, theme), changes: [], unavailable: [] };
      for (const [kind, beforeValues] of [["record", snapshot.records], ["entity", snapshot.entities], ["source", snapshot.sources], ["mapping", snapshot.mappings]] as const) for (const before of beforeValues) {
        if (!await visible(c, kind, before.id)) diff.unavailable.push({ kind, id: before.id });
        const after = await version(c, kind, before.id);
        if (after.revision !== before.revision) diff.changes.push({ kind, id: before.id, beforeRevision: before.revision, afterRevision: after.revision, before, after, ...(kind === "source" ? { requiresRecordCorrection: true } : {}) });
      }
      for (const r of snapshot.records) if (!snapshot.mappings.some(m => m.id === r.id)) {
        const found = (await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='mapping' AND id=$1", [r.id])).rows[0];
        if (found) { const after = await version(c, "mapping", r.id); if (after.content.recordRevision === r.revision) diff.changes.push({ kind: "mapping", id: r.id, beforeRevision: null, afterRevision: after.revision, before: null, after }); }
      }
      return diff;
    }),
    search: (actor: KnowledgeActor, query: string, conceptId?: string) => read(async c => {
      const list = await listIn(c, actor); const q = query.normalize("NFKC").toLocaleLowerCase();
      const records = [];
      for (const r of list.records) {
        if (q && !knowledgeRecordSearchText(r, list.entities).includes(q)) continue;
        if (conceptId) {
          const exists = (await c.query("SELECT current_revision FROM knowledge75.objects WHERE kind='mapping' AND id=$1", [r.id])).rows[0];
          if (!exists) continue; const m = await version(c, "mapping", r.id);
          if (m.content.recordRevision !== r.revision || m.content.concept?.id !== conceptId) continue;
        }
        records.push(r);
      }
      return { records, entities: list.entities, match: conceptId ? "meaning" as const : "text" as const };
    }),
    publicSnapshot: () => read(async c => {
      const list = await listIn(c, { kind: "reader", id: "public" });
      return capture(c, list.records.map(pin), { publicOnly: true });
    }),
    legacyLink: (actor: KnowledgeActor, dataset: string, legacyClaimId: string) => read(async c => {
      if (actor.kind !== "operator") throw new KnowledgeError("原入力を確認する権限がありません", 403, "FORBIDDEN");
      const row = (await c.query("SELECT * FROM knowledge75.legacy_links WHERE dataset=$1 AND legacy_claim_id=$2", [dataset, legacyClaimId])).rows[0];
      if (!row) throw new KnowledgeError("旧Claimの対応がありません", 404, "NOT_FOUND");
      return { dataset: row.dataset, legacyClaimId: row.legacy_claim_id, recordId: row.record_id, importedRevision: Number(row.imported_revision), payload: row.payload, sha256: row.sha256 };
    }),
  };
}
/** Same current visibility and published-edition gates as ordinary public reads. */
export async function readKnowledgeTextOriginal(c:PoolClient,raw:KnowledgeTextTarget,requireCurrent=false,lock=false){
 const target=knowledgeTextTargetSchema.parse(raw),h=await head(c,target.kind,target.id,lock?'FOR SHARE':'');
 if(requireCurrent)expected(h.current_revision,target.revision);
 await assertRevisionPublic(c,target.kind,target.id,target.revision);const original=await version(c,target.kind,target.id,target.revision);
 if(target.kind==='record'&&!await recordReadable(c,original as KnowledgeRecordVersion))throw new KnowledgeError('原文を閲覧できません',404,'NOT_FOUND');
 if(target.kind==='theme')await resolve(c,target.id,target.revision,true);
 try{const text=knowledgeOriginalText(target,original.content);return {...text,content:original.content,target,hash:translationHash(text.text)};}catch(e){throw new KnowledgeError((e as Error).message,400,'TRANSLATION_TARGET');}
}
export async function readKnowledgeTranslation(c:PoolClient,target:KnowledgeTextTarget,language:string,revision?:number){
 await assertTranslationSchema(c);const original=await readKnowledgeTextOriginal(c,target),translation=await storedTranslation(c,translationId(target,language),revision);
 if(translation&&translation.originalHash!==original.hash)throw new KnowledgeError('訳文の原本が一致しません',409,'TRANSLATION_CONFLICT');return {original:{text:original.text,hash:original.hash,language:original.language},translation};
}
export type KnowledgeFoundationService = ReturnType<typeof createKnowledgeFoundationService>;

export async function readKnowledgeTranslationById(c:PoolClient,id:string,revision?:number){
 await assertTranslationSchema(c);const v=await storedTranslation(c,id,revision);if(!v)throw new KnowledgeError('訳文がありません',404,'NOT_FOUND');
 const original=await readKnowledgeTextOriginal(c,v.target);if(original.hash!==v.originalHash)throw new KnowledgeError('原文が一致しません',409,'CONFLICT');return v;
}
