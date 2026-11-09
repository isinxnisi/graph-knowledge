import {themeReadingPresentation} from "./theme-reading-presentation";
import {knowledgeDisplayText} from "../domain/knowledge-display";
import {publicDisplayTranslations,publicThemeSnapshotTranslations} from "./knowledge-display-translations";
import {readKnowledgeRecordVersion} from './knowledge-record-version';
import {readKnowledgeTextOriginal,readKnowledgeTranslation,readKnowledgeTranslationById} from "./knowledge-foundation";
import {knowledgeDisplayTranslationsQuerySchema} from "../domain/knowledge-translation";
import {identitySearchIds} from './knowledge-identity';
import {identityGroup} from './knowledge-identity-resolution';
import {readIdentityPaths} from './knowledge-identity-paths';
import {knowledgeSearchKinds} from '../domain/knowledge-search-kind';
import {migrateKnowledgeIdentities} from './knowledge-identity-migrate';
import type {KnowledgeTextTarget} from "../domain/knowledge-translation";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import neo4j, { type Driver, type ManagedTransaction } from "neo4j-driver";
import { z } from "zod";
import { knowledgeEntityContentSchema, knowledgeSourceContentSchema, knowledgeRecordContentSchema, knowledgeMappingContentSchema, type KnowledgeEntityVersion, type KnowledgeSourceVersion, type KnowledgeRecordVersion, type KnowledgeMappingVersion } from "../domain/knowledge-foundation";
import { buildKnowledgePublishedRecord, flattenKnowledgePublishedRecord, knowledgePublicationQuerySchema, type KnowledgePublishedRecord } from "../domain/knowledge-publication";
import { ensureKnowledgeFoundationSchema, resolvePublicKnowledgeTheme, KnowledgeError, knowledgeDigest } from "./knowledge-foundation";

import { capsuleKnowledgeSchema } from "../domain/capsule-knowledge";
import { capsuleKnowledgeReferences, knowledgeReferenceGroupsSchema, type KnowledgeReference } from "../domain/capsule-knowledge-access";
import { capsuleUpdateQuerySchema, type CapsuleUpdateResponse } from "../domain/capsule-updates";
import { knowledgeThemeListQuerySchema, knowledgeThemeReadQuerySchema, knowledgeEntityQuerySchema, type KnowledgeThemePage, type KnowledgeThemeRead, type KnowledgeEntityPage } from "../domain/knowledge-theme-reader";

const generationSchema = z.string().regex(/^k75-[a-f0-9]{32}$/);
const iso = (v: unknown) => v instanceof Date ? v.toISOString() : String(v);
const pinKey = (kind: string, id: string, revision: number) => JSON.stringify([kind,id,revision]);
const normalize = (v: string) => v.normalize("NFKC").toLocaleLowerCase();
const schemaVersion = "002-publication.sql";


export async function ensureKnowledgePublicationSchema(pool: Pool) {
  await ensureKnowledgeFoundationSchema(pool);
  await migrateKnowledgeIdentities(pool);
  const sql = await readFile(path.join(process.cwd(),"migrations/knowledge-foundation",schemaVersion),"utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const c = await pool.connect();
  try {
    await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(7500001)");
    const old=(await c.query("SELECT checksum FROM knowledge75.migrations WHERE name=$1",[schemaVersion])).rows[0];
    if(old && old.checksum!==checksum) throw new KnowledgeError("公開検索migrationのchecksumが変わっています",503,"MIGRATION_CHANGED");
    if(!old){await c.query(sql);await c.query("INSERT INTO knowledge75.migrations(name,checksum) VALUES($1,$2)",[schemaVersion,checksum]);}
    await c.query("COMMIT");return {name:schemaVersion,checksum,applied:!old};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}

// Every returned record is checked against current publication gates, including its
// exact historical dependencies. The immutable index is not an authorization cache.
const readableSql = (alias="r") => `NOT EXISTS (
 SELECT 1 FROM jsonb_array_elements(${alias}.dependencies) d
 LEFT JOIN knowledge75.objects o ON o.kind=d->>'kind' AND o.id=d->>'id'
 LEFT JOIN knowledge75.published_revisions p ON p.kind=o.kind AND p.id=o.id AND p.revision=(d->>'revision')::integer
 WHERE o.visibility IS DISTINCT FROM 'public' OR p.id IS NULL
)`;
type Dependency = {kind:"record"|"entity"|"source"|"theme";id:string;revision:number};
type Generation = {id:string;sourceSequence:string;digest:string;recordCount:number;createdAt:string;publishedAt:string|null};
const generationRow=(r:QueryResultRow):Generation=>({id:r.id,sourceSequence:String(r.source_sequence),digest:r.digest,recordCount:Number(r.record_count),createdAt:iso(r.created_at),publishedAt:r.published_at?iso(r.published_at):null});
export type KnowledgePublicationPage = {generation:string;records:KnowledgePublishedRecord[];entities:KnowledgeEntityVersion[];nextCursor:string|null;hasMore:boolean};
export type KnowledgePublicationStatus = {active:Generation|null;latestSequence:string;changeToken:string;pending:boolean;lastFailure:{generation:string;message:string;createdAt:string}|null};
type Cursor = {v:1;generation:string;filter:string;after:string};
function decodeCursor(raw:string|undefined):Cursor|undefined {
  if(!raw)return;
  try{return z.strictObject({v:z.literal(1),generation:generationSchema,filter:z.string().regex(/^[a-f0-9]{64}$/),after:z.string().min(1).max(120)}).parse(JSON.parse(Buffer.from(raw,"base64url").toString("utf8")));}
  catch{throw new KnowledgeError("続きの取得条件が不正です",400,"INVALID_CURSOR");}
}
const encodeCursor=(value:Cursor)=>Buffer.from(JSON.stringify(value)).toString("base64url");
const distinctEntities=(records:KnowledgePublishedRecord[])=>[...new Map(records.flatMap(r=>r.entities.map(e=>[e.id,e] as const))).values()];
const rowVersion=(r:QueryResultRow)=>({id:r.id,revision:Number(r.revision),createdAt:iso(r.created_at),reason:r.reason});

async function capturePublication(c:PoolClient) {
  const changeIds=(await c.query("SELECT sequence FROM knowledge75.changes ORDER BY sequence")).rows.map(r=>String(r.sequence));
  const sequence=changeIds.at(-1)??"0";
  const db=String((await c.query("SELECT current_database() AS name")).rows[0].name);
  const heads=(await c.query("SELECT * FROM knowledge75.objects")).rows;
  const byHead=new Map(heads.map(h=>[JSON.stringify([h.kind,h.id]),h]));
  const published=(await c.query("SELECT kind,id,revision FROM knowledge75.published_revisions")).rows;
  const publishedKeys=new Set(published.map(r=>pinKey(r.kind,r.id,Number(r.revision))));
  const isReadable=(kind:string,id:string,revision:number)=>byHead.get(JSON.stringify([kind,id]))?.visibility==="public"&&publishedKeys.has(pinKey(kind,id,revision));
  // Only current records, entities and mappings are candidates. Source revisions are
  // fetched separately because an evidence locator belongs to a fixed source edition.
  const rows=(await c.query("SELECT r.* FROM knowledge75.revisions r JOIN knowledge75.objects o ON o.kind=r.kind AND o.id=r.id AND o.current_revision=r.revision WHERE r.kind IN ('record','entity','mapping') ORDER BY r.kind,r.id")).rows;
  const entities=new Map<string,KnowledgeEntityVersion>();const records:KnowledgeRecordVersion[]=[];const mappings=new Map<string,KnowledgeMappingVersion>();
  for(const r of rows){
    if(r.kind==="entity"&&isReadable(r.kind,r.id,r.revision))entities.set(r.id,{...rowVersion(r),content:knowledgeEntityContentSchema.parse(r.content)});
    if(r.kind==="record"&&isReadable(r.kind,r.id,r.revision))records.push({...rowVersion(r),content:knowledgeRecordContentSchema.parse(r.content)});
    if(r.kind==="mapping")mappings.set(r.id,{...rowVersion(r),content:knowledgeMappingContentSchema.parse(r.content)});
  }
  const sources=new Map<string,KnowledgeSourceVersion>();
  for(const r of (await c.query("SELECT r.* FROM knowledge75.revisions r WHERE r.kind='source'")).rows)
    if(isReadable("source",r.id,r.revision))sources.set(pinKey("source",r.id,r.revision),{...rowVersion(r),content:knowledgeSourceContentSchema.parse(r.content)});
  const legacy=(await c.query("SELECT * FROM knowledge75.legacy_links ORDER BY dataset,legacy_claim_id")).rows;
  const result:{dto:KnowledgePublishedRecord;dependencies:Dependency[]}[]=[];
  for(const r of records){
    const endpointIds=[...new Set([r.content.subjectId,r.content.objectId].filter((v):v is string=>Boolean(v)))];
    if(endpointIds.some(id=>!entities.has(id)))continue;
    const sourceRefs=[...new Map(r.content.evidence.map(e=>[pinKey("source",e.source.id,e.source.revision),e.source] as const)).values()];
    if(sourceRefs.some(ref=>!sources.has(pinKey("source",ref.id,ref.revision))))continue;
    const usedEntities=endpointIds.map(id=>entities.get(id)!);const usedSources=sourceRefs.map(ref=>sources.get(pinKey("source",ref.id,ref.revision))!);
    const link=legacy.find(l=>l.record_id===r.id);
    if(link && knowledgeDigest(link.payload)!==link.sha256)throw new KnowledgeError("旧原本のhashが一致しません",503,"LEGACY_HASH_MISMATCH");
    const dto=buildKnowledgePublishedRecord(r,{entities:usedEntities,sources:usedSources,mappings:mappings.has(r.id)&&publishedKeys.has(pinKey("record",r.id,mappings.get(r.id)!.content.recordRevision))?[mappings.get(r.id)!]:[],...(link?{legacyLink:{dataset:link.dataset,legacyClaimId:link.legacy_claim_id,recordId:link.record_id,importedRevision:Number(link.imported_revision),payload:link.payload,sha256:link.sha256}}:{})});
    const aboutDependencies:Dependency[]=[];
    if(r.content.aboutRecord){if(!isReadable('record',r.content.aboutRecord.id,r.content.aboutRecord.revision))continue;aboutDependencies.push({kind:'record',...r.content.aboutRecord});}
    if(r.content.aboutTheme){const themeHead=byHead.get(JSON.stringify(['theme',r.content.aboutTheme]));if(!themeHead||!isReadable('theme',r.content.aboutTheme,themeHead.current_revision))continue;aboutDependencies.push({kind:'theme',id:r.content.aboutTheme,revision:themeHead.current_revision});}
    result.push({dto,dependencies:[...aboutDependencies,{kind:"record",id:r.id,revision:r.revision},...usedEntities.map(e=>({kind:"entity" as const,id:e.id,revision:e.revision})),...usedSources.map(s=>({kind:"source" as const,id:s.id,revision:s.revision}))]});
  }
  const digest=knowledgeDigest({db,changeIds,records:result});
  return {sequence,changeIds,digest,id:"k75-"+digest.slice(0,32),records:result,entities:distinctEntities(result.map(r=>r.dto))};
}

type PublicationHooks={afterStage?:()=>Promise<void>;beforeActivate?:()=>Promise<void>};
/** Published once, public now, and the exact edition: never the current private head. */
async function capsuleReferenceRows(c:PoolClient,groups:KnowledgeReference[][],content=false){
 const pins=[...new Map(groups.flat().map(p=>[pinKey(p.kind,p.id,p.revision),p])).values()];
 if(!pins.length)return new Map<string,QueryResultRow>();
 const rows=(await c.query(`SELECT ${content?'r.*':'r.kind,r.id,r.revision'} FROM jsonb_to_recordset($1::jsonb) AS requested(kind text,id text,revision bigint)
  JOIN knowledge75.revisions r ON r.kind=requested.kind AND r.id=requested.id AND r.revision=requested.revision
  JOIN knowledge75.objects o ON o.kind=r.kind AND o.id=r.id AND o.visibility='public'
  JOIN knowledge75.published_revisions p ON p.kind=r.kind AND p.id=r.id AND p.revision=r.revision`,[JSON.stringify(pins)])).rows;
 const result=new Map(rows.map(r=>[pinKey(r.kind,r.id,Number(r.revision)),r]));
 for(const p of pins.filter(p=>p.kind==='translation')){try{const value=await readKnowledgeTranslationById(c,p.id,p.revision);result.set(pinKey(p.kind,p.id,p.revision),{kind:'translation',id:p.id,revision:p.revision,content:value});}catch(e){if(!(e instanceof KnowledgeError&&e.status<500))throw e;}}
 return result;
}

export function createKnowledgePublicationService(pool:Pool,driver:Driver,hooks:PublicationHooks={},options:{prepareSchema?:()=>Promise<unknown>}={}) {
  let initialized:Promise<unknown>|undefined;
  const ready=()=>initialized??=(options.prepareSchema?.()??ensureKnowledgePublicationSchema(pool)).catch(e=>{initialized=undefined;throw e;});
  async function read<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{await ready();const c=await pool.connect();try{await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");const value=await fn(c);await c.query("COMMIT");return value;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
  async function generation(c:PoolClient,requested?:string){
    if(requested)generationSchema.parse(requested);
    const r=(await c.query("SELECT g.* FROM knowledge75.publication_generations g WHERE g.id=coalesce($1,(SELECT active_generation FROM knowledge75.publication_control WHERE singleton)) AND g.state='ready'",[requested??null])).rows[0];
    if(!r)throw new KnowledgeError("公開検索の準備ができていません",503,"GENERATION_UNAVAILABLE");
    return generationRow(r);
  }
  async function statusIn(c:PoolClient):Promise<KnowledgePublicationStatus>{
    const active=(await c.query("SELECT g.* FROM knowledge75.publication_control c JOIN knowledge75.publication_generations g ON g.id=c.active_generation WHERE c.singleton")).rows[0];
    const changes=(await c.query("SELECT coalesce(max(sequence),0) AS n,count(*) AS count FROM knowledge75.changes")).rows[0];
    const latestSequence=String(changes.n);const changeToken=knowledgeDigest({max:latestSequence,count:String(changes.count)});
    const pending=Boolean((await c.query("SELECT 1 FROM knowledge75.changes c LEFT JOIN knowledge75.publication_seen_changes s ON s.sequence=c.sequence WHERE s.sequence IS NULL LIMIT 1")).rowCount);
    const failed=(await c.query("SELECT id,error,created_at FROM knowledge75.publication_generations WHERE state='failed' AND created_at > coalesce($1::timestamptz,'-infinity'::timestamptz) ORDER BY created_at DESC LIMIT 1",[active?.published_at??null])).rows[0];
    return {active:active?generationRow(active):null,latestSequence,changeToken,pending:!active||pending,lastFailure:failed?{generation:failed.id,message:failed.error,createdAt:iso(failed.created_at)}:null};
  }
  async function projectGraph(snapshot:Awaited<ReturnType<typeof capturePublication>>) {
    const session=driver.session({database:"neo4j"});
    try{
      await session.run("CREATE CONSTRAINT k75u2_generation IF NOT EXISTS FOR (g:K75U2Generation) REQUIRE g.id IS UNIQUE");
      await session.run("CREATE CONSTRAINT k75u2_entity IF NOT EXISTS FOR (e:K75U2Entity) REQUIRE (e.generation,e.id) IS UNIQUE");
      await session.executeWrite(async tx=>{
        const old=(await tx.run("MATCH (g:K75U2Generation {id:$id}) RETURN g.digest AS digest,g.complete AS complete",{id:snapshot.id})).records[0];
        if(old){if(old.get("digest")!==snapshot.digest||old.get("complete")!==true)throw new KnowledgeError("Graph世代の断面が一致しません",503,"GENERATION_CONFLICT");return;}
        await tx.run("CREATE (:K75U2Generation {id:$id,digest:$digest,complete:false})",{id:snapshot.id,digest:snapshot.digest});
        await tx.run("UNWIND $rows AS row CREATE (:K75U2Entity {generation:$generation,id:row.id,revision:row.revision})",{generation:snapshot.id,rows:snapshot.entities.map(e=>({id:e.id,revision:neo4j.int(e.revision)}))});
        const relations=snapshot.records.map(r=>r.dto.record).filter(r=>r.content.kind==="relation");
        await tx.run("UNWIND $rows AS row MATCH (a:K75U2Entity {generation:$generation,id:row.subjectId}),(b:K75U2Entity {generation:$generation,id:row.objectId}) CREATE (a)-[:K75U2_REL {generation:$generation,recordId:row.id,revision:row.revision}]->(b)",{generation:snapshot.id,rows:relations.map(r=>({id:r.id,revision:neo4j.int(r.revision),subjectId:r.content.subjectId,objectId:r.content.objectId}))});
        const count=(await tx.run("MATCH (:K75U2Entity {generation:$generation})-[r:K75U2_REL {generation:$generation}]->() RETURN count(r) AS n",{generation:snapshot.id})).records[0].get("n").toNumber();
        if(count!==relations.length)throw new KnowledgeError("Graph投影の件数が一致しません",503,"PROJECTION_COUNT_MISMATCH");
        await tx.run("MATCH (g:K75U2Generation {id:$id}) SET g.complete=true",{id:snapshot.id});
      });
    }finally{await session.close();}
  }
  async function publishPending(options:{force?:boolean}={}) {
    await ready();const c=await pool.connect();let snapshot:Awaited<ReturnType<typeof capturePublication>>|undefined;let locked=false;
    try{
      // One session lock spans both stores; it never locks content-writing objects.
      locked=Boolean((await c.query("SELECT pg_try_advisory_lock(7500002) AS locked")).rows[0].locked);
      if(!locked)return {state:"busy" as const,...await read(statusIn)};
      const before=await statusIn(c);
      if(!options.force&&!before.pending)return {state:"unchanged" as const,...before};
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");snapshot=await capturePublication(c);
      // Explicit rebuild gets a fresh namespace, including when a partial Neo4j
      // restore left nodes behind without a complete generation header.
      if(options.force)snapshot.id="k75-"+knowledgeDigest({digest:snapshot.digest,rebuild:randomUUID()}).slice(0,32);
      const existing=(await c.query("SELECT state,digest FROM knowledge75.publication_generations WHERE id=$1",[snapshot.id])).rows[0];
      if(existing&&existing.digest!==snapshot.digest)throw new KnowledgeError("公開世代が競合しました",409,"GENERATION_CONFLICT");
      if(!existing){
        await c.query("INSERT INTO knowledge75.publication_generations(id,state,source_sequence,digest,record_count) VALUES($1,'staged',$2,$3,$4)",[snapshot.id,snapshot.sequence,snapshot.digest,snapshot.records.length]);
        for(const {dto,dependencies} of snapshot.records){const f=flattenKnowledgePublishedRecord(dto);await c.query(`INSERT INTO knowledge75.publication_records(generation,id,revision,body,dependencies,search_text,subject_id,object_id,relation_label,polarity,concept_id,predicate,role_id,isbn13,organization_position_id,event_role_id,event_id,event_from,event_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,[snapshot.id,dto.record.id,dto.record.revision,JSON.stringify(dto),JSON.stringify(dependencies),normalize(f.searchText),dto.record.content.subjectId,dto.record.content.objectId,f.relationLabel,f.polarity,f.conceptId,f.predicate,f.roleId,f.isbn13,f.organizationPositionId,f.eventRoleId,f.eventId,f.eventFromLower,f.eventToUpper]);}
        for(const e of snapshot.entities)await c.query("INSERT INTO knowledge75.publication_entities(generation,id,revision,body) VALUES($1,$2,$3,$4)",[snapshot.id,e.id,e.revision,JSON.stringify(e)]);
      }
      await c.query("COMMIT");
      await hooks.afterStage?.();await projectGraph(snapshot);await hooks.beforeActivate?.();
      await c.query("BEGIN");
      const active=(await c.query("SELECT active_generation FROM knowledge75.publication_control WHERE singleton FOR UPDATE")).rows[0].active_generation as string|null;
      if(active!==(before.active?.id??null))throw new KnowledgeError("別の公開世代が先に有効になりました",409,"ACTIVATION_CONFLICT");
      if(active){const seq=(await c.query("SELECT source_sequence FROM knowledge75.publication_generations WHERE id=$1",[active])).rows[0].source_sequence;if(BigInt(seq)>BigInt(snapshot.sequence))throw new KnowledgeError("古い公開世代へは戻せません",409,"ACTIVATION_CONFLICT");}
      await c.query("UPDATE knowledge75.publication_generations SET state='ready',published_at=coalesce(published_at,clock_timestamp()),error=NULL WHERE id=$1",[snapshot.id]);
      await c.query("UPDATE knowledge75.publication_control SET active_generation=$1 WHERE singleton",[snapshot.id]);
      await c.query("INSERT INTO knowledge75.publication_seen_changes(sequence,generation) SELECT value,$2 FROM unnest($1::bigint[]) value ON CONFLICT DO NOTHING",[snapshot.changeIds,snapshot.id]);
      await c.query("COMMIT");
      return {state:"published" as const,...await statusIn(c)};
    }catch(e){await c.query("ROLLBACK");if(snapshot)await c.query("UPDATE knowledge75.publication_generations SET state='failed',error=$2 WHERE id=$1 AND state<>'ready'",[snapshot.id,e instanceof KnowledgeError?e.code:"PROJECTION_FAILED"]);throw e;}
    finally{if(locked)await c.query("SELECT pg_advisory_unlock(7500002)");c.release();}
  }
  async function graphRead<T>(actual:Generation,fn:(tx:ManagedTransaction)=>Promise<T>):Promise<T>{
    const session=driver.session({database:"neo4j",defaultAccessMode:neo4j.session.READ});
    try{return await session.executeRead(async tx=>{const header=(await tx.run("MATCH (g:K75U2Generation {id:$id}) RETURN g.digest AS digest,g.complete AS complete",{id:actual.id})).records[0];if(!header||header.get("digest")!==actual.digest||header.get("complete")!==true)throw new KnowledgeError("この公開世代のGraphは準備中です。再投影を確認してください",503,"GRAPH_GENERATION_UNAVAILABLE");return fn(tx);});}finally{await session.close();}
  }
  async function allowedRows(c:PoolClient,generationId:string,ids:string[]){if(!ids.length)return [];return (await c.query(`SELECT body FROM knowledge75.publication_records r WHERE generation=$1 AND id=ANY($2::text[]) AND ${readableSql()} ORDER BY id`,[generationId,ids])).rows.map(r=>r.body as KnowledgePublishedRecord);}
  async function deniedIds(c:PoolClient,generationId:string){return (await c.query(`SELECT id FROM knowledge75.publication_records r WHERE generation=$1 AND NOT (${readableSql()})`,[generationId])).rows.map(r=>r.id as string);}
  async function entity(c:PoolClient,generationId:string,id:string){const r=(await c.query("SELECT e.body FROM knowledge75.publication_entities e JOIN knowledge75.objects o ON o.kind='entity' AND o.id=e.id AND o.visibility='public' JOIN knowledge75.published_revisions p ON p.kind='entity' AND p.id=e.id AND p.revision=e.revision WHERE e.generation=$1 AND e.id=$2",[generationId,id])).rows[0];if(!r)throw new KnowledgeError("この対象は閲覧できません",404,"NOT_FOUND");return r.body as KnowledgeEntityVersion;}
  async function searchEntityIds(c:PoolClient,q:string,generationId:string){
    if(!q.trim())return [];
    const pattern='%'+normalize(q).replace(/[\\%_]/g,'\\$&')+'%';
    const translated=(await c.query(`SELECT DISTINCT e.id FROM knowledge75.publication_entities e JOIN knowledge75.objects o ON o.kind='entity' AND o.id=e.id AND o.visibility='public' JOIN knowledge75.published_revisions p ON p.kind='entity' AND p.id=e.id AND p.revision=e.revision JOIN knowledge75.text_translation_heads h ON h.target->>'kind'='entity' AND h.target->>'id'=e.id AND h.target->>'revision'=e.revision::text AND h.target->>'field' IN ('name','aliases') AND h.visibility='public' JOIN knowledge75.text_translation_revisions t ON t.id=h.id AND t.revision=h.current_revision WHERE e.generation=$1 AND lower(normalize(t.text,NFKC)) LIKE $2 ESCAPE E'\\\\' ORDER BY e.id`,[generationId,pattern])).rows.map(r=>r.id as string);
    return [...new Set([...await identitySearchIds(c,q,generationId),...await identityGroup(c,translated,generationId)])].sort();
  }
  return {
    publishPending,status:()=>read(statusIn),
    capsulesReadable:(raw:unknown)=>read(async c=>{
      const groups=knowledgeReferenceGroupsSchema.parse(raw),rows=await capsuleReferenceRows(c,groups);
      return groups.map(group=>group.every(p=>rows.has(pinKey(p.kind,p.id,p.revision))));
    }),
    validateCapsuleKnowledge:(raw:unknown)=>read(async c=>{
      const k=capsuleKnowledgeSchema.parse(raw),pins=capsuleKnowledgeReferences(k),rows=await capsuleReferenceRows(c,[pins],true);
      if(pins.some(p=>!rows.has(pinKey(p.kind,p.id,p.revision))))return false;
      if(k.snapshot.theme){const v=k.snapshot.theme,row=rows.get(pinKey("theme",v.id,v.revision));if(!row||knowledgeDigest({content:v.content,createdAt:v.createdAt,reason:v.reason})!==knowledgeDigest({content:row.content,createdAt:iso(row.created_at),reason:row.reason}))return false;}
      for(const v of k.snapshot.translations??[]){const saved=rows.get(pinKey('translation',v.id,v.revision));if(!saved||knowledgeDigest(saved.content)!==knowledgeDigest(v))return false;}
      return ([['records','record'],['entities','entity'],['sources','source'],['mappings','mapping']] as const).every(([group,kind])=>k.snapshot[group].every(version=>{
        const row=rows.get(pinKey(kind,version.id,version.revision))!;
        return knowledgeDigest({content:version.content,createdAt:version.createdAt,reason:version.reason})===knowledgeDigest({content:row.content,createdAt:iso(row.created_at),reason:row.reason});
      }));
    }),
    capsuleUpdates:(raw:unknown):Promise<CapsuleUpdateResponse>=>read(async c=>{
      const q=capsuleUpdateQuerySchema.parse(raw);
      async function translated(snapshot:import("../domain/knowledge-foundation").KnowledgeSnapshot){
        const translations=[];
        for(const request of q.translations){const rows=request.target.kind==="record"?snapshot.records:request.target.kind==="entity"?snapshot.entities:request.target.kind==="source"?snapshot.sources:snapshot.theme?[snapshot.theme]:[];const original=rows.find(v=>v.id===request.target.id);if(!original)continue;
          try{const v=await readKnowledgeTranslation(c,{...request.target,revision:original.revision},request.language);if(v.translation)translations.push(v.translation);}catch(e){if(!(e instanceof KnowledgeError)||e.status>=500)throw e;}
        }
        return {...snapshot,translations};
      }
      if(q.includeTheme&&q.theme){
        let resolved;
        try{resolved=await resolvePublicKnowledgeTheme(c,q.theme.id);}
        catch(error){if(error instanceof KnowledgeError&&(error.status===403||error.status===404))throw new KnowledgeError("このテーマは閲覧できません",404,"NOT_FOUND");throw error;}
        const control=(await c.query("SELECT active_generation FROM knowledge75.publication_control WHERE singleton")).rows[0];
        return {generation:control?.active_generation??null,translationsChecked:!!q.translations.length,...resolved,snapshot:await translated({...resolved.snapshot,theme:resolved.theme}),unavailable:[]} satisfies CapsuleUpdateResponse;
      }
      const actual=await generation(c);
      const records=await allowedRows(c,actual.id,[...new Set(q.recordIds)]);
      const entities=distinctEntities(records),sources=[...new Map(records.flatMap(r=>r.sources.map(s=>[pinKey('source',s.id,s.revision),s] as const))).values()];
      const unavailable:CapsuleUpdateResponse['unavailable']=q.recordIds.filter(id=>!records.some(r=>r.record.id===id)).map(id=>({kind:'record',id}));
      for(const id of new Set(q.entityIds))if(!entities.some(e=>e.id===id)){
        try{entities.push(await entity(c,actual.id,id));}catch(error){if(error instanceof KnowledgeError&&error.status===404)unavailable.push({kind:'entity',id});else throw error;}
      }
      const mappings:KnowledgeMappingVersion[]=[];
      for(const record of records)if(record.semantics.mappingRevision){
        const row=(await c.query("SELECT * FROM knowledge75.revisions WHERE kind='mapping' AND id=$1 AND revision=$2",[record.record.id,record.semantics.mappingRevision])).rows[0];
        if(row)mappings.push({...rowVersion(row),content:knowledgeMappingContentSchema.parse(row.content)});
      }
      const theme=q.theme?(await resolvePublicKnowledgeTheme(c,q.theme.id,q.theme.revision)).theme:undefined;
      return {generation:actual.id,translationsChecked:!!q.translations.length,snapshot:await translated({schemaVersion:1,initialView:'graph',records:records.map(r=>r.record),entities,sources,mappings,...(theme?{theme}:{})}),unavailable} satisfies CapsuleUpdateResponse;
    }),
    themes:(raw:unknown={})=>read(async c=>{
      const q=knowledgeThemeListQuerySchema.parse(raw);
      const values:unknown[]=[];const conditions=["o.kind='theme'","o.visibility='public'","p.id IS NOT NULL"];
      const focusIds=q.entityId?await identityGroup(c,[q.entityId]):[];
      if(q.entityId){values.push(focusIds);conditions.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(r.content->'entityPins') pin WHERE pin->>'id'=ANY($${values.length}::text[]))`);}

      const candidates=(await c.query(`SELECT r.id,r.revision,(SELECT min(first.created_at) FROM knowledge75.revisions first WHERE first.kind='theme' AND first.id=r.id) AS first_created_at FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision LEFT JOIN knowledge75.published_revisions p ON p.kind=r.kind AND p.id=r.id AND p.revision=r.revision WHERE ${conditions.join(" AND ")} ORDER BY r.id`,values)).rows;
      const result:KnowledgeThemePage={themes:[]};
      for(const candidate of candidates){
        try{const resolved=await resolvePublicKnowledgeTheme(c,candidate.id,Number(candidate.revision));const {theme,snapshot}=resolved;result.themes.push({id:theme.id,revision:theme.revision,title:theme.content.title,description:theme.content.description,initialView:theme.content.initialView,hasTimeline:snapshot.records.some(r=>r.content.times.length>0),hasRelations:snapshot.records.some(r=>r.content.kind==='relation'),publishedAt:new Date(candidate.first_created_at).toISOString(),entityIds:snapshot.entities.map(e=>e.id),presentationIntros:Object.fromEntries((["ja","en"] as const).flatMap(locale=>{const p=themeReadingPresentation(theme,locale,snapshot);return p?[[locale,{hook:p.hook,lead:p.lead}]]:[]})),presentationImages:Object.fromEntries((["ja","en"] as const).flatMap(locale=>{const image=themeReadingPresentation(theme,locale,snapshot)?.image;return image?[[locale,image]]:[]}))});}
        catch(error){if(error instanceof KnowledgeError && (error.status===403||error.status===404))continue;throw error;}
      }
      // Include optional display text in the same catalogue response, including SSR.
      // Original title/description and pins remain unchanged for authoring consumers.
      const targets:KnowledgeTextTarget[]=result.themes.flatMap(t=>[{kind:'theme',id:t.id,revision:t.revision,field:'title'},{kind:'theme',id:t.id,revision:t.revision,field:'description'}]);
      const translations=(await Promise.all(['ja','en'].map(language=>publicDisplayTranslations(c,targets,language)))).flat();
      for(const theme of result.themes){const rows=translations.filter(t=>(t.displayTarget??t.target).id===theme.id&&(t.displayTarget??t.target).revision===theme.revision);if(rows.length)theme.translations=rows;}
      if(q.q)result.themes=result.themes.filter(t=>normalize([t.title,t.description,...(t.translations??[]).map(v=>v.text)].join(' ')).includes(normalize(q.q)));
      result.themes=result.themes.filter(t=>q.kind==='all'||(t.hasTimeline?'timeline':t.hasRelations?'graph':'context')===q.kind);
      result.themes.sort((a,b)=>q.order==='name'?knowledgeDisplayText(a.translations,{kind:'theme',id:a.id,revision:a.revision,field:'title'},q.language,a.title).localeCompare(knowledgeDisplayText(b.translations,{kind:'theme',id:b.id,revision:b.revision,field:'title'},q.language,b.title),q.language)||a.id.localeCompare(b.id):(b.publishedAt??'').localeCompare(a.publishedAt??'')||a.id.localeCompare(b.id));
      return {...result,...(q.entityId?{focusIds}:{})};
    }),
    theme:(raw:unknown)=>read(async c=>{
      const q=knowledgeThemeReadQuerySchema.parse(raw);
      let resolved;
      try{resolved=await resolvePublicKnowledgeTheme(c,q.themeId,q.revision);}
      catch(error){if(error instanceof KnowledgeError && (error.status===403||error.status===404))throw new KnowledgeError("このテーマは閲覧できません",404,"NOT_FOUND");throw error;}
      const {snapshot}=resolved;
      const links=(await c.query("SELECT * FROM knowledge75.legacy_links WHERE record_id=ANY($1::text[]) ORDER BY dataset,legacy_claim_id",[snapshot.records.map(r=>r.id)])).rows;
      const records=snapshot.records.map(record=>{
        const link=links.find(l=>l.record_id===record.id);
        if(link&&knowledgeDigest(link.payload)!==link.sha256)throw new KnowledgeError("旧原本のhashが一致しません",503,"LEGACY_HASH_MISMATCH");
        return buildKnowledgePublishedRecord(record,{entities:snapshot.entities,sources:snapshot.sources,mappings:snapshot.mappings,...(link?{legacyLink:{dataset:link.dataset,legacyClaimId:link.legacy_claim_id,recordId:link.record_id,importedRevision:Number(link.imported_revision),payload:link.payload,sha256:link.sha256}}:{})});
      });
      return {...resolved,records,presentation:themeReadingPresentation(resolved.theme,q.language??"ja",snapshot),...(q.language?{displayTranslations:await publicThemeSnapshotTranslations(c,resolved,q.language)}:{})} satisfies KnowledgeThemeRead;
    }),
    entities:(raw:unknown={})=>read(async c=>{
      const q=knowledgeEntityQuerySchema.parse(raw);const cursor=decodeCursor(q.cursor);const actual=await generation(c,q.generation??cursor?.generation);
      const identities=await searchEntityIds(c,q.q,actual.id),aroundIds=q.aroundId?await identityGroup(c,[q.aroundId],actual.id):null;
      const filter=knowledgeDigest({kind:"entities",...q,cursor:undefined,generation:undefined,q:normalize(q.q),identities,aroundIds});
      if(cursor&&(cursor.generation!==actual.id||cursor.filter!==filter))throw new KnowledgeError("対象の検索条件と続きの取得条件が一致しません",400,"CURSOR_MISMATCH");
      const values:unknown[]=[actual.id,cursor?.after??""];const conditions=["e.generation=$1","e.id>$2","o.visibility='public'","p.id IS NOT NULL"];
      if(q.entityId){values.push(q.entityId);conditions.push(`e.id=$${values.length}`);}
      if(q.entityIds){values.push(q.entityIds);conditions.push(`e.id=ANY($${values.length}::text[])`);}
      if(q.kind){values.push(knowledgeSearchKinds(q.kind));conditions.push(`e.body#>>'{content,kind}'=ANY($${values.length}::text[])`);}
      if(q.scopeIds){values.push(q.scopeIds);conditions.push(`e.id=ANY($${values.length}::text[])`);}
      if(q.predicates||q.roleId||aroundIds){
        const relation=[`r.generation=e.generation`,`(r.subject_id=e.id OR r.object_id=e.id)`,readableSql()];
        if(q.predicates){values.push(q.predicates);relation.push(`r.predicate=ANY($${values.length}::text[])`);}
        if(q.roleId){values.push(q.roleId);relation.push(`r.predicate='CONTRIBUTED_TO' AND r.role_id=$${values.length}`);}
        if(aroundIds){values.push(aroundIds);relation.push(`(r.subject_id=ANY($${values.length}::text[]) OR r.object_id=ANY($${values.length}::text[]))`);}
        conditions.push(`EXISTS(SELECT 1 FROM knowledge75.publication_records r WHERE ${relation.join(' AND ')})`);
      }
      if(q.q){values.push("%"+normalize(q.q).replace(/[\\%_]/g,"\\$&")+"%");const textIndex=values.length;values.push(identities);conditions.push(`(lower(normalize(concat_ws(' ',e.body#>>'{content,name}',(e.body#>'{content,aliases}')::text),NFKC)) LIKE $${textIndex} ESCAPE E'\\\\' OR e.id=ANY($${values.length}::text[]))`);}
      values.push(q.limit+1);
      const rows=(await c.query(`SELECT e.id,e.body FROM knowledge75.publication_entities e LEFT JOIN knowledge75.objects o ON o.kind='entity' AND o.id=e.id LEFT JOIN knowledge75.published_revisions p ON p.kind='entity' AND p.id=e.id AND p.revision=e.revision WHERE ${conditions.join(" AND ")} ORDER BY e.id LIMIT $${values.length}`,values)).rows;
      const hasMore=rows.length>q.limit;const selected=rows.slice(0,q.limit);
      return {generation:actual.id,entities:selected.map(r=>r.body as KnowledgeEntityVersion),hasMore,nextCursor:hasMore?encodeCursor({v:1,generation:actual.id,filter,after:selected.at(-1)!.id}):null} satisfies KnowledgeEntityPage;
    }),
    search:(raw:unknown)=>read(async c=>{
      const q=knowledgePublicationQuerySchema.parse(raw);const cursor=decodeCursor(q.cursor);const actual=await generation(c,q.generation??cursor?.generation);
      const identities=await searchEntityIds(c,q.q,actual.id),entityIds=q.entityId?await identityGroup(c,[q.entityId],actual.id):null,aroundIds=q.aroundId?await identityGroup(c,[q.aroundId],actual.id):null;
      const {cursor:_cursor,generation:_generation,...filters}=q;void _cursor;void _generation;
      const filter=knowledgeDigest({kind:"search",...filters,q:normalize(q.q??""),identities,entityIds,aroundIds});
      if(cursor&&(cursor.generation!==actual.id||cursor.filter!==filter))throw new KnowledgeError("検索条件と続きの取得条件が一致しません",400,"CURSOR_MISMATCH");
      const values:unknown[]=[actual.id,cursor?.after??""];const where=["r.generation=$1","r.id>$2",readableSql()];
      const equal=(column:string,v:unknown)=>{if(v!==undefined&&v!==""){values.push(v);where.push(`r.${column}=$${values.length}`);}};
      if(q.q){values.push("%"+normalize(q.q).replace(/[\\%_]/g,"\\$&")+"%");const textIndex=values.length;values.push(identities);where.push(`(r.search_text LIKE $${textIndex} ESCAPE E'\\\\' OR r.subject_id=ANY($${values.length}::text[]) OR r.object_id=ANY($${values.length}::text[]))`);}
      if(entityIds){values.push(entityIds);where.push(`(r.subject_id=ANY($${values.length}::text[]) OR r.object_id=ANY($${values.length}::text[]))`);}
      for(const ids of [aroundIds,q.scopeIds])if(ids){values.push(ids);where.push(`(r.subject_id=ANY($${values.length}::text[]) OR r.object_id=ANY($${values.length}::text[]))`);}
      if(q.entityKind){values.push(knowledgeSearchKinds(q.entityKind));where.push(`EXISTS(SELECT 1 FROM knowledge75.publication_entities e WHERE e.generation=r.generation AND e.id IN(r.subject_id,r.object_id) AND e.body#>>'{content,kind}'=ANY($${values.length}::text[]))`);}
      if(q.predicates){values.push(q.predicates);where.push(`r.predicate=ANY($${values.length}::text[])`);}
      for(const [column,v] of [["relation_label",q.relationLabel],["polarity",q.polarity],["concept_id",q.conceptId],["predicate",q.predicate],["role_id",q.roleId],["isbn13",q.isbn13],["organization_position_id",q.organizationPositionId],["event_role_id",q.eventRoleId],["event_id",q.eventId]] as const)equal(column,v);
      if(q.eventDay){values.push(q.eventDay);where.push(`r.event_from <= $${values.length}::date AND r.event_to >= $${values.length}::date`);}
      values.push(q.limit+1);const rows=(await c.query(`SELECT r.id,r.body FROM knowledge75.publication_records r WHERE ${where.join(" AND ")} ORDER BY r.id LIMIT $${values.length}`,values)).rows;
      const hasMore=rows.length>q.limit;const selected=rows.slice(0,q.limit);const records=selected.map(r=>r.body as KnowledgePublishedRecord);
      return {generation:actual.id,records,entities:distinctEntities(records),hasMore,nextCursor:hasMore?encodeCursor({v:1,generation:actual.id,filter,after:selected.at(-1)!.id}):null} satisfies KnowledgePublicationPage;
    }),
    facets:(raw:{generation?:string}={})=>read(async c=>{const q=z.strictObject({generation:generationSchema.optional()}).parse(raw);const actual=await generation(c,q.generation);const concepts=(await c.query(`SELECT DISTINCT r.concept_id AS id,r.body->'semantics'->'concept'->>'label' AS label FROM knowledge75.publication_records r WHERE r.generation=$1 AND r.concept_id IS NOT NULL AND ${readableSql()} ORDER BY id`,[actual.id])).rows as {id:string;label:string}[];const relations=(await c.query(`SELECT DISTINCT r.relation_label AS label FROM knowledge75.publication_records r WHERE r.generation=$1 AND ${readableSql()} ORDER BY label`,[actual.id])).rows;return {generation:actual.id,concepts,relationLabels:relations.map(r=>String(r.label))};}),
    translationById:(id:string,revision?:number)=>read(c=>readKnowledgeTranslationById(c,id,revision)),
    recordVersion:(id:string,revision:number)=>read(c=>readKnowledgeRecordVersion(c,{id,revision})),
    textOriginal:(target:KnowledgeTextTarget)=>read(c=>readKnowledgeTextOriginal(c,target,true)),
    textTranslation:(target:KnowledgeTextTarget,language:string,revision?:number)=>read(c=>readKnowledgeTranslation(c,target,language,revision)),
    displayTranslations:(raw:unknown)=>read(async c=>{
      const q=knowledgeDisplayTranslationsQuerySchema.parse(raw);
      return {translations:await publicDisplayTranslations(c,q.targets,q.language)};
    }),
    detail:(raw:{generation?:string;recordId:string})=>read(async c=>{const q=z.strictObject({generation:generationSchema.optional(),recordId:z.string().min(1).max(120)}).parse(raw);const actual=await generation(c,q.generation);const records=await allowedRows(c,actual.id,[q.recordId]);if(!records[0])throw new KnowledgeError("この記録は閲覧できません",404,"NOT_FOUND");return {generation:actual.id,record:records[0]};}),
    graph:(raw:{generation?:string;recordIds:string[]})=>read(async c=>{const q=z.strictObject({generation:generationSchema.optional(),recordIds:z.array(z.string().min(1).max(120)).max(200)}).parse(raw);const actual=await generation(c,q.generation);const records=await allowedRows(c,actual.id,[...new Set(q.recordIds)]);const sources=[...new Map(records.flatMap(r=>r.sources.map(s=>[pinKey("source",s.id,s.revision),s] as const))).values()];return {generation:actual.id,records,entities:distinctEntities(records),sources};}),
    entityScope:(raw:{generation?:string;ids:string[]})=>read(async c=>{
      const q=z.strictObject({generation:generationSchema.optional(),ids:z.array(z.string().min(1).max(120)).max(20000)}).parse(raw),actual=await generation(c,q.generation);
      const ids=await identityGroup(c,q.ids,actual.id);
      const rows=(await c.query(`SELECT DISTINCT endpoint.id FROM knowledge75.publication_records r CROSS JOIN LATERAL unnest(ARRAY[r.subject_id,r.object_id]) endpoint(id) WHERE r.generation=$1 AND (r.subject_id=ANY($2::text[]) OR r.object_id=ANY($2::text[])) AND endpoint.id IS NOT NULL AND ${readableSql()} ORDER BY endpoint.id LIMIT 20001`,[actual.id,ids])).rows.map(r=>r.id as string);
      const result=[...new Set([...ids,...rows])].sort();if(result.length>20000)throw new KnowledgeError('検索範囲が大きすぎます。名前で絞ってください',400,'SCOPE_TOO_LARGE');
      return {generation:actual.id,ids:result};
    }),
    neighbors:(raw:{generation?:string;entityId:string;direction?:"both"|"out"|"in";limit?:number;cursor?:string})=>read(async c=>{
      const q=z.strictObject({generation:generationSchema.optional(),entityId:z.string().min(1).max(120),direction:z.enum(["both","out","in"]).default("both"),limit:z.number().int().min(1).max(50).default(20),cursor:z.string().max(2048).optional()}).parse(raw);
      const cursor=decodeCursor(q.cursor);const actual=await generation(c,q.generation??cursor?.generation);const center=await entity(c,actual.id,q.entityId);
      const identityIds=await identityGroup(c,[q.entityId],actual.id);
      const filter=knowledgeDigest({kind:"neighbors",entityId:q.entityId,identityIds,direction:q.direction,limit:q.limit});if(cursor&&(cursor.generation!==actual.id||cursor.filter!==filter))throw new KnowledgeError("近傍条件と続きの取得条件が一致しません",400,"CURSOR_MISMATCH");
      // A zero degree is authoritative in the immutable public Record index.
      // Note-only subjects must not wait for a graph connection that cannot add
      // any result. Positive relation reads still verify their Neo4j generation.
      const endpoint=q.direction==='out'?'r.subject_id=ANY($2::text[])':q.direction==='in'?'r.object_id=ANY($2::text[])':'(r.subject_id=ANY($2::text[]) OR r.object_id=ANY($2::text[]))';
      const hasIndexedRelation=Boolean((await c.query(`SELECT 1 FROM knowledge75.publication_records r WHERE r.generation=$1 AND ${endpoint} AND r.id>$3 AND r.body#>>'{record,content,kind}'='relation' AND ${readableSql()} LIMIT 1`,[actual.id,identityIds,cursor?.after??''])).rowCount);
      if(!hasIndexedRelation)return {generation:actual.id,records:[],entities:[],center,hasMore:false,nextCursor:null};
      const denied=await deniedIds(c,actual.id);
      const ids=await graphRead(actual,async tx=>{const arrow=q.direction==="out"?"-[r:K75U2_REL]->":q.direction==="in"?"<-[r:K75U2_REL]-":"-[r:K75U2_REL]-";return (await tx.run(`MATCH (a:K75U2Entity {generation:$generation})${arrow}(b:K75U2Entity {generation:$generation}) WHERE a.id IN $ids AND r.generation=$generation AND r.recordId>$after AND NOT r.recordId IN $denied RETURN DISTINCT r.recordId AS id ORDER BY id LIMIT $limit`,{generation:actual.id,ids:identityIds,after:cursor?.after??"",denied,limit:neo4j.int(q.limit+1)})).records.map(r=>String(r.get("id")));});
      const hasMore=ids.length>q.limit;const selected=ids.slice(0,q.limit);const records=await allowedRows(c,actual.id,selected);
      return {generation:actual.id,records,entities:distinctEntities(records),center,hasMore,nextCursor:hasMore?encodeCursor({v:1,generation:actual.id,filter,after:selected.at(-1)!}):null};
    }),
    paths:(raw:{generation?:string;fromEntityId:string;toEntityId:string;maxDepth?:number;limit?:number})=>read(async c=>{
      const q=z.strictObject({generation:generationSchema.optional(),fromEntityId:z.string().min(1).max(120),toEntityId:z.string().min(1).max(120),maxDepth:z.number().int().min(1).max(4).default(3),limit:z.number().int().min(1).max(25).default(10)}).parse(raw);const actual=await generation(c,q.generation);const endpoints=await Promise.all([entity(c,actual.id,q.fromEntityId),entity(c,actual.id,q.toEntityId)]);
      // Validate the graph generation, then traverse its authoritative public Record
      // index with current identity transitions. Original endpoints stay unchanged.
      await graphRead(actual,async()=>undefined);
      const candidates=await readIdentityPaths(c,{generation:actual.id,from:q.fromEntityId,to:q.toEntityId,maxDepth:q.maxDepth,limit:q.limit,readableSql:readableSql()});
      const hasMore=candidates.length>q.limit;const selected=candidates.slice(0,q.limit);const records=await allowedRows(c,actual.id,[...new Set(selected.flatMap(p=>p.recordIds))]);const allowed=new Set(records.map(r=>r.record.id));return {generation:actual.id,paths:selected.filter(p=>p.recordIds.every(id=>allowed.has(id))),records,entities:[...new Map([...distinctEntities(records),...endpoints].map(e=>[e.id,e])).values()],hasMore,maxDepth:q.maxDepth};
    }),
  };
}
export type KnowledgePublicationService=ReturnType<typeof createKnowledgePublicationService>;
