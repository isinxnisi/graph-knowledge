import type {PoolClient} from 'pg';
import type {KnowledgePin,KnowledgeThemeContent,KnowledgeThemeVersion} from '../domain/knowledge-foundation';
import type {KnowledgeDisplayTranslation} from '../domain/knowledge-translation';
import {knowledgeOriginalText} from '../domain/knowledge-translation';
import {freezeThemeReleases} from './knowledge-theme-publication';
import {KnowledgeError} from './knowledge-foundation';

/** This is invoked inside accept-record's writer transaction, after source,
 * acceptance and actor checks. It is not a general publish operation. */
export async function applyAcceptedThemeKnowledge(c:PoolClient,input:{
 id:string;working:KnowledgeThemeVersion;record:KnowledgePin;actorId:string;requestId:string;
 read:(revision:number)=>Promise<KnowledgeThemeVersion>;
 append:(theme:KnowledgeThemeVersion)=>Promise<KnowledgeThemeContent>;
 put:(content:KnowledgeThemeContent,revision:number)=>Promise<KnowledgeThemeVersion>;
}){
 const {id,working,record}=input;
 const state=(await c.query('SELECT *,draft_updated_at>updated_at AS translation_draft FROM knowledge75.theme_publications WHERE theme_id=$1 FOR UPDATE',[id])).rows[0];
 const provenance=async(revision:number,parent:number,channel:'published'|'working')=>{
  await c.query('INSERT INTO knowledge75.theme_knowledge_revisions(theme_id,revision,parent_revision,channel,record_id,record_revision,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,revision,parent,channel,record.id,record.revision,input.actorId,input.requestId]);
 };
 const includes=(t:KnowledgeThemeVersion)=>t.content.recordPins.some(p=>p.id===record.id&&p.revision===record.revision);
 if(!state.published_revision){
  if(includes(working))return {revision:working.revision,changed:false};
  const next=await input.put(await input.append(working),working.revision+1);await provenance(next.revision,working.revision,'working');
  return {revision:next.revision,changed:true};
 }
 const published=await input.read(Number(state.published_revision));
 // Replays/new receipts for an already linked pin must not undo a deliberate
 // draft removal, or manufacture a new release/revision.
 if(includes(published))return {revision:published.revision,changed:false};
 await freezeThemeReleases(c,id);
 const next=await input.put(await input.append(published),working.revision+1);
 await provenance(next.revision,published.revision,'published');
 await releaseAcceptedThemeKnowledge(c,published,next,{actorId:input.actorId,requestId:input.requestId,record});
 if(working.revision!==published.revision){
  const basePin=published.content.recordPins.find(p=>p.id===record.id),draftPin=working.content.recordPins.find(p=>p.id===record.id);
  // Three-way merge: respect explicit removal/replacement of this pin in the
  // editorial draft. All other prose, stories, pins and timeline stay there.
  const diverged=basePin?.revision!==draftPin?.revision;
  const draft=await input.put(diverged?working.content:await input.append(working),next.revision+1);
  await provenance(draft.revision,working.revision,'working');
  return {revision:next.revision,changed:true};
 }
 // A pending translation of the same Theme edition is also editorial work.
 // It was not copied into the public release, and must remain pending.
 if(state.translation_draft)await c.query('UPDATE knowledge75.theme_publications SET draft_updated_at=clock_timestamp() WHERE theme_id=$1',[id]);
 return {revision:next.revision,changed:true};
}

/** Inherit ONLY the parent release's approved Theme translations and images.
 * Capturing global translation heads here would approve an unrelated draft. */
export async function releaseAcceptedThemeKnowledge(c:PoolClient,parent:KnowledgeThemeVersion,next:KnowledgeThemeVersion,accepted:{actorId:string;requestId:string;record:KnowledgePin}){
 const base=(await c.query('SELECT * FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2',[parent.id,parent.revision])).rows[0];
 if(!base||base.theme_translations===null)throw new KnowledgeError('公開元の固定情報が必要です',409,'PUBLICATION_PROOF_REQUIRED');
 const translations=(base.theme_translations as KnowledgeDisplayTranslation[]).flatMap(t=>{
  const target={...(t.displayTarget??t.target),revision:next.revision};
  try{const before=knowledgeOriginalText({...target,revision:parent.revision},parent.content),after=knowledgeOriginalText(target,next.content);
   return before.text===after.text&&JSON.stringify(before.language)===JSON.stringify(after.language)?[{...t,displayTarget:target}]:[];
  }catch{return [];}
 });
 const releaseId='knowledge:'+accepted.actorId+':'+accepted.requestId+':'+parent.id;
 const proof={kind:'accepted-knowledge-update',parentRevision:parent.revision,...accepted};
 await c.query('INSERT INTO knowledge75.theme_releases(theme_id,revision,release_id,proof,theme_translations,image_ids) VALUES($1,$2,$3,$4,$5,$6)',[next.id,next.revision,releaseId,JSON.stringify(proof),JSON.stringify(translations),JSON.stringify(base.image_ids)]);
 await c.query('INSERT INTO knowledge75.theme_release_approvals(release_id,theme_id,revision,proof,theme_translations,image_ids) VALUES($1,$2,$3,$4,$5,$6)',[releaseId,next.id,next.revision,JSON.stringify(proof),JSON.stringify(translations),JSON.stringify(base.image_ids)]);
 await c.query('UPDATE knowledge75.theme_publications SET published_revision=$2,release_id=$3,updated_at=clock_timestamp() WHERE theme_id=$1',[next.id,next.revision,releaseId]);
}

/** Follow only system-published knowledge edges; ordinary editorial revisions
 * have no such edge. Stop at the requested assessed edition (which may itself have knowledge ancestry),
 * and never claim that the old assessment evaluated newly added knowledge. */
export async function knowledgeReleaseBase(c:Pick<PoolClient,'query'>,id:string,revision:number,assessedRevision=1):Promise<number>{
 const rows=(await c.query(`WITH RECURSIVE ancestry(revision) AS (
  SELECT $2::integer UNION ALL SELECT k.parent_revision FROM ancestry a
  JOIN knowledge75.theme_knowledge_revisions k ON k.theme_id=$1 AND k.revision=a.revision AND k.channel='published'
  JOIN knowledge75.theme_releases r ON r.theme_id=k.theme_id AND r.revision=k.revision
  WHERE a.revision>$3
 ) SELECT min(revision)::integer AS revision FROM ancestry`,[id,revision,assessedRevision])).rows;
 return Number(rows[0].revision);
}
