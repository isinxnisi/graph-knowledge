import type {MediaLanguage,MediaSlot,VideoEdition} from "../domain/theme-media";

type Movie = {id:string;snippet:{channelId:string;title:string;defaultAudioLanguage?:string;defaultLanguage?:string;thumbnails?:{high?:{url:string};medium?:{url:string}}};
  status:{privacyStatus:string;embeddable:boolean;uploadStatus:string};contentDetails:{duration:string}};
export class MediaProblem extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
function durationSeconds(value:string){
  const match=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  return match?Number(match[1]||0)*3600+Number(match[2]||0)*60+Number(match[3]||0):0;
}
export function playableVideo(row:Movie|undefined,language:MediaLanguage,channel:string|undefined):VideoEdition|null{
  if(!row||!channel||row.snippet.channelId!==channel||!row.status.embeddable||row.status.uploadStatus!=="processed")return null;
  const privacy=row.status.privacyStatus;
  const declaredLanguage=row.snippet.defaultAudioLanguage||row.snippet.defaultLanguage;
  if((privacy!=="public"&&privacy!=="unlisted")||(declaredLanguage&&declaredLanguage.split("-")[0]!==language))return null;
  const duration=durationSeconds(row.contentDetails.duration);
  const thumbnail=row.snippet.thumbnails?.high?.url||row.snippet.thumbnails?.medium?.url;
  const approvedThumbnail=thumbnail?.startsWith("https://i.ytimg.com/vi/"+row.id+"/")&&/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/[\w.-]+$/.test(thumbnail);
  return duration>0 ? {videoId:row.id,title:row.snippet.title,duration,privacy,...(approvedThumbnail?{thumbnail}: {})} : null;
}
// The site refreshes availability without the studio PC. No viewer cookies or OAuth credentials are used.
export function videoAvailability(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
  const cache=new Map<string,{expires:number;movie:Movie|null}>();
  const pending=new Map<string,Promise<void>>();
  return async(slots:MediaSlot[],fresh=false)=>{
    const videos=slots.flatMap(slot=>slot.kind==="video"?Object.values(slot.editions).map(v=>v.videoId):[]);
    const ids=[...new Set(videos)].sort();
    const results=new Map<string,VideoEdition>();
    if(!ids.length)return results;
    const {PLUNODE_YOUTUBE_API_KEY:key,PLUNODE_YOUTUBE_CHANNEL_JA:ja,PLUNODE_YOUTUBE_CHANNEL_EN:en}=process.env;
    if(!key||ja&&ja===en)throw new MediaProblem(503,"VIDEO_VERIFICATION_UNAVAILABLE","サイトのYouTube照合設定を確認してください。");
    for(const [id,item] of cache)if(item.expires<=now())cache.delete(id);
    const missing=ids.filter(id=>fresh||!cache.has(id));
    for(let start=0;start<missing.length;start+=50){
      const batch=missing.slice(start,start+50),keyForBatch=batch.join(",");
      let request=pending.get(keyForBatch);
      if(!request){
        request=(async()=>{
          const url=new URL("https://www.googleapis.com/youtube/v3/videos");
          url.searchParams.set("part","snippet,status,contentDetails");
          url.searchParams.set("fields","items(id,snippet(channelId,title,defaultLanguage,defaultAudioLanguage,thumbnails(high/url,medium/url)),status(privacyStatus,embeddable,uploadStatus),contentDetails(duration))");
          url.searchParams.set("id",keyForBatch);
          try {
            const response=await fetcher(url,{headers:{"X-Goog-Api-Key":key},signal:AbortSignal.timeout(6000),cache:"no-store"});
            if(!response.ok)throw Error();
            const data=await response.json() as {items:Movie[]};
            if(!Array.isArray(data.items))throw Error();
            const movies=new Map(data.items.map(v=>[v.id,v]));
            for(const id of batch)cache.set(id,{movie:movies.get(id)??null,expires:now()+10*60_000});
          } catch {
            throw new MediaProblem(503,"VIDEO_VERIFICATION_UNAVAILABLE","YouTubeの状態を照合できません。接続とサイト設定を確認して再試行してください。");
          }
        })().finally(()=>{pending.delete(keyForBatch);});
        pending.set(keyForBatch,request);
      }
      await request;
    }
    for(const id of ids)for(const language of ["ja","en"] as const){
      const item=playableVideo(cache.get(id)?.movie??undefined,language,language==="ja"?ja:en);
      if(item)results.set(language+":"+id,item);
    }
    return results;
  };
}
export const checkedVideos=videoAvailability();
