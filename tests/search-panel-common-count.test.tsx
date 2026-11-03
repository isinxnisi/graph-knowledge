// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import SearchPanel from "../components/SearchPanel";
import {searchEntities} from "../lib/client/api";
import type {KnowledgeEntityVersion} from "../lib/domain/knowledge-foundation";
import type {EntitySearchResponse} from "../lib/domain/api";
vi.mock("../lib/client/api",async original=>({...await original<typeof import("../lib/client/api")>(),searchEntities:vi.fn()}));
vi.mock("../components/KnowledgeReading",()=>({useKnowledgeReading:()=>({openEntity:vi.fn()})}));
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
vi.mock("../lib/client/public-events",()=>({trackPublicEvent:vi.fn()}));
const entity=(id:string,name:string,kind="organization"):KnowledgeEntityVersion=>({id,revision:1,createdAt:"2026-11-04",reason:"test",content:{name,kind,aliases:[],description:"",language:"ja"}});
const port=entity("new-port","欧州宇宙港"),old=entity("shared","既存の宇宙港");
const legacy={id:old.id,name:old.content.name,kind:"organization" as const,description:null,aliases:[],event:null};
const response=(entities:KnowledgeEntityVersion[])=>({ok:true,json:async()=>({entities})});
async function tick(){await act(()=>vi.advanceTimersByTimeAsync(260));}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it("counts common-only candidates and deduplicates shared IDs, then clears the prior count when kind changes",async()=>{
 vi.mocked(searchEntities).mockImplementation(async(q,_signal,kind)=>({items:q==="宇宙港"&&kind!=="person"?[legacy]:[],hasMore:false}));
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>response(new URL(url,"http://localhost").searchParams.get("q")==="宇宙港"?[old,port]:[port])));
 render(<SearchPanel onChoose={vi.fn()}/>);const input=screen.getByRole("textbox");
 fireEvent.change(input,{target:{value:"欧州宇宙港"}});await tick();
 expect(screen.getByText("1件の候補")).toBeTruthy();expect(screen.queryByText("0件の候補")).toBeNull();
 fireEvent.change(input,{target:{value:"宇宙港"}});expect(screen.queryByText("1件の候補")).toBeNull();await tick();
 expect(screen.getByText("2件の候補")).toBeTruthy();expect(screen.getAllByText(old.content.name)).toHaveLength(1);
 fireEvent.change(screen.getByRole("combobox"),{target:{value:"person"}});expect(screen.queryByText("2件の候補")).toBeNull();await tick();
 // No organizations are counted in the person category, even if they arrived before the filter changed.
 expect(screen.getByText("0件の候補")).toBeTruthy();
});
it("does not restore counts or results from late responses for an older query",async()=>{
 let releaseCommon!:(value:ReturnType<typeof response>)=>void,releaseLegacy!:(value:EntitySearchResponse)=>void;
 vi.mocked(searchEntities).mockImplementation(q=>q==="古い"?new Promise(resolve=>{releaseLegacy=resolve;}):Promise.resolve({items:[],hasMore:false}));
 vi.stubGlobal("fetch",vi.fn((url:string)=>new URL(url,"http://localhost").searchParams.get("q")==="古い"?new Promise(resolve=>{releaseCommon=resolve;}):Promise.resolve(response([port]))));
 render(<SearchPanel onChoose={vi.fn()}/>);const input=screen.getByRole("textbox");
 fireEvent.change(input,{target:{value:"古い"}});await tick();
 fireEvent.change(input,{target:{value:"新しい"}});await tick();expect(screen.getByText("1件の候補")).toBeTruthy();
 await act(async()=>{releaseCommon(response([old,port,entity("third","古い候補")]));releaseLegacy({items:[legacy],hasMore:false});});
 expect(screen.getByText("1件の候補")).toBeTruthy();expect(screen.queryByText("古い候補")).toBeNull();expect(screen.queryByText("既存の宇宙港")).toBeNull();
});
