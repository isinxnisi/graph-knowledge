/**
 * Actual current pure-domain runtime, no server module, API, DB or import emission.
 * Deterministic UUIDv4-shaped IDs are ONLY ephemeral test keys, never public IDs.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { contributionSchema, roleIdSchema } from "../../../lib/domain/contribution";
import { relationConditionSchema } from "../../../lib/domain/relation-conditions";
import { validateRelationRoute } from "../../../lib/domain/relation-patterns";
import { enumeratePaths, PATH_LIMITS } from "../../../lib/domain/discovery-paths";
import { presetAcceptsStep, pathPresetRefSchema } from "../../../lib/domain/discovery-path-presets";
import { claimSummarySchema } from "../../../lib/domain/api";
const here = resolve("docs/research/film-discovery-pilot-20261026");
const data = JSON.parse(readFileSync(resolve(here,"CANDIDATES.json"),"utf8"));
const rows = data.candidates.filter((c:any)=>c.state==="checked-source-candidate" && c.relation==="CREDIT");
const uid=(s:string)=>{const h=createHash("sha256").update("film-research-only:"+s).digest("hex");return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-8"+h.slice(17,20)+"-"+h.slice(20,32);};
const nodes=new Map(data.entities.map((e:any)=>[uid(e.id),{id:uid(e.id),kind:e.kind,name:e.labels.en?.value??e.id,description:null}]));
const qids=new Map(data.entities.map((e:any)=>[uid(e.id),e.id]));
const original=new Map(rows.map((c:any)=>[uid(c.id),c]));
const toClaim=(c:any,eraseRoles=false)=>({
 id:uid(c.id),subjectId:uid(c.subject),objectId:uid(c.object),predicate:"CONTRIBUTED_TO",
 polarity:"affirmed",period:{from:null,to:null},
 contribution:{roleId:eraseRoles?null:c.research_role==="SCREENWRITING"?"SCRIPT_WRITING":c.research_role,scope:null},
 organizationParticipation:null,eventParticipation:null,sourceCount:c.citations.filter((x:any)=>x.stance==="support").length
});
const baseline=rows.filter((c:any)=>["SCREENWRITING","PRODUCING"].includes(c.research_role)).map((c:any)=>claimSummarySchema.parse(toClaim(c)));
// All-role experiment explicitly erases unsupported roles to isolate geometry/limits.
// It cannot stand for typed film API support or publishable Claims.
const geometry=rows.map((c:any)=>claimSummarySchema.parse(toClaim(c,true)));
const condition=relationConditionSchema.parse({version:1,type:"pattern",pattern:{id:"other-works",revision:2},polarity:"affirmed",contributionRoles:["SCRIPT_WRITING"]});
const tests:string[]=[];
function test(name:string,run:()=>void){run();tests.push(name);}
test("unknown film roles rejected",()=>{for(const r of ["DIRECTING","CAST","MUSIC","CINEMATOGRAPHY"])assert.equal(roleIdSchema.safeParse(r).success,false);});
test("film cut scope rejected; null publication scope remains representable",()=>{
 assert.equal(contributionSchema.safeParse({roleId:"SCRIPT_WRITING",scope:{kind:"film-cut",cut:"final"}}).success,false);
 assert.equal(contributionSchema.safeParse({roleId:"SCRIPT_WRITING",scope:null}).success,true);
});
test("step-specific roles rejected by current strict condition",()=>assert.equal(relationConditionSchema.safeParse({...condition,steps:[{roles:["CAST"]},{roles:["DIRECTING"]}]}).success,false));
test("unknown preset revision rejected",()=>assert.equal(pathPresetRefSchema.safeParse({id:"other-works",revision:2}).success,false));
async function run(root:string,depth:2|3,claims:any[],bounded:boolean,perStep?:string[][],override?:Partial<Record<keyof typeof PATH_LIMITS, number>>){
 const limits=bounded?{...PATH_LIMITS,...override}:{neighbors:10000,expansions:10000,prefixes:10000,results:10000};
 const preset={id:depth===2?"other-works":"work-creators",revision:1} as const;
 const read=async(ids:string[])=>ids.map(id=>{
  const all=claims.filter(c=>[c.subjectId,c.objectId].includes(id)).sort((a,b)=>a.id.localeCompare(b.id));
  return {id,claims:all.slice(0,limits.neighbors),hasMore:all.length>limits.neighbors};
 });
 const result=await enumeratePaths(uid(root),depth,read,limits,(c,from,to,step)=>
  presetAcceptsStep(preset,c,nodes.get(from) as any,nodes.get(to) as any,step)
  &&(!perStep||perStep[step].includes((original.get(c.id) as any).research_role)));
 return {...result,paths:result.paths.map(p=>({...p,researchNodes:p.nodeIds.map(id=>qids.get(id)),
  candidateIds:p.claimIds.map(ids=>ids.map(id=>(original.get(id) as any).id))}))};
}
async function main(){
 const scripts=baseline.filter(c=>c.contribution?.roleId==="SCRIPT_WRITING");
 const r=await run("Q184843",2,scripts,true);
 test("actual other-works v1 geometry finds two screenplay paths",()=>assert.equal(r.paths.length,2));
 test("current pattern rev2 validates both complete witnesses",()=>{
  const claims=new Map(scripts.map(c=>[c.id,c]));
  for(const p of r.paths)validateRelationRoute(condition,uid("Q184843"),{nodeIds:p.nodeIds,claimIds:p.claimIds.map(ids=>ids[0])},nodes as any,claims);
 });
 test("missing or reversed independent Claim rejects witness",()=>{
  const p=r.paths[0],route={nodeIds:p.nodeIds,claimIds:p.claimIds.map(ids=>ids[0])};
  const claims=new Map(scripts.map(c=>[c.id,c]));const c=claims.get(route.claimIds[0])!;
  claims.delete(c.id);assert.throws(()=>validateRelationRoute(condition,uid("Q184843"),route,nodes as any,claims));
  claims.set(c.id,{...c,subjectId:c.objectId,objectId:c.subjectId});
  assert.throws(()=>validateRelationRoute(condition,uid("Q184843"),route,nodes as any,claims));
 });
 const exact=await run("Q184843",3,geometry,false),bounded=await run("Q184843",3,geometry,true);
 test("real sample exposes default results cutoff",()=>{assert(exact.paths.length>12);assert.equal(bounded.paths.length,12);assert(bounded.scan.reasons.includes("results"));});
 const proposed=await run("Q184843",3,geometry,false,[["SCREENWRITING"],["SCREENWRITING"],["CAST"]]);
 test("research callback finds seven per-step witnesses using existing traversal",()=>{assert.equal(proposed.paths.length,7);assert.deepEqual(proposed.scan.reasons,[]);});
 const tiny=await run("Q184843",3,geometry,true,undefined,{neighbors:1});
 test("zero under constrained acquisition is explicitly partial",()=>{assert.equal(tiny.paths.length,0);assert(tiny.scan.reasons.includes("neighbors"));});
 const files=["docs/research/film-discovery-pilot-20261026/CANDIDATES.json","docs/research/film-discovery-pilot-20261026/check-current.ts","lib/domain/contribution.ts","lib/domain/discovery-paths.ts","lib/domain/discovery-path-presets.ts","lib/domain/relation-conditions.ts","lib/domain/relation-patterns.ts","lib/server/relation-pattern-execution.ts"];
 const result={authority:"isolated-pure-domain-runtime-proof-no-public-results",node:process.version,
   tests,passed:tests.length,limits:PATH_LIMITS,
   inputHashes:Object.fromEntries(files.map(f=>[f,createHash("sha256").update(readFileSync(f,"utf8").replaceAll("\r\n","\n")).digest("hex")])),
   baselineWitnesses:r,
   geometryOnly:{note:"All 77 checked credit records projected to role=null ONLY to measure geometry. No film-role compatibility claim.",exact,bounded},
   proposedStepCallback:{note:"Research-only callback, not exposed by current public request schema.",result:proposed},
   syntheticLimitOnRealData:{note:"neighbor cap=1, not default production settings",result:tiny}};
 writeFileSync(resolve(here,"CURRENT_RUNTIME_PROOF.json"),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({passed:tests.length,baselinePaths:r.paths.length,exactGeometryPaths:exact.paths.length,boundedGeometryPaths:bounded.paths.length,scan:bounded.scan,stepPaths:proposed.paths.length,tinyScan:tiny.scan}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
