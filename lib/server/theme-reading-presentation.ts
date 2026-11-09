// Server projection shared with non-Next publication workers. Do not import from client components.
import catalogue from "../../data/theme-reading-presentation.json";
import {themeReadingPresentationSchema} from "../domain/theme-reading-presentation";
import type {KnowledgeThemeVersion,KnowledgeSnapshot} from "../domain/knowledge-foundation";
const presentations=catalogue.map(v=>themeReadingPresentationSchema.parse(v));
/** Project only AFTER authorizing the whole immutable snapshot; never ship the catalogue to a browser. */
export function themeReadingPresentation(theme:KnowledgeThemeVersion,locale:string,snapshot?:KnowledgeSnapshot){
 const item=presentations.find(p=>p.theme.id===theme.id&&p.theme.revision===theme.revision&&p.locale===locale);if(!item)return null;
 return {...item,records:item.records.filter(row=>!snapshot||snapshot.records.some(r=>r.id===row.target.id&&r.revision===row.target.revision)).map(row=>({...row,explanations:row.explanations.filter(ref=>Boolean(snapshot?.records.some(r=>r.id===ref.record.id&&r.revision===ref.record.revision&&r.content.kind==="note"&&r.content.aboutRecord?.id===row.target.id&&r.content.aboutRecord.revision===row.target.revision)))}))};
}
