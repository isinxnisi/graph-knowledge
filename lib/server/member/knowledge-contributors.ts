import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {Pool,PoolClient,QueryResultRow} from "pg";
import {z} from "zod";
import {knowledgeIdSchema} from "../../domain/knowledge-foundation";
import {publicHandleSchema} from "../../domain/public-profile";
import {publicProfileImage} from "../../domain/profile-image";
import {knowledgePublicationPreview} from "../knowledge-publication-preview";
import {knowledgeReadGuard} from "../knowledge-read-runtime";
import {publicProfilesEnabled} from "./public-profiles";
import {MemberError,memberJson} from "./http";
export async function ensurePublicationContributorSchema(pool:Pool){
 const checksum=createHash('sha256').update(await readFile(path.join(process.cwd(),'db/member/025-knowledge-contributors.sql'))).digest('hex');
 if((await pool.query("SELECT checksum FROM member_migration WHERE name='025-knowledge-contributors.sql'")).rows[0]?.checksum!==checksum)throw new MemberError(503,'MIGRATION_REQUIRED');
}
type ContributorInput={decisionId:string;ownerId:string;attribution:'profile'|'anonymous';recordId:string;submissionId:string;submissionRevision:number;operation:string;entityIds:string[];themeIds:string[]};
export async function persistPublicationContributor(c:PoolClient,v:ContributorInput){
 await c.query(`INSERT INTO member_knowledge.publication_contributors(decision_id,owner_id,submission_id,submission_revision,attribution,activity_public,record_id,operation,entity_ids,theme_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(decision_id) DO NOTHING`,[v.decisionId,v.ownerId,v.submissionId,v.submissionRevision,v.attribution,v.attribution==='profile',v.recordId,v.operation,v.entityIds,v.themeIds]);
 const row=(await c.query('SELECT * FROM member_knowledge.publication_contributors WHERE decision_id=$1',[v.decisionId])).rows[0];
 if(!row||row.owner_id!==v.ownerId||row.submission_id!==v.submissionId||row.submission_revision!==v.submissionRevision||row.attribution!==v.attribution||row.record_id!==v.recordId||row.operation!==v.operation||JSON.stringify(row.entity_ids)!==JSON.stringify(v.entityIds)||JSON.stringify(row.theme_ids)!==JSON.stringify(v.themeIds))throw new MemberError(409,'CONTRIBUTION_CONFLICT');
}
export async function finalizePublicationContributor(c:PoolClient,id:string,result:{id:string;revision:number}){
 const row=(await c.query('SELECT record_id,record_revision FROM member_knowledge.publication_contributors WHERE decision_id=$1 FOR UPDATE',[id])).rows[0];
 // Decisions accepted before attribution existed have no author; never guess one.
 if(!row)return;
 if(row.record_id!==result.id||row.record_revision!==null&&row.record_revision!==result.revision)throw new MemberError(409,'CONTRIBUTION_CONFLICT');
 await c.query('UPDATE member_knowledge.publication_contributors SET record_revision=$2,published_at=COALESCE(published_at,clock_timestamp()) WHERE decision_id=$1',[id,result.revision]);
}
const query=z.strictObject({kind:z.enum(['record','entity','theme','profile']).default('record'),id:knowledgeIdSchema.optional(),handle:publicHandleSchema.optional(),revision:z.coerce.number().int().positive().optional(),cursor:z.string().max(1000).optional()});
const columns=`SELECT c.*,to_char(c.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS published_time,p.handle,p.display_name,p.icon,p.official,u.image AS provider_image,u.active FROM member_knowledge.publication_contributors c LEFT JOIN "user" u ON u.id=c.owner_id LEFT JOIN public_profile p ON p.user_id=u.id`;
function dto(r:QueryResultRow){const visible=publicProfilesEnabled()&&r.attribution==='profile'&&r.active===true&&r.handle;return {id:r.decision_id,recordId:r.record_id,revision:r.record_revision,operation:r.operation,publishedAt:r.published_time,anonymous:r.attribution==='anonymous',person:visible?{handle:r.handle,displayName:r.display_name,icon:r.icon,official:!!r.official,imageUrl:publicProfileImage(r.icon,r.provider_image)}:null};}
export function createKnowledgeContributors(pool:Pool){
 return {async read(request:Request){
  knowledgeReadGuard(request);const v=query.parse(Object.fromEntries(new URL(request.url).searchParams));
  const unavailable=()=>memberJson({available:false,activities:[],nextCursor:null});
  const ready=(await pool.query("SELECT to_regclass('member_knowledge.publication_contributors') IS NOT NULL AS ready")).rows[0]?.ready;
  if(!ready)return v.kind==='profile'?unavailable():memberJson({contributors:[]});
  const knowledge=await knowledgePublicationPreview();
  if(v.kind==='profile'){
   if(!v.handle)throw new MemberError(400,'INVALID_ARGUMENT');
   const profile=(await pool.query('SELECT p.user_id FROM public_profile p JOIN "user" u ON u.id=p.user_id WHERE p.handle=$1 AND u.active=true AND p.timeline_public=true',[v.handle])).rows[0];
   if(!profile||!publicProfilesEnabled())return unavailable();
   let before:{time:string;id:string}|null=null;
   if(v.cursor){try{before=z.object({handle:z.literal(v.handle),time:z.string().datetime({offset:true}),id:z.uuidv4()}).parse(JSON.parse(Buffer.from(v.cursor,'base64url').toString()));}catch{throw new MemberError(400,'INVALID_CURSOR');}}
   const rows=(await pool.query(columns+` WHERE c.owner_id=$1 AND c.activity_public AND c.attribution='profile' AND c.published_at IS NOT NULL AND ($2::timestamptz IS NULL OR (c.published_at,c.decision_id)<($2::timestamptz,$3::uuid)) ORDER BY c.published_at DESC,c.decision_id DESC LIMIT 21`,[profile.user_id,before?.time??null,before?.id??null])).rows;
   const page=rows.slice(0,20);
   // One normal public KG read applies current visibility and dependency gates.
   // An accepted member-side receipt alone does not grant public readability.
   const records=page.length?(await knowledge.graph({recordIds:[...new Set(page.map(r=>r.record_id as string))]})).records:[];
   const visible=new Map(records.map(r=>[r.record.id,r.record]));
   const fresh=(await pool.query(columns+` WHERE c.decision_id=ANY($1::uuid[]) AND c.owner_id=$2 AND c.activity_public AND c.attribution='profile' AND c.published_at IS NOT NULL`,[page.map(r=>r.decision_id),profile.user_id])).rows;
   // Recheck member privacy after the cross-database public read. No member
   // lock is held while waiting on the KG, and no provider identity is returned.
   if(!publicProfilesEnabled()||!(await pool.query('SELECT 1 FROM public_profile p JOIN "user" u ON u.id=p.user_id WHERE p.handle=$1 AND p.user_id=$2 AND u.active=true AND p.timeline_public=true',[v.handle,profile.user_id])).rowCount)return unavailable();
   const byId=new Map(fresh.map(r=>[r.decision_id,r]));
   const activities=page.flatMap(row=>{const r=byId.get(row.decision_id),record=visible.get(row.record_id);return r&&record&&record.revision>=r.record_revision?[{...dto(r),title:record.content.assertion,href:'/?krecord='+encodeURIComponent(r.record_id)}]:[];});
   const last=page.at(-1);return memberJson({available:true,activities,nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify({handle:v.handle,time:last.published_time,id:last.decision_id})).toString('base64url'):null});
  }
  if(!v.id)throw new MemberError(400,'INVALID_ARGUMENT');
  let selectedRevision=v.revision,themeRevision:number|undefined,themeRecords:Map<string,number>|null=null;
  const qualify=async()=>{
   if(v.kind==='record'){
    const value=(await knowledge.detail({recordId:v.id!})).record;if(selectedRevision&&selectedRevision>value.record.revision)throw new MemberError(404,'NOT_FOUND');selectedRevision??=value.record.revision;
   }else if(v.kind==='entity'){
    if(!(await knowledge.entities({entityId:v.id!,limit:1})).entities.some(e=>e.id===v.id))throw new MemberError(404,'NOT_FOUND');
   }else{
    const value=await knowledge.theme({themeId:v.id!,...(themeRevision??v.revision?{revision:themeRevision??v.revision}:{})});themeRevision=value.theme.revision;themeRecords=new Map(value.snapshot.records.map(r=>[r.id,r.revision]));
   }
  };
  await qualify();
  const condition=v.kind==='record'?'c.record_id=$1 AND c.record_revision<=$2':v.kind==='entity'?'$1=ANY(c.entity_ids)':'$1=ANY(c.theme_ids) AND c.record_id=ANY($2::text[])';
  const rows=(await pool.query(columns+` WHERE c.published_at IS NOT NULL AND ${condition} ORDER BY c.published_at,c.decision_id LIMIT 50`,v.kind==='record'?[v.id,selectedRevision]:v.kind==='theme'?[v.id,[...themeRecords!.keys()]]:[v.id])).rows;
  const records=rows.length?(await knowledge.graph({recordIds:[...new Set(rows.map(r=>r.record_id as string))]})).records:[];
  const visible=new Map(records.map(r=>[r.record.id,r.record.revision]));
  // The target can be withdrawn while we read the member DB. Repeat its
  // ordinary public qualification before projecting contributor information.
  await qualify();
  const fresh=(await pool.query(columns+` WHERE c.decision_id=ANY($1::uuid[]) AND c.published_at IS NOT NULL`,[rows.map(r=>r.decision_id)])).rows,byId=new Map(fresh.map(r=>[r.decision_id,r]));
  const contributors=rows.flatMap(row=>{const r=byId.get(row.decision_id);return r&&(visible.get(r.record_id)??0)>=r.record_revision&&(v.kind!=='theme'||(themeRecords?.get(r.record_id)??0)>=r.record_revision)?[dto(r)]:[];});
  return memberJson({contributors});
 }};
}
