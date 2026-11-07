// @vitest-environment jsdom
import React from "react";
import {act,cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import KnowledgeReading,{useKnowledgeReading} from "../components/KnowledgeReading";
const mocks=vi.hoisted(()=>({workspace:{} as Record<string,unknown>,close:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(location.search)}));
vi.mock("../lib/client/use-knowledge-workspace",()=>({useKnowledgeWorkspace:()=>mocks.workspace,readKnowledge:vi.fn()}));
vi.mock("../components/GraphCanvas",()=>({default:()=> <div>保持中の図</div>}));
const theme={theme:{id:"theme",revision:1,content:{title:"テーマ",recordPins:[],description:""}},records:[],snapshot:{entities:[],records:[]}};
function Reader(){const r=useKnowledgeReading()!;return <><span>既存Explorer</span><div>{r.center}</div></>;}
async function flush(){await act(async()=>{for(let n=0;n<10;n++)await Promise.resolve();});}
beforeEach(()=>{mocks.close.mockClear();history.replaceState({},"","/?ktheme=theme");mocks.workspace={normal:{records:[],entities:[],epoch:0,selection:null},activeTheme:theme,retainedTheme:theme,themeSelection:null,themeView:"graph",busy:false,restoring:false,error:"",message:"",status:null,closeTheme:mocks.close};});
afterEach(()=>cleanup());
it("Nextの同一路線ホーム移動はpopstateを待たずThemeを閉じる",async()=>{
 const {rerender}=render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 expect(mocks.close).not.toHaveBeenCalled();
 history.replaceState({},"","/");rerender(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 expect(mocks.close).toHaveBeenCalledWith("replace");
});
it("Theme取得中の旧URLだけを理由に手動の読込を中止しない",async()=>{
 history.replaceState({},"","/");mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null,busy:true};
 render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();expect(mocks.close).not.toHaveBeenCalled();
});
it("解説だけのThemeに空のGraph領域を追加しない",async()=>{
 const {container}=render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 expect(screen.getByText("既存Explorer")).toBeTruthy();
 expect(screen.getByRole("heading",{name:/^テーマ$/})).toBeTruthy();
 expect(container.querySelector('[data-view]')).toBeNull();
});

it("公開記録の直リンクを既存Explorerのホーム移動と混同しない",async()=>{
 history.replaceState({},"","/?krecord=record-1");mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null};
 render(<KnowledgeReading><Reader/></KnowledgeReading>);expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();await flush();expect(mocks.close).not.toHaveBeenCalled();expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();
});
