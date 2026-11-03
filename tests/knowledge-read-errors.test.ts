import {afterEach,expect,it,vi} from "vitest";
import {readKnowledge} from "../lib/client/use-knowledge-workspace";
afterEach(()=>vi.unstubAllGlobals());
it("keeps gateway HTML out of the user message and treats it as a retryable connection failure",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("<!DOCTYPE html><title>Gateway</title>",{status:502})));
 await expect(readKnowledge("status")).rejects.toMatchObject({status:0,message:"接続を確認できませんでした。表示を残したまま再試行できます。"});
});
it("keeps a failed network read retryable",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
 await expect(readKnowledge("status")).rejects.toMatchObject({status:0});
});
it("preserves explicit access failures so the reader can remove inaccessible content",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:"この記録は閲覧できません"},{status:404})));
 await expect(readKnowledge("record",{recordId:"stopped"})).rejects.toMatchObject({status:404,message:"この記録は閲覧できません"});
});
