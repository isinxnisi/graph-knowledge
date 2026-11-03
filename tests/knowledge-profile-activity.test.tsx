// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import KnowledgeProfileActivity from "../components/KnowledgeProfileActivity";
vi.mock("../lib/client/ui-locale",()=>({useUiLocale:()=>({locale:"ja"})}));
const fetcher=vi.fn(),activity=(title:string)=>({id:"00000000-0000-4000-8000-000000000001",recordId:"record-one",revision:1,operation:"create-relation",publishedAt:"2026-11-04T01:00:00Z",anonymous:false,person:{handle:"alice",displayName:"Alice",icon:"person"},title,href:"/?krecord=record-one"});
beforeEach(()=>{vi.stubGlobal("fetch",fetcher);fetcher.mockReset();});afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("a new handle starts from its own first page and ignores the prior profile cursor",async()=>{
 fetcher.mockResolvedValueOnce(Response.json({available:true,activities:[activity("Aliceの公開投稿")],nextCursor:"alice-page-2"}));const view=render(<KnowledgeProfileActivity handle="alice"/>);await screen.findByText("Aliceの公開投稿");
 fetcher.mockResolvedValueOnce(Response.json({available:true,activities:[],nextCursor:null}));fireEvent.click(screen.getByRole("button",{name:"さらに読む"}));await waitFor(()=>expect(screen.queryByRole("button",{name:"さらに読む"})).toBeNull());
 fetcher.mockResolvedValueOnce(Response.json({available:true,activities:[activity("Bobの公開投稿")],nextCursor:null}));view.rerender(<KnowledgeProfileActivity handle="bob"/>);await screen.findByText("Bobの公開投稿");
 const url=new URL(fetcher.mock.calls.at(-1)![0],"https://example.invalid");expect(url.searchParams.get("handle")).toBe("bob");expect(url.searchParams.has("cursor")).toBe(false);expect(screen.queryByText("Aliceの公開投稿")).toBeNull();
 expect(fetcher.mock.calls.at(-1)![1]).toMatchObject({credentials:"omit",cache:"no-store"});
});
it("privacy revocation while loading another page clears previously loaded public activity",async()=>{
 fetcher.mockResolvedValueOnce(Response.json({available:true,activities:[activity("後で非公開にされた投稿")],nextCursor:"page-2"}));render(<KnowledgeProfileActivity handle="alice"/>);await screen.findByText("後で非公開にされた投稿");
 fetcher.mockImplementation(async()=>Response.json({available:false,activities:[],nextCursor:null}));fireEvent.click(screen.getByRole("button",{name:"さらに読む"}));await waitFor(()=>expect(screen.queryByText("後で非公開にされた投稿")).toBeNull());expect(screen.queryByRole("region",{name:"知識への投稿"})).toBeNull();
});
it("an old profile response cannot become another profile's history",async()=>{
 let finish!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const view=render(<KnowledgeProfileActivity handle="alice"/>);
 fetcher.mockResolvedValueOnce(Response.json({available:true,activities:[activity("Bobの投稿")],nextCursor:null}));view.rerender(<KnowledgeProfileActivity handle="bob"/>);await screen.findByText("Bobの投稿");
 await act(async()=>{finish(Response.json({available:true,activities:[activity("Aliceの遅い投稿")],nextCursor:null}));});expect(screen.queryByText("Aliceの遅い投稿")).toBeNull();expect(screen.getByText("Bobの投稿")).toBeTruthy();
});
