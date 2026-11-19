import type {PoolClient,Pool} from 'pg';
import {knowledgeOriginalText,translationTargetKey,type KnowledgeDisplayTranslation} from '../domain/knowledge-translation';
import type {KnowledgeThemeContent,KnowledgeThemeVersion} from '../domain/knowledge-foundation';
import {KnowledgeError,knowledgeDigest} from './knowledge-foundation';
import {capturedThemeTranslations,freezeThemeReleases} from './knowledge-theme-publication';

export type PublishedThemeBase={revision:number|null;releaseId:string|null};
export type OrdinaryThemeEdit={base:PublishedThemeBase;replaceDraftRevision?:number};
type ReconciledField='title'|'description'|'initialView'|'textLanguages'|'recordPins'|'timeline'|'stories'|'reading'|'productPins'|'translations';
export type ThemeEdit={ordinary:OrdinaryThemeEdit}|{reconcile:PublishedThemeBase&{supersede?:ReconciledField[]}};

export function samePublishedBase(a:PublishedThemeBase,b:PublishedThemeBase){
 return a.revision===b.revision&&a.releaseId===b.releaseId;
}

export async function themeEditions(c:Pool|PoolClient,id:string){
 const r=(await c.query(`SELECT h.published_revision,h.release_id,h.production_conflict,o.current_revision,o.visibility,
   (o.current_revision IS DISTINCT FROM h.published_revision OR h.draft_updated_at>h.updated_at) AS working_changes,
   d.revision AS draft_revision,d.base_revision,d.base_release_id
  FROM knowledge75.theme_publications h
  JOIN knowledge75.objects o ON o.kind='theme' AND o.id=h.theme_id
  LEFT JOIN knowledge75.theme_operator_drafts d ON d.theme_id=h.theme_id
  WHERE h.theme_id=$1`,[id])).rows[0];
 if(!r||r.visibility!=='public')throw new KnowledgeError('テーマがありません',404,'NOT_FOUND');
 const published:PublishedThemeBase={revision:r.published_revision,releaseId:r.release_id};
 const draft=r.draft_revision?{revision:r.draft_revision,base:{revision:r.base_revision,releaseId:r.base_release_id} as PublishedThemeBase}:null;
 return {published,draft,workingRevision:r.current_revision as number,workingChanges:r.working_changes===true,productionConflict:r.production_conflict as PublishedThemeBase|null};
}

export async function ordinaryThemeBaseline(c:Pool|PoolClient,id:string,revision:number,edit:OrdinaryThemeEdit){
 const state=await themeEditions(c,id);
 const draft=state.draft;
 if(!samePublishedBase(state.published,edit.base))throw new KnowledgeError('公開版が変わりました。現在の公開版と通常編集の差分を照合してください。',409,'THEME_PUBLICATION_CONFLICT');
 const staleDraft=edit.replaceDraftRevision!==undefined?draft?.revision!==edit.replaceDraftRevision:draft&&!samePublishedBase(draft.base,edit.base);
 const target=edit.replaceDraftRevision===undefined&&draft?draft.revision:state.published.revision;
 if(staleDraft||target!==revision)throw new KnowledgeError('通常編集の対象版が変わりました。公開版または通常の作業版を読み直してください。',409,'REVISION_CONFLICT');
 return {fromRelease:revision===state.published.revision,base:state.published};
}

export async function nextThemeRevision(c:PoolClient,id:string){
 return (await c.query("SELECT coalesce(max(revision),0)+1 AS next FROM knowledge75.revisions WHERE kind='theme' AND id=$1",[id])).rows[0].next as number;
}

export async function recordThemeParent(c:PoolClient,id:string,revision:number,parent:number|null,inherited?:KnowledgeDisplayTranslation[]){
 await c.query('INSERT INTO knowledge75.theme_editorial_lineage(theme_id,revision,parent_revision,inherited_translations) VALUES($1,$2,$3,$4)',[id,revision,parent,inherited===undefined?null:JSON.stringify(inherited)]);
}

export async function saveOrdinaryThemeDraft(c:PoolClient,id:string,revision:number,base:PublishedThemeBase){
 await c.query(`INSERT INTO knowledge75.theme_operator_drafts(theme_id,revision,base_revision,base_release_id) VALUES($1,$2,$3,$4)
  ON CONFLICT(theme_id) DO UPDATE SET revision=EXCLUDED.revision,base_revision=EXCLUDED.base_revision,base_release_id=EXCLUDED.base_release_id`,[id,revision,base.revision,base.releaseId]);
}

export async function inheritedThemeTranslations(c:PoolClient,id:string,revision:number){
 await freezeThemeReleases(c,id);
 const result=await c.query('SELECT theme_translations FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2',[id,revision]);
 return (result.rows[0]?.theme_translations??[]) as KnowledgeDisplayTranslation[];
}

/** An explicit reconciliation may supersede a named public change. Unlisted
 * changes must still match the current public edition before writing. */
export async function reconcileThemeEdition(c:PoolClient,working:KnowledgeThemeVersion,content:KnowledgeThemeContent,nextRevision:number,oldRelease:PublishedThemeBase,newRelease:PublishedThemeBase,supersede:ReconciledField[]){
 const get=async(revision:number|null)=>(await c.query("SELECT content FROM knowledge75.revisions WHERE kind='theme' AND id=$1 AND revision=$2",[working.id,revision])).rows[0]?.content as KnowledgeThemeContent|undefined;
 const previous=await get(oldRelease.revision),current=await get(newRelease.revision);
 if(!previous||!current||!oldRelease.revision||!newRelease.revision)throw new KnowledgeError('制作と公開の比較元を確認できません。',409,'THEME_PUBLICATION_CONFLICT');
 const fields=['title','description','initialView','textLanguages','recordPins','timeline','stories','reading','productPins'] as const;
 const equal=(a:unknown,b:unknown)=>knowledgeDigest(a??null)===knowledgeDigest(b??null);
 const missing=fields.filter(field=>!supersede.includes(field)&&!equal(previous[field],current[field])&&!equal(content[field],current[field]));
 if(missing.length)throw new KnowledgeError('後から公開された変更を取り込むか、置き換える項目を明示してください: '+missing.join(', '),409,'THEME_PUBLICATION_CONFLICT');
 const slot=(t:KnowledgeDisplayTranslation)=>t.language+':'+translationTargetKey({...t.displayTarget??t.target,revision:1});
 const edits=new Map((await capturedThemeTranslations(c,working)).map(t=>[slot(t),t]));
 if(!supersede.includes('translations')){
  const before=new Map((await inheritedThemeTranslations(c,working.id,oldRelease.revision)).map(t=>[slot(t),t]));
  const after=new Map((await inheritedThemeTranslations(c,working.id,newRelease.revision)).map(t=>[slot(t),t]));
  for(const key of new Set([...before.keys(),...after.keys()])){
   const a=before.get(key),b=after.get(key);
   if(a?.id===b?.id&&a?.revision===b?.revision)continue;
   if(b)edits.set(key,b);else edits.delete(key);
  }
 }
 return [...edits.values()].flatMap(t=>{
  const target={...(t.displayTarget??t.target),revision:nextRevision};
  try{return knowledgeOriginalText(target,content).text===t.originalText?[{...t,displayTarget:target}]:[];}catch{return [];}
 });
}

/** Bind a case and switch the ordinary release in a consistent order across
 * both databases. This locks only short transactions for this one Theme. */
export async function lockThemeCaseBinding(c:PoolClient,id:string){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['theme-editorial-binding:'+id]);
}

/** Pre-migration versions used consecutive numbers, except for collection's
 * explicit provenance. A detached edition always records its actual parent. */
export async function readThemeLineage(c:PoolClient,id:string,revision:number,stopAtInherited=false){
 return (await c.query(`WITH RECURSIVE lineage(revision) AS (
  SELECT $2::integer UNION ALL
  SELECT CASE WHEN e.revision IS NOT NULL THEN e.parent_revision ELSE COALESCE(k.parent_revision,l.revision-1) END
  FROM lineage l
  LEFT JOIN knowledge75.theme_knowledge_revisions k ON k.theme_id=$1 AND k.revision=l.revision
  LEFT JOIN knowledge75.theme_editorial_lineage e ON e.theme_id=$1 AND e.revision=l.revision
  WHERE l.revision>1 AND (NOT $3::boolean OR e.inherited_translations IS NULL)
 ) SELECT r.revision,r.content,r.created_at,e.inherited_translations FROM lineage l
  JOIN knowledge75.revisions r ON r.kind='theme' AND r.id=$1 AND r.revision=l.revision
  LEFT JOIN knowledge75.theme_editorial_lineage e ON e.theme_id=$1 AND e.revision=r.revision
  ORDER BY r.revision DESC`,[id,revision,stopAtInherited])).rows;
}
