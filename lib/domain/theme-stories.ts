import {z} from "zod";
import {knowledgePinSchema} from "./knowledge-ids";
import type {KnowledgeRecordVersion} from "./knowledge-foundation";
import {readingRecordTitle,type ThemeReadingPresentation} from "./theme-reading-presentation";

/** Theme-only editorial selection. Array order is reading order; absence is legacy, [] is deliberately empty. */
export const themeStoriesSchema=z.strictObject({
 version:z.literal(1),
 items:z.array(z.strictObject({
  key:z.string().trim().min(1).max(100),
  records:z.array(knowledgePinSchema).min(1).max(20),
  title:z.strictObject({ja:z.string().trim().min(1).max(180).optional(),en:z.string().trim().min(1).max(180).optional()}).optional(),
 })).max(400),
}).superRefine((v,c)=>{
 if(new Set(v.items.map(i=>i.key)).size!==v.items.length)c.addIssue({code:"custom",path:["items"],message:"読み物のkeyを重複させないでください。"});
 for(const [i,item] of v.items.entries())if(new Set(item.records.map(r=>r.id)).size!==item.records.length)c.addIssue({code:"custom",path:["items",i,"records"],message:"同じ読み物内の記録を重複させないでください。"});
});
export type ThemeStories=z.infer<typeof themeStoriesSchema>;
export function themeStoriesReferenceError(stories:ThemeStories,records:KnowledgeRecordVersion[]){
 return stories.items.some(item=>item.records.some(pin=>!records.some(r=>r.id===pin.id&&r.revision===pin.revision)))?"読み物には、このテーマに含まれる記録の正確な内容版を指定してください。":null;
}
/** Never fall back to auto listing for an explicitly empty or unavailable selection. */
export function themeStoryEntries(records:KnowledgeRecordVersion[],stories:ThemeStories|undefined,presentation?:ThemeReadingPresentation|null,locale:"ja"|"en"="ja",legacy:"stories"|"list"="stories"){
 if(stories===undefined)return records.filter(r=>legacy==="stories"?r.content.kind!=="relation":r.content.times.length===0).map(record=>({key:record.id,title:legacy==="list"?record.content.assertion:readingRecordTitle(record,presentation),records:[record]}));
 return stories.items.flatMap(item=>{
  const found=item.records.map(pin=>records.find(r=>r.id===pin.id&&r.revision===pin.revision));
  // A grouped reading is atomic; missing/private/stale members cannot leak a partial story.
  if(found.some(r=>!r))return [];
  const selected=found as KnowledgeRecordVersion[];
  return [{key:item.key,title:item.title?.[locale]??readingRecordTitle(selected[0],presentation),records:selected}];
 });
}
