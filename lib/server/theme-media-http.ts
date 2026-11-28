import {memberRuntime} from "./member/runtime";
import {memberInput,MemberError,assertMemberOrigin} from "./member/http";
import {themeOperator} from "./theme-operator-preview";
import {knowledgePublicationPreview} from "./knowledge-publication-preview";
import {knowledgeReadGuard} from "./knowledge-read-runtime";
import {knowledgeIdSchema,knowledgeRevisionSchema} from "../domain/knowledge-ids";
import {hasThemeLocale} from "../domain/theme-locale";
import {mediaChange,type MediaLanguage} from "../domain/theme-media";
import {scopedActor,mediaImages,mediaTargets,mediaReceipt,savePlacement,settings,validatePlacement,projectSlides,placementHistory,removalOnly} from "./theme-media";
import {checkedVideos,MediaProblem} from "./theme-media-youtube";
import {readPublishedThemeSlides} from "./published-theme-media";

const headers={"Cache-Control":"private, no-store","Vary":"Cookie, Authorization","X-Content-Type-Options":"nosniff"};
function json(data:unknown,status=200){return Response.json(data,{status,headers});}
function errorResponse(e:unknown){
  if(e instanceof MediaProblem)return json({error:e.message,code:e.code},e.status);
  if(e instanceof MemberError)return json({error:"認証・送信元または入力内容を確認してください。",code:e.code},e.status);
  const status=e&&typeof e==="object"&&"status" in e?Number(e.status):503;
  return json({error:status===403||status===404?"対象を閲覧できません。":"掲載設定を取得できません。接続とデータベースの移行状態を確認してください。",code:"MEDIA_UNAVAILABLE"},[400,401,403,404,409,410].includes(status)?status:503);
}
function pin(id:string|null,rev:number){
  if(!knowledgeIdSchema.safeParse(id).success||!knowledgeRevisionSchema.safeParse(rev).success)throw new MediaProblem(400,"BAD_PIN","公開テーマのIDと版を指定してください。");
  return {themeId:id!,revision:rev};
}
async function readTheme(id:string,revision?:number,language:MediaLanguage="ja"){
  const reader=await knowledgePublicationPreview();
  const read=await reader.theme({themeId:id,revision,language},{localeEdition:true});
  if(!hasThemeLocale(read,language))throw new MediaProblem(404,"THEME_UNAVAILABLE","この言語のテーマは公開されていません。");
  return read;
}
export async function publicThemeMedia(request:Request,poster=false){
  try{
    knowledgeReadGuard(request);
    const q=new URL(request.url).searchParams,language=q.get("language")??"ja";
    if(language!=="ja"&&language!=="en")throw new MediaProblem(400,"LANGUAGE","表示言語を選んでください。");
    const {themeId,revision}=pin(q.get("themeId"),Number(q.get("revision")));
    const read=await readTheme(themeId,revision,language);
    const slides=await readPublishedThemeSlides(read,language);
    if(poster){
      const id=q.get("id"),movie=slides.flatMap(s=>s.kind==="video"?Object.values(s.editions):[]).find(e=>e.videoId===id);
      if(!movie?.thumbnail)return new Response(null,{status:404});
      const response=await fetch(movie.thumbnail,{redirect:"error",signal:AbortSignal.timeout(4500),cache:"no-store"});
      if(!response.ok||response.headers.get("content-type")?.split(";")[0]!=="image/jpeg")return new Response(null,{status:404});
      return new Response(response.body,{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=120","X-Content-Type-Options":"nosniff"}});
    }
    return json({slides});
  }catch(e){return errorResponse(e);}
}
export async function operateThemeMedia(request:Request){
  try{
    knowledgeReadGuard(request);
    if(process.env.SITE_OPERATIONS_ENABLED!=="1")throw new MediaProblem(404,"UNAVAILABLE","掲載管理が有効になっていません。");
    const {pool,config}=memberRuntime();
    const authorize=async()=>{
      const scoped=scopedActor(request.headers,config.origin);
      if(scoped)return scoped;
      if(request.method!=="GET")assertMemberOrigin(request,config.origin);
      return "operator:"+await themeOperator(request.headers);
    };
    const actor=await authorize();
    const q=new URL(request.url).searchParams;
    if(request.method==="GET"&&q.get("history")==="1"){
      const id=knowledgeIdSchema.safeParse(q.get("themeId"));
      if(!id.success)throw new MediaProblem(400,"BAD_PIN","テーマIDを指定してください。");
      return json({themeId:id.data,previousPlacements:await placementHistory(pool,id.data)});
    }
    if(request.method==="GET"&&!q.has("themeId")){
      const search=q.get("q")??"";
      if(search.length>200)throw new MediaProblem(400,"SEARCH","検索文字列が長すぎます。");
      const page=await (await knowledgePublicationPreview()).themes({q:search});
      return json({themes:page.themes.map(({id,title,revision})=>({id,title,revision}))});
    }
    const change=request.method==="POST"?await memberInput(request,mediaChange,160_000):null;
    const {themeId,revision}=change??pin(q.get("themeId"),Number(q.get("revision")));
    if(change?.action==="save"){
      const replay=await mediaReceipt(pool,actor,change);
      if(replay)return json(replay);
    }
    const readableOrRemoved=async(rev?:number)=>{
      try{return await readTheme(themeId,rev);}catch(e){if(e&&typeof e==="object"&&"status" in e&&[403,404,410].includes(Number(e.status)))return null;throw e;}
    };
    const [latest,before]=await Promise.all([readableOrRemoved(),settings(pool,themeId,revision)]);
    const current=latest?.theme.revision===revision;
    const read=current?latest:await readableOrRemoved(revision);
    if(!read&&!before.generation)throw new MediaProblem(404,"THEME_UNAVAILABLE","対象の公開版を確認できません。");
    const imageCandidates=read?await mediaImages(pool,read):[],targets=read?mediaTargets(read):[];
    if(!change){
      const checked=await checkedVideos(before.slots).catch(()=>null);
      const videoStatus=Object.fromEntries(before.slots.flatMap(s=>s.kind==="video"?Object.entries(s.editions).map(([l,e])=>{
        const key=l+":"+e.videoId,edition=checked?.get(key);
        return [key,{state:edition?"ready":checked?"unavailable":"verification-unavailable",edition}];
      }):[]));
      return json({themeId,revision,title:read?.theme.content.title??latest?.theme.content.title??themeId,
        latestRevision:latest?.theme.revision??null,previousPlacements:await placementHistory(pool,themeId),...before,imageCandidates,targets,videoStatus});
    }
    if(before.generation!==change.expectedGeneration)throw new MediaProblem(409,"PLACEMENT_CHANGED","ほかの変更が保存されています。掲載設定を読み直してください。");
    const removing=removalOnly(change.slots,before.slots);
    if(!current&&!removing)throw new MediaProblem(409,"THEME_CHANGED","公開版が変わりました。旧版は掲載解除できます。追加・差し替えは最新の公開版を選んでください。");
    // Removing every association needs no YouTube connection. Old unplayable associations
    // can be retained; a new edition or a newly assigned position must pass a fresh check.
    const videos=change.action==="save"&&removing?new Map():await checkedVideos(change.slots,true);
    if(!removing)validatePlacement(change.slots,targets,imageCandidates,videos,before.slots);
    if(change.action==="preview")return json({slides:{
      ja:projectSlides(change.slots,"ja",targets,imageCandidates,videos),en:projectSlides(change.slots,"en",targets,imageCandidates,videos),
    }});
    return json(await savePlacement(pool,actor,change,async()=>{
      if(await authorize()!==actor)throw new MediaProblem(403,"DENIED","掲載権限を確認してください。");
      if(!removing&&(await readTheme(themeId)).theme.revision!==revision)throw new MediaProblem(409,"THEME_CHANGED","公開版が変わりました。最新の公開版を選び直してください。");
    }));
  }catch(e){return errorResponse(e);}
}
