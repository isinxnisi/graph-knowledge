import type {PoolClient} from 'pg';
import type {KnowledgeThemeResolved,KnowledgeThemeVersion} from '../domain/knowledge-foundation';
import type {KnowledgeDisplayTranslation} from '../domain/knowledge-translation';
import {translationTargetKey} from '../domain/knowledge-translation';
import {additiveThemeContent,hasThemeLocale,themeLocaleRequirements} from '../domain/theme-locale';
import {publicThemeSnapshotTranslations} from './knowledge-display-translations';
import {resolvePublicKnowledgeTheme,KnowledgeError} from './knowledge-foundation';
import {knowledgeDisplayText} from '../domain/knowledge-display';

/** Read-only language publication projection over persisted immutable editions.
 * The caller has already authorized the complete CURRENT theme. Never use this
 * for Capsules, explicit editions, authoring or general exploration reads. */
export async function resolveThemeLocalePublication(c:PoolClient,current:KnowledgeThemeResolved,language:string):Promise<{resolved:KnowledgeThemeResolved;displayTranslations:KnowledgeDisplayTranslation[];localeEdition?:{language:string;servedRevision:number;latestRevision:number;state:"translation-pending"}}>{
 const latestTranslations=await publicThemeSnapshotTranslations(c,current,language);
 const latest={resolved:current,displayTranslations:latestTranslations};
 if(language==='ja'||hasThemeLocale({...current,displayTranslations:latestTranslations},language))return latest;
 const history=(await c.query("SELECT revision,content,created_at FROM knowledge75.revisions WHERE kind='theme' AND id=$1 AND revision<$2 ORDER BY revision DESC",[current.theme.id,current.theme.revision])).rows;
 let next=current.theme;
 for(const row of history){
  if(Number(row.revision)!==next.revision-1||!additiveThemeContent(row.content,next.content))break;
  const transitionRevision=next.revision;
  next={id:current.theme.id,revision:Number(row.revision),content:row.content,createdAt:new Date(row.created_at).toISOString(),reason:''} as KnowledgeThemeVersion;
  let candidate:KnowledgeThemeResolved;
  try{candidate=await resolvePublicKnowledgeTheme(c,next.id,next.revision);}catch(error){if(error instanceof KnowledgeError&&[403,404,410].includes(error.status))break;throw error;}
  // An explicit correction of an original must not be hidden by a stale edition.
  const pins=[...candidate.snapshot.records.map(v=>({kind:'record',id:v.id,revision:v.revision})),...candidate.snapshot.entities.map(v=>({kind:'entity',id:v.id,revision:v.revision})),...candidate.snapshot.sources.map(v=>({kind:'source',id:v.id,revision:v.revision}))];
  if((await c.query("SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS p(kind text,id text,revision integer) JOIN knowledge75.objects o USING(kind,id) WHERE o.current_revision>p.revision LIMIT 1",[JSON.stringify(pins)])).rowCount)break;
  const translations=await publicThemeSnapshotTranslations(c,candidate,language);
  const slots=new Set(translations.filter(t=>(t.displayTarget??t.target).kind==='theme').map(t=>translationTargetKey({...t.displayTarget??t.target,revision:1})));
  const hidden=(await c.query("SELECT target FROM knowledge75.text_translation_heads WHERE language=$1 AND visibility<>'public' AND target->>'kind'='theme' AND target->>'id'=$2 AND (target->>'revision')::integer BETWEEN $3 AND $4",[language,next.id,next.revision,current.theme.revision])).rows;
  if(hidden.some(h=>slots.has(translationTargetKey({...h.target,revision:1}))))break;
  if(!hasThemeLocale({...candidate,displayTranslations:translations},language))continue;
  // Prove this was an available language edition before the next composition,
  // rather than manufacturing an initial English page from late partial work.
  const required=themeLocaleRequirements(candidate,language).filter(r=>!r.native);
  const used=required.map(r=>translations.find(t=>translationTargetKey(t.displayTarget??t.target)===translationTargetKey(r.target))!);
  const first=(await c.query("SELECT id,min(created_at)<=(SELECT created_at FROM knowledge75.revisions WHERE kind='theme' AND id=$2 AND revision=$3) AS existed FROM knowledge75.text_translation_revisions WHERE id=ANY($1::text[]) GROUP BY id",[used.map(t=>t.id),current.theme.id,transitionRevision])).rows;
  if(used.some(t=>!first.some(f=>f.id===t.id&&f.existed===true)))continue;
  return {resolved:candidate,displayTranslations:translations,localeEdition:{language,servedRevision:next.revision,latestRevision:current.theme.revision,state:'translation-pending' as const}};
 }
 return latest;
}
export function themeLocaleTitle(value:{theme:KnowledgeThemeVersion;displayTranslations?:KnowledgeDisplayTranslation[]},language:string){const t=value.theme;return knowledgeDisplayText(value.displayTranslations,{kind:'theme',id:t.id,revision:t.revision,field:'title'},language,t.content.title);}
