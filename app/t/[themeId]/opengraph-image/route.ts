import {themeReadingImage} from "../../../../lib/server/theme-reading-image";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{themeId:string}>}){const raw=new URL(request.url).searchParams.get("revision"),revision=raw&&/^[1-9]\d*$/.test(raw)?Number(raw):undefined;return themeReadingImage((await params).themeId,"ja",revision);}
