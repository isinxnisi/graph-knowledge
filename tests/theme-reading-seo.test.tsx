import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({host:"plunode.net",theme:vi.fn(),query:vi.fn(),videos:vi.fn(),guard:vi.fn(),notFound:vi.fn(()=>{throw {status:404};})}));
vi.mock("server-only",()=>({}));vi.mock("next/headers",()=>({headers:async()=>new Headers({host:mocks.host})}));vi.mock("next/navigation",()=>({notFound:mocks.notFound}));
vi.mock("../lib/server/knowledge-read-runtime",()=>({knowledgeReadGuard:mocks.guard}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>({theme:mocks.theme})}));vi.mock("../lib/server/exploration-page",()=>({ExplorationPage:({initialKnowledgeTheme}: {initialKnowledgeTheme:KnowledgeThemeRead})=><div>{JSON.stringify(initialKnowledgeTheme.publishedMedia)}</div>}));
vi.mock("../lib/server/member/runtime",()=>({memberRuntime:()=>({pool:{query:mocks.query}})}));
vi.mock("../lib/server/theme-media-youtube",async importOriginal=>({...await importOriginal<typeof import("../lib/server/theme-media-youtube")>(),checkedVideos:mocks.videos}));
vi.mock("../lib/server/read-db",()=>({readTransaction:vi.fn()}));
import type {KnowledgeThemeRead} from "../lib/domain/knowledge-theme-reader";
import {GET as readPublic} from "../app/api/knowledge/public/route";
import {themeMetadata,ThemeReadingPage,publicThemeRead} from "../lib/server/theme-reading-page";
const record={id:"r",revision:1,createdAt:"2026-11-10T00:00:00Z",reason:"",content:{assertion:"原文",times:[{id:"time",time:{kind:"calendar",from:"1991"}}]}},theme={id:"theme:x",revision:4,createdAt:"2026-11-10T00:00:00Z",reason:"",content:{title:"テーマ",description:"説明",recordPins:[],entityPins:[],sourcePins:[],mappingPins:[],initialView:"timeline"}};
const translations=[...(["title","description"] as const).map(field=>({id:field,revision:1,target:{kind:"theme",id:theme.id,revision:4,field},language:"en",originalText:theme.content[field],text:field==="title"?"Theme title":"Description",originalHash:"0".repeat(64),createdAt:theme.createdAt,reason:""})),{id:"assertion",revision:1,target:{kind:"record",id:"r",revision:1,field:"assertion"},language:"en",originalText:"原文",text:"Translated statement",originalHash:"0".repeat(64),createdAt:theme.createdAt,reason:""}];
beforeEach(()=>{mocks.host="plunode.net";process.env.GRAPH_DATASET="public-kg";process.env.PLUNODE_PUBLIC_ENABLED="1";mocks.theme.mockReset();mocks.guard.mockReset();mocks.query.mockReset().mockResolvedValue({rows:[]});mocks.videos.mockReset().mockResolvedValue(new Map());mocks.theme.mockImplementation(async(q:{language:string})=>({theme,snapshot:{schemaVersion:1,records:[record],entities:[],sources:[],mappings:[],initialView:"timeline"},records:[],displayTranslations:q.language==="en"?translations:[]}));});
describe("public theme metadata boundaries",()=>{
 it("returns a self canonical, edition-aware OG and only real alternate languages",async()=>{const m=await themeMetadata("theme:x","en");expect(m.title).toBe("Theme title — Plunode");expect(m.robots).toMatchObject({index:true});expect(m.alternates?.canonical).toBe("https://plunode.net/en/t/theme%3Ax");expect(m.alternates?.languages?.en).toBe("https://plunode.net/en/t/theme%3Ax");expect(JSON.stringify(m.openGraph)).toContain("/en/t/theme%3Ax/opengraph-image?revision=4");expect(JSON.stringify(m)).not.toContain("localhost");});
 it("uses the retained language edition for body marker and OG while keeping Japanese latest",async()=>{const original=mocks.theme.getMockImplementation()!;mocks.theme.mockImplementation(async(q:{language:string})=>({...await original(q),...(q.language==='en'?{theme:{...theme,revision:4},localeEdition:{language:'en',servedRevision:4,latestRevision:5,state:'translation-pending'}}:{theme:{...theme,revision:5}})}));const m=await themeMetadata('theme:x','en');expect(JSON.stringify(m.openGraph)).toContain('revision=4');expect(JSON.stringify((await themeMetadata('theme:x','ja')).openGraph)).toContain('revision=5');const html=renderToStaticMarkup(await ThemeReadingPage({id:'theme:x',locale:'en'}));expect(html).toContain('data-theme-publication-revision="4"');expect(m.alternates?.languages?.ja).toBe('https://plunode.net/t/theme%3Ax');});
 it("keeps beta noindex and pinned editions noindex",async()=>{mocks.host="graph-beta.isinxnisi.com";expect((await themeMetadata("theme:x","ja")).robots).toMatchObject({index:false});mocks.host="plunode.net";expect((await themeMetadata("theme:x","ja",undefined,true)).robots).toMatchObject({index:false});expect((await themeMetadata("theme:x","ja",2)).robots).toMatchObject({index:false});});
 it("does not manufacture an English page from a translated title alone",async()=>{mocks.theme.mockResolvedValue({theme,snapshot:{records:[record]},records:[],displayTranslations:translations.slice(0,1)});const m=await themeMetadata("theme:x","ja");expect(m.alternates?.languages?.en).toBeUndefined();await expect(ThemeReadingPage({id:"theme:x",locale:"en"})).rejects.toMatchObject({status:404});});
 it("blocked or unpublished themes expose neither indexable metadata nor the page",async()=>{mocks.theme.mockRejectedValue({status:404});expect((await themeMetadata("private","ja")).robots).toMatchObject({index:false});await expect(ThemeReadingPage({id:"private",locale:"ja"})).rejects.toMatchObject({status:404});});
 it("validates decoded route IDs before reading and preserves the requested old edition",async()=>{await publicThemeRead("theme%3Ax","ja",2);expect(mocks.theme).toHaveBeenCalledWith({themeId:"theme:x",language:"ja",revision:2},{localeEdition:true});await expect(publicThemeRead("bad%2Fid","ja")).rejects.toMatchObject({status:404});});
});

describe("media and the public reading snapshot",()=>{
 const pin={kind:"record",id:record.id,revision:record.revision} as const;
 const videoId="oneVideo001";
 const positions=[{kind:"theme"},pin,{...pin,revision:2}];
 const slot={id:"film",kind:"video",format:"landscape",positions,editions:{ja:{videoId}}};
 const themeRequest=(media:boolean)=>new Request("https://plunode.net/api/knowledge/public?mode=theme&themeId=theme%3Ax&revision=4&language=ja"+(media?"&media=1":""));
 it("passes verified placements to the explorer on its first render and leaves metadata independent",async()=>{
   mocks.query.mockResolvedValue({rows:[{slots:[slot]}]});
   mocks.videos.mockResolvedValue(new Map([["ja:"+videoId,{videoId,title:"Fixture film",duration:30,privacy:"unlisted"}]]));
   await themeMetadata("theme:x","ja");
   expect(mocks.query).not.toHaveBeenCalled();
   const html=renderToStaticMarkup(await ThemeReadingPage({id:"theme:x",locale:"ja"}));
   expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("site_theme_media"),["theme:x",4]);
   expect(html).toContain("Fixture film");
   const plain=await (await readPublic(themeRequest(false))).json();
   expect(plain).not.toHaveProperty("publishedMedia");
   expect(mocks.query).toHaveBeenCalledTimes(1);
   const bundled=await (await readPublic(themeRequest(true))).json();
   expect(bundled.publishedMedia).toMatchObject({language:"ja",slides:[{id:"film",positions:positions.slice(0,2)}]});
   expect(bundled.publishedMedia.slides[0].positions).toHaveLength(2);
 });
 it("keeps a public theme readable with a settled empty media bundle when placement storage fails",async()=>{
   mocks.query.mockRejectedValue(Error("offline"));
   const response=await readPublic(themeRequest(true));
   expect(response.status).toBe(200);
   expect(await response.json()).toMatchObject({theme:{id:"theme:x",revision:4},publishedMedia:{language:"ja",slides:[]}});
 });
});
