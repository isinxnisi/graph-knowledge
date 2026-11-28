import type {KnowledgeThemeRead} from "../domain/knowledge-theme-reader";
import {hasThemeLocale} from "../domain/theme-locale";
import type {MediaLanguage,MediaSlide} from "../domain/theme-media";
import {memberRuntime} from "./member/runtime";
import {mediaImages,mediaTargets,projectSlides,settings} from "./theme-media";
import {checkedVideos} from "./theme-media-youtube";

export async function readPublishedThemeSlides(read:KnowledgeThemeRead,language:MediaLanguage):Promise<MediaSlide[]>{
  const {pool}=memberRuntime();
  const {slots}=await settings(pool,read.theme.id,read.theme.revision);
  if(!slots.length)return [];
  const [images,videos]=await Promise.all([
    slots.some(slot=>slot.kind==="image")?mediaImages(pool,read):[],
    checkedVideos(slots).catch(()=>new Map()),
  ]);
  return projectSlides(slots,language,mediaTargets(read),images,videos);
}

export async function withPublishedThemeMedia(read:KnowledgeThemeRead,language:MediaLanguage):Promise<KnowledgeThemeRead>{
  if(read.operatorPreview||!hasThemeLocale(read,language))return read;
  // Decide the layout once per theme read, even when media storage is unavailable.
  const slides=await readPublishedThemeSlides(read,language).catch(()=>[]);
  return {...read,publishedMedia:{language,slides}};
}
