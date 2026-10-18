import { expect, it, vi, afterEach } from "vitest";
import { allRelations, otherWorks, presetApplication, initialConnectionsWorkspace, connectionsWorkspaceSchema, type ConnectionSelection } from "../lib/domain/discovery-connections";
import { presetCatalog } from "../lib/domain/discovery-preset-catalog";
import { discoveryRelationHref, parseDiscoveryHandoff, verifyDiscoveryHandoff } from "../lib/client/discovery-relation-navigation";
import { decodeExploration } from "../lib/client/exploration-url";
import { relationConditionKey } from "../lib/domain/relation-conditions";
import { id, page, route } from "./pattern-graph-fixture";
import { fetchDatasetRevision, fetchEntity, fetchClaim } from "../lib/client/api";
vi.mock("../lib/client/api", async original => ({ ...await original<typeof import("../lib/client/api")>(), fetchDatasetRevision: vi.fn(), fetchEntity: vi.fn(), fetchClaim: vi.fn() }));
const proofPage=page([route(2,3)]), relation=otherWorks(["AUTHORSHIP"]);
const witness={version:1 as const,dataset:"public-kg" as const,revision:"r1",conditionKey:relationConditionKey(relation),route:proofPage.routes[0]};
const selection={entity:proofPage.root,relation,revision:"r1",witness};
function parse(input:ConnectionSelection=selection){const href=discoveryRelationHref(input),params=new URL(href,"https://example.invalid").searchParams;const workspace=decodeExploration(params.get("s")!,input.entity.id,"public-kg");return {workspace,handoff:parseDiscoveryHandoff(params.get("match"),workspace)!};}
function material(){
 vi.mocked(fetchDatasetRevision).mockResolvedValue({dataset:"public-kg",revision:"r1"});
 vi.mocked(fetchEntity).mockImplementation(async entityId=>({entity:{...proofPage.nodes.find(n=>n.id===entityId)!,aliases:[],event:null}}));
 vi.mocked(fetchClaim).mockImplementation(async claimId=>({claim:{...proofPage.claims.find(c=>c.id===claimId)!,createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",citations:[]},relatedClaimIds:[]}));
}
afterEach(()=>vi.resetAllMocks());
it("対象指定有無は独立プロパティとして判定し、新方式2件と旧方式3件を区別する",()=>{
 expect(presetCatalog.filter(p=>presetApplication(p).binding==="bound")).toHaveLength(3);
 expect(presetCatalog.filter(p=>presetApplication(p).binding==="unbound").map(p=>p.id)).toEqual(["other-works","authored-works"]);
 expect(presetCatalog.filter(p=>presetApplication(p).binding==="legacy")).toHaveLength(3);
 expect(presetApplication(presetCatalog.find(p=>p.id==="pluto")!)).toMatchObject({binding:"bound",relation:{type:"adjacent",predicates:["CONTRIBUTED_TO"],polarity:"all-records"}});
 expect(connectionsWorkspaceSchema.parse(initialConnectionsWorkspace)).toEqual(initialConnectionsWorkspace);
});
it("検索と同じ条件・完全証拠・公開版を渡し、初期表示は通常Graphと同じ最初の展開にする",()=>{
 const {workspace,handoff}=parse();expect(workspace.relation).toEqual(relation);expect(handoff.witness).toEqual(witness);
 expect(workspace.execution).toMatchObject({type:"pattern",routes:[{open:false}],entityState:{branches:[{id:id(1),open:true,claimIds:[witness.route.claimIds[0]]}]}});
 const adjacent={...selection,relation:allRelations(),witness:null};expect(parse(adjacent).workspace.execution).toMatchObject({type:"adjacent"});
 expect(()=>discoveryRelationHref({...selection,witness:null})).toThrow();
});
it("条件・対象・公開版を改ざんした引継ぎを拒否し、旧共有URLには制約を追加しない",()=>{
 const {workspace}=parse();expect(parseDiscoveryHandoff(null,workspace)).toBeNull();
 const encoded=(patch:object)=>btoa(JSON.stringify({version:1,revision:"r1",witness,...patch})).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
 for(const patch of [{revision:"r2"},{witness:{...witness,conditionKey:"wrong"}},{witness:{...witness,route:{...witness.route,nodeIds:[id(9),id(2),id(3)]}}}])expect(()=>parseDiscoveryHandoff(encoded(patch),workspace)).toThrow();
 expect(()=>parseDiscoveryHandoff("x".repeat(6001),workspace)).toThrow();
});
it("近傍上限に依存せずClaimを直接検証し、肯否・方向・欠落・Roleの不一致を受理しない",async()=>{
 material();const {workspace,handoff}=parse(),signal=new AbortController().signal;
 expect((await verifyDiscoveryHandoff(handoff,workspace,signal)).claims).toHaveLength(2);
 expect(fetchClaim).toHaveBeenCalledWith(witness.route.claimIds[1],signal);
 for(const patch of [{polarity:"denied"},{subjectId:id(1),objectId:id(2)},{contribution:{roleId:"SUPERVISION",scope:null}},{withdrawal:{reason:"withdrawn",release:"r2",replacementClaimId:null}}]){
  material();const original=await fetchClaim(witness.route.claimIds[0],signal);vi.mocked(fetchClaim).mockResolvedValueOnce({...original,claim:{...original.claim,...patch} as typeof original.claim});
  await expect(verifyDiscoveryHandoff(handoff,workspace,signal)).rejects.toThrow();
 }
 material();vi.mocked(fetchClaim).mockRejectedValueOnce(Error("missing"));await expect(verifyDiscoveryHandoff(handoff,workspace,signal)).rejects.toThrow("missing");
});
it("検証途中の版変更・Abortは正常なGraphとして適用できない",async()=>{
 material();const {workspace,handoff}=parse();vi.mocked(fetchDatasetRevision).mockResolvedValueOnce({dataset:"public-kg",revision:"r1"}).mockResolvedValueOnce({dataset:"public-kg",revision:"r2"});
 await expect(verifyDiscoveryHandoff(handoff,workspace,new AbortController().signal)).rejects.toMatchObject({status:409});
 material();const controller=new AbortController();controller.abort();await expect(verifyDiscoveryHandoff(handoff,workspace,controller.signal)).rejects.toThrow();
});
