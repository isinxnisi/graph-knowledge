import {themeEditorialImageIds} from '../domain/theme-editorial';
import type {PoolClient,Pool} from 'pg';
import {KnowledgeError} from './knowledge-foundation';
import {operatorThemeRead,withOperatorThemeRead} from './knowledge-theme-access';
import {publicDisplayTranslations} from './knowledge-display-translations';
import {themeTimelineTextTargets} from '../domain/knowledge-timeline-text';
import {translationTargetKey,type KnowledgeDisplayTranslation,type KnowledgeTextTarget} from '../domain/knowledge-translation';
import type {KnowledgeThemeVersion} from '../domain/knowledge-foundation';

export async function themePublicationRevision(c:PoolClient,id:string,requested?:number){
 const row=(await c.query("SELECT h.published_revision FROM knowledge75.theme_publications h JOIN knowledge75.objects o ON o.kind='theme' AND o.id=h.theme_id WHERE h.theme_id=$1 AND o.visibility='public'",[id])).rows[0];
 if(!row?.published_revision)throw new KnowledgeError('このテーマは閲覧できません',404,'NOT_FOUND');
 const revision=requested??Number(row.published_revision);
 if(!(await c.query('SELECT 1 FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2',[id,revision])).rowCount)throw new KnowledgeError('このテーマ版は一般公開されていません',404,'NOT_FOUND');
 return revision;
}
export async function themeRevisionPublic(c:PoolClient,id:string,revision:number){try{await themePublicationRevision(c,id,revision);return true;}catch(e){if(e instanceof KnowledgeError&&e.status===404)return false;throw e;}}
export async function themePublicationState(c:Pool|PoolClient,id:string){const r=(await c.query("SELECT o.current_revision,h.published_revision,h.release_id,(h.published_revision IS NULL OR h.published_revision<>o.current_revision OR h.draft_updated_at>h.updated_at) AS working_changes FROM knowledge75.objects o JOIN knowledge75.theme_publications h ON h.theme_id=o.id WHERE o.kind='theme' AND o.id=$1",[id])).rows[0];if(!r)throw new KnowledgeError('テーマがありません',404,'NOT_FOUND');return {state:r.published_revision?'published' as const:'private' as const,publishedRevision:r.published_revision?Number(r.published_revision):null,workingRevision:Number(r.current_revision),releaseId:r.release_id??null,workingChanges:r.working_changes===true};}
export async function capturedThemeTranslations(c:PoolClient,theme:KnowledgeThemeVersion){
 if(!(await c.query("SELECT to_regclass('knowledge75.text_translation_heads') AS ready")).rows[0].ready)return [];
 const targets:KnowledgeTextTarget[]=[{kind:'theme',id:theme.id,revision:theme.revision,field:'title'},...(theme.content.description?[{kind:'theme' as const,id:theme.id,revision:theme.revision,field:'description' as const}]:[]),...themeTimelineTextTargets(theme)];
 return withOperatorThemeRead(async()=>(await Promise.all(['ja','en'].map(locale=>publicDisplayTranslations(c,targets,locale)))).flat());
}
/** Freeze only when editing starts; migration preserves legacy display semantics. */
export async function freezeThemeReleases(c:PoolClient,id:string){
 const rows=(await c.query("SELECT r.* FROM knowledge75.theme_releases p JOIN knowledge75.revisions r ON r.kind='theme' AND r.id=p.theme_id AND r.revision=p.revision WHERE p.theme_id=$1 AND p.theme_translations IS NULL ORDER BY r.revision",[id])).rows;
 for(const r of rows){const t={id,revision:Number(r.revision),content:r.content,createdAt:new Date(r.created_at).toISOString(),reason:r.reason} as KnowledgeThemeVersion;const translations=JSON.stringify(await capturedThemeTranslations(c,t));await c.query('UPDATE knowledge75.theme_releases SET theme_translations=$3 WHERE theme_id=$1 AND revision=$2 AND theme_translations IS NULL',[id,t.revision,translations]);await c.query("INSERT INTO knowledge75.theme_release_approvals(release_id,theme_id,revision,theme_translations,image_ids) SELECT $3,theme_id,revision,theme_translations,image_ids FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2 ON CONFLICT DO NOTHING",[id,t.revision,'legacy:'+id+'@'+t.revision]);}
}
/** null means unchanged legacy policy; [] is an explicit absence of approved translations. */
export async function approvedThemeTranslations(c:PoolClient,target:KnowledgeTextTarget,language:string):Promise<KnowledgeDisplayTranslation[]|null>{
 if(operatorThemeRead())return null;
 await themePublicationRevision(c,target.id,target.revision);
 const r=(await c.query('SELECT theme_translations FROM knowledge75.theme_releases WHERE theme_id=$1 AND revision=$2',[target.id,target.revision])).rows[0];
 if(r.theme_translations===null)return null;
 const rows=(r.theme_translations as KnowledgeDisplayTranslation[]).filter(t=>t.language===language&&translationTargetKey(t.displayTarget??t.target)===translationTargetKey(target));
 const ids=rows.map(t=>t.id),visible=new Set((await c.query("SELECT id FROM knowledge75.text_translation_heads WHERE id=ANY($1::text[]) AND visibility='public'",[ids])).rows.map(r=>r.id));
 return rows.filter(t=>visible.has(t.id));
}

/** Called with the common knowledge writer lock held. The release row serves
 * the latest approval of an edition; approvals retain each exact snapshot. */
export async function writeEditorialThemeRelease(c:PoolClient,theme:KnowledgeThemeVersion,releaseId:string,proof:unknown,translations:KnowledgeDisplayTranslation[]){
 const images=themeEditorialImageIds(theme.content.reading);
 const values=[theme.id,theme.revision,releaseId,JSON.stringify(proof),JSON.stringify(translations),JSON.stringify(images)];
 await c.query(`INSERT INTO knowledge75.theme_releases(theme_id,revision,release_id,proof,theme_translations,image_ids)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(theme_id,revision) DO UPDATE
  SET release_id=EXCLUDED.release_id,proof=EXCLUDED.proof,theme_translations=EXCLUDED.theme_translations,image_ids=EXCLUDED.image_ids,approved_at=clock_timestamp()`,values);
 await c.query('INSERT INTO knowledge75.theme_release_approvals(theme_id,revision,release_id,proof,theme_translations,image_ids) VALUES($1,$2,$3,$4,$5,$6)',values);
 await c.query('UPDATE knowledge75.theme_publications SET published_revision=$2,release_id=$3,updated_at=clock_timestamp() WHERE theme_id=$1',[theme.id,theme.revision,releaseId]);
}
