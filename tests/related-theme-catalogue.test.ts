import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("../lib/server/member/config",()=>({memberConfig:()=>null}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:vi.fn()}));
import {knowledgeThemeHome} from "../lib/server/knowledge-theme-home";
import type {KnowledgeThemeSummary} from "../lib/domain/knowledge-theme-reader";
it("SSRの関連一覧にも公開カタログの全Entity・Record・同一性情報を保持する",async()=>{
 const theme:KnowledgeThemeSummary={id:"t",revision:3,title:"題",description:"説明",entityIds:["a"],recordIds:["relation","episode","note"],focusAliases:{legacy:"a"},initialView:"graph",hasTimeline:false};
 const read=vi.fn(async()=>({themes:[theme]}));
 const home=await knowledgeThemeHome({themes:read});
 expect(read).toHaveBeenCalledWith({},true);
 expect(home.relatedCatalogue?.[0]).toMatchObject({id:"t",revision:3,entityIds:["a"],recordIds:["relation","episode","note"],focusAliases:{legacy:"a"}});
});
