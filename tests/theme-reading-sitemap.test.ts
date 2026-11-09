import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({public:true}));
vi.mock("../lib/server/publication",()=>({publicationPolicy:async()=>({public:m.public}),sitemapEntities:async()=>["entity"]}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>({themes:async()=>({themes:[{id:"public-theme"},{id:"japanese-theme"}]})})}));
vi.mock("../lib/server/theme-reading-page",()=>({themePath:(id:string,l="ja")=>(l==="en"?"/en":"")+"/t/"+id,publicThemeRead:async(id:string,locale:string)=>({id,locale,theme:{createdAt:"2026-11-10T00:00:00Z"}}),hasThemeLocale:(v:{id:string;locale:string})=>v.locale==="ja"||v.id==="public-theme"}));
import sitemap from "../app/sitemap";
it("公開カタログ内の実言語だけを載せ、βと限定共有・管理URLを含めない",async()=>{
 const urls=(await sitemap()).map(v=>v.url);expect(urls).toContain("https://plunode.net/en/t/public-theme");expect(urls).toContain("https://plunode.net/t/japanese-theme");expect(urls).not.toContain("https://plunode.net/en/t/japanese-theme");expect(urls.some(u=>/shared|themes\/|operations|localhost|beta/.test(u))).toBe(false);m.public=false;expect(await sitemap()).toEqual([]);
});
