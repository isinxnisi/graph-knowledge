import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("../lib/server/read-db",()=>({readTransaction:vi.fn()}));
vi.mock("../lib/server/public-revision",()=>({readPublicRevision:vi.fn()}));
vi.mock("../lib/client/saved-workspace",async original=>({...await original<typeof import("../lib/client/saved-workspace")>(),rebuildWorkspace:vi.fn()}));
import { enumeratePaths, parsePathWitness, validatePathResponse, type Adjacency, type DiscoveryPathsResponse } from "../lib/domain/discovery-paths";
import { discoveryPathsInput, discoverPaths, PATH_NEIGHBORS } from "../lib/server/discovery-paths";
import { readTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { executePathSearch } from "../lib/client/use-discovery-paths";
import { discoveryPathHref } from "../lib/client/discovery-path-navigation";
import { decodeExploration,rebuildExplorationUrl } from "../lib/client/exploration-url";
import { rebuildWorkspace } from "../lib/client/saved-workspace";
import { emptyGraph,emptyExpansion } from "../lib/client/graph-state";
import type { ClaimSummary } from "../lib/domain/api";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const node=(n:number)=>({id:id(n),kind:n%2?"person" as const:"work" as const,name:"Entity "+n,description:null});
const claim=(n:number,subject:number,object:number,extra:Partial<ClaimSummary>={}):ClaimSummary=>({id:id(1000+n),subjectId:id(subject),objectId:id(object),predicate:"CONTRIBUTED_TO",polarity:"affirmed",period:{from:null,to:null},contribution:null,organizationParticipation:null,eventParticipation:null,sourceCount:1,...extra});
const claims=[claim(1,1,0),claim(2,1,2,{polarity:"denied",contribution:{roleId:"DRAWING",scope:{kind:"publication",isbn13:"9784091921116",volumeLabel:"第1巻",editionLabel:"文庫",language:"ja"}},period:{from:{precision:"year",value:"2001"},to:null}}),claim(3,3,2),claim(4,1,0,{contribution:{roleId:"AUTHORSHIP",scope:null}})];
const read=async(ids:string[]):Promise<Adjacency[]>=>ids.map(id=>({id,claims:claims.filter(c=>c.subjectId===id||c.objectId===id),hasMore:false}));
const input=(q="")=>discoveryPathsInput(new Request("http://localhost/?anchor="+id(0)+"&"+q));
const conditions={predicates:null,contributionRoles:null};
async function response():Promise<DiscoveryPathsResponse>{return {revision:"r1",anchor:node(0),nodes:[0,1,2,3].map(node),claims,depth:2,...await enumeratePaths(id(0),2,read)};}
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();vi.stubEnv("GRAPH_DATASET","public-kg");});
it("2・3段の単純経路を辿り、逆方向・否定・scope・並行Claimを統合しない",async()=>{
 const two=await enumeratePaths(id(0),2,read),three=await enumeratePaths(id(0),3,read);
 expect(two.paths).toEqual([{nodeIds:[id(0),id(1),id(2)],claimIds:[[id(1001),id(1004)],[id(1002)]]}]);
 expect(three.paths[0].nodeIds).toEqual([0,1,2,3].map(id));expect(two.scan.reasons).toEqual([]);
 const result=validatePathResponse(await response(),id(0),2,"r1",conditions);
 expect(result.claims.find(c=>c.id===id(1002))).toMatchObject({polarity:"denied",contribution:{roleId:"DRAWING",scope:{isbn13:"9784091921116"}},period:{from:{value:"2001"}}});
});
it("自己循環・同じClaimの重複・逆戻りを返さない",async()=>{
 const loop=claim(9,1,1,{predicate:"INFLUENCED_BY"});
 const result=await enumeratePaths(id(0),3,async ids=>(await read(ids)).map(p=>({...p,claims:[...p.claims,...p.claims,loop]})));
 expect(result.paths).toHaveLength(1);expect(new Set(result.paths[0].nodeIds).size).toBe(4);expect(result.paths[0].claimIds.flat()).toHaveLength(4);
});
it("高次数でも記録・展開・中間候補・結果上限で止め、完全な探索と偽らない",async()=>{
 const loader=vi.fn(async(ids:string[])=>ids.map(from=>({id:from,hasMore:true,claims:Array.from({length:20},(_,i)=>({...claim(i+200,1,i+20),subjectId:from,objectId:from===id(0)?id(i+1):id(i+50)}))})));
 const result=await enumeratePaths(id(0),2,loader,{neighbors:20,expansions:3,prefixes:4,results:2});
 expect(result.paths).toHaveLength(2);expect(result.scan.expanded).toBe(3);expect(result.scan.reasons).toEqual(["expansions","neighbors","prefixes","results"]);
 expect(loader.mock.calls.flatMap(([ids])=>ids)).toHaveLength(3);
});
it("深さ不足の末端は3段の結果にせず、条件ごとの再試行は決定的",async()=>{
 const a=await enumeratePaths(id(0),3,async ids=>(await read(ids)).map(p=>({...p,claims:p.claims.filter(c=>c.id!==id(1003))})));
 expect(a.paths).toEqual([]);expect(await enumeratePaths(id(0),2,read)).toEqual(await enumeratePaths(id(0),2,read));
});
it("未知条件・深さ・重複入力・Roleの黙った削除を拒否し、空集合を保持する",()=>{
 expect(input("depth=3&predicates=CONTRIBUTED_TO&contributionRoles=DRAWING")).toMatchObject({depth:3,conditions:{predicates:["CONTRIBUTED_TO"],contributionRoles:["DRAWING"]}});
 expect(input("predicates=").conditions.predicates).toEqual([]);
 for(const q of ["depth=4","depth=2&depth=3","world=manga","q=PLUTO","predicates=AFFILIATED_WITH&contributionRoles=DRAWING","contributionRoles=FAKE","organizationPositions=VISITOR"]){expect(()=>input(q)).toThrow();}
});
it("応答の版・起点・循環・端点・Roleの取り違えを拒否する",async()=>{
 const r=await response();expect(()=>validatePathResponse(r,id(0),2,"stale",conditions)).toThrow();
 expect(()=>validatePathResponse(r,id(0),3,"r1",conditions)).toThrow();
 expect(()=>validatePathResponse({...r,claims:r.claims.filter(c=>c.id!==id(1002))},id(0),2,"r1",conditions)).toThrow();
 expect(()=>validatePathResponse(r,id(0),2,"r1",{predicates:["CONTRIBUTED_TO"],contributionRoles:["AUTHORSHIP"]})).toThrow();
});
it("read-only処理は同一Claimの公開性・RoleをLIMIT前に絞り、版を前後照合する",async()=>{
 const run=vi.fn().mockResolvedValueOnce({records:[{get:()=>node(0)}]}).mockResolvedValue({records:[]});
 vi.mocked(readTransaction).mockImplementation(action=>action({run} as never));vi.mocked(readPublicRevision).mockResolvedValue("r1");
 const result=await discoverPaths(input("predicates=CONTRIBUTED_TO&contributionRoles=DRAWING&revision=r1"));
 expect(result.paths).toEqual([]);expect(run).toHaveBeenLastCalledWith(PATH_NEIGHBORS,expect.objectContaining({ids:[id(0)],roles:["DRAWING"]}));
 expect(PATH_NEIGHBORS.split("LIMIT $take")[0]).toContain("c.visibility = 'published'");expect(PATH_NEIGHBORS.split("LIMIT $take")[0]).toContain("c.contributionRoleId IN $roles");
 expect(readPublicRevision).toHaveBeenLastCalledWith(expect.anything(),"r1");
 vi.mocked(readPublicRevision).mockRejectedValueOnce(new Error("changed"));await expect(discoverPaths(input())).rejects.toThrow("changed");
 vi.stubEnv("GRAPH_DATASET","demo");await expect(discoverPaths(input())).rejects.toMatchObject({status:400});
});
it.each(["unchanged","before","after","response"])("adapterは条件とrevisionを送り、版変化を成功にしない: %s",async mode=>{
 let reads=0;const r=await response();const fetcher=vi.fn(async(path:string)=>{if(path==="/api/dataset"){reads++;return Response.json({dataset:"public-kg",revision:mode==="before"||mode==="after"&&reads>1?"r2":"r1"});}return Response.json({...r,revision:mode==="response"?"r2":"r1"});});vi.stubGlobal("fetch",fetcher);
 const promise=executePathSearch(id(0),2,conditions,"r1",new AbortController().signal);
 if(mode==="unchanged"){await expect(promise).resolves.toMatchObject({paths:r.paths});expect(fetcher.mock.calls.some(([path])=>path.includes("revision=r1"))).toBe(true);}else await expect(promise).rejects.toMatchObject({status:409});
});
it("Graph URLは全段を再取得する枝と版付き証人を持ち、破損や別起点を拒否する",async()=>{
 const r=await response(),url=new URL(discoveryPathHref(r.paths[0],conditions,"r1"),"http://local");
 const saved=decodeExploration(url.searchParams.get("s")!,id(0),"public-kg");expect(saved.branches.map(b=>b.id)).toEqual([id(0),id(1)]);
 const witness=parsePathWitness(url.searchParams.get("via"),id(0))!;expect(witness.revision).toBe("r1");expect(witness.claimIds).toEqual(r.paths[0].claimIds);
 expect(()=>parsePathWitness(url.searchParams.get("via"),id(2))).toThrow();expect(()=>parsePathWitness("a".repeat(4097),id(0))).toThrow();
 const graph={...emptyGraph(),revision:"r1",centerId:id(0),nodes:Object.fromEntries(r.nodes.map(n=>[n.id,n])),claims:Object.fromEntries(r.claims.map(c=>[c.id,c])),expansions:Object.fromEntries(saved.branches.map(b=>[b.id,{...emptyExpansion(),pages:[{after:null,claimIds:[],nextCursor:null}]}]))};
 vi.mocked(rebuildWorkspace).mockResolvedValue({graph,view:null,skippedBranches:0});vi.stubGlobal("fetch",vi.fn(async()=>Response.json({dataset:"public-kg",revision:"r1"})));
 await expect(rebuildExplorationUrl(saved,new AbortController().signal,witness)).resolves.toMatchObject({selectedEntityId:id(2)});
 delete graph.claims[id(1002)];await expect(rebuildExplorationUrl(saved,new AbortController().signal,witness)).rejects.toThrow("changed");
 graph.revision="r2";await expect(rebuildExplorationUrl(saved,new AbortController().signal,witness)).rejects.toThrow("changed");
});
