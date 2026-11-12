import {z} from "zod";
import type {KnowledgeSnapshot, KnowledgeRecordVersion} from "./knowledge-foundation";

const pin=z.object({id:z.string().min(1),revision:z.number().int().positive()});
const language=z.enum(["ja","en"]);
const image=z.object({id:z.string(),src:z.string().regex(/^(?:\/theme-assets\/[a-zA-Z0-9._/-]+|\/api\/knowledge\/product-images\/[a-f0-9]{64})$/),width:z.number().positive(),height:z.number().positive(),kind:z.enum(["photo","illustration"]),alt:z.string(),caption:z.string(),credit:z.string(),sourceUrl:z.url().optional(),termsUrl:z.url().optional(),checkedAt:z.iso.date(),focus:z.string().regex(/^\d{1,3}% \d{1,3}%$/)}).refine(v=>v.kind==="illustration"||Boolean(v.sourceUrl&&v.termsUrl),"Photographs need source and usage terms URLs");
export const themeReadingPresentationSchema=z.object({
 version:z.literal(1),theme:pin,locale:language,state:z.literal("checked"),
 hook:z.string().min(1).max(300),lead:z.string().max(1200),image:image.optional(),
 entityNotes:z.array(z.object({target:pin,text:z.string().min(1).max(500)})).optional(),
 records:z.array(z.object({target:pin,chapterQuestion:z.string().min(1).max(180).optional(),shortTitle:z.string().min(1).max(180),timelineSummary:z.string().max(260).optional(),explanations:z.array(z.object({record:pin,role:z.enum(["background","importance","insight","next"]),heading:z.string().min(1).max(100).optional()})).default([])})).default([]),
});
export type ThemeReadingPresentation=z.infer<typeof themeReadingPresentationSchema>;
/** Use a supplied short heading or an authored time label; never truncate a claim mid-sentence. */
export function readingRecordTitle(record:KnowledgeRecordVersion,presentation?:ThemeReadingPresentation|null){
 return presentation?.records.find(r=>r.target.id===record.id&&r.target.revision===record.revision)?.shortTitle || record.content.times.find(t=>t.time.label)?.time.label || record.content.assertion;
}
export function readingExplanations(record:KnowledgeRecordVersion,snapshot:KnowledgeSnapshot,presentation?:ThemeReadingPresentation|null){
 const entry=presentation?.records.find(r=>r.target.id===record.id&&r.target.revision===record.revision);
 return (entry?.explanations??[]).flatMap(ref=>{const note=snapshot.records.find(r=>r.id===ref.record.id&&r.revision===ref.record.revision);return note?[{record:note,role:ref.role,heading:ref.heading}]:[];});
}
