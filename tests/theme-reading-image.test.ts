import {it,expect,vi} from "vitest";
import input from "../data/theme-reading-webb.json";
vi.mock("server-only",()=>({}));
vi.mock("../lib/server/theme-reading-page",()=>({publicThemeRead:async()=>({theme:{id:input.id,revision:1,content:{title:input.title,description:input.description}},snapshot:{records:input.records.map(r=>({...r,revision:1})),entities:[],sources:[]},displayTranslations:[]}),hasThemeLocale:()=>true}));
import {themeReadingImage} from "../lib/server/theme-reading-image";
it("実画像と日本語タイトルから1200×630のPNGを最後まで生成できる",async()=>{
 const response=await themeReadingImage(input.id,"ja",1);expect(response.status).toBe(200);const b=new Uint8Array(await response.arrayBuffer());expect([...b.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);const d=new DataView(b.buffer);expect([d.getUint32(16),d.getUint32(20)]).toEqual([1200,630]);expect(response.headers.get("cache-control")).toBe("no-store");
},15000);
