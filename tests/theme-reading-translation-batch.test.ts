import {it,expect,vi} from "vitest";
import type {PoolClient} from "pg";
import type {KnowledgeThemeResolved} from "../lib/domain/knowledge-foundation";
import {publicThemeSnapshotTranslations} from "../lib/server/knowledge-display-translations";
it("認可済み断面の一致する原文だけを翻訳へ使い、隠れたheadと任意対象を含めない",async()=>{
 const target={kind:"record",id:"r",revision:2,field:"assertion"},row={id:"tr",revision:1,target,language:"en",text:"Translated",original_text:"Original",original_hash:"a".repeat(64),reason:"",created_at:new Date()};
 const query=vi.fn().mockResolvedValueOnce({rows:[row,{...row,id:"bad",target:{...target,id:"outside"}},{...row,id:"stale",original_text:"Different original"}]}).mockResolvedValue({rows:[]});
 const snapshot={records:[{id:"r",revision:2,content:{kind:"note",assertion:"Original",scope:"",times:[],evidence:[]}}],entities:[],sources:[]},theme={id:"theme",revision:1,content:{title:"Title",description:"",timeline:{axes:[],insets:[],placements:[]}}};
 const result=await publicThemeSnapshotTranslations({query} as unknown as PoolClient,{snapshot,theme} as unknown as KnowledgeThemeResolved,"en");
 expect(result.map(t=>t.id)).toEqual(["tr"]);expect(query.mock.calls[0][0]).toContain("h.visibility='public'");expect(JSON.stringify(query.mock.calls[0][1])).not.toContain("outside");
});
