import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, mkdtemp, rm, writeFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fixtureV4Schema } from "../lib/domain/fixture";
import { canonicalLabJson, labCounts, MAX_LAB_ARTIFACT_BYTES } from "../lib/domain/ai-lab";
import { activateLabArtifact, parseLabArtifact, publicLabKgReader, readActiveLabArtifact, readLabPointer, sealLabArtifact, verifyLabPublicReferences, type LabKgReader } from "../lib/server/ai-lab-artifact";

const initial = parseLabArtifact(await readFile("data/ai-lab/initial.json"));
const sortie = parseLabArtifact(await readFile("docs/verification/ai-lab-education-20261026/public-artifact.json"));
const fixture = fixtureV4Schema.parse(JSON.parse(gunzipSync(await readFile("datasets/connectivity/issue-34/after-data.json.gz")).toString()));
const revision = "88437056-b74f-42ab-88c0-33ed435bdccc";
const kg: LabKgReader = async url => {
  if (url === "/api/dataset") return { dataset:"public-kg",revision };
  const id = url.split("/").at(-1);
  if (url.startsWith("/api/entities/")) { const e=fixture.entities.find(e=>e.id===id); if(!e)throw Error("Not public"); return { entity:{id:e.id,kind:e.kind,name:e.name,description:e.description,aliases:e.aliases,event:e.event??null} }; }
  const claim = fixture.claims.find(c=>c.id===id);
  if (!claim) throw Error("Not public");
  const publicClaim={id:claim.id,subjectId:claim.subjectId,objectId:claim.objectId,predicate:claim.predicate,polarity:claim.polarity,period:claim.period,contribution:claim.contribution,createdAt:claim.createdAt,updatedAt:claim.updatedAt};
  return { claim:{...publicClaim,sourceCount:1,organizationParticipation:null,eventParticipation:null,citations:fixture.citations.filter(c=>c.claimId===id).map(c=>({id:c.id,locator:c.locator,note:c.note,accessedAt:c.accessedAt,stance:c.stance,roleEvidence:c.roleEvidence??null,positionEvidence:null,eventParticipationEvidence:null,source:fixture.sources.find(s=>s.id===c.sourceId)}))} };
};
const directories: string[] = [];
async function directory() { const p = await mkdtemp(path.join(tmpdir(),"plunode-lab-artifact-")); directories.push(p); return p; }
afterEach(async()=>{ for (const p of directories.splice(0)) await rm(p,{recursive:true,force:true}); vi.unstubAllEnvs(); });

describe("AIラボ初段の公開artifact",()=>{
  it("v2は実応答1件・新規送信前保留2件を追記し、初段7件を変更しない",async()=>{
    expect(labCounts(sortie.payload)).toEqual({inference:1,training:0,baseline:5,held:4});
    expect(sortie.payload.runs.slice(0,7)).toEqual(initial.payload.runs);
    const real=sortie.payload.runs.find(r=>r.executionKind==='kev-api')!;
    expect(real.choice).toBe('path-400881205d404a66cd397e09');
    expect(real.observation?.atSend?.temperatureC).toBe(70);
    expect(real.observation?.peak).toEqual({temperatureC:74,utilizationPercent:99,powerWatts:71.31,usedVramMiB:6378});
    expect(real.semanticReview).toBe('pending-human');
    expect(canonicalLabJson(sortie)).not.toMatch(/requestWire|rawResponse|acceptable|\/home\/|apiKey/);
    const dir=await directory();
    await activateLabArtifact(dir,initial,null,kg);
    await activateLabArtifact(dir,sortie,initial.sha256,kg);
    expect((await readActiveLabArtifact(dir))?.sha256).toBe(sortie.sha256);
    await activateLabArtifact(dir,initial,sortie.sha256,kg);
    expect((await readActiveLabArtifact(dir))?.sha256).toBe(initial.sha256);
  });
  it("送信後の失敗・不明は推論完了に数えず、機械検証・モデル版・送信の矛盾を拒否する",()=>{
    for(const status of ['failed','unknown'] as const){
      const value=structuredClone(sortie.payload),real=value.runs.find(r=>r.executionKind==='kev-api')!;
      real.status=status;real.choice=null;real.observation!.responseValidated=false;real.observation!.errorCode='transport_error';
      expect(labCounts(sealLabArtifact(value).payload).inference).toBe(0);
    }
    for(const mutate of [
      (r: typeof sortie.payload.runs[number])=>{r.observation!.requestSent=false;},
      (r: typeof sortie.payload.runs[number])=>{r.observation!.responseValidated=false;},
      (r: typeof sortie.payload.runs[number])=>{r.modelRevision=null;},
      (r: typeof sortie.payload.runs[number])=>{r.status='unknown';},
      (r: typeof sortie.payload.runs[number])=>{r.observation!.peak.powerWatts=Infinity;},
    ]){const value=structuredClone(sortie.payload);mutate(value.runs.find(r=>r.executionKind==='kev-api')!);expect(()=>sealLabArtifact(value)).toThrow();}
    expect(()=>sealLabArtifact({...sortie.payload,schemaVersion:1})).toThrow();
  });
  it("現在KGの不透明なbeta試験版を保持しながら実Claimを検査する",async()=>{
    expect(await verifyLabPublicReferences(sortie,async url=>url==='/api/dataset'?{dataset:'public-kg',revision:'film-beta-issue43-unaccepted-v1'}:kg(url))).toBe('film-beta-issue43-unaccepted-v1');
  });
  it("0回の誕生状態と実在する7記録を保持し、採点案・実コメントを配信しない",()=>{
    expect(labCounts(initial.payload)).toEqual({inference:0,training:0,baseline:5,held:2});
    expect(initial.payload.runs).toHaveLength(7);
    expect(canonicalLabJson(initial)).not.toMatch(/request_wire|raw_response|\.runtime|\/home\/|apiKey|expectedDraft|demoComments/);
  });
  it("checksum・版・全階層の許可項目と未学習の整合性を拒否側で検査する",()=>{
    expect(()=>parseLabArtifact(JSON.stringify({...initial,sha256:"0".repeat(64)}))).toThrow();
    for (const mutate of [
      (v: typeof initial)=>Object.assign(v.payload,{rawResponse:"secret"}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0],{requestWire:"secret"}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0],{trained:true}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0],{semanticReview:"accepted"}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0],{executionKind:"kev-api",status:"completed"}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0],{status:"completed"}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0],{parentRunId:v.payload.runs[0].runId}),
      (v: typeof initial)=>Object.assign(v.payload.runs[0].paths[0].steps[0],{privatePath:"/home/private"}),
    ]) { const value = structuredClone(initial); mutate(value); expect(()=>sealLabArtifact(value.payload)).toThrow(); }
    expect(()=>parseLabArtifact(" ".repeat(MAX_LAB_ARTIFACT_BYTES+1))).toThrow();
  });
  it("公開KGの端点・Role・scope・方向・支持Citationを照合し、重複したClaimの全出現を検査する",async()=>{
    expect(await verifyLabPublicReferences(initial,kg)).toBe(revision);
    const changed = structuredClone(initial.payload);
    changed.runs[0].paths[0].steps[0].contribution={roleId:"AUTHORSHIP",scope:null};
    await expect(verifyLabPublicReferences(sealLabArtifact(changed),kg)).rejects.toThrow("differs");
    const renamed = sealLabArtifact({...initial.payload,entities:initial.payload.entities.map((e,i)=>i?e:{...e,name:"not the public name"})});
    await expect(verifyLabPublicReferences(renamed,kg)).rejects.toThrow("differs");
    await expect(verifyLabPublicReferences(initial,async url=>url.startsWith("/api/claims/")?{claim:{...((await kg(url)) as {claim:object}).claim,withdrawal:{reason:"withdrawn",release:"x",replacementClaimId:null}}}:kg(url))).rejects.toThrow("differs");
  });
  it("検証途中のKG版変更・ネットワーク不通を公開結果にしない",async()=>{
    let n=0;
    await expect(verifyLabPublicReferences(initial,async url=>url==="/api/dataset"?{dataset:"public-kg",revision:++n===1?revision:"82b01515-594c-48ca-b4b6-515eefac83ca"}:kg(url))).rejects.toThrow("changed");
    expect(()=>publicLabKgReader("https://evil.invalid")).toThrow();
    expect(()=>publicLabKgReader("http://localhost:8009")).toThrow();
  });
  it("原子的な切替・旧版復旧・失敗時旧版維持と固定expected版を検証する",async()=>{
    const dir=await directory(), next=sealLabArtifact({...initial.payload,version:"birth-20261022-v2"});
    await activateLabArtifact(dir,initial,null,kg);
    expect((await readActiveLabArtifact(dir))?.sha256).toBe(initial.sha256);
    await expect(activateLabArtifact(dir,next,null,kg)).rejects.toThrow("changed");
    await expect(activateLabArtifact(dir,next,initial.sha256,async()=>{throw Error("offline");})).rejects.toThrow("offline");
    expect(await readLabPointer(dir)).toBe(initial.sha256);
    const omitted=sealLabArtifact({...initial.payload,version:"omitted",runs:initial.payload.runs.filter(r=>r.taskId!=="pluto-other-work")});
    await expect(activateLabArtifact(dir,omitted,initial.sha256,kg)).rejects.toThrow("immutable");
    await activateLabArtifact(dir,next,initial.sha256,kg);
    await activateLabArtifact(dir,initial,next.sha256,kg);
    expect((await readActiveLabArtifact(dir))?.sha256).toBe(initial.sha256);
    expect(parseLabArtifact(await readFile(path.join(dir,"releases",next.sha256+".json"))).sha256).toBe(next.sha256);
  });
  it("同時切替・symlink・path traversal・不完全な新規版を拒否する",async()=>{
    const dir=await directory(); await activateLabArtifact(dir,initial,null,kg);
    const versions=["v2","v3"].map(version=>sealLabArtifact({...initial.payload,version}));
    const result=await Promise.allSettled(versions.map(v=>activateLabArtifact(dir,v,initial.sha256,kg)));
    expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    await writeFile(path.join(dir,"current.json"),JSON.stringify({schemaVersion:1,sha256:"../private"}));
    await expect(readActiveLabArtifact(dir)).rejects.toThrow();
    const bad=await directory(); await mkdir(path.join(bad,"elsewhere")); await symlink(path.join(bad,"elsewhere"),path.join(bad,"releases"));
    await expect(activateLabArtifact(bad,initial,null,kg)).rejects.toThrow("symlink");
    expect(await readLabPointer(bad)).toBeNull();
  });
});
