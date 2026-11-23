import type {KnowledgeThemeRead} from './knowledge-theme-reader';
import {knowledgeDisplayText} from './knowledge-display';
import type {KnowledgeTextTarget} from './knowledge-translation';
/** The existing publication threshold, shared by canonical pages and their resolver. */
export function themeLocaleRequirements(value:Pick<KnowledgeThemeRead,'theme'|'snapshot'>,locale:string){
 const t=value.theme,timed=value.snapshot.records.filter(r=>r.content.times.length),bodies=timed.length?timed:value.snapshot.records;
 return [...(['title','description'] as const).filter(field=>field==='title'||!!t.content.description).map(field=>({target:{kind:'theme',id:t.id,revision:t.revision,field} as KnowledgeTextTarget,text:t.content[field],native:t.content.textLanguages?.[field]?.tag===locale})),...bodies.map(r=>({target:{kind:'record',id:r.id,revision:r.revision,field:'assertion'} as KnowledgeTextTarget,text:r.content.assertion,native:r.content.textLanguages?.assertion?.tag===locale}))];
}
export function missingThemeLocaleRequirements(value:Pick<KnowledgeThemeRead,'theme'|'snapshot'|'displayTranslations'>,locale:string){
 return locale==='ja'?[]:themeLocaleRequirements(value,locale).filter(r=>!r.native&&knowledgeDisplayText(value.displayTranslations,r.target,locale,r.text)===r.text).map(r=>r.target);
}
export function hasThemeLocale(value:Pick<KnowledgeThemeRead,'theme'|'snapshot'|'displayTranslations'>,locale:string){
 return locale==='ja'||!!value.theme.content.title&&missingThemeLocaleRequirements(value,locale).length===0;
}
/** Ordered additions only: no edits, removals, changed pins or edit/revert crossing. */
export function additiveThemeContent(previous:unknown,current:unknown):boolean{
 if(previous===null||typeof previous!=='object')return previous===current;
 if(Array.isArray(previous)){
  if(!Array.isArray(current))return false;let at=0;
  return previous.every(old=>{for(;at<current.length;at++)if(additiveThemeContent(old,current[at])){at++;return true;}return false;});
 }
 if(!current||typeof current!=='object'||Array.isArray(current))return false;
 return Object.entries(previous).every(([key,value])=>key==='readingBaseRevision'||key in current&&additiveThemeContent(value,(current as Record<string,unknown>)[key]));
}
