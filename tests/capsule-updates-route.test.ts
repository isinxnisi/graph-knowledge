import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({guard:vi.fn(),read:vi.fn()}));
vi.mock("../lib/server/knowledge-read-runtime",()=>({knowledgeReadGuard:mocks.guard}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>({capsuleUpdates:mocks.read})}));
import {POST} from "../app/api/knowledge/capsule-updates/route";
beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockReset();mocks.read.mockReset();});
it("bounds the read body before querying and never returns private error details",async()=>{
 const large=await POST(new Request("http://localhost:3276/api/knowledge/capsule-updates",{method:"POST",body:" ".repeat(128001)}));expect(large.status).toBe(413);expect(mocks.read).not.toHaveBeenCalled();
 const broken=await POST(new Request("http://localhost:3276/api/knowledge/capsule-updates",{method:"POST",body:"{"}));expect(broken.status).toBe(400);
 mocks.read.mockRejectedValue(new Error("private database credential"));const failed=await POST(new Request("http://localhost:3276/api/knowledge/capsule-updates",{method:"POST",body:"{}"}));expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("credential");
});
it("uses the existing runtime guard and a non-cacheable response",async()=>{
 mocks.read.mockResolvedValue({generation:"public"});const result=await POST(new Request("http://localhost:3276/api/knowledge/capsule-updates",{method:"POST",body:JSON.stringify({recordIds:["r"],entityIds:[]})}));expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toContain("no-store");expect(result.headers.get("x-robots-tag")).toContain("noindex");expect(mocks.guard).toHaveBeenCalledTimes(1);expect(mocks.read).toHaveBeenCalledWith({recordIds:["r"],entityIds:[]});
 mocks.guard.mockImplementation(()=>{throw Object.assign(new Error("private guard details"),{status:403});});const stopped=await POST(new Request("http://wrong.example/api/knowledge/capsule-updates",{method:"POST",body:"{}"}));expect(stopped.status).toBe(403);expect(await stopped.text()).not.toContain("guard details");
});
