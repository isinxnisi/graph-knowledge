import {z} from "zod";
import {knowledgeIdSchema, knowledgeRevisionSchema} from "./knowledge-ids";
import type {ThemeReadingImage} from "./theme-reading-presentation";

export type MediaLanguage = "ja" | "en";
const position = z.union([z.strictObject({kind:z.literal("theme")}),z.strictObject({
  kind:z.enum(["entity","record"]), id:knowledgeIdSchema, revision:knowledgeRevisionSchema,
})]);
export type MediaPosition = z.infer<typeof position>;
export const positionKey = (p:MediaPosition) => p.kind === "theme" ? "theme" : JSON.stringify([p.kind,p.id,p.revision]);
const positions = z.array(position).min(1).max(60).refine(rows=>new Set(rows.map(positionKey)).size===rows.length);
const common = {id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/), positions};
const edition = z.strictObject({videoId:z.string().regex(/^[A-Za-z0-9_-]{11}$/)});
export const mediaSlot = z.discriminatedUnion("kind", [
  z.strictObject({...common,kind:z.literal("image"),imageId:z.string().min(1).max(180)}),
  z.strictObject({...common,kind:z.literal("video"),format:z.enum(["landscape","short"]),
    editions:z.strictObject({ja:edition.optional(),en:edition.optional()}).refine(v=>!!(v.ja||v.en)&&(!v.ja||v.ja.videoId!==v.en?.videoId))}),
]);
export type MediaSlot = z.infer<typeof mediaSlot>;
export const mediaChange = z.strictObject({requestId:z.uuid(),action:z.enum(["save","preview"]),
  themeId:knowledgeIdSchema,revision:knowledgeRevisionSchema,expectedGeneration:z.number().int().min(0),
  slots:z.array(mediaSlot).max(48).refine(slots=>new Set(slots.map(s=>s.id)).size===slots.length)});
export type MediaChange = z.infer<typeof mediaChange>;
export type VideoEdition = {videoId:string;title:string;duration:number;privacy:"public"|"unlisted";thumbnail?:string};
export type MediaSlide = {id:string;positions:MediaPosition[]} & (
  {kind:"image";image:ThemeReadingImage;terms?:string} |
  {kind:"video";format:"landscape"|"short";editions:Partial<Record<MediaLanguage,VideoEdition>>});
export type ImageCandidate = {id:string;images:Partial<Record<MediaLanguage,ThemeReadingImage>>;origin:"licensed"|"original"|"unknown";eligible:boolean;terms?:string};

export function slidesAt(slides:MediaSlide[],position:MediaPosition,language:MediaLanguage){
  const items=slides.filter(s=>s.positions.some(p=>positionKey(p)===positionKey(position)));
  // The operator's order is stable. Open at the first local-language image or landscape;
  // an alternative edition and a short are still reachable if they are the only choices.
  let first=items.findIndex(s=>s.kind==="image"||s.format!=="short"&&!!s.editions[language]);
  if(first<0)first=items.findIndex(s=>s.kind==="video"&&!!s.editions[language]);
  return {items,first:Math.max(first,0)};
}
