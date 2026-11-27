import {afterEach,describe,expect,it,vi} from "vitest";
import {mediaSlot,slidesAt,type MediaSlot} from "../lib/domain/theme-media";
import {playableVideo,videoAvailability} from "../lib/server/theme-media-youtube";
import {projectSlides,removalOnly,scopedActor,themeMediaImages,validatePlacement} from "../lib/server/theme-media";
import type {KnowledgeThemeRead} from "../lib/domain/knowledge-theme-reader";
vi.mock("server-only",()=>({}));
const top={kind:"theme"} as const;
const rec={kind:"record",id:"game",revision:8} as const;
const v:MediaSlot={id:"s",kind:"video",format:"landscape",positions:[top,rec],editions:{ja:{videoId:"oneVideo001"},en:{videoId:"twoVideo002"}}};
const movie={id:"oneVideo001",snippet:{channelId:"japan",title:"A"},status:{privacyStatus:"unlisted",embeddable:true,uploadStatus:"processed"},contentDetails:{duration:"PT1M2S"}};
afterEach(()=>vi.unstubAllEnvs());
describe("public media",()=>{
 it("rejects arbitrary embeds, identical editions and stale targets",()=>{
   expect(mediaSlot.safeParse({...v,editions:{en:{videoId:"https://youtu.be/bad"}}}).success).toBe(false);
   expect(mediaSlot.safeParse({...v,editions:{en:{videoId:"oneVideo001"},ja:{videoId:"oneVideo001"}}}).success).toBe(false);
   expect(()=>validatePlacement([v],[top,{...rec,revision:9}],[],new Map())).toThrow(/ノード/);
 });
 it("filters missing, private, processing, embed-disabled, wrong-language and wrong-channel editions",()=>{
   const ok=playableVideo(movie,"ja","japan");
   expect(ok).toMatchObject({duration:62,privacy:"unlisted"});
   for(const status of [{embeddable:false},{privacyStatus:"private"},{uploadStatus:"uploaded"}]){
     expect(playableVideo({...movie,status:{...movie.status,...status}},"ja","japan")).toBeNull();
   }
   expect(playableVideo(undefined,"ja","japan")).toBeNull();
   expect(playableVideo(movie,"en","english")).toBeNull();
   expect(playableVideo({...movie,snippet:{...movie.snippet,defaultAudioLanguage:"en-US"}},"ja","japan")).toBeNull();
   const out=projectSlides([v],"en",[top],[],new Map([["ja:oneVideo001",ok!]]));
   expect(out).toMatchObject([{positions:[top],editions:{ja:{title:"A"}}}]);
   expect(out[0]).not.toHaveProperty("editions.en");
   expect(()=>validatePlacement([v],[top,rec],[],new Map())).toThrow(/チャンネル/);
 });
 it("expires cached checks, distinguishes failed retrieval and allows a new check",async()=>{
   vi.stubEnv("PLUNODE_YOUTUBE_API_KEY","fixture-key");vi.stubEnv("PLUNODE_YOUTUBE_CHANNEL_JA","japan");vi.stubEnv("PLUNODE_YOUTUBE_CHANNEL_EN","english");
   let clock=1;
   const fetcher=vi.fn().mockResolvedValueOnce(Response.json({items:[movie]})).mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce(Response.json({items:[]}));
   const check=videoAvailability(fetcher,()=>clock);
   expect((await check([v])).size).toBe(1);await check([v]);expect(fetcher).toHaveBeenCalledTimes(1);
   clock+=11*60_000;
   await expect(check([v])).rejects.toMatchObject({code:"VIDEO_VERIFICATION_UNAVAILABLE"});
   expect((await check([v])).size).toBe(0);
 });
 it("binds an operator bridge to an exact origin, environment and secret",()=>{
   vi.stubEnv("PLUNODE_THEME_MEDIA_TOKEN","x".repeat(32));vi.stubEnv("PLUNODE_THEME_MEDIA_ENVIRONMENT","beta");
   const headers=new Headers({authorization:"Bearer "+"x".repeat(32),"x-plunode-media-environment":"beta"});
   expect(scopedActor(headers,"https://graph-beta.isinxnisi.com")).toBe("studio:beta");
   expect(()=>scopedActor(headers,"https://plunode.net")).toThrow();headers.set("authorization","Bearer abc");
   expect(()=>scopedActor(headers,"https://graph-beta.isinxnisi.com")).toThrow();
 });
 it("allows removing a stale placement or edition without adding others",()=>{
   expect(removalOnly([], [v])).toBe(true);
   expect(removalOnly([{...v,positions:[top],editions:{ja:{videoId:"oneVideo001"}}}],[v])).toBe(true);
   expect(removalOnly([{...v,positions:[{...rec,revision:9}]}],[v])).toBe(false);
   expect(removalOnly([{...v,editions:{en:{videoId:"newVideo003"}}}],[v])).toBe(false);
 });
 it("enumerates pinned images in both languages, merges duplicate cover/record art and respects provenance",()=>{
   const img={src:"/api/knowledge/product-images/"+"a".repeat(64),id:"a".repeat(64),credit:"",kind:"illustration",alt:"A"};
   const original={...img,id:"own",src:"/theme-assets/original.png",credit:"Plunode · AI-generated illustration"};
   const unknown={...img,id:"unknown",src:"/theme-assets/no-info.png"};
   const pin={id:"game",revision:8};
   const read={theme:{id:"theme",revision:2,content:{reading:["ja","en"].map(locale=>({locale,image:{...img,alt:locale},records:[
     {target:pin,image:img,explanations:[]},{target:pin,image:original,explanations:[]},{target:pin,image:unknown,explanations:[]},
     {target:{id:"other",revision:1},image:{...unknown,id:"absent",src:"/theme-assets/absent.png"},explanations:[]},
   ]}))}},snapshot:{entities:[],records:[pin]}} as unknown as KnowledgeThemeRead;
   const images=themeMediaImages(read,new Map([[img.id,{kind:"licensed",terms:"CC BY 4.0",credit:"A",sourceUrl:"https://example.org/photo"}]]));
   expect(images.map(i=>[i.id,i.origin,i.eligible])).toEqual([[img.id,"licensed",true],["own","original",true],["unknown","unknown",false]]);
   expect(images[0].images.en).toMatchObject({alt:"en",credit:"A"});
   expect(()=>validatePlacement([{kind:"image",id:"i",imageId:"unknown",positions:[top]}],[top],images,new Map())).toThrow();
   const rows=projectSlides([{kind:"image",id:"i",imageId:img.id,positions:[top]}],"en",[top],images,new Map());
   const unavailable={id:"film",kind:"video" as const,format:"landscape" as const,positions:[top],editions:{ja:playableVideo(movie,"ja","japan")!}};
   const short={...unavailable,id:"short",format:"short" as const};
   expect(slidesAt([short,unavailable,...rows],top,"en").first).toBe(2);
   expect(slidesAt([short,unavailable,...rows],top,"ja").first).toBe(1);
 });
});
