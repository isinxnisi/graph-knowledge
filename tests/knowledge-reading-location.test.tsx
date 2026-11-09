// @vitest-environment jsdom
import React from "react";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import KnowledgeReading,{useKnowledgeReading} from "../components/KnowledgeReading";
import {MemberClientError} from "../lib/client/member-api";
import {knowledgeRecordContentSchema,knowledgeSourceContentSchema} from "../lib/domain/knowledge-foundation";
import {buildKnowledgePublishedRecord} from "../lib/domain/knowledge-publication";
const mocks=vi.hoisted(()=>({workspace:{} as Record<string,unknown>,close:vi.fn(),capture:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(location.search)}));
vi.mock("../lib/client/use-knowledge-workspace",()=>({useKnowledgeWorkspace:()=>mocks.workspace,readKnowledge:vi.fn()}));
vi.mock("../components/GraphCanvas",()=>({default:()=> <div>保持中の図</div>}));
vi.mock("../components/KnowledgeSubmissionAvailability",()=>({useKnowledgeSubmissionsEnabled:()=>true}));
vi.mock("../lib/client/use-knowledge-display-translations",()=>({useKnowledgeDisplayTranslations:()=>[]}));
vi.mock("../lib/client/knowledge-submission-handoff",async()=>({...await vi.importActual("../lib/client/knowledge-submission-handoff"),createSelectionSubmission:mocks.capture}));
const theme={theme:{id:"theme",revision:1,content:{title:"テーマ",recordPins:[],description:""}},records:[],snapshot:{entities:[],records:[]}};
function Reader(){const r=useKnowledgeReading()!;return <><span>既存Explorer</span><button onClick={()=>r.openRecord("record-1")}>記録を開く</button><div>{r.center}</div></>;}
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

it("通常Graphからの記録取得中は旧URLを理由に取消さず、成功後に直リンクへ切り替える",async()=>{
 history.replaceState({},"","/");
 let resolve!:(value:boolean)=>void;
 const selectRecord=vi.fn(()=>new Promise<boolean>(done=>{resolve=done;}));
 mocks.workspace={...mocks.workspace,activeTheme:null,retainedTheme:null,selectRecord};
 render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 fireEvent.click(screen.getByRole("button",{name:"記録を開く"}));await flush();
 expect(selectRecord).toHaveBeenCalledWith("record-1",{latest:true});
 expect(mocks.close).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve(true);await Promise.resolve();});await flush();
 expect(new URL(location.href).searchParams.get("krecord")).toBe("record-1");
 expect(screen.getByRole("region",{name:"通常の関係探索"})).toBeTruthy();
 expect(mocks.close).toHaveBeenCalledTimes(1);
});

it("固定版の選択投稿が競合しても勝手に替えず、明示操作で現在版を開き直せる",async()=>{
 const record={id:"record-1",revision:1,createdAt:"2026-11-08T00:00:00Z",reason:"",content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"固定した内容",aboutTheme:"theme",evidence:[{id:"e",source:{id:"source",revision:1},locator:"本文"}]})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[record],entities:[],sources:[{id:"source",revision:1,createdAt:record.createdAt,reason:"",content:knowledgeSourceContentSchema.parse({title:"公開資料",bibliography:"固定版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:[buildKnowledgePublishedRecord(record,snapshot)]},selectRecord=vi.fn(async()=>false);
 mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,themeSelection:{kind:"record",id:record.id},selectRecord,captureThemeView:vi.fn()};
 mocks.capture.mockRejectedValueOnce(new MemberClientError(409,"REFERENCE_CONFLICT"));
 render(<KnowledgeReading><Reader/></KnowledgeReading>);await flush();
 fireEvent.click(screen.getByRole("button",{name:"選択範囲を投稿"}));await flush();
 expect(mocks.capture).toHaveBeenCalledWith({context:expect.objectContaining({recordPins:[{id:record.id,revision:1}],themePin:{id:"theme",revision:1}})});
 expect(selectRecord).not.toHaveBeenCalled();expect(fixed.snapshot.records[0].revision).toBe(1);
 fireEvent.click(screen.getByRole("button",{name:"最新版を開いて選び直す"}));await flush();
 expect(selectRecord).toHaveBeenCalledWith(record.id,{latest:true});expect(fixed.snapshot.records[0].revision).toBe(1);
});

it("テーマ説明の一時表示は記録・出典の開閉と詳細DOMを保持する",async()=>{
 HTMLElement.prototype.scrollIntoView=vi.fn();
 const record={id:"fixed",revision:1,createdAt:"2026-11-10T00:00:00Z",reason:"",content:knowledgeRecordContentSchema.parse({kind:"note",assertion:"固定した本文",evidence:[{id:"e",source:{id:"source",revision:1},locator:"p.7",excerpt:"根拠の文章"}]})};
 const snapshot={schemaVersion:1 as const,initialView:"graph" as const,records:[record],entities:[],sources:[{id:"source",revision:1,createdAt:record.createdAt,reason:"",content:knowledgeSourceContentSchema.parse({title:"資料",bibliography:"第1版"})}],mappings:[]};
 const fixed={...theme,snapshot,records:[buildKnowledgePublishedRecord(record,snapshot)]},setThemeSelection=vi.fn();mocks.workspace={...mocks.workspace,activeTheme:fixed,retainedTheme:fixed,themeSelection:{kind:"record",id:"fixed",timeId:"original"},setThemeSelection};
 function Both(){const r=useKnowledgeReading()!;return <>{r.center}<aside id="explorer-detail">{r.detail}</aside></>;}
 render(<KnowledgeReading><Both/></KnowledgeReading>);await flush();fireEvent.click(screen.getByRole("button",{name:"引用と該当箇所を読む"}));expect(screen.getByText("根拠の文章")).toBeTruthy();const node=screen.getByText("根拠の文章");fireEvent.click(screen.getByRole("button",{name:"テーマについて"}));expect(setThemeSelection).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"選んだ記録に戻る"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"選んだ記録に戻る"}));expect(screen.getByText("根拠の文章")).toBe(node);expect(screen.getByRole("button",{name:"引用と該当箇所を読む"}).getAttribute("aria-expanded")).toBe("true");
});
