import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({entities:vi.fn(),guard:vi.fn(),capability:vi.fn(()=>true)}));
vi.mock("../lib/server/knowledge-deployment",()=>({knowledgeCapability:mocks.capability}));
vi.mock("../lib/server/knowledge-read-runtime",()=>({knowledgeReadGuard:mocks.guard}));
vi.mock("../lib/server/knowledge-publication-preview",()=>({knowledgePublicationPreview:async()=>({entities:mocks.entities})}));
import {publicKnowledgeEntity} from "../lib/server/knowledge-entity-page";
import {publicLocalePath,decodePublicEntityId} from "../lib/domain/public-routes";
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();mocks.capability.mockReturnValue(true);});
it("正規探索は公開投影の同じIDだけを読み、未公開・停止は推測しない",async()=>{
 vi.stubEnv("KNOWLEDGE_WORKSPACE_ENABLED","1");mocks.entities.mockResolvedValue({entities:[{id:"import:kurosawa",content:{name:"黒澤明"}}]});
 expect((await publicKnowledgeEntity("import:kurosawa"))?.id).toBe("import:kurosawa");expect(mocks.guard).toHaveBeenCalled();expect(mocks.entities).toHaveBeenCalledWith({entityId:"import:kurosawa",limit:1});
 mocks.entities.mockResolvedValue({entities:[]});expect(await publicKnowledgeEntity("hidden")).toBeNull();
});
it("未提供の配置や不正なIDは読み出さず、通信障害を不存在に置き換えない",async()=>{
 vi.stubEnv("KNOWLEDGE_WORKSPACE_ENABLED","1");expect(await publicKnowledgeEntity("../invalid")).toBeNull();expect(mocks.entities).not.toHaveBeenCalled();
 mocks.capability.mockReturnValue(false);expect(await publicKnowledgeEntity("valid")).toBeNull();mocks.capability.mockReturnValue(true);
 mocks.entities.mockRejectedValue(new Error("DB unavailable"));await expect(publicKnowledgeEntity("valid")).rejects.toThrow("DB unavailable");
});
it("共通知識の正規URLも日本語と英語を往復でき、不正なパスは作らない",()=>{
 expect(publicLocalePath("/explore/import%3Aperson-1","en")).toBe("/en/explore/import%3Aperson-1");expect(publicLocalePath("/en/explore/import%3Aperson-1","ja")).toBe("/explore/import%3Aperson-1");expect(publicLocalePath("/explore/a%2Fb","en")).toBeNull();expect(publicLocalePath("/explore/%xx","en")).toBeNull();
});

it("URLエンコードされたNextの動的パラメータを公開IDへ戻す",()=>{
 const id="import:web.e8ce8d05768278da91a20d62ca4114bac8241c61fc47a5ed:entity:b6d8a4b9825667852cd8e2a8777ee842";
 expect(decodePublicEntityId(encodeURIComponent(id))).toBe(id);expect(decodePublicEntityId(id)).toBe(id);
 expect(decodePublicEntityId("a%2Fb")).toBeNull();expect(decodePublicEntityId("%xx")).toBeNull();
});
