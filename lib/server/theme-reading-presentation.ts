// Server projection shared with non-Next publication workers. Do not import from client components.
import entityNotes from "../../data/theme-reading-entity-notes.json";
import catalogue from "../../data/theme-reading-presentation.json";
import {themeReadingPresentationSchema} from "../domain/theme-reading-presentation";
import type {KnowledgeThemeVersion,KnowledgeSnapshot} from "../domain/knowledge-foundation";
const presentations=catalogue.map(v=>themeReadingPresentationSchema.parse(v));
/** Project only AFTER authorizing the whole immutable snapshot; never ship the catalogue to a browser. */
export function themeReadingPresentation(theme:KnowledgeThemeVersion,locale:string,snapshot?:KnowledgeSnapshot){
 const embedded=theme.content.reading?.find(row=>row.locale===locale);
 const item=embedded?{version:1 as const,theme:{id:theme.id,revision:theme.revision},state:"checked" as const,...embedded}:theme.content.reading!==undefined?undefined:presentations.find(p=>p.theme.id===theme.id&&p.theme.revision===(theme.content.readingBaseRevision??theme.revision)&&p.locale===locale);if(!item)return null;
 return {...item,entityNotes:[...(item.entityNotes??[]),...entityNotes.filter(n=>snapshot?.entities.some(e=>e.id===n.id&&e.revision===n.revision)).map(n=>({target:{id:n.id,revision:n.revision},text:n[item.locale]}))].filter((n,i,all)=>all.findIndex(v=>v.target.id===n.target.id)===i),records:item.records.filter(row=>!snapshot||snapshot.records.some(r=>r.id===row.target.id&&r.revision===row.target.revision)).map(row=>({...row,explanations:row.explanations.filter(ref=>Boolean(snapshot?.records.some(r=>r.id===ref.record.id&&r.revision===ref.record.revision&&r.content.kind==="note"&&r.content.aboutRecord?.id===row.target.id&&r.content.aboutRecord.revision===row.target.revision)))}))};
}
