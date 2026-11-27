import {publicThemeMedia} from "../../../../../lib/server/theme-media-http";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const GET=(request:Request)=>publicThemeMedia(request,true);
