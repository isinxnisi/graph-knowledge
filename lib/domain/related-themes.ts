import type {KnowledgeThemePage, KnowledgeThemeRead} from "./knowledge-theme-reader";

/** Match the fixed composition, independent of stories, product pins and Record kind. */
export function relatedThemesForTheme(catalogue:KnowledgeThemePage["themes"], current:KnowledgeThemeRead) {
 const entities=new Set(current.snapshot.entities.map(entity=>entity.id));
 const records=new Set(current.snapshot.records.map(record=>record.id));
 const seen=new Set<string>();
 return catalogue.filter(theme=>{
  if(theme.id===current.theme.id||seen.has(theme.id))return false;
  const related=theme.entityIds.some(id=>entities.has(id))||
   Object.keys(theme.focusAliases??{}).some(id=>entities.has(id))||
   (theme.recordIds??[]).some(id=>records.has(id));
  if(related)seen.add(theme.id);
  return related;
 });
}
