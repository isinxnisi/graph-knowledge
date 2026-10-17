import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("../lib/server/read-db",()=>({readTransaction:vi.fn()}));
vi.mock("../lib/server/public-revision",()=>({readPublicRevision:vi.fn()}));
import { discoveryPathsInput, discoverPaths } from "../lib/server/discovery-paths";
import { readTransaction } from "../lib/server/read-db";
import { readPublicRevision } from "../lib/server/public-revision";
import { enumeratePaths, pathScope, validatePathResponse, type PathUi } from "../lib/domain/discovery-paths";
import { pathPresets, presetAcceptsStep, type PathPresetRef } from "../lib/domain/discovery-path-presets";
import { rebasePathUi } from "../lib/domain/discovery-path-state";
import { initialContext } from "../lib/domain/discovery-prototype";
import { executePathSearch } from "../lib/client/use-discovery-paths";
import type { ClaimSummary,EntitySummary } from "../lib/domain/api";
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const node=(n:number,kind:EntitySummary["kind"]):EntitySummary=>({id:id(n),kind,name:String(n),description:null});
const claim=(n:number,person:number,object:number):ClaimSummary=>({id:id(n+1000),subjectId:id(person),objectId:id(object),predicate:"CONTRIBUTED_TO",polarity:"denied",period:{from:null,to:null},contribution:null,organizationParticipation:null,eventParticipation:null,sourceCount:1});
const ref:PathPresetRef={id:"other-works",revision:1};
const input=(q:string)=>discoveryPathsInput(new Request("http://local/?anchor="+id(0)+"&"+q));
afterEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("各プリセットを固定版の実行条件に解決し、不一致・未知の版を拒否する",()=>{
 expect(new Set(pathPresets.map(p=>p.id)).size).toBe(4);
 expect(input("preset=work-creators&presetRevision=1")).toMatchObject({depth:3,preset:{id:"work-creators",revision:1},conditions:{predicates:["CONTRIBUTED_TO"]}});
 expect(input("preset=other-works&presetRevision=1&contributionRoles=DRAWING").conditions.contributionRoles).toEqual(["DRAWING"]);
 for(const q of ["preset=unknown&presetRevision=1","preset=other-works","presetRevision=1","preset=other-works&presetRevision=2","preset=other-works&presetRevision=1&depth=3","preset=other-works&presetRevision=1&predicates=","preset=other-works&presetRevision=1&predicates=AFFILIATED_WITH","preset=institution-bridge&presetRevision=1&contributionRoles=DRAWING"]){expect(()=>input(q)).toThrow();}
});
it("作品・人物・方向を同じClaimで検証し、否定を肯定に変換しない",()=>{
 const person=node(1,"person"),work=node(0,"work"),org=node(2,"organization"),c=claim(1,1,0);
 expect(presetAcceptsStep(ref,c,work,person,0)).toBe(true);
 expect(presetAcceptsStep(ref,{...c,subjectId:work.id,objectId:person.id},work,person,0)).toBe(false);
 expect(presetAcceptsStep(ref,claim(2,1,2),person,org,1)).toBe(false);
 expect(c.polarity).toBe("denied");
});
it("機関プリセットは同一人物のperson→organization記録だけを両方向に辿る",()=>{
 const r:PathPresetRef={id:"institution-bridge",revision:1},org=node(0,"organization"),person=node(1,"person"),c={...claim(1,1,0),predicate:"AFFILIATED_WITH" as const};
 expect(presetAcceptsStep(r,c,org,person,0)).toBe(true);
 expect(presetAcceptsStep(r,c,person,org,1)).toBe(true);
 expect(presetAcceptsStep(r,{...c,predicate:"CONTRIBUTED_TO"},org,person,0)).toBe(false);
});
it("経路の形を候補LIMIT前に評価し、不適合候補の後にある作品も取得する",async()=>{
 const nodes=[node(0,"work"),node(1,"person"),...Array.from({length:15},(_,i)=>node(i+2,"organization")),node(17,"work"),node(18,"work")];
 const byId=new Map(nodes.map(n=>[n.id,n])),claims=[claim(0,1,0),...Array.from({length:17},(_,i)=>claim(i+1,1,i+2))];
 const result=await enumeratePaths(id(0),2,async ids=>ids.map(id=>({id,claims:claims.filter(c=>c.subjectId===id||c.objectId===id),hasMore:false})),{neighbors:20,expansions:24,prefixes:128,results:2},(c,from,to,step)=>presetAcceptsStep(ref,c,byId.get(from)!,byId.get(to)!,step));
 expect(result.paths.map(p=>p.nodeIds.at(-1))).toEqual([id(17),id(18)]);expect(result.scan.reasons).toEqual([]);
});
it("型の合わない対象は無条件検索へフォールバックせずAPIで拒否する",async()=>{
 vi.stubEnv("GRAPH_DATASET","public-kg");vi.mocked(readPublicRevision).mockResolvedValue("r1");
 vi.mocked(readTransaction).mockImplementation(fn=>fn({run:vi.fn().mockResolvedValue({records:[{get:()=>node(0,"person")} ]})} as never));
 await expect(discoverPaths(input("preset=other-works&presetRevision=1"))).rejects.toMatchObject({status:400});
});
it("応答のプリセット・端点型・向きが要求と違えば表示しない",()=>{
 const nodes=[node(0,"work"),node(1,"person"),node(2,"work")],claims=[claim(0,1,0),claim(1,1,2)];
 const r={preset:ref,revision:"r1",anchor:nodes[0],nodes,claims,depth:2,paths:[{nodeIds:nodes.map(n=>n.id),claimIds:claims.map(c=>[c.id])}],scan:{expanded:2,reasons:[],limitedIds:[]}},conditions={predicates:["CONTRIBUTED_TO" as const],contributionRoles:null};
 expect(validatePathResponse(r,id(0),2,"r1",conditions,ref).paths).toHaveLength(1);
 expect(()=>validatePathResponse(r,id(0),2,"r1",conditions)).toThrow();
 expect(()=>validatePathResponse({...r,preset:{id:"work-creators",revision:1}},id(0),2,"r1",conditions,{id:"work-creators",revision:1})).toThrow();
 expect(()=>validatePathResponse(r,id(0),2,"r1",{predicates:null,contributionRoles:null},ref)).toThrow();
 expect(()=>validatePathResponse({...r,nodes:[nodes[0],nodes[1],{...nodes[2],kind:"organization"}]},id(0),2,"r1",conditions,ref)).toThrow();
 expect(()=>validatePathResponse({...r,claims:[claims[0],{...claims[1],subjectId:id(2),objectId:id(1)}]},id(0),2,"r1",conditions,ref)).toThrow();
});
it("対象とRoleは互換なプリセットに再適用でき、関係変更は自由探索と明示する",()=>{
 const before={...initialContext,anchor:node(0,"work"),question:"credits" as const};
 const ui:PathUi={scope:pathScope(id(0),"CONTRIBUTED_TO",null),depth:2,open:true,selected:"old",preset:ref};
 expect(rebasePathUi(ui,before,{...before,anchor:node(2,"work"),role:"DRAWING"})).toMatchObject({scope:pathScope(id(2),"CONTRIBUTED_TO","DRAWING"),preset:ref,open:true,selected:null});
 expect(rebasePathUi(ui,before,{...before,question:"influences"})).toMatchObject({preset:null,changed:true,open:true});
 expect(rebasePathUi(ui,before,{...before,anchor:node(1,"person")})).toMatchObject({preset:null,changed:true});
});
it("クライアントはプリセット版を送信し、自由検索の成功応答で代用しない",async()=>{
 const fetcher=vi.fn(async(url:string)=>url==="/api/dataset"?Response.json({dataset:"public-kg",revision:"r1"}):Response.json({revision:"r1"}));vi.stubGlobal("fetch",fetcher);
 await expect(executePathSearch(id(0),2,{predicates:["CONTRIBUTED_TO"],contributionRoles:null},"r1",new AbortController().signal,ref)).rejects.toThrow();
 expect(fetcher.mock.calls[1][0]).toContain("preset=other-works&presetRevision=1");
});
