import {themeReadingPresentation} from "./theme-reading-presentation";
import {themeStoryEntries} from "../domain/theme-stories";
import {recordTimeTextTargets,themeTimelineTextTargets} from "../domain/knowledge-timeline-text";
import {knowledgeOriginalText} from "../domain/knowledge-translation";
import type {Pool} from 'pg';
import {createKnowledgeFoundationService,KnowledgeError} from './knowledge-foundation';
import {verifyKnowledgeReadSchema} from './knowledge-publication-preview';

/** The compose permission is checked by the caller; reads still use public
 * visibility/dependency gates, not the operator's private-data access. */
export function createThemeAuthoringReader(pool:Pool,origin:string){
 const foundation=createKnowledgeFoundationService(pool,{prepareSchema:()=>verifyKnowledgeReadSchema(pool)});
 const reader={kind:'reader' as const,id:'chatgpt-theme-authoring'};
 const url=(id:string,revision:number)=>origin+'/?ktheme='+encodeURIComponent(id)+'&krev='+revision;
 function themeId(value:string){
  if(!/^https?:/i.test(value))return value;
  let parsed:URL;try{parsed=new URL(value);}catch{throw new KnowledgeError('テーマのURLを確認してください。');}
  if(parsed.origin!==origin||!parsed.searchParams.get('ktheme'))throw new KnowledgeError('この接続先のテーマURLを指定してください。');
  return parsed.searchParams.get('ktheme')!;
 }
 async function read(theme:string,revision?:number){
  const result=await foundation.resolveTheme(reader,themeId(theme),revision);
  const translationTargets=[...themeTimelineTextTargets(result.theme),...result.snapshot.records.flatMap(recordTimeTextTargets)].map(target=>({target,original:knowledgeOriginalText(target,target.kind==='theme'?result.theme.content:result.snapshot.records.find(r=>r.id===target.id)!.content).text}));
  const presentations=(['ja','en'] as const).map(locale=>themeReadingPresentation(result.theme,locale,result.snapshot)).filter(p=>p!==null);
  const stories=result.theme.content.stories;
  const storyEditing={mode:stories===undefined?'legacy':'explicit',selection:stories??null,
   effectiveItems:themeStoryEntries(result.snapshot.records,stories,presentations.find(p=>p.locale==='ja'),'ja').map(item=>({key:item.key,title:item.title,records:item.records.map(r=>({id:r.id,revision:r.revision}))})),
   candidates:result.snapshot.records.map(record=>({target:{id:record.id,revision:record.revision},kind:record.content.kind,
    assertion:record.content.assertion,headings:presentations.flatMap(p=>p.records.filter(r=>r.target.id===record.id&&r.target.revision===record.revision).map(r=>({locale:p.locale,shortTitle:r.shortTitle,chapterQuestion:r.chapterQuestion,explanations:r.explanations}))),evidence:record.content.evidence})),
   updateField:'update_theme.changes.stories',rules:'Selection is independent of timeline/Graph membership. All kinds are candidates. Ordered items may group multiple exact Record versions. Omit to retain; {version:1,items:[]} explicitly empties the list. Missing/private records are never exposed. Source URLs and exact source versions are in snapshot.sources. Read the current quality guide to edit prose; no automatic AI selection or review.'};
  return {...result,storyEditing,translationTargets,target:{id:result.theme.id,revision:result.theme.revision},url:url(result.theme.id,result.theme.revision)};
 }
 async function find(kind:'theme'|'entity'|'record'|'source',query:string,cursor:number){
  // Candidates are bounded and independently checked for public dependencies.
  // The cursor reports scanned candidates, so a hidden dependency neither leaks
  // a result nor causes the same page to be returned forever.
  await verifyKnowledgeReadSchema(pool);
  const rows=(await pool.query(`SELECT o.id,r.revision,r.content FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision WHERE o.kind=$1 AND o.visibility='public' AND ($2='' OR lower(r.content::text) LIKE '%'||lower($2)||'%') ORDER BY o.id LIMIT 21 OFFSET $3`,[kind,query,cursor])).rows;
  const items=[];
  for(const row of rows.slice(0,20)){
   try{const v=await foundation.get(reader,kind,row.id,Number(row.revision));items.push({...v,...(kind==='theme'?{url:url(v.id,v.revision)}:{})});}
   catch(e){if(e instanceof KnowledgeError&&e.status<500)continue;throw e;}
  }
  return {items,nextCursor:rows.length>20?cursor+20:null,scope:'Current public common knowledge, including already captured legacy records. A page is not the complete catalog.'};
 }
 async function knowledge(kind:'entity'|'record'|'source',id:string,revision?:number){
  const value=await foundation.get(reader,kind,id,revision);
  if(kind!=='record')return value;
  const record=await foundation.get(reader,'record',id,revision);
  const entities=await Promise.all([...new Set([record.content.subjectId,record.content.objectId].filter((v):v is string=>!!v))].map(id=>foundation.get(reader,'entity',id)));
  const pins=new Map(record.content.evidence.map(e=>[e.source.id+'@'+e.source.revision,e.source]));
  const sources=await Promise.all([...pins.values()].map(p=>foundation.get(reader,'source',p.id,p.revision)));
  return {record,entities,sources};
 }
 return {read,find,knowledge};
}
